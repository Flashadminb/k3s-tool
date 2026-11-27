/*
 * IDATA TOOLS login server (Cloudflare Worker, free plan).
 *
 * The whole site is served from here and only after login. Two kinds of people:
 *   - owner (admin): password set by the owner on first visit, can change everything (settings, staff, Telegram bot)
 *   - staff: name + a random password the server makes and sends to that person's Telegram at the hours the owner
 *     chose (Thai time). Staff can use the tools; settings they change stay on their own browser only.
 *
 * Storage: one KV namespace (binding DB)
 *   admin            {name, salt, hash}
 *   staff            [{id, name, chatId, times:[hours], enabled, salt, hash, gen, last, sentAt}]
 *   tg               {token, secret, bot, origin}
 *   settings         shared tool settings (Wi-Fi list, model folders, Flash Kit link, standard settings, ...)
 *   sess:<token>     {role, id, name, gen}            expires by itself after SESSION_H hours
 *   rl:<ip>          failed logins in the last 15 minutes
 */
const SESSION_H = 12;
const MAX_FAILS = 10;
const PW_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // no 0/O, 1/I/L: easy to type from a phone message
const enc = new TextEncoder();
const TZ_OFFSET_H = 7; // Thailand, no daylight saving

const b64u = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const randToken = (n = 32) => b64u(crypto.getRandomValues(new Uint8Array(n)));
function randPassword(len = 8) {
  const out = [];
  const r = crypto.getRandomValues(new Uint8Array(len * 2));
  for (const x of r) { if (x < 248) out.push(PW_ALPHABET[x % PW_ALPHABET.length]); if (out.length === len) break; } // 248 = 8*31: no bias
  while (out.length < len) out.push(PW_ALPHABET[crypto.getRandomValues(new Uint8Array(1))[0] % PW_ALPHABET.length]);
  return out.join("");
}
async function hashPw(pw, salt) {
  const key = await crypto.subtle.importKey("raw", enc.encode(pw), "PBKDF2", false, ["deriveBits"]);
  // iterations kept modest: the free plan allows ~10 ms of CPU per request. Logins are rate limited per IP.
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: enc.encode(salt), iterations: 20000 }, key, 256);
  return b64u(bits);
}
function sameStr(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}
async function setPw(obj, pw) { obj.salt = randToken(16); obj.hash = await hashPw(pw, obj.salt); return obj; }
async function checkPw(obj, pw) { return !!(obj && obj.hash && sameStr(await hashPw(String(pw || ""), obj.salt), obj.hash)); }
const norm = (s) => String(s || "").trim().toLowerCase();

const json = (data, status = 200, headers = {}) => new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers } });
const bad = (msg, status = 400) => json({ error: msg }, status);
const getJ = async (env, k, def) => (await env.DB.get(k, "json")) ?? def;
const putJ = (env, k, v, opt) => env.DB.put(k, JSON.stringify(v), opt);

function thaiNow(ms = Date.now()) {
  const d = new Date(ms + TZ_OFFSET_H * 3600e3);
  return { day: d.toISOString().slice(0, 10), hour: d.getUTCHours() };
}
function nextRotation(times, ms = Date.now()) {
  const { hour } = thaiNow(ms);
  const hs = [...new Set(times)].sort((a, b) => a - b);
  if (!hs.length) return "";
  const n = hs.find((h) => h > hour);
  return n !== undefined ? `วันนี้ ${String(n).padStart(2, "0")}:00` : `พรุ่งนี้ ${String(hs[0]).padStart(2, "0")}:00`;
}
const publicStaff = (s) => ({ id: s.id, name: s.name, chatId: s.chatId || "", times: s.times || [], enabled: s.enabled !== false, sentAt: s.sentAt || 0, sendError: s.sendError || "", hasPassword: !!s.hash });

