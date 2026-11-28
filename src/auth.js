// Login + shared settings + command verification, when the page is served by the login server (worker/index.js).
// Opened any other way (a saved file, tests) there is no server: role "local", everything allowed.
// The session itself is an HttpOnly cookie: this file never sees or stores a token.
import * as st from "./store.js";

// Settings shared by every computer and phone: the owner's copy lives on the server
export const SYNC_KEYS = ["profiles", "banned", "std", "flash", "wifi", "fieldLock", "gEmail", "names", "wallLearn", "portal"];
export let me = { role: "local", name: "" };
export const ACT_LABEL = { delete: "ลบข้อมูล", unlock: "ปลดล็อกแอป", reset: "รีเซ็ตเครื่อง (Factory Reset)", recovery: "เข้าเมนู Recovery", uninstall: "ถอนแอป", autodelete: "เปิดลบอัตโนมัติ", settings: "เปลี่ยนค่าหลังบ้าน", adbkey: "นำเข้ากุญแจ ADB" };

/** fetch JSON; 401 = the session is gone -> login page */
async function raw(method, path, body, headers = {}) {
  const r = await fetch(path, { method, credentials: "same-origin", headers: { ...(body ? { "content-type": "application/json" } : {}), ...headers }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (r.status === 401) { location.href = "/login"; throw new Error("LOGIN"); }
  return { ok: r.ok, status: r.status, j };
}
async function call(method, path, body) {
  const r = await raw(method, path, body);
  if (!r.ok) throw new Error(r.j.error || "HTTP " + r.status);
  return r.j;
}
export const apiGet = (p) => call("GET", p);
export const apiPost = (p, b) => call("POST", p, b || {});
export const apiDel = (p) => call("DELETE", p);

export async function initAuth() {
  let r;
  try { r = await fetch("/api/me", { credentials: "same-origin" }); } catch (e) { return me; }
  if (r.status === 401) { location.href = "/login"; await new Promise(() => {}); }
  if (!r.ok || !(r.headers.get("content-type") || "").includes("json")) return me;   // no login server here
  me = await r.json();
  // fresh computer or phone: settings come from the server, so it is ready to use right after login
  try {
    const s = await apiGet("/api/settings");
    for (const k of SYNC_KEYS) if (k in s) st.save(k, s[k]);
  } catch (e) {}
  if (me.role === "admin") st.onSave((k) => { if (SYNC_KEYS.includes(k)) pushSoon(); });
  return me;
}

let pushT = null;
function pushSoon() {
  clearTimeout(pushT);
  pushT = setTimeout(pushNow, 1200);
}
async function pushNow(ticket) {
  const out = {};
  for (const k of SYNC_KEYS) { const v = st.load(k, undefined); if (v !== undefined) out[k] = v; }
  try {
    const r = await raw("PUT", "/api/settings", out, ticket ? { "x-idt-ticket": ticket } : {});
    if (r.ok) return;
    if (r.j.verify) {
      // an important back-office change: confirm the password first
      const v = await verifyDialog({ action: "settings", text: "บันทึกค่าหลังบ้านที่แก้ไว้ขึ้นระบบ (ทุกเครื่องจะได้ค่านี้)" });
      if (v) return pushNow(v.ticket);
      notice("ยังไม่ได้บันทึกค่าหลังบ้านขึ้นระบบ: ค่าที่แก้ใช้ได้แค่คอมนี้ จนกว่าจะยืนยันรหัสผ่าน");
      return;
    }
    notice("บันทึกค่าหลังบ้านไม่สำเร็จ: " + (r.j.error || r.status));
  } catch (e) { if (e.message !== "LOGIN") notice("บันทึกค่าหลังบ้านไม่สำเร็จ: " + e.message); }
}
let noticeFn = (t) => console.warn(t);
export const onNotice = (fn) => { noticeFn = fn; };
const notice = (t) => noticeFn(t);

/** POST that may need the password first (server answers verify:true): asks once, then sends again with the ticket */
export async function verifiedPost(action, path, body, text) {
  let r = await raw("POST", path, body);
  if (!r.ok && r.j.verify) {
    const v = await verifyDialog({ action, text });
    if (!v) return null;
    r = await raw("POST", path, body, v.ticket ? { "x-idt-ticket": v.ticket } : {});
  }
  if (!r.ok) throw new Error(r.j.error || "HTTP " + r.status);
  return r.j;
}
export async function logout() { try { await apiPost("/api/logout"); } catch (e) {} location.href = "/login"; }

/**
 * Ask the server before a risky command. Inside the 8-hour window it just says yes (and records it);
 * otherwise the Energy Shield window asks for the password. Factory reset always asks for the word RESET too.
 * Resolves true = go ahead, false = cancelled. Without the login server: always true.
 */
export async function guard(action, detail) {
  if (me.role === "local") return true;
  if (action !== "reset") {
    const r = await raw("POST", "/api/authorize", { action, detail });
    if (r.ok) return true;
    if (!r.j.verify) throw new Error(r.j.error || "ไม่อนุญาต");
  }
  return !!(await verifyDialog({ action, detail }));
}

/* ---------- Energy Shield verification window (markup in index.html: #vfy) ---------- */
const $ = (id) => document.getElementById(id);
function verifyDialog({ action, detail, text }) {
  return new Promise(async (resolve) => {
    const isReset = action === "reset";
    let inWindow = false;
    if (isReset) { try { const m = await apiGet("/api/me"); inWindow = m.verifiedUntil > Date.now(); } catch (e) {} }
    const box = $("vfy"), sh = $("vfyShield"), err = $("vfyErr"), pw = $("vfyPw"), rs = $("vfyReset"), okB = $("vfyOk");
    $("vfyWhat").textContent = (ACT_LABEL[action] || action) + (detail ? " · " + detail : "");
    $("vfyText").textContent = text || (isReset ? "ขั้นสุดท้าย: พิมพ์ RESET แล้วกดยืนยัน" : "คำสั่งนี้ต้องยืนยันตัวตนด้วยรหัสผ่านของคุณ");
    $("vfyPwRow").hidden = inWindow; $("vfyModes").hidden = inWindow;
    rs.parentElement.hidden = !isReset;
    pw.value = ""; rs.value = ""; err.textContent = ""; err.className = "";
    $("vfyOnce").checked = true;
    sh.className = "shield"; box.hidden = false; box.classList.remove("out");
    (inWindow ? rs : pw).focus();
    const state = (s, m, good) => { sh.className = "shield " + (s || ""); err.textContent = m || ""; err.className = good ? "good" : ""; };
    const close = (v) => { box.classList.add("out"); setTimeout(() => { box.hidden = true; }, 220); okB.onclick = $("vfyNo").onclick = box.onkeydown = null; resolve(v); };
    const submit = async () => {
      if (isReset && rs.value.trim().toUpperCase() !== "RESET") { state("bad", "พิมพ์ RESET ให้ถูกก่อน"); rs.focus(); return; }
      if (!inWindow && !pw.value) { state("bad", "ใส่รหัสผ่าน"); pw.focus(); return; }
      okB.disabled = true; state("busy", "กำลังตรวจสอบตัวตน...");
      const t0 = Date.now();
      let r;
      try {
        r = inWindow ? await raw("POST", "/api/authorize", { action, detail, confirm: "RESET" })
          : await raw("POST", "/api/verify", { action, detail, password: pw.value, remember: $("vfyRemember").checked, confirm: isReset ? "RESET" : undefined });
      } catch (e) { okB.disabled = false; state("bad", e.message === "LOGIN" ? "" : "ติดต่อระบบไม่ได้"); return; }
      await new Promise((x) => setTimeout(x, Math.max(0, 650 - (Date.now() - t0))));
      okB.disabled = false;
      if (r.ok) {
        if (r.j.verifiedUntil) me.verifiedUntil = r.j.verifiedUntil;
        state("ok", r.j.verifiedUntil ? "ยืนยันแล้ว ใช้คำสั่งสำคัญได้ถึง " + new Date(r.j.verifiedUntil).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" }) : "ยืนยันตัวตนแล้ว", true);
        setTimeout(() => close({ ticket: r.j.ticket || "" }), 700);
        return;
      }
      if (r.j.locked) { state("bad", r.j.error); setTimeout(() => { location.href = "/login"; }, 2500); return; }
      if (r.j.verify && inWindow) { inWindow = false; $("vfyPwRow").hidden = false; $("vfyModes").hidden = false; state("bad", "การยืนยันหมดอายุแล้ว ใส่รหัสผ่านอีกครั้ง"); pw.focus(); return; }
      state("bad", r.j.error || "ไม่สำเร็จ"); pw.value = ""; pw.focus();
    };
    okB.onclick = submit;
    $("vfyNo").onclick = () => close(null);
    box.onkeydown = (e) => { if (e.key === "Enter") submit(); if (e.key === "Escape") close(null); };
  });
}
