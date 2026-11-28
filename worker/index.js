/*! IDATA TOOLS · created by THANAWAT PHUTTARIT */
/*
 * IDATA TOOLS login server (Cloudflare Worker + D1).
 *
 * The whole site (pages, scripts, every static file) is served from here and only to a logged-in session.
 * Two kinds of account:
 *   - owner    ("admin" in the page): manages members, invitations, sessions and the shared back-office settings
 *   - employee ("staff" in the page): uses the tools, edits their own profile and password
 * Employees join through an invitation (personal link or code, single use) and choose their own password.
 *
 * Security rules kept here, on the server:
 *   - passwords: PBKDF2-SHA256 with a random salt per password; nobody (owner included) can read one back
 *   - sessions: random token in an HttpOnly + Secure + SameSite=Strict cookie, only its SHA-256 is stored
 *       "remember me" = cookie and session live until logout / revoke; otherwise a browser-session cookie + 12 h limit
 *   - 3 wrong passwords (login or command verification, any device or browser) lock the account until the owner
 *     unlocks it or sets a new password; every lock / unlock is recorded
 *   - rate limits per IP on login, invitation codes and recovery
 *   - risky commands need /api/authorize: allowed for 8 h after a password check ("remember"), or once per check;
 *     factory reset also needs the word RESET every time. Logout, a password change or a revoked session ends it.
 *   - no secret in the code: the first-owner / recovery code is the SETUP_CODE secret of the Worker
 *
 * Tables (created on first use): users, invites, sessions, events, rate, settings
 */
const SESSION_MS = 12 * 3600e3;          // without "remember me"
const REMEMBER_MS = 400 * 86400e3;       // the longest a browser keeps a cookie; renewed while in use
const VERIFY_MS = 8 * 3600e3;            // "remember verification for 8 hours"
const TICKET_MS = 2 * 60e3;              // one-time verification ticket (settings save)
const MAX_WRONG = 3;
const INVITE_DAYS = 7;
const SUSPENDED = "บัญชีถูกระงับ กรุณาติดต่อเจ้าของระบบ";
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // no 0/O, 1/I/L
const ACTIONS = { delete: "ลบข้อมูล", unlock: "ปลดล็อกแอป", reset: "รีเซ็ตเครื่อง (Factory Reset)", recovery: "เข้าเมนู Recovery", uninstall: "ถอนแอป", autodelete: "เปิดลบอัตโนมัติ", settings: "เปลี่ยนค่าหลังบ้าน", adbkey: "นำเข้ากุญแจ ADB" };
const LIGHT_KEYS = new Set(["names", "wallLearn", "usbIds"]); // shared settings that are not "important" (device nicknames, learned taps)
const enc = new TextEncoder();
const now = () => Date.now();

/* ---------- small helpers ---------- */
const b64u = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const randToken = (n = 32) => b64u(crypto.getRandomValues(new Uint8Array(n)));
const sha = async (s) => b64u(await crypto.subtle.digest("SHA-256", enc.encode(String(s))));
function randCode(len) {
  const out = [];
  while (out.length < len) for (const x of crypto.getRandomValues(new Uint8Array(len * 2))) { if (x < 248 && out.length < len) out.push(CODE_ALPHABET[x % 31]); } // 248 = 8*31: no bias
  return out.join("");
}
const inviteCode = () => { const c = randCode(10); return c.slice(0, 5) + "-" + c.slice(5); };
const normCode = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
function sameStr(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const clip = (s, n = 60) => String(s ?? "").trim().replace(/\s+/g, " ").slice(0, n);
const normUser = (s) => String(s || "").trim().toLowerCase();
const USER_RE = /^[a-z0-9._-]{3,32}$/;
const ipOf = (req) => req.headers.get("cf-connecting-ip") || "local";
const uaOf = (req) => (req.headers.get("user-agent") || "").slice(0, 200);

/* ---------- passwords ---------- */
const iterOf = (env) => Math.min(100000, Math.max(10000, parseInt(env.PBKDF2_ITER, 10) || 100000));
async function pbkdf2(pw, salt, iter) {
  const key = await crypto.subtle.importKey("raw", enc.encode(pw), "PBKDF2", false, ["deriveBits"]);
  return b64u(await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: enc.encode(salt), iterations: iter }, key, 256));
}
async function makeHash(env, pw) { const salt = randToken(16), it = iterOf(env); return `pbkdf2$${it}$${salt}$${await pbkdf2(pw, salt, it)}`; }
async function checkHash(hash, pw) {
  const [kind, it, salt, h] = String(hash || "").split("$");
  if (kind !== "pbkdf2" || !h) { await pbkdf2(String(pw), "x", 10000); return false; }
  return sameStr(await pbkdf2(String(pw ?? ""), salt, +it), h);
}
function pwProblem(pw, username) {
  pw = String(pw ?? "");
  if (pw.length < 8) return "รหัสผ่านอย่างน้อย 8 ตัว";
  if (pw.length > 128) return "รหัสผ่านยาวเกินไป";
  if (username && pw.toLowerCase() === String(username).toLowerCase()) return "รหัสผ่านต้องไม่เหมือน Username";
  return "";
}

