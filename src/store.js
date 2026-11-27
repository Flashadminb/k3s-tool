// Everything saved in this browser (localStorage). Wrapped so a blocked storage never breaks the page.
const KEY = "k3s-tool:";
export function load(name, def) {
  try { const v = localStorage.getItem(KEY + name); return v == null ? def : JSON.parse(v); } catch (e) { return def; }
}
let hook = null;
export function onSave(f) { hook = f; }
export function save(name, v) {
  try { localStorage.setItem(KEY + name, JSON.stringify(v)); } catch (e) {}
  if (hook) hook(name);
}

/* ---------- Model profiles: where each model keeps its photos ---------- */
export const DEFAULT_PROFILE = { name: "K3S (ค่าเริ่มต้น)", match: "", success: "/sdcard/imagePath/success", fail: "/sdcard/imagePath/fail" };
export function profiles() { return load("profiles", [{ name: "K3S", match: "K3S", success: DEFAULT_PROFILE.success, fail: DEFAULT_PROFILE.fail }]); }
export function saveProfiles(list) { save("profiles", list); }
/** Pick the profile whose "match" text is part of the model name; fall back to K3S paths */
export function profileFor(model) {
  const m = String(model || "").toLowerCase();
  return profiles().find((p) => p.match && m.includes(p.match.toLowerCase())) || DEFAULT_PROFILE;
}

/* ---------- History of deletions ---------- */
export function history() { return load("history", []); }
export function addHistory(e) {
  const h = history(); h.unshift({ time: Date.now(), ...e });
  save("history", h.slice(0, 2000));
}
export function clearHistory() { save("history", []); }

/* ---------- Device registry (every device ever connected) ---------- */
export function registry() { return load("registry", {}); }
export function updateRegistry(serial, data) {
  const r = registry();
  const now = Date.now();
  r[serial] = { firstSeen: now, ...(r[serial] || {}), ...data, serial, lastSeen: now };
  save("registry", r);
}
export function removeRegistry(serial) { const r = registry(); delete r[serial]; save("registry", r); }

/* ---------- Banned apps list ---------- */
export const DEFAULT_BANNED = [
  "com.zhiliaoapp.musically", "com.ss.android.ugc.trill", // TikTok
  "com.dts.freefireth", "com.dts.freefiremax",               // Free Fire
  "com.garena.game.kgth",                                    // ROV
  "com.tencent.ig",                                          // PUBG Mobile
  "com.mobile.legends",                                      // Mobile Legends
  "com.roblox.client"                                        // Roblox
];
export function banned() { return load("banned", DEFAULT_BANNED); }
export function saveBanned(list) { save("banned", list); }

/* ---------- Standard device settings ---------- */
export const DEFAULT_STD = { timeoutMin: 5, brightness: 70, autoBrightness: false, autoTime: true, noAnim: true, stayAwake: false };
export function stdSettings() { return { ...DEFAULT_STD, ...load("std", {}) }; }
export function saveStd(v) { save("std", v); }

/* ---------- CSV export (Excel opens UTF-8 Thai correctly with the BOM) ---------- */
export function toCsv(rows) {
  const esc = (v) => { const s = v == null ? "" : String(v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  return "﻿" + rows.map((r) => r.map(esc).join(",")).join("\r\n");
}

/* ---------- Flash Kit: where to download it and which version counts as current ---------- */
export const DEFAULT_FLASH = { url: "https://fle.pub/ay9kj5", latest: "8.2.65" };
export function flashCfg() { return { ...DEFAULT_FLASH, ...load("flash", {}) }; }
export function saveFlashCfg(v) { save("flash", v); }

/* ---------- Saved Wi-Fi networks (this browser only, plain text: the page warns about it) ---------- */
export function wifiList() { return load("wifi", []); }
export function saveWifiList(v) { save("wifi", v); }
