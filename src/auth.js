// Login + shared settings, when the page is served by the login server (worker/index.js).
// Opened any other way (GitHub Pages, a saved file, tests) there is no server: role "local", everything allowed.
import * as st from "./store.js";

// Settings shared by every computer and phone: the owner's copy lives on the server
export const SYNC_KEYS = ["profiles", "banned", "std", "flash", "wifi", "fieldLock", "gEmail", "names"];
export let me = { role: "local", name: "" };

async function call(method, path, body) {
  const r = await fetch(path, { method, credentials: "same-origin", headers: body ? { "content-type": "application/json" } : {}, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (r.status === 401) { location.href = "/login"; throw new Error("LOGIN"); }
  if (!r.ok) throw new Error(j.error || "HTTP " + r.status);
  return j;
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
  pushT = setTimeout(() => {
    const out = {};
    for (const k of SYNC_KEYS) { const v = st.load(k, undefined); if (v !== undefined) out[k] = v; }
    call("PUT", "/api/settings", out).catch((e) => console.warn("sync", e));
  }, 1200);
}
export async function logout() { try { await apiPost("/api/logout"); } catch (e) {} location.href = "/login"; }
