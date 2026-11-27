import * as adb from "./adb.js";
import * as st from "./store.js";
import { appName, CRITICAL } from "./appnames.js";

const q = adb.q;
const $ = (id) => document.getElementById(id);
const el = (tag, props = {}, ...kids) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === "class") e.className = v;
    else if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
    else if (k === "text") e.textContent = v;
    else e.setAttribute(k, v);
  }
  kids.flat().forEach((c) => c != null && e.append(c));
  return e;
};

/* =====================================================================
   Help guides shown when something goes wrong (code -> title, steps, link)
   ===================================================================== */
const PT = { label: "โหลด Platform-Tools (เพื่อใช้ adb kill-server)", url: "https://developer.android.com/tools/releases/platform-tools" };
const HELP = {
  NO_WEBUSB: ["ใช้เบราว์เซอร์ไม่ถูก", ["เปิดหน้านี้ด้วย Google Chrome หรือ Microsoft Edge บนคอม (Firefox/Safari ใช้ไม่ได้)", "ต้องเปิดจากคอม ไม่ใช่จากมือถือ"]],
  NO_DEVICE_SELECTED: ["ยังไม่ได้เลือกเครื่อง", ["กด + เชื่อมต่อเครื่อง อีกครั้ง แล้วคลิกชื่อเครื่องในหน้าต่างที่เด้งขึ้น แล้วกด เชื่อมต่อ", "ถ้าไม่เห็นชื่อเครื่องในรายการ ให้ดูแท็บ คู่มือ หัวข้อ แก้ปัญหา: ไม่เห็นชื่อเครื่อง"]],
  BUSY: ["เครื่องถูกโปรแกรมอื่นใช้อยู่", ["กดปุ่ม Windows พิมพ์ cmd แล้วกด Enter", "พิมพ์ cd C:\\Users\\Flash\\Desktop\\Best\\platform-tools แล้วกด Enter", "พิมพ์ adb kill-server แล้วกด Enter", "ปิดแท็บอื่นที่เปิดหน้านี้ซ้ำ และปิดโปรแกรมอื่นที่ใช้มือถือ เช่น Android Studio, scrcpy", "ถอดสาย USB แล้วเสียบใหม่ แล้วกดเชื่อมต่ออีกครั้ง"], PT],
  UNPLUGGED: ["สาย USB หลุด หรือเครื่องถูกถอด", ["เสียบสายกลับเข้าไป รอ 3 วินาที เว็บจะเชื่อมต่อให้เอง (ถ้าไม่ต่อ ให้กด + เชื่อมต่อเครื่อง)", "กดปุ่มเดิมอีกครั้งได้เลย ลบซ้ำได้ ไม่มีอะไรเสีย", "ถ้าหลุดบ่อย: เปลี่ยนสาย หรือเสียบเข้าคอมตรงๆ ไม่ผ่านสายต่อพ่วง"]],
  NOT_CONNECTED: ["ยังไม่ได้เชื่อมต่อ", ["กดปุ่ม + เชื่อมต่อเครื่อง ก่อน", "ถ้าเพิ่งถอดสาย ให้เสียบใหม่"]],
  AUTH: ["เครื่องยังไม่อนุญาต", ["ปลดล็อกหน้าจอเครื่อง จะมีหน้าต่าง อนุญาตการแก้ไขข้อบกพร่อง USB ให้ติ๊ก อนุญาตเสมอ แล้วกด อนุญาต", "ถ้าไม่เห็นหน้าต่าง ให้ถอดสายแล้วเสียบใหม่", "ถ้าเคยกดปฏิเสธ: ตัวเลือกสำหรับนักพัฒนา > เพิกถอนการให้สิทธิ์การแก้ไขข้อบกพร่อง USB แล้วลองใหม่"]],
  INSTALL: ["ติดตั้ง APK ไม่ได้", ["พื้นที่เครื่องอาจเต็ม: กด ลบขยะ และ ลบรูป success ก่อน", "ถ้าขึ้น INSTALL_FAILED_UPDATE_INCOMPATIBLE: ไฟล์มาจากคนละที่กับแอปเดิม ต้องถอนแอปเดิมก่อน (แท็บ แอป)", "ถ้าขึ้น INSTALL_FAILED_VERSION_DOWNGRADE: ไฟล์เก่ากว่าแอปที่มีอยู่", "ถ้าขึ้น USER_RESTRICTED หรือ blocked: ระบบบริษัทบล็อกการติดตั้ง ให้แจ้งไอที Flash"]],
  UNINSTALL: ["ถอนแอปไม่ได้", ["ถ้าขึ้น DEVICE_POLICY_MANAGER หรือ blocked: แอปนี้ระบบบริษัทล็อกไว้ ห้ามหาทางเลี่ยง ให้แจ้งไอที Flash", "ลองโหลดรายชื่อแอปใหม่ แล้วกดอีกครั้ง"]],
  RESET: ["สั่งรีเซ็ตผ่านโปรแกรมไม่ได้", ["ทำมือที่เครื่อง: การตั้งค่า > ระบบ > ตัวเลือกการรีเซ็ต > ลบข้อมูลทั้งหมด (รีเซ็ตเป็นค่าเริ่มต้น)", "บางรุ่นเมนูชื่อไม่เหมือนกัน ลองค้นหาคำว่า รีเซ็ต หรือ Reset ในช่องค้นหาของการตั้งค่า", "ถ้าไม่มีเมนูนี้ ระบบบริษัทอาจล็อกไว้ ให้แจ้งไอที"]],
  WALLPAPER: ["เปิดหน้าตั้งวอลเปเปอร์ให้อัตโนมัติไม่ได้", ["รูปถูกส่งเข้าเครื่องแล้วที่โฟลเดอร์ Download", "ทำมือ: เปิดแอป แกลเลอรี/Files > เปิดรูป > เมนู 3 จุด > ตั้งเป็นวอลเปเปอร์", "เลือกได้ว่าจะตั้งหน้าจอหลัก หรือหน้าจอล็อก"]],
  NO_FLASH: ["ไม่เจอแอป Flash ในเครื่อง", ["เช็กว่าเครื่องนี้ติดตั้ง Flash Kit แล้ว", "ดูชื่อแอปในแท็บ แอป แล้วแจ้งผู้ดูแลเว็บให้เพิ่มชื่อ"]],
  NO_FS: ["เบราว์เซอร์นี้บันทึกลงโฟลเดอร์ไม่ได้", ["ใช้ Google Chrome หรือ Microsoft Edge เวอร์ชันล่าสุดบนคอม Windows", "ตอนหน้าต่างเลือกโฟลเดอร์เด้งขึ้น ให้เลือกโฟลเดอร์ แล้วกด อนุญาต/ดูไฟล์ และ บันทึกการเปลี่ยนแปลง"]],
  SETTINGS: ["ตั้งค่าบางข้อไม่สำเร็จ", ["ข้อที่ไม่สำเร็จอาจถูกระบบบริษัทล็อกไว้ ห้ามหาทางเลี่ยง ให้แจ้งไอที Flash", "ข้ออื่นที่สำเร็จแล้วใช้งานได้ตามปกติ"]],
  SCREEN: ["จับภาพ/อัดหน้าจอไม่ได้", ["ปลดล็อกหน้าจอเครื่องแล้วลองใหม่", "บางแอปห้ามจับภาพหน้าจอ (จะได้ภาพดำ)", "ถ้ายังไม่ได้ ระบบบริษัทอาจล็อกการจับหน้าจอ ให้แจ้งไอที"]],
  WALL_TAP: ["ส่งรูปแล้ว เหลือกดยืนยันที่เครื่อง 1 ครั้ง", ["ที่หน้าจอเครื่อง จะขึ้นหน้าตั้งวอลเปเปอร์พร้อมรูปที่เลือก (ถ้าเครื่องล็อกอยู่ ให้ปลดล็อกก่อน)", "กด ตั้งวอลเปเปอร์ (Set wallpaper)", "เลือก หน้าจอหลักและหน้าจอล็อก (Home and lock screens)", "ถ้าไม่อยากจับเครื่อง: แท็บ เครื่อง > ดู/คุมหน้าจอสด แล้วคลิกจากคอมแทนได้", "ถ้าเครื่องถามว่าจะเปิดด้วยแอปไหน ให้เลือก วอลเปเปอร์ หรือ Wallpaper"]],
  UNKNOWN: ["เกิดข้อผิดพลาด", ["ถ่ายภาพหน้าจอส่วน Log ด้านล่างส่งให้ผู้ดูแล", "ลองถอดสายแล้วเชื่อมต่อใหม่"]]
};

/* =====================================================================
   Small UI helpers
   ===================================================================== */