/* ---------- cookies / sessions ---------- */
function cookie(req, name) {
  const m = (req.headers.get("cookie") || "").match(new RegExp("(?:^|;\\s*)" + name + "=([^;]+)"));
  return m ? m[1] : "";
}
const sessCookie = (tok, maxAge) => `idt=${tok}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`;
async function session(req, env) {
  const tok = cookie(req, "idt");
  if (!tok) return null;
  const s = await getJ(env, "sess:" + tok, null);
  if (!s) return null;
  if (s.role === "staff") {
    // a removed or switched-off staff member is out at once, even with a live session
    const st = (await getJ(env, "staff", [])).find((x) => x.id === s.id);
    if (!st || st.enabled === false || (st.gen || 0) !== (s.gen || 0)) return null;
  }
  return { ...s, tok };
}
async function newSession(env, data) {
  const tok = randToken();
  await putJ(env, "sess:" + tok, data, { expirationTtl: SESSION_H * 3600 });
  return tok;
}

/* ---------- Telegram ---------- */
const tgApi = (env) => env.TG_API || "https://api.telegram.org";
async function tgCall(env, token, method, body) {
  const r = await fetch(`${tgApi(env)}/bot${token}/${method}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!j.ok) throw new Error(j.description || "Telegram HTTP " + r.status);
  return j.result;
}
async function rotate(env, staff, s, why) {
  const pw = randPassword();
  await setPw(s, pw);
  s.sentAt = Date.now(); s.sendError = "";
  const tg = await getJ(env, "tg", null);
  let sent = false;
  if (tg && tg.token && s.chatId) {
    const next = nextRotation(s.times || []);
    const text = `🔑 IDATA TOOLS\nรหัสเข้าเว็บของ ${s.name}: ${pw}\n${next ? "ใช้ได้จนถึงรอบเปลี่ยนรหัสถัดไป (" + next + ")" : "ใช้ได้จนกว่าหัวหน้าจะเปลี่ยนรหัส"}${tg.origin ? "\n" + tg.origin : ""}\n(${why})`;
    try { await tgCall(env, tg.token, "sendMessage", { chat_id: s.chatId, text }); sent = true; }
    catch (e) { s.sendError = String(e.message || e).slice(0, 200); }
  } else s.sendError = !s.chatId ? "ยังไม่ได้ใส่ Chat ID" : "ยังไม่ได้ตั้งบอท Telegram";
  await putJ(env, "staff", staff);
  return { pw, sent };
}

/* ---------- login page (served without a session) ---------- */
function loginPage(needSetup) {
  return new Response(`<!doctype html><html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>IDATA TOOLS · เข้าสู่ระบบ</title><link rel="manifest" href="/manifest.webmanifest"><link rel="icon" href="/icon-192.png">
<link href="https://fonts.googleapis.com/css2?family=Prompt:wght@400;600&display=swap" rel="stylesheet">
<style>
:root{--bg:#070b1a;--card:rgba(20,27,52,.86);--line:rgba(232,190,90,.28);--gold:#e8be5a;--text:#eef1fb;--mut:#a7b0cc;--red:#ff7b7b}
*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;padding:16px;background:radial-gradient(1200px 700px at 70% 20%,#18234a,transparent),var(--bg);color:var(--text);font:16px/1.5 Prompt,system-ui,sans-serif}
form{width:100%;max-width:380px;background:var(--card);border:1px solid var(--line);border-radius:20px;padding:28px 24px;box-shadow:0 20px 60px rgba(0,0,0,.45)}
h1{margin:0;font-size:24px;letter-spacing:.5px}h1 small{display:block;font-size:12px;color:var(--mut);letter-spacing:2px;font-weight:400}
p{color:var(--mut);margin:10px 0 18px;font-size:14px}label{display:block;font-size:14px;color:var(--mut);margin:12px 0 6px}
input{width:100%;padding:12px 14px;border-radius:12px;border:1px solid rgba(255,255,255,.16);background:rgba(0,0,0,.25);color:var(--text);font:inherit}
input:focus{outline:2px solid var(--gold);outline-offset:1px}
button{margin-top:20px;width:100%;padding:13px;border:0;border-radius:12px;background:var(--gold);color:#1b1400;font:600 16px Prompt,system-ui,sans-serif;cursor:pointer}
#err{color:var(--red);font-size:14px;min-height:20px;margin-top:12px}
</style></head><body>
<form id="f" autocomplete="on">
<h1>IDATA TOOLS<small>BPL HUB · FLASH KIT</small></h1>
${needSetup ? `<p>ตั้งค่าครั้งแรก: ตั้งชื่อและรหัสของเจ้าของ (เข้าได้ทุกอย่าง เปลี่ยนหลังบ้านได้) · รหัสอย่างน้อย 8 ตัว</p>
<label for="n">ชื่อเจ้าของ</label><input id="n" name="username" autocomplete="username" required>
<label for="p">รหัส</label><input id="p" name="password" type="password" autocomplete="new-password" minlength="8" required>
<label for="p2">ใส่รหัสอีกครั้ง</label><input id="p2" type="password" autocomplete="new-password" minlength="8" required>
<button>ตั้งรหัสและเข้าใช้งาน</button>` : `<p>ใส่ชื่อและรหัส · พนักงานใช้รหัสล่าสุดที่บอทส่งให้ใน Telegram</p>
<label for="n">ชื่อ</label><input id="n" name="username" autocomplete="username" required>
<label for="p">รหัส</label><input id="p" name="password" type="password" autocomplete="current-password" required>
<button>เข้าสู่ระบบ</button>`}
<div id="err" role="alert"></div></form>
<script>
const f=document.getElementById("f"),err=document.getElementById("err");
f.addEventListener("submit",async(e)=>{e.preventDefault();err.textContent="";
const n=document.getElementById("n").value,p=document.getElementById("p").value,p2=document.getElementById("p2");
if(p2&&p2.value!==p){err.textContent="รหัสสองช่องไม่ตรงกัน";return}
const r=await fetch(${needSetup ? '"/api/setup"' : '"/api/login"'},{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({name:n,password:p.trim()})});
const j=await r.json().catch(()=>({}));if(r.ok)location.href="/";else err.textContent=j.error||"เข้าไม่ได้";});
</script></body></html>`, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "x-frame-options": "DENY", "referrer-policy": "no-referrer" } });
}

const PUBLIC = new Set(["/manifest.webmanifest", "/icon-192.png", "/icon-512.png", "/icon-maskable-512.png", "/sw.js"]);

async function api(req, env, url, s) {
  const p = url.pathname, m = req.method;
  const body = m === "POST" || m === "PUT" ? await req.json().catch(() => ({})) : {};
  const admin = s && s.role === "admin";

  if (p === "/api/me" && m === "GET") return s ? json({ role: s.role, name: s.name }) : bad("ยังไม่ได้เข้าสู่ระบบ", 401);
  if (p === "/api/logout" && m === "POST") {
    if (s) await env.DB.delete("sess:" + s.tok);
    return json({ ok: true }, 200, { "set-cookie": sessCookie("x", 0) });
  }
  if (!s) return bad("ยังไม่ได้เข้าสู่ระบบ", 401);

  if (p === "/api/settings") {
    if (m === "GET") return json(await getJ(env, "settings", {}));
    if (m === "PUT" && admin) { await putJ(env, "settings", body || {}); return json({ ok: true }); }
  }
  if (!admin) return bad("เฉพาะเจ้าของเท่านั้น", 403);

  if (p === "/api/staff" && m === "GET") {
    const staff = await getJ(env, "staff", []);
    return json(staff.map((x) => ({ ...publicStaff(x), next: x.enabled !== false ? nextRotation(x.times || []) : "" })));
  }
  if (p === "/api/staff" && m === "POST") {
    const staff = await getJ(env, "staff", []);
    const name = String(body.name || "").trim().slice(0, 40);
    if (!name) return bad("ใส่ชื่อพนักงาน");
    const adminRec = await getJ(env, "admin", {});
    if (norm(name) === norm(adminRec.name) || staff.some((x) => norm(x.name) === norm(name) && x.id !== body.id)) return bad("ชื่อนี้มีแล้ว");
    const times = [...new Set((Array.isArray(body.times) ? body.times : []).map(Number).filter((h) => Number.isInteger(h) && h >= 0 && h <= 23))].sort((a, b) => a - b);
    const chatId = String(body.chatId || "").trim().replace(/[^-\d]/g, "").slice(0, 20);
    let s1 = staff.find((x) => x.id === body.id);
    if (s1) {
      const wasOn = s1.enabled !== false;
      Object.assign(s1, { name, chatId, times, enabled: body.enabled !== false });
      if (wasOn && s1.enabled === false) s1.gen = (s1.gen || 0) + 1; // switching someone off ends their sessions
    } else { s1 = { id: randToken(9), name, chatId, times, enabled: body.enabled !== false, gen: 0 }; staff.push(s1); }
    await putJ(env, "staff", staff);
    return json(publicStaff(s1));
  }
  if (p === "/api/staff" && m === "DELETE") {
    const id = url.searchParams.get("id");
    await putJ(env, "staff", (await getJ(env, "staff", [])).filter((x) => x.id !== id));
    return json({ ok: true });
  }
  if (p === "/api/staff/rotate" && m === "POST") {
    const staff = await getJ(env, "staff", []);
    const s1 = staff.find((x) => x.id === body.id);
    if (!s1) return bad("ไม่พบพนักงาน", 404);
    const r = await rotate(env, staff, s1, "หัวหน้าสั่งเปลี่ยนรหัส");
    return json({ password: r.pw, sent: r.sent, error: s1.sendError });
  }
  if (p === "/api/telegram" && m === "GET") { const tg = await getJ(env, "tg", null); return json({ set: !!(tg && tg.token), bot: (tg && tg.bot) || "" }); }
  if (p === "/api/telegram" && m === "POST") {
    const token = String(body.token || "").trim();
    if (!/^\d+:[\w-]{30,}$/.test(token)) return bad("Token ไม่ถูกรูปแบบ (ได้จาก @BotFather หน้าตาแบบ 123456:ABC...)");
    let me;
    try { me = await tgCall(env, token, "getMe", {}); } catch (e) { return bad("Telegram ไม่รับ Token นี้: " + e.message); }
    const secret = randToken(24);
    const origin = url.origin;
    try { await tgCall(env, token, "setWebhook", { url: `${origin}/tg/${secret}`, secret_token: secret, allowed_updates: ["message"] }); }
    catch (e) { return bad("ตั้ง webhook ไม่ได้: " + e.message); }
    await putJ(env, "tg", { token, secret, bot: me.username || "", origin });
    return json({ ok: true, bot: me.username || "" });
  }
  if (p === "/api/admin/password" && m === "POST") {
    const a = await getJ(env, "admin", null);
    if (!(await checkPw(a, body.old))) return bad("รหัสเดิมไม่ถูก", 403);
    if (String(body.password || "").length < 8) return bad("รหัสใหม่อย่างน้อย 8 ตัว");
    await putJ(env, "admin", await setPw(a, String(body.password)));
    return json({ ok: true });
  }
  return bad("ไม่พบ", 404);
}

async function telegramHook(req, env, secret) {
  const tg = await getJ(env, "tg", null);
  if (!tg || !sameStr(secret, tg.secret) || !sameStr(req.headers.get("x-telegram-bot-api-secret-token") || "", tg.secret)) return new Response("no", { status: 403 });
  const u = await req.json().catch(() => ({}));
  const msg = u.message;
  if (msg && msg.chat && msg.chat.id) {
    const id = String(msg.chat.id);
    const who = (await getJ(env, "staff", [])).find((x) => x.chatId === id);
    const text = who
      ? `สวัสดี ${who.name} 👋\nบอทจะส่งรหัสเข้า IDATA TOOLS ให้ที่นี่ตามเวลาที่หัวหน้าตั้งไว้`
      : `Chat ID ของคุณคือ ${id}\nส่งเลขนี้ให้หัวหน้า เพื่อรับรหัสเข้า IDATA TOOLS`;
    await tgCall(env, tg.token, "sendMessage", { chat_id: msg.chat.id, text }).catch(() => {});
  }
  return json({ ok: true });
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const p = url.pathname;
    if (p.startsWith("/tg/") && req.method === "POST") return telegramHook(req, env, p.slice(4));
    if (PUBLIC.has(p)) return env.ASSETS.fetch(req);

    // JSON only for writes: a plain HTML form on another site cannot send these (together with SameSite cookies)
    if (req.method !== "GET" && req.method !== "HEAD" && !(req.headers.get("content-type") || "").includes("application/json")) return bad("ต้องส่งเป็น JSON", 415);

    if (p === "/api/setup" && req.method === "POST") {
      if (await env.DB.get("admin")) return bad("ตั้งรหัสเจ้าของไปแล้ว", 409);
      const b = await req.json().catch(() => ({}));
      const name = String(b.name || "").trim().slice(0, 40);
      if (!name || String(b.password || "").length < 8) return bad("ใส่ชื่อ และรหัสอย่างน้อย 8 ตัว");
      await putJ(env, "admin", await setPw({ name }, String(b.password)));
      const tok = await newSession(env, { role: "admin", name });
      return json({ ok: true }, 200, { "set-cookie": sessCookie(tok, SESSION_H * 3600) });
    }
    if (p === "/api/login" && req.method === "POST") {
      const ip = req.headers.get("cf-connecting-ip") || "local";
      const fails = parseInt((await env.DB.get("rl:" + ip)) || "0", 10);
      if (fails >= MAX_FAILS) return bad("ใส่รหัสผิดหลายครั้ง รอ 15 นาทีแล้วลองใหม่", 429);
      const b = await req.json().catch(() => ({}));
      const name = norm(b.name);
      const a = await getJ(env, "admin", null);
      let who = null;
      if (a && name === norm(a.name) && (await checkPw(a, b.password))) who = { role: "admin", name: a.name };
      else {
        const st = (await getJ(env, "staff", [])).find((x) => norm(x.name) === name && x.enabled !== false);
        if (st && (await checkPw(st, String(b.password || "").toUpperCase()))) who = { role: "staff", id: st.id, name: st.name, gen: st.gen || 0 };
      }
      if (!who) { await env.DB.put("rl:" + ip, String(fails + 1), { expirationTtl: 900 }); return bad("ชื่อหรือรหัสไม่ถูก", 401); }
      const tok = await newSession(env, who);
      return json({ ok: true, role: who.role }, 200, { "set-cookie": sessCookie(tok, SESSION_H * 3600) });
    }

    const s = await session(req, env);
    if (p.startsWith("/api/")) return api(req, env, url, s);
    if (p === "/login") return s ? Response.redirect(url.origin + "/", 302) : loginPage(!(await env.DB.get("admin")));
    if (!s) return Response.redirect(url.origin + "/login", 302);
    const r = await env.ASSETS.fetch(req);
    const h = new Headers(r.headers);
    h.set("cache-control", "no-store"); h.set("x-frame-options", "DENY");
    return new Response(r.body, { status: r.status, headers: h });
  },

  // Every hour: staff whose chosen hour (Thai time) it is get a new password by Telegram
  async scheduled(ctrl, env) {
    const { day, hour } = thaiNow(ctrl.scheduledTime);
    const staff = await getJ(env, "staff", []);
    for (const s of staff) {
      if (s.enabled === false || !(s.times || []).includes(hour)) continue;
      const mark = `${day}-${hour}`;
      if (s.last === mark) continue;
      s.last = mark;
      await rotate(env, staff, s, "เปลี่ยนรหัสตามเวลา");
    }
  }
};