/* ---------- database ---------- */
const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY, username TEXT NOT NULL UNIQUE, role TEXT NOT NULL, first_name TEXT, last_name TEXT, nickname TEXT, pw_hash TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'active', failed INTEGER NOT NULL DEFAULT 0, locked_at INTEGER, created_at INTEGER, updated_at INTEGER, pw_changed_at INTEGER, last_login INTEGER, invite_id TEXT)`,
  `CREATE TABLE IF NOT EXISTS invites(id TEXT PRIMARY KEY, token_hash TEXT NOT NULL UNIQUE, code_hash TEXT NOT NULL UNIQUE, first_name TEXT, last_name TEXT, nickname TEXT, message TEXT, note TEXT, created_by TEXT, created_at INTEGER, expires_at INTEGER, revoked_at INTEGER, opened_at INTEGER, used_at INTEGER, used_by TEXT)`,
  `CREATE TABLE IF NOT EXISTS sessions(id TEXT PRIMARY KEY, user_id TEXT NOT NULL, created_at INTEGER, expires_at INTEGER, remember INTEGER NOT NULL DEFAULT 0, last_seen INTEGER, ip TEXT, ua TEXT, verified_until INTEGER NOT NULL DEFAULT 0, ticket TEXT, ticket_exp INTEGER)`,
  `CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id)`,
  `CREATE TABLE IF NOT EXISTS events(id INTEGER PRIMARY KEY AUTOINCREMENT, at INTEGER, user_id TEXT, username TEXT, type TEXT, ip TEXT, ua TEXT, detail TEXT, by_user TEXT)`,
  `CREATE INDEX IF NOT EXISTS events_user ON events(user_id, at)`,
  `CREATE TABLE IF NOT EXISTS rate(k TEXT PRIMARY KEY, n INTEGER NOT NULL, reset_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS settings(k TEXT PRIMARY KEY, v TEXT, updated_at INTEGER, updated_by TEXT)`,
  // ADB private keys shared by every logged-in browser, so a device that allowed one computer works from all of them
  `CREATE TABLE IF NOT EXISTS adbkeys(id TEXT PRIMARY KEY, k TEXT NOT NULL, label TEXT, added_by TEXT, at INTEGER)`
];
let schemaReady = null;
function ensureSchema(env) {
  if (!schemaReady) schemaReady = env.DB.batch(SCHEMA.map((s) => env.DB.prepare(s))).catch((e) => { schemaReady = null; throw e; });
  return schemaReady;
}
const one = (env, sql, ...a) => env.DB.prepare(sql).bind(...a).first();
const many = async (env, sql, ...a) => (await env.DB.prepare(sql).bind(...a).all()).results || [];
const exec = (env, sql, ...a) => env.DB.prepare(sql).bind(...a).run();

/** count one attempt for key; true = over the limit for this window */
async function limited(env, key, limit, winSec) {
  const t = now(), end = t + winSec * 1000;
  const r = await one(env, `INSERT INTO rate(k,n,reset_at) VALUES(?,1,?) ON CONFLICT(k) DO UPDATE SET n=CASE WHEN reset_at<? THEN 1 ELSE n+1 END, reset_at=CASE WHEN reset_at<? THEN ? ELSE reset_at END RETURNING n`, key, end, t, t, end);
  return r.n > limit;
}
/** true when key is already over the limit (does not count this attempt) */
async function over(env, key, limit) {
  const r = await one(env, "SELECT n FROM rate WHERE k=? AND reset_at>=?", key, now());
  return !!r && r.n >= limit;
}
async function logEv(env, req, ev) {
  const u = ev.user || {};
  await exec(env, "INSERT INTO events(at,user_id,username,type,ip,ua,detail,by_user) VALUES(?,?,?,?,?,?,?,?)",
    now(), u.id || null, u.username || ev.username || null, ev.type, req ? ipOf(req) : null, req ? uaOf(req) : null, ev.detail ? String(ev.detail).slice(0, 300) : null, ev.by || null);
}

/* ---------- sessions ---------- */
function cookie(req, name) {
  const m = (req.headers.get("cookie") || "").match(new RegExp("(?:^|;\\s*)" + name + "=([^;]+)"));
  return m ? m[1] : "";
}
const sessCookie = (tok, remember) => `idt=${tok}; Path=/; HttpOnly; Secure; SameSite=Strict${remember ? "; Max-Age=" + REMEMBER_MS / 1000 : ""}`;
const CLEAR = "idt=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0";
async function newSession(env, req, u, remember) {
  const tok = randToken(32), t = now();
  await exec(env, "INSERT INTO sessions(id,user_id,created_at,expires_at,remember,last_seen,ip,ua) VALUES(?,?,?,?,?,?,?,?)",
    await sha(tok), u.id, t, t + (remember ? REMEMBER_MS : SESSION_MS), remember ? 1 : 0, t, ipOf(req), uaOf(req));
  return sessCookie(tok, remember);
}
async function session(req, env) {
  const tok = cookie(req, "idt");
  if (!tok || tok.length > 100) return null;
  const id = await sha(tok);
  const s = await one(env, `SELECT s.*, u.username, u.role, u.first_name, u.last_name, u.nickname, u.status, u.locked_at, u.pw_hash
    FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.id = ?`, id);
  if (!s) return null;
  if (s.expires_at < now() || s.status !== "active" || s.locked_at) { await exec(env, "DELETE FROM sessions WHERE id=?", id); return null; }
  if (now() - s.last_seen > 3600e3) {   // at most once an hour: last seen, and a remembered session is renewed
    await exec(env, "UPDATE sessions SET last_seen=?, expires_at=? WHERE id=?", now(), s.remember ? now() + REMEMBER_MS : s.expires_at, id);
    if (s.remember) s.renew = sessCookie(tok, true);
  }
  s.sid = id;
  return s;
}
const verified = (s) => s.verified_until > now();
async function useTicket(env, s, tk) {
  if (!tk || !s.ticket || !(s.ticket_exp > now()) || !sameStr(await sha(tk), s.ticket)) return false;
  const r = await exec(env, "UPDATE sessions SET ticket=NULL, ticket_exp=NULL WHERE id=? AND ticket=?", s.sid, s.ticket);
  return r.meta.changes === 1;
}
const display = (u) => u.nickname || u.first_name || u.username;
const roleOut = (r) => (r === "owner" ? "admin" : "staff");

/** a wrong password (login or verification): counted on the server for every device; 3 = locked */
async function wrongPassword(env, req, u, where) {
  const r = await one(env, "UPDATE users SET failed=failed+1, locked_at=CASE WHEN failed+1>=? THEN ? ELSE locked_at END WHERE id=? RETURNING failed, locked_at", MAX_WRONG, now(), u.id);
  await logEv(env, req, { user: u, type: where === "verify" ? "verify_fail" : "login_fail" });
  if (r && r.locked_at) {
    await exec(env, "DELETE FROM sessions WHERE user_id=?", u.id);
    await logEv(env, req, { user: u, type: "locked", detail: `รหัสผ่านผิดครบ ${MAX_WRONG} ครั้ง (${where === "verify" ? "ยืนยันคำสั่ง" : "เข้าสู่ระบบ"})` });
    return { locked: true };
  }
  return { left: MAX_WRONG - (r ? r.failed : 0) };
}

/* ---------- responses ---------- */
const SEC_HEADERS = { "x-frame-options": "DENY", "x-content-type-options": "nosniff", "referrer-policy": "no-referrer", "strict-transport-security": "max-age=31536000" };
const json = (data, status = 200, headers = {}) => new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...SEC_HEADERS, ...headers } });
const bad = (msg, status = 400, extra = {}) => json({ error: msg, ...extra }, status);
const html = (body, status = 200) => new Response(body, { status, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", ...SEC_HEADERS } });

/* ---------- Energy Shield pages (login, first owner, invitation, recovery) ---------- */
const SHIELD_SVG = `<div class="shield" id="shield" aria-hidden="true"><svg viewBox="0 0 120 120"><defs><linearGradient id="sg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="currentColor" stop-opacity=".55"/><stop offset="1" stop-color="currentColor" stop-opacity=".08"/></linearGradient></defs><circle class="ring r1" cx="60" cy="60" r="56"/><circle class="ring r2" cx="60" cy="60" r="47"/><path class="sh" d="M60 20 91 31v26c0 21-13 35-31 43-18-8-31-22-31-43V31Z"/><path class="mk" d="M47 59l9 9 18-20"/></svg><i class="scan"></i></div>`;
const SHIELD_CSS = `
:root{--bg:#050816;--glass:rgba(14,22,48,.62);--line:rgba(92,225,255,.28);--cy:#5ce1ff;--bl:#4c7dff;--ok:#5dffa8;--bad:#ff5d73;--tx:#eaf4ff;--mut:#9fb3d1}
*{box-sizing:border-box}
body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px 16px;color:var(--tx);font:16px/1.55 Prompt,system-ui,sans-serif;
 background:radial-gradient(900px 600px at 75% 10%,rgba(76,125,255,.22),transparent 60%),radial-gradient(700px 500px at 10% 90%,rgba(92,225,255,.12),transparent 60%),var(--bg)}
body::before{content:"";position:fixed;inset:0;pointer-events:none;opacity:.7;
 background-image:radial-gradient(1px 1px at 20px 30px,#fff,transparent),radial-gradient(1px 1px at 120px 80px,#cfe8ff,transparent),radial-gradient(1.5px 1.5px at 200px 150px,#fff,transparent),radial-gradient(1px 1px at 300px 40px,#9fdcff,transparent),radial-gradient(1px 1px at 380px 200px,#fff,transparent);
 background-size:420px 260px;animation:tw 6s ease-in-out infinite alternate}
@keyframes tw{to{opacity:.35}}
.card{position:relative;width:100%;max-width:420px;padding:30px 26px 22px;border-radius:22px;background:var(--glass);border:1px solid var(--line);
 backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);box-shadow:0 0 0 1px rgba(92,225,255,.06) inset,0 20px 70px rgba(0,0,0,.55),0 0 40px rgba(92,225,255,.12);animation:in .45s ease-out}
@keyframes in{from{opacity:0;transform:scale(.96)}}
.card::after{content:"";position:absolute;inset:-1px;border-radius:inherit;pointer-events:none;padding:1px;background:linear-gradient(140deg,rgba(92,225,255,.7),transparent 35%,transparent 65%,rgba(76,125,255,.6));
 -webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);-webkit-mask-composite:xor;mask-composite:exclude}
.shield{position:relative;width:108px;height:108px;margin:0 auto 10px;color:var(--cy);filter:drop-shadow(0 0 10px currentColor)}
.shield svg{width:100%;height:100%;overflow:visible}
.ring{fill:none;stroke:currentColor;stroke-width:1.4;transform-origin:60px 60px;opacity:.75}
.r1{stroke-dasharray:6 10 40 10;animation:spin 14s linear infinite}
.r2{stroke-dasharray:2 6;opacity:.5;animation:spin 9s linear infinite reverse}
.sh{fill:url(#sg);stroke:currentColor;stroke-width:2;animation:pulse 3s ease-in-out infinite}
.mk{fill:none;stroke:currentColor;stroke-width:4;stroke-linecap:round;stroke-linejoin:round;stroke-dasharray:44;stroke-dashoffset:44}
.scan{position:absolute;left:24%;right:24%;top:18%;height:2px;background:currentColor;box-shadow:0 0 12px currentColor;opacity:0;border-radius:2px}
@keyframes spin{to{transform:rotate(360deg)}}
@keyframes pulse{50%{opacity:.7}}
@keyframes scan{0%{top:18%;opacity:0}15%{opacity:1}85%{opacity:1}100%{top:82%;opacity:0}}
@keyframes shake{20%,60%{transform:translateX(-6px)}40%,80%{transform:translateX(6px)}}
.shield.busy .r1{animation-duration:2.2s}.shield.busy .r2{animation-duration:1.6s}
.shield.busy .scan{animation:scan 1.1s ease-in-out infinite}
.shield.ok{color:var(--ok)}.shield.ok .mk{stroke-dashoffset:0;transition:stroke-dashoffset .5s ease-out}
.shield.bad{color:var(--bad);animation:shake .45s}
h1{margin:0;text-align:center;font-size:22px;letter-spacing:.06em}
.sub{display:block;text-align:center;font-size:11px;letter-spacing:.32em;color:var(--mut);margin:2px 0 14px}
p{color:var(--mut);margin:6px 0 14px;font-size:14px;text-align:center}
.msg{border:1px solid var(--line);border-radius:12px;padding:10px 12px;background:rgba(92,225,255,.06);color:var(--tx);font-size:14px;white-space:pre-wrap;text-align:left}
label{display:block;font-size:13px;color:var(--mut);margin:11px 0 5px}
input[type=text],input[type=password]{width:100%;padding:11px 13px;border-radius:12px;border:1px solid rgba(160,200,255,.18);background:rgba(3,8,22,.55);color:var(--tx);font:inherit;transition:border-color .2s,box-shadow .2s}
input:focus{outline:none;border-color:var(--cy);box-shadow:0 0 0 3px rgba(92,225,255,.18)}
.two{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.chk{display:flex;gap:8px;align-items:center;margin-top:14px;color:var(--tx);font-size:14px}
button{margin-top:18px;width:100%;padding:12px;border:1px solid rgba(92,225,255,.6);border-radius:12px;cursor:pointer;color:#03131c;font:600 16px Prompt,system-ui,sans-serif;
 background:linear-gradient(180deg,#8ff0ff,#38c8ff);box-shadow:0 0 18px rgba(92,225,255,.35);transition:transform .15s,box-shadow .2s}
button:hover{box-shadow:0 0 28px rgba(92,225,255,.55)}button:active{transform:scale(.98)}button:disabled{opacity:.6;cursor:wait}
#err{min-height:20px;margin-top:12px;font-size:14px;text-align:center;color:var(--bad)}
#err.good{color:var(--ok)}
a{color:var(--cy)}
.foot{margin-top:16px;text-align:center;font-size:9px;letter-spacing:.14em;color:rgba(200,215,240,.22);text-transform:uppercase}
@media (max-width:420px){.two{grid-template-columns:1fr}}
@media (prefers-reduced-motion:reduce){*,*::before,*::after{animation:none!important;transition:none!important}}`;
const SHIELD_JS = `const $=(i)=>document.getElementById(i),sh=$("shield"),er=$("err");
function state(s,m,good){sh.className="shield "+(s||"");er.textContent=m||"";er.className=good?"good":"";}
async function post(u,b){const r=await fetch(u,{method:"POST",credentials:"same-origin",headers:{"content-type":"application/json"},body:JSON.stringify(b)});const j=await r.json().catch(()=>({}));return{ok:r.ok,status:r.status,j};}
async function go(u,b,btn,next){btn.disabled=true;state("busy","กำลังตรวจสอบตัวตน...");const t=Date.now();const r=await post(u,b);await new Promise((x)=>setTimeout(x,Math.max(0,700-(Date.now()-t))));
if(r.ok){state("ok",(r.j&&r.j.message)||"ผ่านการตรวจสอบ",true);setTimeout(()=>{location.href=next||"/"},650);return r}
state("bad",(r.j&&r.j.error)||"ไม่สำเร็จ");btn.disabled=false;return r}`;
function page(title, inner, script) {
  return html(`<!doctype html><html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)} · IDATA TOOLS</title><meta name="author" content="THANAWAT PHUTTARIT"><meta name="robots" content="noindex">
<link rel="manifest" href="/manifest.webmanifest"><link rel="icon" href="/icon-192.png">
<link href="https://fonts.googleapis.com/css2?family=Prompt:wght@400;600&display=swap" rel="stylesheet"><style>${SHIELD_CSS}</style></head><body>
<main class="card">${SHIELD_SVG}<h1>IDATA TOOLS</h1><span class="sub">SECURE ACCESS</span>${inner}<div id="err" role="alert"></div><div class="foot">made by THANAWAT PHUTTARIT</div></main>
<script>${SHIELD_JS}\n${script || ""}</script></body></html>`);
}
const field = (id, label, type = "text", extra = "") => `<label for="${id}">${label}</label><input id="${id}" type="${type}" ${extra}>`;
const PROFILE_FIELDS = (v = {}) => `<div class="two">${field("fn", "ชื่อ", "text", `required maxlength="60" autocomplete="given-name" value="${esc(v.first_name)}"`)}${field("ln", "นามสกุล", "text", `required maxlength="60" autocomplete="family-name" value="${esc(v.last_name)}"`)}</div>
${field("nn", "ชื่อเล่น (แสดงบนเว็บ)", "text", `required maxlength="40" value="${esc(v.nickname)}"`)}
${field("un", "Username / ID (a-z 0-9 . _ - อย่างน้อย 3 ตัว)", "text", `required maxlength="32" autocomplete="username" autocapitalize="none" spellcheck="false"`)}
${field("pw", "Password (อย่างน้อย 8 ตัว)", "password", `required minlength="8" autocomplete="new-password"`)}
${field("pw2", "Confirm Password", "password", `required minlength="8" autocomplete="new-password"`)}`;
const PROFILE_JS = `const prof=()=>({first:$("fn").value,last:$("ln").value,nick:$("nn").value,username:$("un").value,password:$("pw").value,confirm:$("pw2").value});
function profOk(){const p=prof();if(!p.first.trim()||!p.last.trim()||!p.nick.trim()||!p.username.trim()){state("bad","กรอกให้ครบทุกช่อง");return false}
if(p.password.length<8){state("bad","รหัสผ่านอย่างน้อย 8 ตัว");return false}if(p.password!==p.confirm){state("bad","Password กับ Confirm Password ไม่ตรงกัน");return false}return true}`;

function loginPage() {
  return page("เข้าสู่ระบบ", `<p>ยืนยันตัวตนเพื่อเข้าใช้งาน</p><form id="f" autocomplete="on">
${field("u", "Username", "text", `required autocomplete="username" autocapitalize="none" spellcheck="false" autofocus`)}
${field("p", "Password", "password", `required autocomplete="current-password"`)}
<label class="chk"><input type="checkbox" id="r"> จำฉันไว้ (เข้าค้างไว้จนกว่าจะออกจากระบบ)</label>
<button id="b">เข้าสู่ระบบ</button></form><p style="margin:14px 0 0">มีคำเชิญ? <a href="/invite">ใส่รหัสเชิญ</a></p>`,
  `$("f").addEventListener("submit",(e)=>{e.preventDefault();go("/api/login",{username:$("u").value,password:$("p").value,remember:$("r").checked},$("b"),"/"+location.hash)});`);
}
function setupPage(hasCode) {
  if (!hasCode) return page("ตั้งค่าครั้งแรก", `<p>ยังเปิดใช้ไม่ได้</p><div class="msg">ยังไม่ได้ตั้งรหัสตั้งค่าครั้งแรก (Secret ชื่อ IDT_SETUP_CODE ใน GitHub อย่างน้อย 12 ตัว) แล้ว deploy ใหม่</div>`, "");
  return page("ตั้งค่าครั้งแรก", `<p>สร้างบัญชีเจ้าของระบบ (Owner)</p><form id="f">
${field("sc", "รหัสตั้งค่าครั้งแรก (IDT_SETUP_CODE)", "password", `required autocomplete="off"`)}${PROFILE_FIELDS()}<button id="b">สร้างบัญชีเจ้าของ</button></form>`,
  `${PROFILE_JS}$("f").addEventListener("submit",(e)=>{e.preventDefault();if(profOk())go("/api/setup",{code:$("sc").value,...prof()},$("b"),"/")});`);
}
function invitePage(inv, token) {
  if (inv === "bad") return page("คำเชิญ", `<div class="msg">คำเชิญนี้ใช้ไม่ได้แล้ว (ใช้สมัครไปแล้ว หมดอายุ หรือถูกยกเลิก)\nขอคำเชิญใหม่จากเจ้าของระบบ</div><p style="margin-top:14px"><a href="/login">ไปหน้าเข้าสู่ระบบ</a></p>`, `state("bad")`);
  const form = (v) => `<div id="hello" class="msg" ${v && v.message ? "" : "hidden"}>${esc(v && v.message)}</div><form id="f" ${v ? "" : "hidden"}>${PROFILE_FIELDS(v || {})}<button id="b">สมัครและเข้าใช้งาน</button></form>`;
  if (inv) return page("สมัครสมาชิก", `<p>สมัครสมาชิกด้วยคำเชิญ</p>${form(inv)}`,
    `${PROFILE_JS}$("f").addEventListener("submit",(e)=>{e.preventDefault();if(profOk())go("/api/invite/accept",{token:${JSON.stringify(token)},...prof()},$("b"),"/")});`);
  return page("ใส่รหัสเชิญ", `<p>ใส่รหัสเชิญที่ได้รับจากเจ้าของระบบ</p><form id="c">${field("code", "รหัสเชิญ", "text", `required autocomplete="off" autocapitalize="characters" placeholder="XXXXX-XXXXX"`)}<button id="cb">ตรวจรหัสเชิญ</button></form>${form(null)}`,
    `${PROFILE_JS}let code="";
$("c").addEventListener("submit",async(e)=>{e.preventDefault();$("cb").disabled=true;state("busy","กำลังตรวจรหัสเชิญ...");const r=await post("/api/invite/check",{code:$("code").value});$("cb").disabled=false;
if(!r.ok){state("bad",r.j.error||"รหัสเชิญใช้ไม่ได้");return}code=$("code").value;state("ok","รหัสเชิญถูกต้อง กรอกข้อมูลเพื่อสมัคร",true);$("c").hidden=true;$("f").hidden=false;
$("fn").value=r.j.first_name||"";$("ln").value=r.j.last_name||"";$("nn").value=r.j.nickname||"";if(r.j.message){$("hello").textContent=r.j.message;$("hello").hidden=false}});
$("f").addEventListener("submit",(e)=>{e.preventDefault();if(profOk())go("/api/invite/accept",{code,...prof()},$("b"),"/")});`);
}
function recoverPage() {
  return page("กู้บัญชีเจ้าของ", `<p>เจ้าของระบบลืมรหัสหรือถูกล็อก: ใช้รหัสตั้งค่าครั้งแรก (IDT_SETUP_CODE) ตั้งรหัสใหม่</p><form id="f">
${field("sc", "รหัสตั้งค่าครั้งแรก", "password", `required autocomplete="off"`)}${field("u", "Username ของเจ้าของ", "text", `required autocapitalize="none"`)}
${field("pw", "Password ใหม่", "password", `required minlength="8" autocomplete="new-password"`)}${field("pw2", "Confirm Password", "password", `required minlength="8" autocomplete="new-password"`)}<button id="b">ตั้งรหัสใหม่และปลดล็อก</button></form>`,
  `$("f").addEventListener("submit",(e)=>{e.preventDefault();if($("pw").value!==$("pw2").value){state("bad","Password ไม่ตรงกัน");return}go("/api/recover",{code:$("sc").value,username:$("u").value,password:$("pw").value},$("b"),"/login")});`);
}

/* ---------- invitations ---------- */
const inviteOk = (i) => i && !i.used_at && !i.revoked_at && i.expires_at > now();
async function findInvite(env, { token, code }) {
  if (token) return one(env, "SELECT * FROM invites WHERE token_hash=?", await sha(String(token)));
  const c = normCode(code);
  if (c.length !== 10) return null;
  return one(env, "SELECT * FROM invites WHERE code_hash=?", await sha(c));
}
const inviteStatus = (i) => (i.used_at ? "used" : i.revoked_at ? "revoked" : i.expires_at <= now() ? "expired" : "pending");
function readProfile(b) {
  const p = { first: clip(b.first), last: clip(b.last), nick: clip(b.nick, 40), username: normUser(b.username) };
  if (!p.first || !p.last || !p.nick) return { err: "กรอกชื่อ นามสกุล และชื่อเล่นให้ครบ" };
  if (!USER_RE.test(p.username)) return { err: "Username ใช้ได้เฉพาะ a-z 0-9 . _ - ยาว 3-32 ตัว" };
  if (String(b.password ?? "") !== String(b.confirm ?? "")) return { err: "Password กับ Confirm Password ไม่ตรงกัน" };
  const e = pwProblem(b.password, p.username);
  return e ? { err: e } : p;
}

/* ---------- API for logged-in people ---------- */
async function api(req, env, url, s, body) {
  const p = url.pathname, m = req.method;
  const owner = s.role === "owner";
  const me = { id: s.user_id, username: s.username };

  if (p === "/api/me" && m === "GET")
    return json({ role: roleOut(s.role), name: display(s), username: s.username, first: s.first_name || "", last: s.last_name || "", nick: s.nickname || "", verifiedUntil: verified(s) ? s.verified_until : 0, remember: !!s.remember });
  if (p === "/api/logout" && m === "POST") {
    await exec(env, "DELETE FROM sessions WHERE id=?", s.sid);
    await logEv(env, req, { user: me, type: "logout" });
    return json({ ok: true }, 200, { "set-cookie": CLEAR });
  }
  if (p === "/api/me/profile" && m === "POST") {
    const first = clip(body.first), last = clip(body.last), nick = clip(body.nick, 40);
    if (!first || !last || !nick) return bad("กรอกชื่อ นามสกุล และชื่อเล่นให้ครบ");
    await exec(env, "UPDATE users SET first_name=?, last_name=?, nickname=?, updated_at=? WHERE id=?", first, last, nick, now(), s.user_id);
    await logEv(env, req, { user: me, type: "profile", detail: "แก้ข้อมูลส่วนตัว" });
    return json({ ok: true, name: nick });
  }
  if (p === "/api/me/password" && m === "POST") {
    if (await limited(env, "pw:" + s.user_id, 10, 900)) return bad("ลองหลายครั้งเกินไป รอ 15 นาที", 429);
    if (!(await checkHash(s.pw_hash, body.old))) {
      const w = await wrongPassword(env, req, me, "verify");
      return w.locked ? bad(SUSPENDED, 403, { locked: true }) : bad(`รหัสผ่านเดิมไม่ถูกต้อง (เหลืออีก ${w.left} ครั้ง)`, 422);
    }
    const e = pwProblem(body.password, s.username);
    if (e) return bad(e);
    await exec(env, "UPDATE users SET pw_hash=?, failed=0, pw_changed_at=?, updated_at=? WHERE id=?", await makeHash(env, String(body.password)), now(), now(), s.user_id);
    // other devices are logged out; this one stays, but its command verification ends
    await exec(env, "DELETE FROM sessions WHERE user_id=? AND id<>?", s.user_id, s.sid);
    await exec(env, "UPDATE sessions SET verified_until=0, ticket=NULL WHERE id=?", s.sid);
    await logEv(env, req, { user: me, type: "pw_changed" });
    return json({ ok: true });
  }

  // risky commands: allowed inside the 8 h window, with a one-time ticket, or right after a password check
  if (p === "/api/authorize" && m === "POST") {
    const a = body.action;
    if (!ACTIONS[a]) return bad("ไม่รู้จักคำสั่ง");
    if (a === "settings" && !owner) return bad("เฉพาะเจ้าของเท่านั้น", 403);
    if (a === "reset" && body.confirm !== "RESET") return bad("พิมพ์ RESET เพื่อยืนยัน", 400, { needReset: true });
    if (verified(s) || (await useTicket(env, s, body.ticket))) {
      await logEv(env, req, { user: me, type: "action", detail: ACTIONS[a] + (body.detail ? " · " + clip(body.detail, 200) : "") });
      return json({ ok: true, verifiedUntil: verified(s) ? s.verified_until : 0 });
    }
    return bad("ต้องยืนยันรหัสผ่านก่อน", 403, { verify: true });
  }
  if (p === "/api/verify" && m === "POST") {
    const a = body.action;
    if (!ACTIONS[a]) return bad("ไม่รู้จักคำสั่ง");
    if (a === "settings" && !owner) return bad("เฉพาะเจ้าของเท่านั้น", 403);
    if (a === "reset" && body.confirm !== "RESET") return bad("พิมพ์ RESET เพื่อยืนยัน", 400, { needReset: true });
    if (await limited(env, "verify:" + s.user_id, 15, 900)) return bad("ลองหลายครั้งเกินไป รอ 15 นาที", 429);
    if (!(await checkHash(s.pw_hash, body.password))) {
      const w = await wrongPassword(env, req, me, "verify");
      return w.locked ? bad(SUSPENDED, 403, { locked: true }, ) : bad(`รหัสผ่านไม่ถูกต้อง (เหลืออีก ${w.left} ครั้งก่อนบัญชีถูกระงับ)`, 422);
    }
    await exec(env, "UPDATE users SET failed=0 WHERE id=?", s.user_id);
    let until = 0, ticket = "";
    if (body.remember) { until = now() + VERIFY_MS; await exec(env, "UPDATE sessions SET verified_until=? WHERE id=?", until, s.sid); }
    else if (a === "settings" || a === "adbkey") { ticket = randToken(24); await exec(env, "UPDATE sessions SET ticket=?, ticket_exp=? WHERE id=?", await sha(ticket), now() + TICKET_MS, s.sid); }
    await logEv(env, req, { user: me, type: "verify_ok", detail: body.remember ? "จำการยืนยัน 8 ชั่วโมง" : "ยืนยันครั้งนี้" });
    if (a !== "settings" && a !== "adbkey") await logEv(env, req, { user: me, type: "action", detail: ACTIONS[a] + (body.detail ? " · " + clip(body.detail, 200) : "") });
    return json({ ok: true, verifiedUntil: until, ticket });
  }

  if (p === "/api/adbkeys" && m === "GET")
    return json((await many(env, "SELECT id, k, label, added_by, at FROM adbkeys ORDER BY (id = 'primary') DESC, at")).map((r) => (owner ? r : { id: r.id === "primary" ? "primary" : "", k: r.k })));
  // the hub's main key: made once by the first browser that finds none (key generation is too heavy for the Worker),
  // then every browser offers it first, so a device that allows it once works from every computer and phone
  if (p === "/api/adbkeys/primary" && m === "POST") {
    const k = String(body.k || "");
    if (!/^[A-Za-z0-9_-]{600,4000}$/.test(k)) return bad("กุญแจไม่ถูกต้อง");
    const r = await exec(env, "INSERT OR IGNORE INTO adbkeys(id,k,label,added_by,at) VALUES('primary',?,?,?,?)", k, "กุญแจหลักของฮับ (ใช้ร่วมทุกคอม)", s.username, now());
    if (r.meta.changes) await logEv(env, req, { user: me, type: "action", detail: "สร้างกุญแจหลักของฮับ" });
    return json({ ok: true, created: !!r.meta.changes });
  }
  if (p === "/api/adbkeys" && m === "POST") {
    if (!verified(s) && !(await useTicket(env, s, req.headers.get("x-idt-ticket")))) return bad("ต้องยืนยันรหัสผ่านก่อน", 403, { verify: true });
    const keys = (Array.isArray(body.keys) ? body.keys : []).map(String).filter((k) => /^[A-Za-z0-9_-]{600,4000}$/.test(k)).slice(0, 20);
    if (!keys.length) return bad("ไม่มีกุญแจที่ใช้ได้");
    const have = (await one(env, "SELECT COUNT(*) AS n FROM adbkeys")).n;
    let added = 0;
    for (const k of keys) {
      if (have + added >= 60) break;
      const r = await exec(env, "INSERT OR IGNORE INTO adbkeys(id,k,label,added_by,at) VALUES(?,?,?,?,?)", await sha(k), k, clip(body.label, 60), s.username, now());
      added += r.meta.changes;
    }
    await logEv(env, req, { user: me, type: "action", detail: `${ACTIONS.adbkey} ${added} ชุด${body.label ? " · " + clip(body.label, 60) : ""}` });
    return json({ ok: true, added });
  }
  if (p === "/api/adbkeys" && m === "DELETE") {
    if (!owner) return bad("เฉพาะเจ้าของเท่านั้น", 403);
    await exec(env, "DELETE FROM adbkeys WHERE id=?", url.searchParams.get("id") || "");
    await logEv(env, req, { user: me, type: "action", detail: "ลบกุญแจ ADB 1 ชุด" });
    return json({ ok: true });
  }
  if (p === "/api/settings" && m === "GET") {
    const out = {};
    for (const r of await many(env, "SELECT k, v FROM settings")) { try { out[r.k] = JSON.parse(r.v); } catch (e) {} }
    return json(out);
  }
  if (p === "/api/settings" && m === "PUT") {
    if (!owner) return bad("เฉพาะเจ้าของเท่านั้น", 403);
    if (!body || typeof body !== "object" || Array.isArray(body)) return bad("ข้อมูลไม่ถูกต้อง");
    const cur = new Map((await many(env, "SELECT k, v FROM settings")).map((r) => [r.k, r.v]));
    const changed = Object.keys(body).filter((k) => /^[\w-]{1,40}$/.test(k) && cur.get(k) !== JSON.stringify(body[k]));
    if (!changed.length) return json({ ok: true });
    const important = changed.filter((k) => !LIGHT_KEYS.has(k));
    if (important.length && !verified(s) && !(await useTicket(env, s, req.headers.get("x-idt-ticket")))) return bad("ต้องยืนยันรหัสผ่านก่อนเปลี่ยนค่าหลังบ้าน", 403, { verify: true });
    const v = JSON.stringify(body);
    if (v.length > 900000) return bad("ข้อมูลใหญ่เกินไป", 413);
    await env.DB.batch(changed.map((k) => env.DB.prepare("INSERT INTO settings(k,v,updated_at,updated_by) VALUES(?,?,?,?) ON CONFLICT(k) DO UPDATE SET v=excluded.v, updated_at=excluded.updated_at, updated_by=excluded.updated_by").bind(k, JSON.stringify(body[k]), now(), s.username)));
    if (important.length) await logEv(env, req, { user: me, type: "action", detail: ACTIONS.settings + " · " + important.join(", ") });
    return json({ ok: true });
  }

  if (!owner) return bad("เฉพาะเจ้าของเท่านั้น", 403);
  /* ----- owner only from here ----- */
  const target = async (id) => one(env, "SELECT * FROM users WHERE id=?", String(id || ""));
  const by = s.username;

  if (p === "/api/users" && m === "GET") {
    const rows = await many(env, `SELECT u.id, u.username, u.role, u.first_name, u.last_name, u.nickname, u.status, u.failed, u.locked_at, u.created_at, u.last_login,
      (SELECT COUNT(*) FROM sessions x WHERE x.user_id = u.id AND x.expires_at > ?) AS sessions FROM users u ORDER BY u.role DESC, u.created_at`, now());
    return json(rows.map((r) => ({ ...r, role: roleOut(r.role) })));
  }
  if (p === "/api/users" && m === "POST") {   // owner adds an account directly (no invitation)
    const pr = readProfile({ ...body, confirm: body.password });
    if (pr.err) return bad(pr.err);
    if (await one(env, "SELECT 1 FROM users WHERE username=?", pr.username)) return bad("Username นี้มีคนใช้แล้ว", 409);
    const id = randToken(12);
    await exec(env, "INSERT INTO users(id,username,role,first_name,last_name,nickname,pw_hash,created_at,updated_at,pw_changed_at) VALUES(?,?,?,?,?,?,?,?,?,?)",
      id, pr.username, "employee", pr.first, pr.last, pr.nick, await makeHash(env, String(body.password)), now(), now(), now());
    await logEv(env, req, { user: { id, username: pr.username }, type: "user_created", detail: "เจ้าของเพิ่มบัญชี", by });
    return json({ ok: true, id });
  }
  if (p === "/api/users/update" && m === "POST") {
    const u = await target(body.id);
    if (!u) return bad("ไม่พบสมาชิก", 404);
    const first = clip(body.first), last = clip(body.last), nick = clip(body.nick, 40), un = normUser(body.username);
    if (!first || !last || !nick) return bad("กรอกชื่อ นามสกุล และชื่อเล่นให้ครบ");
    if (!USER_RE.test(un)) return bad("Username ใช้ได้เฉพาะ a-z 0-9 . _ - ยาว 3-32 ตัว");
    if (un !== u.username && (await one(env, "SELECT 1 FROM users WHERE username=?", un))) return bad("Username นี้มีคนใช้แล้ว", 409);
    await exec(env, "UPDATE users SET username=?, first_name=?, last_name=?, nickname=?, updated_at=? WHERE id=?", un, first, last, nick, now(), u.id);
    await logEv(env, req, { user: { id: u.id, username: un }, type: "user_updated", detail: un !== u.username ? `เปลี่ยน Username จาก ${u.username}` : "แก้ข้อมูล", by });
    return json({ ok: true });
  }
  if (p === "/api/users/password" && m === "POST") {   // set a new password (the old one is never shown: it cannot be)
    const u = await target(body.id);
    if (!u) return bad("ไม่พบสมาชิก", 404);
    const pw = body.generate ? randCode(10) : String(body.password ?? "");
    const e = pwProblem(pw, u.username);
    if (e) return bad(e);
    await exec(env, "UPDATE users SET pw_hash=?, failed=0, locked_at=NULL, pw_changed_at=?, updated_at=? WHERE id=?", await makeHash(env, pw), now(), now(), u.id);
    if (u.id !== s.user_id) await exec(env, "DELETE FROM sessions WHERE user_id=?", u.id);
    await logEv(env, req, { user: u, type: "pw_reset", detail: "เจ้าของตั้งรหัสผ่านใหม่" + (u.locked_at ? " (ปลดล็อกด้วย)" : ""), by });
    return json({ ok: true, password: body.generate ? pw : undefined });
  }
  if (p === "/api/users/unlock" && m === "POST") {
    const u = await target(body.id);
    if (!u) return bad("ไม่พบสมาชิก", 404);
    await exec(env, "UPDATE users SET failed=0, locked_at=NULL, updated_at=? WHERE id=?", now(), u.id);
    await logEv(env, req, { user: u, type: "unlocked", detail: "เจ้าของปลดล็อก", by });
    return json({ ok: true });
  }
  if (p === "/api/users/status" && m === "POST") {
    const u = await target(body.id);
    if (!u) return bad("ไม่พบสมาชิก", 404);
    if (u.role === "owner") return bad("ปิดบัญชีเจ้าของไม่ได้");
    const active = !!body.active;
    await exec(env, "UPDATE users SET status=?, updated_at=? WHERE id=?", active ? "active" : "disabled", now(), u.id);
    if (!active) await exec(env, "DELETE FROM sessions WHERE user_id=?", u.id);
    await logEv(env, req, { user: u, type: active ? "enabled" : "disabled", by });
    return json({ ok: true });
  }
  if (p === "/api/users/revoke" && m === "POST") {
    const u = await target(body.id);
    if (!u) return bad("ไม่พบสมาชิก", 404);
    const r = await exec(env, "DELETE FROM sessions WHERE user_id=?" + (u.id === s.user_id ? " AND id<>?" : ""), ...(u.id === s.user_id ? [u.id, s.sid] : [u.id]));
    await logEv(env, req, { user: u, type: "revoked", detail: `ยกเลิก ${r.meta.changes} session`, by });
    return json({ ok: true, revoked: r.meta.changes });
  }
  if (p === "/api/users" && m === "DELETE") {
    const u = await target(url.searchParams.get("id"));
    if (!u) return bad("ไม่พบสมาชิก", 404);
    if (u.role === "owner") return bad("ลบบัญชีเจ้าของไม่ได้");
    await env.DB.batch([env.DB.prepare("DELETE FROM sessions WHERE user_id=?").bind(u.id), env.DB.prepare("DELETE FROM users WHERE id=?").bind(u.id)]);
    await logEv(env, req, { user: u, type: "deleted", by });
    return json({ ok: true });
  }
  if (p === "/api/users/sessions" && m === "GET") {
    return json(await many(env, "SELECT created_at, last_seen, expires_at, remember, ip, ua, verified_until > ? AS verified FROM sessions WHERE user_id=? AND expires_at > ? ORDER BY last_seen DESC", now(), url.searchParams.get("id") || "", now()));
  }
  if (p === "/api/events" && m === "GET") {
    const id = url.searchParams.get("user"), lim = Math.min(300, parseInt(url.searchParams.get("limit"), 10) || 100);
    return json(id ? await many(env, "SELECT * FROM events WHERE user_id=? ORDER BY id DESC LIMIT ?", id, lim) : await many(env, "SELECT * FROM events ORDER BY id DESC LIMIT ?", lim));
  }

  if (p === "/api/invites" && m === "GET") {
    const rows = await many(env, "SELECT i.*, u.username AS used_username FROM invites i LEFT JOIN users u ON u.id = i.used_by ORDER BY i.created_at DESC LIMIT 100");
    return json(rows.map(({ token_hash, code_hash, ...r }) => ({ ...r, status: inviteStatus(r) })));
  }
  if (p === "/api/invites" && m === "POST") {
    const days = Math.min(30, Math.max(1, parseInt(body.days, 10) || INVITE_DAYS));
    for (let i = 0; i < 4; i++) {
      const id = randToken(12), token = randToken(32), code = inviteCode();
      try {
        await exec(env, "INSERT INTO invites(id,token_hash,code_hash,first_name,last_name,nickname,message,note,created_by,created_at,expires_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
          id, await sha(token), await sha(normCode(code)), clip(body.first), clip(body.last), clip(body.nick, 40), clip(body.message, 300), clip(body.note, 100), s.user_id, now(), now() + days * 86400e3);
      } catch (e) { if (/UNIQUE/i.test(String(e))) continue; throw e; }
      await logEv(env, req, { user: me, type: "invite_created", detail: `${clip(body.nick, 40) || clip(body.first) || "ไม่ระบุชื่อ"} · หมดอายุใน ${days} วัน` });
      return json({ ok: true, id, link: `${url.origin}/invite/${token}`, code, expires_at: now() + days * 86400e3 });
    }
    return bad("สร้างคำเชิญไม่สำเร็จ ลองใหม่", 500);
  }
  if (p === "/api/invites/revoke" && m === "POST") {
    const r = await exec(env, "UPDATE invites SET revoked_at=? WHERE id=? AND used_at IS NULL AND revoked_at IS NULL", now(), String(body.id || ""));
    if (r.meta.changes !== 1) return bad("ยกเลิกไม่ได้ (ใช้ไปแล้วหรือยกเลิกอยู่แล้ว)", 409);
    await logEv(env, req, { user: me, type: "invite_revoked" });
    return json({ ok: true });
  }
  return bad("ไม่พบ", 404);
}

/* ---------- routes open without a session ---------- */
async function publicApi(req, env, url, body) {
  const p = url.pathname, ip = ipOf(req);
  if (p === "/api/login") {
    // only failed tries count: a whole hub often shares one internet address
    if (await over(env, "login:" + ip, 20)) return bad("ใส่รหัสผิดหลายครั้งเกินไป รอ 15 นาทีแล้วลองใหม่", 429);
    const fail = () => limited(env, "login:" + ip, 20, 900);
    const u = await one(env, "SELECT * FROM users WHERE username=?", normUser(body.username));
    if (!u) { await checkHash("", body.password); await fail(); await logEv(env, req, { type: "login_fail", username: clip(body.username, 40), detail: "ไม่มี Username นี้" }); return bad("Username หรือ Password ไม่ถูกต้อง", 401); }
    if (u.status !== "active" || u.locked_at) { await logEv(env, req, { user: u, type: "login_blocked" }); return bad(SUSPENDED, 403, { locked: true }); }
    if (!(await checkHash(u.pw_hash, body.password))) {
      await fail();
      const w = await wrongPassword(env, req, u, "login");
      return w.locked ? bad(SUSPENDED, 403, { locked: true }) : bad(`Username หรือ Password ไม่ถูกต้อง (เหลืออีก ${w.left} ครั้งก่อนบัญชีถูกระงับ)`, 401);
    }
    // a stronger hash setting is applied the next time the person logs in
    const it = +String(u.pw_hash).split("$")[1];
    const rehash = it < iterOf(env) ? await makeHash(env, String(body.password)) : u.pw_hash;
    await exec(env, "UPDATE users SET failed=0, last_login=?, pw_hash=? WHERE id=?", now(), rehash, u.id);
    await logEv(env, req, { user: u, type: "login_ok", detail: body.remember ? "จำฉันไว้" : "" });
    return json({ ok: true, role: roleOut(u.role) }, 200, { "set-cookie": await newSession(env, req, u, !!body.remember) });
  }
  if (p === "/api/setup") {
    if (!env.SETUP_CODE || String(env.SETUP_CODE).length < 12) return bad("ยังไม่ได้ตั้ง IDT_SETUP_CODE", 503);
    if (await limited(env, "setup:" + ip, 10, 900)) return bad("ลองหลายครั้งเกินไป รอ 15 นาที", 429);
    if (await one(env, "SELECT 1 FROM users WHERE role='owner'")) return bad("ตั้งบัญชีเจ้าของไปแล้ว", 409);
    if (!sameStr(String(body.code ?? ""), String(env.SETUP_CODE))) return bad("รหัสตั้งค่าครั้งแรกไม่ถูกต้อง", 403);
    const pr = readProfile(body);
    if (pr.err) return bad(pr.err);
    const id = randToken(12);
    const r = await exec(env, "INSERT INTO users(id,username,role,first_name,last_name,nickname,pw_hash,created_at,updated_at,pw_changed_at,last_login) SELECT ?,?,?,?,?,?,?,?,?,?,? WHERE NOT EXISTS (SELECT 1 FROM users WHERE role='owner')",
      id, pr.username, "owner", pr.first, pr.last, pr.nick, await makeHash(env, String(body.password)), now(), now(), now(), now());
    if (r.meta.changes !== 1) return bad("ตั้งบัญชีเจ้าของไปแล้ว", 409);
    const u = { id, username: pr.username };
    await logEv(env, req, { user: u, type: "user_created", detail: "บัญชีเจ้าของ (ตั้งค่าครั้งแรก)" });
    return json({ ok: true }, 200, { "set-cookie": await newSession(env, req, u, false) });
  }
  if (p === "/api/recover") {
    if (await limited(env, "recover:" + ip, 5, 900)) return bad("ลองหลายครั้งเกินไป รอ 15 นาที", 429);
    if (!env.SETUP_CODE || !sameStr(String(body.code ?? ""), String(env.SETUP_CODE))) { await logEv(env, req, { type: "recover_fail" }); return bad("รหัสตั้งค่าครั้งแรกไม่ถูกต้อง", 403); }
    const u = await one(env, "SELECT * FROM users WHERE username=? AND role='owner'", normUser(body.username));
    if (!u) return bad("ไม่พบบัญชีเจ้าของชื่อนี้", 404);
    const e = pwProblem(body.password, u.username);
    if (e) return bad(e);
    await exec(env, "UPDATE users SET pw_hash=?, failed=0, locked_at=NULL, pw_changed_at=?, updated_at=? WHERE id=?", await makeHash(env, String(body.password)), now(), now(), u.id);
    await exec(env, "DELETE FROM sessions WHERE user_id=?", u.id);
    await logEv(env, req, { user: u, type: "unlocked", detail: "กู้บัญชีด้วยรหัสตั้งค่าครั้งแรก (ตั้งรหัสใหม่)" });
    return json({ ok: true, message: "ตั้งรหัสใหม่แล้ว เข้าสู่ระบบได้เลย" });
  }
  if (p === "/api/invite/check") {
    if (await limited(env, "invite:" + ip, 20, 900)) return bad("ลองหลายครั้งเกินไป รอ 15 นาที", 429);
    const i = await findInvite(env, { code: body.code });
    if (!inviteOk(i)) return bad("รหัสเชิญนี้ใช้ไม่ได้ (ผิด ใช้ไปแล้ว หมดอายุ หรือถูกยกเลิก)", 410);
    if (!i.opened_at) await exec(env, "UPDATE invites SET opened_at=? WHERE id=?", now(), i.id);
    return json({ first_name: i.first_name || "", last_name: i.last_name || "", nickname: i.nickname || "", message: i.message || "" });
  }
  if (p === "/api/invite/accept") {
    if (await limited(env, "invite:" + ip, 20, 900)) return bad("ลองหลายครั้งเกินไป รอ 15 นาที", 429);
    const i = await findInvite(env, body.token ? { token: body.token } : { code: body.code });
    if (!inviteOk(i)) return bad("คำเชิญนี้ใช้ไม่ได้แล้ว (ใช้สมัครไปแล้ว หมดอายุ หรือถูกยกเลิก)", 410);
    const pr = readProfile(body);
    if (pr.err) return bad(pr.err);
    if (await one(env, "SELECT 1 FROM users WHERE username=?", pr.username)) return bad("Username นี้มีคนใช้แล้ว เลือกชื่ออื่น", 409);
    const id = randToken(12), t = now();
    // claim the invitation first: only one sign-up can win it, even two at the same moment
    const c = await exec(env, "UPDATE invites SET used_at=?, used_by=? WHERE id=? AND used_at IS NULL AND revoked_at IS NULL AND expires_at>?", t, id, i.id, t);
    if (c.meta.changes !== 1) return bad("คำเชิญนี้ใช้ไม่ได้แล้ว (ใช้สมัครไปแล้ว หมดอายุ หรือถูกยกเลิก)", 410);
    try {
      await exec(env, "INSERT INTO users(id,username,role,first_name,last_name,nickname,pw_hash,created_at,updated_at,pw_changed_at,last_login,invite_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",
        id, pr.username, "employee", pr.first, pr.last, pr.nick, await makeHash(env, String(body.password)), t, t, t, t, i.id);
    } catch (e) {
      await exec(env, "UPDATE invites SET used_at=NULL, used_by=NULL WHERE id=? AND used_by=?", i.id, id);   // give the invitation back
      if (/UNIQUE/i.test(String(e))) return bad("Username นี้มีคนใช้แล้ว เลือกชื่ออื่น", 409);
      throw e;
    }
    const u = { id, username: pr.username };
    await logEv(env, req, { user: u, type: "invite_used", detail: "สมัครด้วย" + (body.token ? "ลิงก์เชิญ" : "รหัสเชิญ") });
    return json({ ok: true, message: "สมัครสำเร็จ กำลังเข้าใช้งาน" }, 200, { "set-cookie": await newSession(env, req, u, false) });
  }
  return null;
}

const PUBLIC_FILES = new Set(["/manifest.webmanifest", "/icon-192.png", "/icon-512.png", "/icon-maskable-512.png", "/sw.js"]);

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const p = url.pathname, m = req.method;
    if (PUBLIC_FILES.has(p)) return env.ASSETS.fetch(req);

    let body = {};
    if (m !== "GET" && m !== "HEAD") {
      // JSON only, from this site only: a form or script on another site cannot send these
      if (m !== "DELETE" && !(req.headers.get("content-type") || "").includes("application/json")) return bad("ต้องส่งเป็น JSON", 415);
      const o = req.headers.get("origin");
      if (o && o !== url.origin) return bad("ไม่อนุญาต", 403);
      if (m !== "DELETE") { body = await req.json().catch(() => null); if (!body || typeof body !== "object") return bad("ข้อมูลไม่ถูกต้อง"); }
    }
    await ensureSchema(env);

    if (m === "POST" && p.startsWith("/api/")) { const r = await publicApi(req, env, url, body); if (r) return r; }
    const s = await session(req, env);
    const withRenew = (r) => { if (s && s.renew) r.headers.append("set-cookie", s.renew); return r; };

    if (p.startsWith("/api/")) return s ? withRenew(await api(req, env, url, s, body)) : bad("ยังไม่ได้เข้าสู่ระบบ", 401);
    if (m !== "GET" && m !== "HEAD") return bad("ไม่พบ", 404);
    if (p === "/login") {
      if (s) return Response.redirect(url.origin + "/", 302);
      return (await one(env, "SELECT 1 FROM users WHERE role='owner'")) ? loginPage() : setupPage(!!(env.SETUP_CODE && String(env.SETUP_CODE).length >= 12));
    }
    if (p === "/recover") return recoverPage();
    if (p === "/invite" || p.startsWith("/invite/")) {
      const token = p.slice(8);
      if (!token) return invitePage(null);
      const i = await findInvite(env, { token });
      if (!inviteOk(i)) return invitePage("bad");
      if (!i.opened_at) await exec(env, "UPDATE invites SET opened_at=? WHERE id=?", now(), i.id);   // opening does not use it up
      return invitePage(i, token);
    }
    // every page and file of the tool: logged-in sessions only
    if (!s) return Response.redirect(url.origin + "/login", 302);
    const r = await env.ASSETS.fetch(req);
    const h = new Headers(r.headers);
    h.set("cache-control", "no-store");
    for (const [k, v] of Object.entries(SEC_HEADERS)) h.set(k, v);
    if (s.renew) h.append("set-cookie", s.renew);
    return new Response(r.body, { status: r.status, headers: h });
  }
};