function log(msg) {
  const t = new Date().toLocaleTimeString("th-TH");
  $("log").textContent = `[${t}] ${msg}\n` + $("log").textContent.slice(0, 20000);
}
// Progress toast at the bottom + tab title, with seconds counter for long jobs
const busyState = { text: "", start: 0, timer: null };
function busyMsg(t) {
  const b = $("busy");
  if (t && !busyState.text) busyState.start = Date.now();
  busyState.text = t || "";
  const paint = () => {
    const sec = Math.round((Date.now() - busyState.start) / 1000);
    b.textContent = busyState.text + (sec >= 3 ? ` · ${sec} วิ` : "");
  };
  if (t) {
    paint(); b.hidden = false; document.title = "⏳ K3S Tool";
    if (!busyState.timer) busyState.timer = setInterval(paint, 1000);
  } else {
    b.hidden = true; clearInterval(busyState.timer); busyState.timer = null;
    const long = Date.now() - busyState.start > 8000;
    document.title = long ? "✅ เสร็จแล้ว · K3S Tool" : "K3S Tool";
    if (long) setTimeout(() => { if (!busyState.text) document.title = "K3S Tool"; }, 15000);
  }
}

// Big card while waiting for someone to tap "Allow" on the device
let authTimer = null;
function authWait(on) {
  const c = $("authWait");
  clearTimeout(authTimer);
  c.hidden = !on;
  $("authMore").hidden = true;
  if (on) { c.scrollIntoView({ behavior: "smooth", block: "nearest" }); authTimer = setTimeout(() => ($("authMore").hidden = false), 15000); }
}

function showHelp(code, detail, info) {
  const [title, steps, link] = HELP[HELP[code] ? code : "UNKNOWN"];
  const box = $("help");
  box.classList.toggle("info", !!info);
  box.replaceChildren(
    el("div", { class: "help-title", text: title }),
    el("ol", {}, steps.map((s) => el("li", { text: s })))
  );
  if (link) box.append(el("a", { href: link.url, target: "_blank", rel: "noopener", class: "btn-link", text: link.label }));
  if (detail && detail !== code) box.append(el("div", { class: "help-detail", text: "รายละเอียด: " + detail }));
  box.append(el("div", { class: "row end" }, el("button", { text: "ปิด", onclick: () => (box.hidden = true) })));
  box.hidden = false;
  box.scrollIntoView({ behavior: "smooth", block: "nearest" });
}
function codeOf(e) {
  const m = String((e && e.message) || e);
  if (HELP[m]) return m;
  if (/auth|unauthor/i.test(m)) return "AUTH";
  if (/disconnect|closed|transfer|NetworkError|NotFoundError/i.test(m)) return "UNPLUGGED";
  return "UNKNOWN";
}

let busy = false;
async function run(name, fn, helpCode) {
  if (busy) { log("รอให้งานก่อนหน้าเสร็จก่อน"); return; }
  busy = true;
  const btns = document.querySelectorAll("button[data-act]");
  btns.forEach((b) => (b.disabled = true));
  $("help").hidden = true;
  busyMsg(name + " ...");
  log(name + " ...");
  try { const r = await fn(); if (r !== false) log(name + " เสร็จแล้ว"); }
  catch (e) { console.error(e); log(name + " ล้มเหลว: " + (e && e.message)); showHelp(helpCode && codeOf(e) === "UNKNOWN" ? helpCode : codeOf(e), String((e && e.message) || e)); }
  finally { busy = false; busyMsg(""); btns.forEach((b) => (b.disabled = false)); }
}

function confirmBox(text, word) {
  return new Promise((resolve) => {
    $("dlgText").textContent = text;
    const inp = $("dlgInput"); inp.value = ""; inp.hidden = !word; inp.placeholder = word ? `พิมพ์ ${word} เพื่อยืนยัน` : "";
    $("dlg").hidden = false;
    (word ? inp : $("dlgOk")).focus();
    const done = (v) => { $("dlg").hidden = true; $("dlgOk").onclick = $("dlgNo").onclick = inp.onkeydown = null; resolve(v); };
    const ok = () => { if (word && inp.value.trim().toUpperCase() !== word) { inp.focus(); return; } done(true); };
    $("dlgNo").onclick = () => done(false);
    $("dlgOk").onclick = ok;
    inp.onkeydown = (e) => { if (e.key === "Enter") ok(); };
  });
}

/** Ask which plugged-in devices to use. One device = no question. Returns [] if cancelled */
function pickDevices(title) {
  const ds = all();
  if (ds.length <= 1) return Promise.resolve(ds.length ? [cur()] : []);
  return new Promise((resolve) => {
    $("dlgText").textContent = title + "\nเลือกเครื่องที่ต้องการ:";
    $("dlgInput").hidden = true;
    const boxes = ds.map((d) => { const c = el("input", { type: "checkbox" }); c.checked = d.serial === selected; return [d, c]; });
    const allBox = el("input", { type: "checkbox" });
    allBox.addEventListener("change", () => boxes.forEach(([, c]) => (c.checked = allBox.checked)));
    $("dlgList").replaceChildren(el("label", {}, allBox, el("b", { text: "เลือกทุกเครื่อง" })), ...boxes.map(([d, c]) => el("label", {}, c, label(d))));
    $("dlg").hidden = false;
    const done = (v) => { $("dlg").hidden = true; $("dlgList").replaceChildren(); $("dlgOk").onclick = $("dlgNo").onclick = null; resolve(v); };
    $("dlgNo").onclick = () => done([]);
    $("dlgOk").onclick = () => { const v = boxes.filter(([, c]) => c.checked).map(([d]) => d); if (v.length) done(v); };
  });
}

function human(kb) {
  kb = Math.max(0, Math.round(kb || 0));
  if (kb >= 1048576) return (kb / 1048576).toFixed(1) + " GB";
  if (kb >= 1024) return (kb / 1024).toFixed(0) + " MB";
  return kb + " KB";
}
const fmtTime = (ts) => new Date(ts).toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" });
const isoTime = (ts) => { const d = new Date(ts); const p = (n) => String(n).padStart(2, "0"); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`; };
const stamp = () => isoTime(Date.now()).replace(/[- :]/g, "").replace(/^(\d{8})/, "$1-");

function download(data, name, type) {
  const url = URL.createObjectURL(data instanceof Blob ? data : new Blob([data], { type }));
  const a = el("a", { href: url, download: name }); document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

/* =====================================================================
   Devices (several can be plugged in at once)
   ===================================================================== */
const devices = new Map();   // serial -> Device
let selected = null;

function cur() {
  const d = devices.get(selected);
  if (!d || d.closed) throw new Error("NOT_CONNECTED");
  return d;
}
const all = () => [...devices.values()].filter((d) => !d.closed);
const targets = () => ($("allDev").checked && devices.size > 1 ? all() : [cur()]);
const label = (d) => (d.info.model || "เครื่อง") + " · " + d.serial.slice(-6);

async function addDevice(d) {
  const old = devices.get(d.serial);
  if (old && !old.closed) { await d.close(); return old; }
  d.info.model = (await d.sh("getprop ro.product.model")).out.trim();
  d.info.profile = st.profileFor(d.info.model);
  devices.set(d.serial, d);
  if (!selected || !devices.get(selected) || devices.get(selected).closed) selected = d.serial;
  log("เชื่อมต่อ " + label(d) + " (ใช้ที่เก็บรูปแบบ " + d.info.profile.name + ")");
  d.disconnected.then(() => {
    log("ถอดสายแล้ว: " + label(d));
    devices.delete(d.serial);
    if (selected === d.serial) selected = devices.keys().next().value || null;
    if (live.dev === d) stopLive();
    renderAll();
  });
  try { st.save("everConnected", true); } catch (e) {}
  // First visit opens the guide; once a device is connected, jump to the main delete tab
  if (document.querySelector(".tabs .on").dataset.tab === "guide") showTab("data");
  renderAll();
  // Fill in numbers in the background-ish order: storage first (main feature), then info, then banned check
  await refreshStorage(d);
  await loadInfo(d).catch((e) => log("อ่านข้อมูลเครื่องไม่ครบ: " + e.message));
  await checkBanned(d).catch(() => {});
  renderAll();
  return d;
}

async function connectNew() {
  log("รอเลือกเครื่องในหน้าต่างของเบราว์เซอร์ ...");
  let d;
  try { d = await adb.requestAndOpen(() => { busyMsg("รอกด อนุญาต ที่หน้าจอเครื่อง"); authWait(true); }); }
  finally { authWait(false); }
  busyMsg("กำลังอ่านข้อมูลเครื่อง");
  await addDevice(d);
}

// Reconnect devices this browser was already allowed to use (no popup). Called on page load and on plug-in.
let autoConnecting = false;
async function autoConnect() {
  if (autoConnecting) return;
  autoConnecting = true;
  try {
    for (const usb of await adb.knownDevices()) {
      if (devices.has(usb.serial) && !devices.get(usb.serial).closed) continue;
      // Right after plug-in or reboot the device may not be ready yet: try a few times
      for (let tryNo = 1; tryNo <= 5; tryNo++) {
        try {
          log("พบเครื่องที่เคยอนุญาต " + usb.serial.slice(-6) + " กำลังเชื่อมต่อ ...");
          await addDevice(await adb.openUsb(usb, () => authWait(true)));
          break;
        } catch (e) {
          if (e.message === "BUSY") { showHelp("BUSY"); break; }
          if (tryNo === 5) { log("เชื่อมต่ออัตโนมัติไม่สำเร็จ (" + (e.message || e) + ") กด + เชื่อมต่อเครื่อง เอง"); break; }
          await new Promise((r) => setTimeout(r, 3000));
        } finally { authWait(false); }
      }
    }
  } finally { autoConnecting = false; }
}

function renderDevices() {
  const box = $("devices");
  if (box.classList.contains("orbit")) renderOrbit(box);
  else box.replaceChildren(...all().map((d) => {
    const s = d.info.storage;
    const pct = s && s.total ? Math.round((s.used / s.total) * 100) + "%" : "";
    const ban = d.info.bannedFound && d.info.bannedFound.length ? " · 🚫" + d.info.bannedFound.length : "";
    return el("button", { class: "dev" + (d.serial === selected ? " sel" : ""), onclick: () => { selected = d.serial; renderAll(); } },
      el("b", { text: d.info.model || "เครื่อง" }), el("small", { text: "รหัส " + d.serial.slice(-6) + (pct ? " · ใช้ " + pct : "") + ban }));
  }));
  const n = all().length;
  document.body.classList.toggle("has-dev", !!n);
  $("status").textContent = n ? `เชื่อมต่อ ${n} เครื่อง` : "ยังไม่เชื่อมต่อ";
  $("status").className = n ? "pill ok" : "pill";
  $("allDevWrap").hidden = n < 2; $("devCount").textContent = n;
  $("stdAll").parentElement.hidden = n < 2;
  document.querySelectorAll(".need-dev").forEach((e) => (e.hidden = !n));
  const tab = document.querySelector(".tabs .on").dataset.tab;
  // In the space layout the empty-state note lives on the stage, so it shows on every tab
  $("nodev").hidden = !!n || (!box.classList.contains("orbit") && !["data", "device", "apps", "setup"].includes(tab));
}

/* ---------- Space layout: devices float on orbits around the connect hub ---------- */
const TINTS = ["#5b8cff", "#3cc6b4", "#c98bff", "#ff9d6b", "#6fd49a", "#ffd36b"];
function tintOf(serial) { let h = 0; for (const c of serial) h = (h * 31 + c.charCodeAt(0)) >>> 0; return TINTS[h % TINTS.length]; }
function renderOrbit(box) {
  const ds = all();
  const w = box.clientWidth || 800, h = box.clientHeight || 500;
  // two elliptical lanes so neighbours never sit in a row; skip the top-left arc where the device card sits
  const lanes = [[0.27, 0.32], [0.36, 0.40]];
  const from = -75, span = 200;
  box.replaceChildren(...ds.map((d, i) => {
    const s = d.info.storage;
    const pct = s && s.total ? Math.round((s.used / s.total) * 100) : 0;
    const ang = from + (ds.length === 1 ? span * 0.35 : (i * span) / (ds.length - 1 || 1));
    const [rx, ry] = lanes[i % 2];
    const x = Math.cos((ang * Math.PI) / 180) * rx * w, y = Math.sin((ang * Math.PI) / 180) * ry * h;
    const ban = d.info.bannedFound && d.info.bannedFound.length;
    const b = el("button", {
      class: "sat" + (d.serial === selected ? " sel" : "") + (pct > 85 ? " full" : ""),
      style: `--x:${x.toFixed(0)}px;--y:${y.toFixed(0)}px;--p:${pct};--tint:${tintOf(d.serial)};--delay:${(i * -2.7).toFixed(1)}s`,
      title: label(d), "aria-pressed": d.serial === selected ? "true" : "false",
      onclick: () => { selected = d.serial; renderAll(); }
    },
      el("span", { class: "sat-ring" }),
      el("span", { class: "sat-body" },
        el("b", { class: "sat-pct", text: s ? pct + "%" : "…" }),
        el("span", { class: "sat-name", text: d.info.model || "เครื่อง" }),
        el("span", { class: "sat-id", text: d.serial.slice(-6) })),
      ban ? el("span", { class: "sat-ban", text: "แอปต้องห้าม " + ban }) : null);
    return b;
  }));
  renderDevCard(devices.get(selected));
}
function renderDevCard(d) {
  const c = $("devCard");
  if (!c) return;
  c.hidden = !d;
  if (!d) return;
  const i = d.info, b = i.battery;
  $("dcBattery").textContent = b ? `${b.level}%${b.status ? " · " + b.status : ""}` : "-";
  $("dcHealth").textContent = b ? b.health + (b.temp ? ` · ${b.temp}°C` : "") : "-";
  $("dcAndroid").textContent = i.android ? "Android " + i.android : "-";
  $("dcFlash").textContent = i.flash && i.flash.length ? i.flash.map((f) => f.ver || f.pkg).join(", ") : "-";
  $("dcSerial").textContent = d.serial;
}

function renderAll() {
  renderDevices();
  const d = devices.get(selected);
  renderStorage(d);
  renderInfo(d);
  renderApps(d);
  renderProfiles();
  renderBannedFound(d);
  renderToday();
  renderRegistry();
}

/* =====================================================================
   Storage + cleanup (the main feature)
   ===================================================================== */
const TRASH = "-name '.trashed-*'";
// One pass per folder: number of files and total KB. Missing folder -> 0 0
const statCmd = (dir, filter = "") =>
  `if [ -d ${q(dir)} ]; then find ${q(dir)} -type f ${filter} -exec du -k {} + 2>/dev/null | awk '{s+=$1;n++} END {print n+0, s+0}'; else echo 0 0; fi`;

async function df(d) {
  const p = (await d.sh("df -k /sdcard | tail -1")).out.trim().split(/\s+/);
  return { total: parseInt(p[1], 10) || 0, used: parseInt(p[2], 10) || 0 };
}

async function refreshStorage(d) {
  const p = d.info.profile;
  const s = await df(d);
  d.info.storage = { ...s, counting: true };
  if (d.serial === selected) renderStorage(d);
  const r = (await d.sh(`${statCmd(p.success)}; ${statCmd(p.fail)}; ${statCmd("/sdcard", TRASH)}`)).out.trim().split(/\n/).map((l) => l.trim().split(/\s+/).map((x) => parseInt(x, 10) || 0));
  d.info.storage = { ...s, success: r[0] || [0, 0], fail: r[1] || [0, 0], trash: r[2] || [0, 0], at: Date.now() };
  st.updateRegistry(d.serial, { model: d.info.model, storage: `${human(s.used)} / ${human(s.total)}` });
  renderStorage(devices.get(selected)); renderDevices();
}

function renderStorage(d) {
  const s = d && d.info.storage;
  $("model").textContent = d ? label(d) : "-";
  if (!s) { ["used", "total", "cSuccess", "cTrash", "cFail"].forEach((k) => ($(k).textContent = "-")); $("bar").style.width = 0; return; }
  const pct = s.total ? Math.round((s.used / s.total) * 100) : 0;
  $("used").textContent = human(s.used) + " (" + pct + "%)";
  $("total").textContent = "เหลือว่าง " + human(s.total - s.used) + " จาก " + human(s.total);
  $("bar").style.width = pct + "%"; $("bar").className = pct > 85 ? "bar bad" : pct > 70 ? "bar warn" : "bar";
  const f = (x) => (s.counting ? "กำลังนับ..." : x[0].toLocaleString() + " ไฟล์ · " + human(x[1]));
  $("cSuccess").textContent = f(s.success); $("cTrash").textContent = f(s.trash); $("cFail").textContent = f(s.fail);
}

function renderToday() {
  const start = new Date(); start.setHours(0, 0, 0, 0);
  const h = st.history().filter((x) => x.time >= start.getTime());
  $("todayFreed").textContent = h.length ? `วันนี้ลบไปแล้ว ${h.length} ครั้ง ได้พื้นที่คืนรวม ${human(h.reduce((a, x) => a + (x.freedKb || 0), 0))} (ทุกเครื่อง)` : "";
}

const KIND = {
  success: { label: "รูป success", cmd: (p) => delCmd(p.success) },
  fail: { label: "รูป fail", cmd: (p) => delCmd(p.fail) },
  trash: { label: "ขยะ .trashed", cmd: () => `n=$(find /sdcard -type f ${TRASH} 2>/dev/null | wc -l); find /sdcard -type f ${TRASH} -delete 2>/dev/null; echo $n` }
};
// find -delete avoids "argument list too long" that rm -rf dir/* hits with tens of thousands of files.
// Missing folder (fresh device) means nothing to delete, not an error.
function delCmd(dir) {
  return `[ -d ${q(dir)} ] || { echo 0; exit 0; }; n=$(find ${q(dir)} -type f | wc -l); find ${q(dir)} -type f -delete; c=$?; echo $n; exit $c`;
}

/** Delete the given kinds on one device, record history, return KB freed */
async function cleanup(d, kinds, how = "กดเอง") {
  const before = (await df(d)).used;
  let files = 0;
  for (const k of kinds) {
    busyMsg(`กำลังลบ${KIND[k].label} · ${label(d)}`);
    const r = await d.sh(KIND[k].cmd(d.info.profile));
    files += parseInt(r.out.trim().split(/\s+/).pop(), 10) || 0;
    if (r.code) throw new Error(`ลบ${KIND[k].label}ไม่ครบ: ` + (r.err || r.out).trim());
  }
  const after = (await df(d)).used;
  const freed = Math.max(0, before - after);
  st.addHistory({ serial: d.serial, model: d.info.model, action: kinds.map((k) => KIND[k].label).join(" + "), how, files, freedKb: freed });
  log(`${label(d)}: ลบ ${files.toLocaleString()} ไฟล์ ได้พื้นที่คืน ${human(freed)}`);
  await refreshStorage(d);
  renderToday(); renderHistory();
  return freed;
}

async function cleanupAction(kinds, text) {
  const ts = targets();
  const who = ts.length > 1 ? `\n\nจะทำกับทุกเครื่อง ${ts.length} เครื่อง` : `\n\nเครื่อง: ${label(ts[0])}`;
  if (!(await confirmBox(text + who))) return false;
  for (const d of ts) await cleanup(d, kinds);
}

/* ---------- Back up fail photos to the computer ---------- */
async function pickBackupFolder() {
  if (!window.showDirectoryPicker) throw new Error("NO_FS");
  try { return await window.showDirectoryPicker({ mode: "readwrite", id: "k3s-backup" }); }
  catch (e) { if (e && e.name === "AbortError") return null; throw new Error("NO_FS"); }
}
async function backupFail(d, root) {
  const dir = d.info.profile.fail;
  const list = (await d.sh(`[ -d ${q(dir)} ] && find ${q(dir)} -type f`)).out.split("\n").map((s) => s.trim()).filter(Boolean);
  if (!list.length) { log(`${label(d)}: ไม่มีรูปใน fail ให้สำรอง`); return 0; }
  const top = await root.getDirectoryHandle(`fail-${d.serial.slice(-6)}-${stamp()}`, { create: true });
  const cache = new Map();
  const dirFor = async (rel) => {
    const parts = rel.split("/").slice(0, -1);
    let h = top, key = "";
    for (const p of parts) { key += "/" + p; if (!cache.has(key)) cache.set(key, await h.getDirectoryHandle(p, { create: true })); h = cache.get(key); }
    return h;
  };
  await d.pullMany(list, async (path, bytes, i) => {
    const rel = path.slice(dir.length).replace(/^\/+/, "");
    const fh = await (await dirFor(rel)).getFileHandle(rel.split("/").pop(), { create: true });
    const w = await fh.createWritable(); await w.write(bytes); await w.close();
    if (i % 20 === 0 || i === list.length - 1) busyMsg(`กำลังสำรอง ${i + 1}/${list.length} · ${label(d)}`);
  });
  log(`สำรองรูป fail ${list.length.toLocaleString()} ไฟล์ ลงโฟลเดอร์ ${top.name} แล้ว`);
  return list.length;
}

/* ---------- Biggest files / folders ---------- */
async function bigFiles(d) {
  busyMsg("กำลังค้นหาไฟล์ใหญ่ (อาจใช้เวลาเป็นนาที) ...");
  const dirs = (await d.sh("du -sk /sdcard/* 2>/dev/null | sort -rn | head -15")).out;
  const files = (await d.sh("find /sdcard -type f -size +1024k -exec du -k {} + 2>/dev/null | sort -rn | head -30")).out;
  const parse = (t) => t.split("\n").map((l) => l.match(/^(\d+)\s+(.+)$/)).filter(Boolean).map((m) => ({ kb: +m[1], path: m[2].trim() }));
  $("bigCard").hidden = false;
  $("bigDirs").replaceChildren(...parse(dirs).map((x) => el("div", { class: "item" }, el("div", { class: "nm", text: x.path }), el("b", { text: human(x.kb) }))));
  const fl = parse(files);
  $("bigList").replaceChildren(...(fl.length ? fl.map((x) => el("div", { class: "item" },
    el("div", { class: "nm" }, x.path.split("/").pop(), el("small", { text: x.path })),
    el("div", { class: "row" }, el("b", { text: human(x.kb) }), el("button", { class: "red", text: "ลบ", onclick: () => run("ลบไฟล์", async () => {
      if (!(await confirmBox(`ลบไฟล์นี้ถาวร?\n${x.path}\n(${human(x.kb)})`))) return false;
      await d.shOk(`rm -f ${q(x.path)}`);
      st.addHistory({ serial: d.serial, model: d.info.model, action: "ลบไฟล์ " + x.path.split("/").pop(), how: "กดเอง", files: 1, freedKb: x.kb });
      await bigFiles(d); await refreshStorage(d); renderHistory();
    }) }))
  )) : [el("div", { class: "item mut", text: "ไม่มีไฟล์เกิน 1 MB" })]));
  $("bigCard").scrollIntoView({ behavior: "smooth", block: "start" });
}

/* ---------- Auto delete ---------- */
const auto = { ...{ every: 0, pct: 0 }, ...st.load("auto", {}), next: 0, last: null };
function scheduleAuto() {
  auto.next = auto.every ? Date.now() + auto.every * 60000 : 0;
  st.save("auto", { every: auto.every, pct: auto.pct });
  renderAuto();
}
function renderAuto() {
  const t = (ts) => new Date(ts).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" });
  let s = auto.every ? `เปิดอยู่ · ครั้งถัดไป ${t(auto.next)}` : "ปิดอยู่";
  if (auto.last) s += ` · ครั้งล่าสุด ${t(auto.last.time)} ได้คืน ${human(auto.last.kb)}`;
  $("autoStatus").textContent = s;
}
async function autoTick() {
  if (!auto.every || Date.now() < auto.next || busy) return;
  scheduleAuto();
  if (!all().length) return;
  busy = true;
  let kb = 0;
  try {
    for (const d of all()) {
      try {
        const s = await df(d);
        const pct = s.total ? (s.used / s.total) * 100 : 100;
        if (pct < auto.pct) { log(`ลบอัตโนมัติ: ${label(d)} ใช้ ${Math.round(pct)}% ยังไม่ถึง ${auto.pct}% ข้าม`); continue; }
        kb += await cleanup(d, ["success", "trash"], "อัตโนมัติ");
      } catch (e) { log(`ลบอัตโนมัติ ${label(d)} ไม่สำเร็จ: ${e.message}`); }
    }
    auto.last = { time: Date.now(), kb };
  } finally { busy = false; busyMsg(""); renderAuto(); }
}

/* =====================================================================
   Device info + tools
   ===================================================================== */
const HEALTH = { 1: "ไม่ทราบ", 2: "ดี", 3: "ร้อนเกิน", 4: "เสื่อม/เสีย", 5: "แรงดันเกิน", 6: "ผิดปกติ", 7: "เย็นเกิน" };
const STATUS = { 1: "ไม่ทราบ", 2: "กำลังชาร์จ", 3: "ไม่ได้ชาร์จ", 4: "ไม่ได้ชาร์จ", 5: "เต็ม" };

async function flashPackages(d) {
  const out = (await d.sh("pm list packages | grep -i flash")).out;
  return out.split("\n").map((l) => l.replace("package:", "").trim()).filter(Boolean);
}

async function loadInfo(d) {
  const g = async (k) => (await d.sh("getprop " + k)).out.trim();
  const i = d.info;
  i.manufacturer = await g("ro.product.manufacturer");
  i.android = await g("ro.build.version.release");
  i.sdk = await g("ro.build.version.sdk");
  const bat = (await d.sh("dumpsys battery")).out;
  const bv = (k) => { const m = bat.match(new RegExp("^\\s*" + k + ":\\s*(.+)$", "m")); return m ? m[1].trim() : ""; };
  i.battery = { level: bv("level"), health: HEALTH[bv("health")] || bv("health"), status: STATUS[bv("status")] || "", temp: bv("temperature") ? (parseInt(bv("temperature"), 10) / 10).toFixed(1) : "" };
  const mem = (await d.sh("cat /proc/meminfo")).out;
  const mv = (k) => { const m = mem.match(new RegExp(k + ":\\s*(\\d+)")); return m ? +m[1] : 0; };
  i.ram = { total: mv("MemTotal"), avail: mv("MemAvailable") };
  i.uptime = parseFloat((await d.sh("cat /proc/uptime")).out) || 0;
  i.flash = [];
  for (const p of await flashPackages(d)) {
    const v = (await d.sh(`dumpsys package ${q(p)} | grep -m1 versionName`)).out.split("=")[1];
    i.flash.push({ pkg: p, ver: (v || "").trim() });
  }
  st.updateRegistry(d.serial, {
    model: i.model, manufacturer: i.manufacturer, android: i.android,
    battery: i.battery.level ? `${i.battery.level}% (${i.battery.health})` : "",
    flash: i.flash.map((f) => f.ver || f.pkg).join(", ")
  });
  renderRegistry();
}

function renderInfo(d) {
  renderDevCard(devices.get(selected));
  const g = $("infoGrid");
  if (!d || !d.info.battery) { g.replaceChildren(el("div", { class: "mut", text: d ? "กด อัปเดต เพื่ออ่านข้อมูล" : "-" })); return; }
  const i = d.info, b = i.battery;
  const up = Math.floor(i.uptime / 3600);
  const items = [
    ["รุ่น", `${i.manufacturer} ${i.model}`], ["รหัสเครื่อง", d.serial],
    ["Android", `${i.android} (SDK ${i.sdk})`], ["แบตเตอรี่", `${b.level}% · ${b.status}`],
    ["สุขภาพแบต", b.health + (b.temp ? ` · ${b.temp}°C` : "")], ["RAM ว่าง", `${human(i.ram.avail)} จาก ${human(i.ram.total)}`],
    ["เปิดเครื่องมาแล้ว", up >= 24 ? `${Math.floor(up / 24)} วัน ${up % 24} ชม.` : `${up} ชม.`],
    ["แอป Flash", i.flash.length ? i.flash.map((f) => `${f.pkg} ${f.ver}`).join("\n") : "ไม่พบ"]
  ];
  g.replaceChildren(...items.map(([k, v]) => el("div", { class: "stat" }, el("span", { class: "mut", text: k }), el("b", { text: v, style: "white-space:pre-line;overflow-wrap:anywhere" }))));
}

async function capture(d) {
  const tmp = "/data/local/tmp/k3s-shot.png";
  const r = await d.sh(`screencap -p ${tmp}`);
  if (r.code) throw new Error("SCREEN");
  const bytes = await d.pull(tmp);
  if (!bytes.length) throw new Error("SCREEN");
  return bytes;
}

/* ---------- Live screen: screenshot loop + tap/swipe via `input` ---------- */
const live = { dev: null, on: false, url: null, down: null };
async function startLive(d) {
  live.dev = d; live.on = true; $("liveCard").hidden = false;
  $("liveCard").scrollIntoView({ behavior: "smooth", block: "start" });
  while (live.on && live.dev === d && !d.closed) {
    try {
      const bytes = await capture(d);
      const url = URL.createObjectURL(new Blob([bytes], { type: "image/png" }));
      $("screenImg").src = url;
      if (live.url) URL.revokeObjectURL(live.url);
      live.url = url;
    } catch (e) { log("หน้าจอสดหยุด: " + e.message); break; }
    await new Promise((r) => setTimeout(r, 300));
  }
  if (live.dev === d) stopLive();
}
function stopLive() { live.on = false; live.dev = null; $("liveCard").hidden = true; }
function imgPoint(ev) {
  const img = $("screenImg"), r = img.getBoundingClientRect();
  return [Math.round(((ev.clientX - r.left) / r.width) * img.naturalWidth), Math.round(((ev.clientY - r.top) / r.height) * img.naturalHeight)];
}
async function liveInput(cmd) { if (live.dev) { try { await live.dev.sh(cmd); } catch (e) { log("ส่งคำสั่งไม่สำเร็จ: " + e.message); } } }

/* =====================================================================
   Apps: list, uninstall, restore, banned list
   ===================================================================== */
const pkgList = (out) => out.split("\n").map((l) => l.replace("package:", "").trim()).filter(Boolean);

async function loadApps(d) {
  busyMsg("กำลังโหลดรายชื่อแอป ...");
  const user = pkgList((await d.sh("pm list packages -3")).out);
  const sys = pkgList((await d.sh("pm list packages -s")).out);
  const sysAll = pkgList((await d.sh("pm list packages -s -u")).out);
  const ver = {};
  (await d.sh(`for p in $(pm list packages -3 | cut -d: -f2); do echo "$p|$(dumpsys package $p | grep -m1 versionName | cut -d= -f2)"; done`)).out
    .split("\n").forEach((l) => { const [p, v] = l.split("|"); if (p) ver[p.trim()] = (v || "").trim(); });
  // Apps the company device-management system controls: never offer to remove them
  const pol = (await d.sh("dumpsys device_policy 2>/dev/null")).out;
  const prot = new Set([...pol.matchAll(/ComponentInfo\{([\w.]+)\//g)].map((m) => m[1]));
  for (const m of pol.matchAll(/package=([\w.]+)/g)) prot.add(m[1]);
  const isProt = (p) => prot.has(p) || /flash/i.test(p) || CRITICAL.includes(p);
  const sysSet = new Set(sys);
  d.info.apps = {
    list: [...user.map((p) => ({ pkg: p, sys: false })), ...sys.map((p) => ({ pkg: p, sys: true }))]
      .map((a) => ({ ...a, name: appName(a.pkg), ver: ver[a.pkg] || "", prot: isProt(a.pkg) }))
      .sort((a, b) => (a.sys - b.sys) || (a.name || a.pkg).localeCompare(b.name || b.pkg)),
    hidden: sysAll.filter((p) => !sysSet.has(p)),
    at: Date.now()
  };
  d.info.bannedFound = bannedIn(d);
}

function bannedIn(d) {
  const b = new Set(st.banned());
  return d.info.apps ? d.info.apps.list.filter((a) => b.has(a.pkg)).map((a) => a.pkg) : [];
}
async function checkBanned(d) {
  const installed = new Set(pkgList((await d.sh("pm list packages")).out));
  d.info.bannedFound = st.banned().filter((p) => installed.has(p));
  if (d.info.bannedFound.length) log(`⚠️ ${label(d)} มีแอปต้องห้าม ${d.info.bannedFound.length} แอป: ${d.info.bannedFound.map((p) => appName(p) || p).join(", ")}`);
}

async function uninstall(d, pkg, isSys) {
  const r = await d.sh(isSys ? `pm uninstall -k --user 0 ${q(pkg)}` : `pm uninstall ${q(pkg)}`);
  const msg = (r.out + r.err).trim();
  if (!/Success/i.test(msg)) throw new Error(msg || "uninstall failed");
  log(`${label(d)}: ถอน ${appName(pkg) || pkg} แล้ว`);
}

function renderApps(d) {
  const box = $("appList"), hid = $("hiddenList");
  const a = d && d.info.apps;
  if (!a) { box.replaceChildren(el("div", { class: "item mut", text: "กด โหลดรายชื่อแอป" })); hid.replaceChildren(el("div", { class: "item mut", text: "-" })); return; }
  const s = $("appSearch").value.trim().toLowerCase();
  const showSys = $("showSys").checked;
  const banned = new Set(st.banned());
  const rows = a.list.filter((x) => (showSys || !x.sys || banned.has(x.pkg)) && (!s || x.pkg.toLowerCase().includes(s) || x.name.toLowerCase().includes(s)));
  box.replaceChildren(...(rows.length ? rows.slice(0, 400).map((x) => el("div", { class: "item" },
    el("div", { class: "nm" }, x.name || x.pkg,
      x.sys ? el("span", { class: "tag sys", text: "แอประบบ" }) : null,
      x.prot ? el("span", { class: "tag", text: "แอปบริษัท/ระบบ ห้ามถอน" }) : null,
      banned.has(x.pkg) ? el("span", { class: "tag", text: "ต้องห้าม" }) : null,
      el("small", { text: x.pkg + (x.ver ? " · v" + x.ver : "") })),
    el("div", { class: "row" },
      banned.has(x.pkg) || x.prot ? null : el("button", { title: "เพิ่มในรายการต้องห้าม", text: "🚫", onclick: () => { st.saveBanned([...st.banned(), x.pkg]); loadBannedText(); d.info.bannedFound = bannedIn(d); renderAll(); log("เพิ่ม " + (x.name || x.pkg) + " ในรายการต้องห้าม"); } }),
      x.prot ? null : el("button", { class: "red", text: "ถอน", onclick: () => run("ถอน " + (x.name || x.pkg), async () => {
        const warn = x.sys ? "\n\nนี่เป็นแอประบบ จะถูกซ่อนและปิดไว้ (กดคืนได้ภายหลัง)" : "\n\nข้อมูลในแอปจะหายด้วย";
        if (!(await confirmBox(`ถอนแอป ${x.name || x.pkg} ออกจาก ${label(d)}?${warn}`))) return false;
        await uninstall(d, x.pkg, x.sys); await loadApps(d); renderAll();
      }, "UNINSTALL") }))
  )) : [el("div", { class: "item mut", text: "ไม่เจอแอปที่ค้นหา" })]));
  hid.replaceChildren(...(a.hidden.length ? a.hidden.map((p) => el("div", { class: "item" },
    el("div", { class: "nm" }, appName(p) || p, el("small", { text: p })),
    el("button", { text: "คืน", onclick: () => run("คืนแอป " + p, async () => {
      const r = await d.sh(`cmd package install-existing ${q(p)} || pm install-existing ${q(p)}`);
      if (!/installed|Success/i.test(r.out + r.err)) throw new Error((r.out + r.err).trim());
      await loadApps(d); renderAll();
    }) }))) : [el("div", { class: "item mut", text: "ไม่มี" })]));
}

function renderBannedFound(d) {
  const box = $("bannedFound");
  if (!d) { box.textContent = "-"; return; }
  const f = d.info.bannedFound;
  if (!f) { box.textContent = "กด โหลดรายชื่อแอป ด้านล่างเพื่อตรวจ"; return; }
  if (!f.length) { box.replaceChildren(el("span", { text: "✅ ไม่เจอแอปต้องห้ามใน " + label(d) })); return; }
  const others = all().filter((x) => x !== d && x.info.bannedFound && x.info.bannedFound.length);
  box.replaceChildren(
    el("div", { text: `เจอ ${f.length} แอปใน ${label(d)}: ` + f.map((p) => appName(p) || p).join(", "), style: "color:var(--bad);margin-bottom:8px" }),
    el("div", { class: "row" },
      el("button", { class: "red", text: "ถอนแอปต้องห้ามทั้งหมด (เครื่องนี้)", onclick: () => removeBanned([d]) }),
      others.length ? el("button", { class: "red", text: `ถอนจากทุกเครื่อง (${others.length + 1} เครื่อง)`, onclick: () => removeBanned([d, ...others]) }) : null)
  );
}
function removeBanned(ds) {
  run("ถอนแอปต้องห้าม", async () => {
    const n = ds.reduce((a, d) => a + d.info.bannedFound.length, 0);
    if (!(await confirmBox(`ถอนแอปต้องห้าม ${n} รายการ จาก ${ds.length} เครื่อง?\nข้อมูลในแอปพวกนี้จะหายด้วย`))) return false;
    const fails = [];
    for (const d of ds) {
      if (!d.info.apps) await loadApps(d);
      const sysSet = new Set(d.info.apps ? d.info.apps.list.filter((a) => a.sys).map((a) => a.pkg) : []);
      for (const p of d.info.bannedFound) {
        try { await uninstall(d, p, sysSet.has(p)); } catch (e) { fails.push(`${label(d)} ${appName(p) || p}: ${e.message}`); }
      }
      await checkBanned(d);
      await loadApps(d);
    }
    renderAll();
    if (fails.length) throw new Error(fails.join("\n"));
  }, "UNINSTALL");
}
function loadBannedText() { $("bannedText").value = st.banned().join("\n"); }

/* =====================================================================
   Standard settings + model profiles
   ===================================================================== */
function loadStdForm() {
  const s = st.stdSettings();
  $("stdTimeout").value = String(s.timeoutMin); $("stdBright").value = s.brightness; $("stdBrightV").textContent = s.brightness;
  $("stdAutoBright").checked = s.autoBrightness; $("stdAutoTime").checked = s.autoTime; $("stdNoAnim").checked = s.noAnim; $("stdAwake").checked = s.stayAwake;
}
function readStdForm() {
  const s = { timeoutMin: +$("stdTimeout").value, brightness: +$("stdBright").value, autoBrightness: $("stdAutoBright").checked, autoTime: $("stdAutoTime").checked, noAnim: $("stdNoAnim").checked, stayAwake: $("stdAwake").checked };
  st.saveStd(s); return s;
}
async function applyStd(d, s) {
  const cmds = [
    ["ปิดหน้าจอ", `settings put system screen_off_timeout ${s.timeoutMin * 60000}`],
    ["ความสว่างอัตโนมัติ", `settings put system screen_brightness_mode ${s.autoBrightness ? 1 : 0}`],
    s.autoBrightness ? null : ["ความสว่าง", `settings put system screen_brightness ${Math.round((s.brightness / 100) * 255)}`],
    ["เวลาอัตโนมัติ", `settings put global auto_time ${s.autoTime ? 1 : 0}`],
    ["เขตเวลาอัตโนมัติ", `settings put global auto_time_zone ${s.autoTime ? 1 : 0}`],
    ...["window_animation_scale", "transition_animation_scale", "animator_duration_scale"].map((k) => ["แอนิเมชัน", `settings put global ${k} ${s.noAnim ? 0 : 1}`]),
    ["หน้าจอไม่ดับตอนชาร์จ", `settings put global stay_on_while_plugged_in ${s.stayAwake ? 7 : 0}`]
  ].filter(Boolean);
  const fails = [];
  for (const [name, c] of cmds) {
    const r = await d.sh(c);
    if (r.code || /exception|denied|not allowed/i.test(r.out + r.err)) fails.push(name);
  }
  log(`${label(d)}: ตั้งค่ามาตรฐาน${fails.length ? " ไม่สำเร็จบางข้อ: " + [...new Set(fails)].join(", ") : " ครบทุกข้อ"}`);
  return [...new Set(fails)];
}

let profDraft = st.profiles();
function renderProfiles() {
  const d = devices.get(selected);
  $("curModel").textContent = d ? d.info.model || "-" : "-";
  $("curProfile").textContent = d ? d.info.profile.name : "-";
}
function renderProfTable() {
  const inp = (p, k, w) => el("input", { type: "text", value: p[k] || "", style: `width:${w}`, oninput: (e) => (p[k] = e.target.value) });
  $("profTable").replaceChildren(...profDraft.map((p, i) => el("tr", {},
    el("td", {}, inp(p, "name", "90px")), el("td", {}, inp(p, "match", "90px")),
    el("td", {}, inp(p, "success", "210px")), el("td", {}, inp(p, "fail", "210px")),
    el("td", {}, el("button", { class: "red", text: "ลบ", onclick: () => { profDraft.splice(i, 1); renderProfTable(); } })))));
}

/* =====================================================================
   Records: registry + history
   ===================================================================== */
function renderRegistry() {
  const r = Object.values(st.registry()).sort((a, b) => b.lastSeen - a.lastSeen);
  $("regTable").replaceChildren(...(r.length ? r.map((x) => el("tr", {},
    el("td", { text: x.serial }), el("td", { text: x.model || "" }), el("td", { text: x.android || "" }),
    el("td", { text: x.battery || "" }), el("td", { text: x.storage || "" }), el("td", { text: x.flash || "" }),
    el("td", { text: fmtTime(x.lastSeen) }),
    el("td", {}, el("button", { class: "red", text: "ลบ", onclick: async () => { if (await confirmBox("ลบเครื่อง " + x.serial + " ออกจากทะเบียน?")) { st.removeRegistry(x.serial); renderRegistry(); } } })))) : [el("tr", {}, el("td", { colspan: "8", class: "mut", text: "ยังไม่มีเครื่อง" }))]));
}
function renderHistory() {
  const h = st.history();
  $("histSum").textContent = h.length ? `ทั้งหมด ${h.length} ครั้ง ได้พื้นที่คืนรวม ${human(h.reduce((a, x) => a + (x.freedKb || 0), 0))}` : "";
  $("histTable").replaceChildren(...(h.length ? h.slice(0, 300).map((x) => el("tr", {},
    el("td", { text: fmtTime(x.time) }), el("td", { text: (x.model || "") + " " + (x.serial || "").slice(-6) }),
    el("td", { text: x.action + (x.how === "อัตโนมัติ" ? " (อัตโนมัติ)" : "") }),
    el("td", { text: (x.files || 0).toLocaleString() }), el("td", { text: human(x.freedKb) }))) : [el("tr", {}, el("td", { colspan: "5", class: "mut", text: "ยังไม่มีประวัติ" }))]));
}

/* =====================================================================
   Button actions
   ===================================================================== */
const actions = {
  connect: () => run("เชื่อมต่อเครื่อง", connectNew),
  refresh: () => run("อัปเดตตัวเลข", async () => { for (const d of targets()) await refreshStorage(d); }),

  success: () => run("ลบรูป success", () => cleanupAction(["success"], "ลบรูปทั้งหมดในโฟลเดอร์ success (อัปโหลดแล้ว)\nลบถาวร ไม่เข้าถังขยะ")),
  trash: () => run("ลบขยะ", () => cleanupAction(["trash"], "ลบไฟล์ขยะ .trashed- ทั้งเครื่อง (ลบถาวร)")),
  all: () => run("ลบทั้งหมด", () => cleanupAction(["success", "fail", "trash"], "ลบรูป success, รูป fail และไฟล์ขยะ .trashed- ทั้งหมด\nลบถาวร กู้คืนไม่ได้\n\n⚠️ คำเตือน: รูปใน fail อาจยังไม่ถูกอัปโหลด ถ้าไม่แน่ใจ ให้กด ยกเลิก แล้วไปที่ ตัวเลือกเพิ่มเติม > เก็บรูป fail ไว้ในคอมก่อน")),
  fail: () => run("ลบรูป fail", () => cleanupAction(["fail"], "⚠️ รูปใน fail อาจยังไม่ถูกอัปโหลด ลบแล้วกู้คืนไม่ได้\nตรวจกับหัวหน้าแล้วหรือยัง?\n\nถ้าไม่แน่ใจ ให้กด ยกเลิก แล้วไปที่ ตัวเลือกเพิ่มเติม > เก็บรูป fail ไว้ในคอมก่อน")),
  backupFail: () => run("สำรองรูป fail", async () => {
    const ts = targets();
    log("เลือกโฟลเดอร์ในคอมที่จะเก็บรูป fail แล้วกด อนุญาต");
    const root = await pickBackupFolder();
    if (!root) { log("ยกเลิกการสำรอง"); return false; }
    for (const d of ts) {
      const n = await backupFail(d, root);
      if (n > 0 && (await confirmBox(`สำรองรูป fail ${n.toLocaleString()} ไฟล์ ลงคอมเรียบร้อย\nต้องการลบรูป fail ออกจาก ${label(d)} เลยไหม?`))) await cleanup(d, ["fail"]);
    }
  }, "NO_FS"),
  cache: () => run("ล้างแคชแอป", async () => {
    for (const d of targets()) {
      const b = (await df(d)).used;
      const r = await d.sh("pm trim-caches 999G");
      if (r.code) throw new Error((r.err || r.out).trim());
      const freed = Math.max(0, b - (await df(d)).used);
      st.addHistory({ serial: d.serial, model: d.info.model, action: "ล้างแคชแอป", how: "กดเอง", files: 0, freedKb: freed });
      log(`${label(d)}: ล้างแคช ได้พื้นที่คืน ${human(freed)}`);
      await refreshStorage(d);
    }
    renderHistory(); renderToday();
  }),
  bigFiles: () => run("หาไฟล์ใหญ่", () => bigFiles(cur())),

  info: () => run("อ่านข้อมูลเครื่อง", async () => { const d = cur(); await loadInfo(d); renderInfo(d); }),
  screenshot: () => run("จับภาพหน้าจอ", async () => {
    const d = cur(); const b = await capture(d);
    download(new Blob([b], { type: "image/png" }), `screen-${d.serial.slice(-6)}-${stamp()}.png`);
  }, "SCREEN"),
  record: () => run("อัดวิดีโอหน้าจอ", async () => {
    const d = cur(); const sec = +$("recSec").value; const tmp = "/data/local/tmp/k3s-rec.mp4";
    busyMsg(`กำลังอัดหน้าจอ ${sec} วินาที ... ใช้เครื่องได้ตามปกติ`);
    const r = await d.sh(`screenrecord --time-limit ${sec} ${tmp}`);
    if (r.code) throw new Error((r.err || r.out).trim() || "SCREEN");
    busyMsg("กำลังส่งวิดีโอมาที่คอม ...");
    const b = await d.pull(tmp); await d.sh(`rm -f ${tmp}`);
    download(new Blob([b], { type: "video/mp4" }), `record-${d.serial.slice(-6)}-${stamp()}.mp4`);
  }, "SCREEN"),
  live: () => { try { const d = cur(); if (!live.on) startLive(d); } catch (e) { showHelp(codeOf(e)); } },
  liveStop: () => stopLive(),
  liveType: () => { const t = $("liveText").value; if (!t) return; liveInput(`input text ${q(t.replace(/ /g, "%s"))}`); $("liveText").value = ""; },
  restartFlash: () => run("รีสตาร์ทแอป Flash", async () => {
    const d = cur(); const pk = await flashPackages(d);
    if (!pk.length) throw new Error("NO_FLASH");
    if (!(await confirmBox(`ปิดแล้วเปิดแอป Flash ใหม่ที่ ${label(d)}?\nงานที่พิมพ์ค้างไว้แต่ยังไม่กดบันทึกอาจหาย`))) return false;
    for (const p of pk) { await d.sh(`am force-stop ${q(p)}`); await d.sh(`monkey -p ${q(p)} -c android.intent.category.LAUNCHER 1`); }
  }),
  reboot: () => run("รีสตาร์ทเครื่อง", async () => {
    const ts = targets();
    if (!(await confirmBox(`รีสตาร์ท ${ts.length > 1 ? ts.length + " เครื่อง" : label(ts[0])}?\nหลังเปิดเครื่องเสร็จ ให้ปลดล็อกหน้าจอ เว็บจะเชื่อมต่อให้เอง`))) return false;
    for (const d of ts) await d.reboot().catch(() => {});
    log("สั่งรีสตาร์ทแล้ว รอเครื่องเปิดเสร็จ (1-2 นาที) แล้วปลดล็อกหน้าจอ เว็บจะเชื่อมต่อให้เอง");
  }),
  logcat: () => run("บันทึก log", async () => {
    const d = cur();
    const r = await d.sh("logcat -d -v time -t 20000");
    const head = `K3S Tool log\nเครื่อง: ${d.info.manufacturer || ""} ${d.info.model} (${d.serial})\nAndroid: ${d.info.android || ""}\nเวลา: ${new Date().toString()}\n\n`;
    download(head + r.out, `log-${d.serial.slice(-6)}-${stamp()}.txt`, "text/plain");
  }),
  apk: () => $("apkFile").click(),
  wall: () => $("wallFile").click(),
  reset: () => run("รีเซ็ตเครื่อง", async () => {
    const d = cur();
    if (!(await confirmBox(`รีเซ็ต ${label(d)} จะลบข้อมูลทุกอย่างในเครื่อง กู้คืนไม่ได้ และต้องติดตั้ง Flash Kit ใหม่`, "RESET"))) return false;
    if (!(await confirmBox("ยืนยันอีกครั้ง: ลบข้อมูลทั้งเครื่องจริงๆ ใช่ไหม", "YES"))) return false;
    const r = await d.sh("am broadcast -a android.intent.action.FACTORY_RESET -p android");
    log(r.out + r.err);
    if (r.code || /Permission Denial|Exception|not allowed/i.test(r.out + r.err)) throw new Error("RESET");
    // If the reset really started, the device disconnects. Still connected after 10 s = it was ignored.
    await Promise.race([d.disconnected, new Promise((res) => setTimeout(res, 10000))]);
    if (!d.closed) throw new Error("RESET");
  }, "RESET"),

  apps: () => run("โหลดรายชื่อแอป", async () => { const d = cur(); await loadApps(d); renderAll(); }),
  bannedSave: () => {
    st.saveBanned([...new Set($("bannedText").value.split(/\s+/).map((s) => s.trim()).filter(Boolean))]);
    all().forEach((d) => { if (d.info.apps) d.info.bannedFound = bannedIn(d); });
    loadBannedText(); renderAll(); log("บันทึกรายการแอปต้องห้ามแล้ว");
  },
  bannedReset: async () => { if (await confirmBox("คืนรายการแอปต้องห้ามเป็นค่าเริ่มต้น?")) { st.saveBanned(st.DEFAULT_BANNED); loadBannedText(); renderAll(); } },

  stdApply: () => run("ตั้งค่ามาตรฐาน", async () => {
    const s = readStdForm();
    const ts = $("stdAll").checked && devices.size > 1 ? all() : [cur()];
    if (!(await confirmBox(`ตั้งค่ามาตรฐานให้ ${ts.length > 1 ? ts.length + " เครื่อง" : label(ts[0])}?`))) return false;
    const fails = [];
    for (const d of ts) { const f = await applyStd(d, s); if (f.length) fails.push(label(d) + ": " + f.join(", ")); }
    if (fails.length) throw new Error("SETTINGS: " + fails.join(" / "));
  }, "SETTINGS"),
  profAdd: () => { profDraft.push({ name: "รุ่นใหม่", match: "", success: "/sdcard/imagePath/success", fail: "/sdcard/imagePath/fail" }); renderProfTable(); },
  profSave: () => {
    const bad = profDraft.find((p) => !p.success.startsWith("/") || !p.fail.startsWith("/"));
    if (bad) { showHelp("UNKNOWN", "โฟลเดอร์ต้องขึ้นต้นด้วย / เช่น /sdcard/imagePath/success"); return; }
    st.saveProfiles(profDraft); profDraft = st.profiles(); renderProfTable();
    all().forEach((d) => { d.info.profile = st.profileFor(d.info.model); });
    renderAll(); log("บันทึกรุ่นเครื่องแล้ว กด อัปเดตตัวเลข เพื่อนับใหม่");
  },

  regCsv: () => {
    const r = Object.values(st.registry());
    download(st.toCsv([["รหัสเครื่อง", "ยี่ห้อ", "รุ่น", "Android", "แบต", "พื้นที่", "แอป Flash", "เห็นครั้งแรก", "เห็นล่าสุด"],
      ...r.map((x) => [x.serial, x.manufacturer, x.model, x.android, x.battery, x.storage, x.flash, isoTime(x.firstSeen), isoTime(x.lastSeen)])]), `devices-${stamp()}.csv`, "text/csv");
  },
  histCsv: () => {
    download(st.toCsv([["เวลา", "รหัสเครื่อง", "รุ่น", "ทำอะไร", "วิธี", "จำนวนไฟล์", "ได้พื้นที่คืน (MB)"],
      ...st.history().map((x) => [isoTime(x.time), x.serial, x.model, x.action, x.how, x.files, ((x.freedKb || 0) / 1024).toFixed(1)])]), `history-${stamp()}.csv`, "text/csv");
  },
  histClear: async () => { if (await confirmBox("ล้างประวัติการลบทั้งหมด?")) { st.clearHistory(); renderHistory(); renderToday(); } }
};

async function installApk(file) {
  await run("ติดตั้ง " + file.name, async () => {
    const ts = await pickDevices(`ติดตั้ง ${file.name}\n(ถ้ามีแอปเดิมอยู่ จะอัปเดตทับ ข้อมูลในแอปยังอยู่)`);
    if (!ts.length) return false;
    const fails = [];
    for (const d of ts) {
      const tmp = "/data/local/tmp/k3s-tool.apk";
      await d.push(file, tmp, (p) => busyMsg(`ส่งไฟล์ ${Math.round(p * 100)}% · ${label(d)}`));
      busyMsg("กำลังติดตั้ง · " + label(d));
      const r = await d.sh(`pm install -r ${tmp}`);
      await d.sh(`rm -f ${tmp}`);
      const msg = (r.out + r.err).trim();
      if (/Success/i.test(r.out)) log(`${label(d)}: ติดตั้ง ${file.name} สำเร็จ`); else fails.push(`${label(d)}: ${msg || "install failed"}`);
    }
    if (fails.length) throw new Error(fails.join("\n"));
  }, "INSTALL");
}

async function setWallpaper(file) {
  await run("ส่งรูปหน้าจอ", async () => {
    const ts = await pickDevices("ส่งรูปหน้าจอ " + file.name);
    if (!ts.length) return false;
    const ext = ((file.name.match(/\.(\w+)$/) || [, "jpg"])[1]).toLowerCase();
    const mime = ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";
    const fails = [];
    for (const d of ts) {
      const name = `k3s-wallpaper-${Date.now()}.${ext}`;
      const dest = "/sdcard/Pictures/" + name;
      await d.sh("mkdir -p /sdcard/Pictures");
      await d.push(file, dest, (p) => busyMsg(`ส่งรูป ${Math.round(p * 100)}% · ${label(d)}`));
      // Let the media library index the file so the system wallpaper screen can open it as content://
      await d.sh(`am broadcast -a android.intent.action.MEDIA_SCANNER_SCAN_FILE -d ${q("file://" + dest)}`);
      let id = "";
      for (let i = 0; i < 10 && !id; i++) {
        const r = await d.sh(`content query --uri content://media/external/images/media --projection _id --where ${q(`_display_name='${name}'`)}`);
        id = ((r.out.match(/_id=(\d+)/) || [])[1]) || "";
        if (!id) await new Promise((res) => setTimeout(res, 700));
      }
      if (!id) { fails.push(label(d) + ": หารูปในเครื่องไม่เจอ"); continue; }
      const uri = q("content://media/external/images/media/" + id);
      // Android's own "crop and set wallpaper" screen; falls back to "set as" chooser
      let r = await d.sh(`am start -a android.service.wallpaper.CROP_AND_SET_WALLPAPER -d ${uri} -t ${mime} --grant-read-uri-permission`);
      if (/Error|unable|not found|Exception/i.test(r.out + r.err)) r = await d.sh(`am start -a android.intent.action.ATTACH_DATA -d ${uri} -t ${mime} --grant-read-uri-permission`);
      log(`${label(d)}: ${(r.out + r.err).trim()}`);
      if (/Error|unable|not found|Exception/i.test(r.out + r.err)) fails.push(label(d) + ": เปิดหน้าตั้งวอลเปเปอร์ไม่ได้");
    }
    if (fails.length) throw new Error(fails.join("\n"));
    showHelp("WALL_TAP", "", true);
  }, "WALLPAPER");
}

/* =====================================================================
   Start
   ===================================================================== */
function showTab(name) {
  document.querySelectorAll(".tabs button").forEach((b) => b.classList.toggle("on", b.dataset.tab === name));
  document.querySelectorAll(".tab").forEach((t) => (t.hidden = t.id !== "tab-" + name));
  renderDevices();
}

window.addEventListener("DOMContentLoaded", () => {
  document.querySelectorAll("button[data-act]").forEach((b) => b.addEventListener("click", () => actions[b.dataset.act]()));
  document.querySelectorAll(".tabs button").forEach((b) => b.addEventListener("click", () => showTab(b.dataset.tab)));
  document.querySelectorAll("[data-goto]").forEach((a) => a.addEventListener("click", (e) => { e.preventDefault(); showTab(a.dataset.goto); }));
  document.querySelectorAll("button[data-key]").forEach((b) => b.addEventListener("click", () => liveInput("input keyevent " + b.dataset.key)));
  $("apkFile").addEventListener("change", (e) => { const f = e.target.files[0]; e.target.value = ""; if (f) installApk(f); });
  $("wallFile").addEventListener("change", (e) => { const f = e.target.files[0]; e.target.value = ""; if (f) setWallpaper(f); });
  $("appSearch").addEventListener("input", () => renderApps(devices.get(selected)));
  $("showSys").addEventListener("change", () => renderApps(devices.get(selected)));
  $("stdBright").addEventListener("input", (e) => ($("stdBrightV").textContent = e.target.value));

  // live screen: click = tap, drag = swipe
  const img = $("screenImg");
  img.addEventListener("mousedown", (e) => { e.preventDefault(); live.down = { p: imgPoint(e), t: Date.now() }; });
  img.addEventListener("mouseup", (e) => {
    if (!live.down) return;
    const [x1, y1] = live.down.p, [x2, y2] = imgPoint(e), ms = Math.max(100, Date.now() - live.down.t);
    live.down = null;
    if (Math.hypot(x2 - x1, y2 - y1) < 15) liveInput(`input tap ${x1} ${y1}`);
    else liveInput(`input swipe ${x1} ${y1} ${x2} ${y2} ${Math.min(ms, 1500)}`);
  });

  // auto delete settings
  $("autoEvery").value = String(auto.every); $("autoPct").value = String(auto.pct);
  $("autoEvery").addEventListener("change", (e) => { auto.every = +e.target.value; scheduleAuto(); log(auto.every ? `เปิดลบอัตโนมัติทุก ${auto.every} นาที` : "ปิดลบอัตโนมัติ"); });
  $("autoPct").addEventListener("change", (e) => { auto.pct = +e.target.value; scheduleAuto(); });
  if (auto.every) scheduleAuto(); else renderAuto();
  setInterval(autoTick, 30000);
  window.addEventListener("beforeunload", (e) => { if (auto.every && all().length) { e.preventDefault(); e.returnValue = ""; } });

  loadStdForm(); loadBannedText(); renderProfTable(); renderRegistry(); renderHistory(); renderAll();
  if (!st.load("everConnected", false)) showTab("guide");

  window.addEventListener("resize", () => { if ($("devices").classList.contains("orbit")) renderDevices(); });
  if (!adb.hasWebUsb()) { showHelp("NO_WEBUSB"); return; }
  navigator.usb.addEventListener("connect", () => setTimeout(autoConnect, 800));
  autoConnect();
});
