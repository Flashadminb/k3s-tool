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
  NO_DEVICE_SELECTED: ["ยังไม่ได้เลือกเครื่อง / ไม่เห็นชื่อเครื่อง", ["ถ้าเครื่องขึ้นเป็นดาวกลางจออยู่แล้ว แปลว่าต่ออยู่แล้ว ไม่ต้องกดซ้ำ", "รูดแถบแจ้งเตือนที่เครื่อง ต้องเห็น USB debugging connected ถ้าไม่เห็น ให้เปิด USB debugging ใหม่ (เมนู คู่มือ ส่วน B) หรือเปลี่ยนสาย", "แตะข้อความ USB ในแถบแจ้งเตือน แล้วเลือก File transfer (โอนไฟล์)", "ปิดแท็บอื่นที่เปิดเว็บนี้ซ้ำ ถอดสาย รอ 3 วินาที เสียบใหม่ แล้วกดวงกลมอีกครั้ง", "ดูวิธีเช็กเพิ่ม: เมนู คู่มือ > กดเชื่อมต่อแล้ว ไม่เห็นชื่อเครื่องในหน้าต่าง"]],
  BUSY: ["เครื่องถูกโปรแกรมอื่นใช้อยู่", ["กดปุ่ม Windows พิมพ์ cmd แล้วกด Enter", "พิมพ์ cd C:\\Users\\Flash\\Desktop\\Best\\platform-tools แล้วกด Enter", "พิมพ์ adb kill-server แล้วกด Enter", "ปิดแท็บอื่นที่เปิดหน้านี้ซ้ำ และปิดโปรแกรมอื่นที่ใช้มือถือ เช่น Android Studio, scrcpy", "ถอดสาย USB แล้วเสียบใหม่ แล้วกดเชื่อมต่ออีกครั้ง"], PT],
  UNPLUGGED: ["สาย USB หลุด หรือเครื่องถูกถอด", ["เสียบสายกลับเข้าไป รอ 3 วินาที เว็บจะเชื่อมต่อให้เอง (ถ้าไม่ต่อ ให้กด + เชื่อมต่อเครื่อง)", "กดปุ่มเดิมอีกครั้งได้เลย ลบซ้ำได้ ไม่มีอะไรเสีย", "ถ้าหลุดบ่อย: เปลี่ยนสาย หรือเสียบเข้าคอมตรงๆ ไม่ผ่านสายต่อพ่วง"]],
  NOT_CONNECTED: ["ยังไม่ได้เชื่อมต่อ", ["กดปุ่ม + เชื่อมต่อเครื่อง ก่อน", "ถ้าเพิ่งถอดสาย ให้เสียบใหม่"]],
  AUTH: ["เครื่องยังไม่อนุญาต", ["ปลดล็อกหน้าจอเครื่อง จะมีหน้าต่าง Allow USB debugging? ให้ติ๊ก Always allow from this computer (อนุญาตเสมอ) แล้วกด Allow (อนุญาต)", "ถ้าไม่เห็นหน้าต่าง ให้ถอดสายแล้วเสียบใหม่", "ถ้าเคยกด Deny (ปฏิเสธ): Settings > System > Developer options > Revoke USB debugging authorizations แล้วลองใหม่"]],
  INSTALL: ["ติดตั้ง APK ไม่ได้", ["พื้นที่เครื่องอาจเต็ม: กด ลบขยะ และ ลบรูป success ก่อน", "ถ้าขึ้น INSTALL_FAILED_UPDATE_INCOMPATIBLE: ไฟล์มาจากคนละที่กับแอปเดิม ต้องถอนแอปเดิมก่อน (แท็บ แอป)", "ถ้าขึ้น INSTALL_FAILED_VERSION_DOWNGRADE: ไฟล์เก่ากว่าแอปที่มีอยู่", "ถ้าขึ้น USER_RESTRICTED หรือ blocked: ระบบบริษัทบล็อกการติดตั้ง ให้แจ้งไอที Flash"]],
  UNINSTALL: ["ถอนแอปไม่ได้", ["ถ้าขึ้น DEVICE_POLICY_MANAGER หรือ blocked: แอปนี้ระบบบริษัทล็อกไว้ ห้ามหาทางเลี่ยง ให้แจ้งไอที Flash", "ลองโหลดรายชื่อแอปใหม่ แล้วกดอีกครั้ง"]],
  RESET: ["สั่งรีเซ็ตผ่านโปรแกรมไม่ได้", ["ทำมือที่เครื่อง: Settings > System > Reset options > Erase all data (factory reset) (ลบข้อมูลทั้งหมด)", "บางรุ่นเมนูชื่อไม่เหมือนกัน ลองพิมพ์ reset ในช่อง Search ของ Settings", "ถ้าไม่มีเมนูนี้ ระบบบริษัทอาจล็อกไว้ ให้แจ้งไอที"]],
  WALLPAPER: ["เปิดหน้าตั้งวอลเปเปอร์ให้อัตโนมัติไม่ได้", ["รูปถูกส่งเข้าเครื่องแล้วที่โฟลเดอร์ Download", "ทำมือ: เปิดแอป Gallery หรือ Files > เปิดรูป > เมนู 3 จุด > Set as wallpaper (ตั้งเป็นวอลเปเปอร์)", "เลือกได้ว่าจะตั้งหน้าจอหลัก หรือหน้าจอล็อก"]],
  NO_FLASH: ["ไม่เจอแอป Flash ในเครื่อง", ["เช็กว่าเครื่องนี้ติดตั้ง Flash Kit แล้ว", "ดูชื่อแอปในแท็บ แอป แล้วแจ้งผู้ดูแลเว็บให้เพิ่มชื่อ"]],
  NO_FS: ["เบราว์เซอร์นี้บันทึกลงโฟลเดอร์ไม่ได้", ["ใช้ Google Chrome หรือ Microsoft Edge เวอร์ชันล่าสุดบนคอม Windows", "ตอนหน้าต่างเลือกโฟลเดอร์เด้งขึ้น ให้เลือกโฟลเดอร์ แล้วกด อนุญาต/ดูไฟล์ และ บันทึกการเปลี่ยนแปลง"]],
  SETTINGS: ["ตั้งค่าบางข้อไม่สำเร็จ", ["ข้อที่ไม่สำเร็จอาจถูกระบบบริษัทล็อกไว้ ห้ามหาทางเลี่ยง ให้แจ้งไอที Flash", "ข้ออื่นที่สำเร็จแล้วใช้งานได้ตามปกติ"]],
  WIFI: ["ต่อ Wi-Fi ไม่สำเร็จ", ["เช็กชื่อ Wi-Fi ให้ตรงตัวพิมพ์เล็ก/ใหญ่ และรหัสผ่านให้ถูก", "เครื่องต้องอยู่ในระยะสัญญาณ (กด ค้นหา ดูว่าเครื่องเห็น Wi-Fi นี้ไหม)", "ถ้าขึ้นว่าไม่อนุญาต / not allowed: ระบบบริษัทล็อกการตั้ง Wi-Fi ห้ามหาทางเลี่ยง ให้แจ้งไอที Flash"]],
  WIFI_MANUAL: ["เครื่องรุ่นนี้ต้องแตะเลือก Wi-Fi เอง 1 ครั้ง", ["Android ของเครื่องนี้ไม่ให้คอมสั่งต่อ Wi-Fi (ใช้ได้กับ Android 12 ขึ้นไป เช่น K3S) ไม่ใช่ระบบบริษัทบล็อก", "เว็บเปิดหน้า Wi-Fi ที่เครื่องให้แล้ว: แตะชื่อ Wi-Fi ที่ต้องการ (ถ้าเครื่องล็อกอยู่ ให้ปลดล็อกก่อน)", "พอขึ้นช่องใส่รหัส กดปุ่ม พิมพ์รหัส... ด้านล่าง เว็บจะพิมพ์รหัสที่บันทึกไว้และกด Enter ให้", "ไม่อยากจับเครื่อง: ใช้ เครื่อง > ดู/คุมหน้าจอสด แล้วคลิกชื่อ Wi-Fi จากคอม"]],
  TYPE: ["ส่งข้อความไม่ได้", ["พิมพ์ได้เฉพาะภาษาอังกฤษ ตัวเลข และสัญลักษณ์บนคีย์บอร์ด (ภาษาไทยส่งไม่ได้)", "ที่เครื่องต้องเปิดช่องใส่รหัสค้างไว้ก่อน แล้วค่อยกดส่ง", "ดูหน้าจอเครื่องผ่าน เครื่อง > ดู/คุมหน้าจอสด ได้"]],
  SCREEN: ["จับภาพ/อัดหน้าจอไม่ได้", ["ปลดล็อกหน้าจอเครื่องแล้วลองใหม่", "บางแอปห้ามจับภาพหน้าจอ (จะได้ภาพดำ)", "ถ้ายังไม่ได้ ระบบบริษัทอาจล็อกการจับหน้าจอ ให้แจ้งไอที"]],
  WALL_TAP: ["ส่งรูปแล้ว เหลือกดยืนยันที่เครื่อง 1 ครั้ง", ["ที่หน้าจอเครื่อง จะขึ้นหน้าตั้งวอลเปเปอร์พร้อมรูปที่เลือก (ถ้าเครื่องล็อกอยู่ ให้ปลดล็อกก่อน)", "กด ตั้งวอลเปเปอร์ (Set wallpaper)", "เลือก หน้าจอหลักและหน้าจอล็อก (Home and lock screens)", "ถ้าไม่อยากจับเครื่อง: แท็บ เครื่อง > ดู/คุมหน้าจอสด แล้วคลิกจากคอมแทนได้", "ถ้าเครื่องถามว่าจะเปิดด้วยแอปไหน ให้เลือก วอลเปเปอร์ หรือ Wallpaper"]],
  FLASH_DL: ["โหลด Flash Kit อัตโนมัติไม่สำเร็จ", ["ตรวจว่าคอมต่อเน็ตอยู่ และลิงก์ใน ตั้งค่า > Flash Kit ถูกต้อง", "ถ้าเว็บให้เลือกโฟลเดอร์: เลือกโฟลเดอร์ Downloads ที่ Chrome เก็บไฟล์ที่โหลด แล้วกด อนุญาต", "ทางสำรอง: กดปุ่ม Flash Kit มุมขวาบนเพื่อโหลดเอง แล้วใช้ เครื่อง > ติดตั้ง / อัปเดต APK"]],
  DEV_BUSY: ["เครื่องนี้กำลังทำงานอื่นอยู่", ["รอให้งานเดิมเสร็จก่อน (ดูแถบด้านล่างจอ)", "ระหว่างนี้สั่งงานเครื่องอื่นได้ตามปกติ: คลิกดาวเครื่องอื่นก่อน แล้วค่อยกดปุ่ม", "ถ้าเลือกกลุ่มไว้ และมีเครื่องในกลุ่มที่ยังทำงานอยู่ ให้รอ หรือเอาเครื่องนั้นออกจากกลุ่มก่อน"]],
  UNKNOWN: ["เกิดข้อผิดพลาด", ["ถ่ายภาพหน้าจอส่วน Log ด้านล่างส่งให้ผู้ดูแล", "ลองถอดสายแล้วเชื่อมต่อใหม่"]]
};

/* =====================================================================
   Small UI helpers
   ===================================================================== */
function log(msg) {
  const t = new Date().toLocaleTimeString("th-TH");
  $("log").textContent = `[${t}] ${msg}\n` + $("log").textContent.slice(0, 20000);
}
// Progress toast at the bottom + tab title. Several jobs can run at once (one per device), one line each.
const TITLE = "IDATA TOOLS";
const toast = { lines: new Map(), last: null, timer: null, firstStart: 0 };
function busyMsg(t, key) {
  // no key: the detail belongs to the job started most recently
  if (!key) key = toast.last || "misc";
  if (t) {
    const j = toast.lines.get(key);
    if (j) j.text = t; else { toast.lines.set(key, { text: t, start: Date.now() }); if (key.startsWith("job")) toast.last = key; }
    if (!toast.firstStart) toast.firstStart = Date.now();
  } else {
    toast.lines.delete(key);
    if (toast.last === key) toast.last = [...toast.lines.keys()].reverse().find((k) => k.startsWith("job")) || null;
    if (key === "prog") $("busy").classList.remove("prog");
  }
  paintBusy();
}
function paintBusy() {
  const b = $("busy");
  if (toast.lines.size) {
    b.textContent = [...toast.lines.values()].map((j) => {
      const sec = Math.round((Date.now() - j.start) / 1000);
      return j.text + (sec >= 3 ? ` · ${sec} วิ` : "");
    }).join("\n");
    b.hidden = false; document.title = `⏳ ${TITLE}`;
    if (!toast.timer) toast.timer = setInterval(paintBusy, 1000);
  } else {
    b.hidden = true; b.classList.remove("prog"); clearInterval(toast.timer); toast.timer = null;
    const long = toast.firstStart && Date.now() - toast.firstStart > 8000;
    toast.firstStart = 0;
    document.title = long ? `✅ เสร็จแล้ว · ${TITLE}` : TITLE;
    if (long) setTimeout(() => { if (!toast.lines.size) document.title = TITLE; }, 15000);
  }
}

// Big card while waiting for someone to tap "Allow" on the device; it names every device still waiting
let authTimer = null;
const pending = new Set();   // serials waiting for "Allow"
function authWait(on, serial) {
  const c = $("authWait");
  if (serial) on ? pending.add(serial) : pending.delete(serial);
  else if (!on) pending.clear();
  const show = on || pending.size > 0;
  if ($("authWho")) $("authWho").textContent = pending.size ? "เครื่องที่รอ: " + [...pending].map((s) => "รหัส " + s.slice(-6)).join(", ") : "";
  if (c.hidden === !show) { renderDevicesSoon(); return; }
  clearTimeout(authTimer);
  c.hidden = !show;
  $("authMore").hidden = true;
  if (show) { c.scrollIntoView({ behavior: "smooth", block: "nearest" }); authTimer = setTimeout(() => ($("authMore").hidden = false), 15000); }
  renderDevicesSoon();
}
let rdTimer = 0;
function renderDevicesSoon() { clearTimeout(rdTimer); rdTimer = setTimeout(() => { if (typeof renderDevices === "function") renderDevices(); }, 0); }

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

/*
 * Jobs lock only the devices they work on. While one device is deleting, the others (and the rest of the page)
 * stay usable; a second job on a device that is already busy is refused with a clear message.
 */
let jobSeq = 0;
const anyBusy = () => toast.lines.size > 0;
async function run(name, fn, helpCode) {
  let devs = [];
  try { devs = targets(); } catch (e) {}
  const clash = devs.find((d) => d.busy);
  if (clash) {
    log(`${label(clash)} กำลัง${clash.busy}อยู่ รอให้เสร็จก่อน หรือเลือกเครื่องอื่น`);
    showHelp("DEV_BUSY", `${label(clash)}: ${clash.busy}`);
    return;
  }
  const key = "job" + ++jobSeq;
  devs.forEach((d) => { d.busy = name; if (!d.status || d.status.done) setStatus(d, { title: shortJob(name) }); });
  if (devs.length) renderDevicesSoon();
  $("help").hidden = true;
  busyMsg(name + (devs.length === 1 ? " · " + label(devs[0]) : devs.length > 1 ? ` · ${devs.length} เครื่อง` : "") + " ...", key);
  log(name + " ...");
  let outcome = "ok";
  try { const r = await fn(); if (r === false) outcome = "cancel"; else log(name + " เสร็จแล้ว"); }
  catch (e) { outcome = "err"; console.error(e); log(name + " ล้มเหลว: " + (e && e.message)); showHelp(helpCode && codeOf(e) === "UNKNOWN" ? helpCode : codeOf(e), String((e && e.message) || e)); }
  finally {
    devs.forEach((d) => {
      if (d.busy === name) d.busy = null;
      // a job that set its own finished status keeps it; otherwise show the generic outcome
      if (d.status && !d.status.done) setStatus(d, outcome === "cancel" ? null : outcome === "err" ? { title: "ไม่สำเร็จ", err: true, done: true } : { title: "เสร็จแล้ว", done: true });
    });
    busyMsg("", key);
    if (devs.length) renderDevicesSoon();
  }
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
  if (pendingInstall && Date.now() - pendingInstall.t < 180000) { const p = pendingInstall.list; pendingInstall = null; return Promise.resolve(p); }
  pendingInstall = null;
  const g = groupDevs();
  if (g.length) return Promise.resolve(g);
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
const targets = () => {
  const g = groupDevs();
  if (g.length) return g;
  const ad = $("allDev");
  return ad && ad.checked && devices.size > 1 ? all() : [cur()];
};
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
    devices.delete(d.serial); group.delete(d.serial);
    if (selected === d.serial) selected = devices.keys().next().value || null;
    if (live.dev === d) stopLive();
    renderAll();
  });
  try { st.save("everConnected", true); } catch (e) {}
  // First visit opens the guide; once a device is connected, jump to the main delete tab
  if (document.querySelector(".tabs .on").dataset.tab === "guide") showTab("data");
  renderAll();
  // Quick facts (battery, screen, Flash Kit) and the slower file counts load side by side
  await Promise.all([
    (async () => {
      await loadInfo(d).catch((e) => log("อ่านข้อมูลเครื่องไม่ครบ: " + e.message));
      await pollStatus(d).catch(() => {});
      renderDevices(); renderCard();
      await checkBanned(d).catch(() => {});
    })(),
    refreshStorage(d)
  ]);
  renderAll();
  return d;
}

async function connectNew() {
  log("รอเลือกเครื่องในหน้าต่างของเบราว์เซอร์ ...");
  let d;
  let waiting = null;
  try { d = await adb.requestAndOpen((s) => { waiting = s; busyMsg(`รอกด Allow ที่เครื่องรหัส ${String(s || "").slice(-6)}`); authWait(true, s); }); }
  finally { authWait(false, waiting); }
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
          await addDevice(await adb.openUsb(usb, () => authWait(true, usb.serial)));
          break;
        } catch (e) {
          if (e.message === "BUSY") { showHelp("BUSY"); break; }
          if (tryNo === 5) { log("เชื่อมต่ออัตโนมัติไม่สำเร็จ (" + (e.message || e) + ") กด + เชื่อมต่อเครื่อง เอง"); break; }
          await new Promise((r) => setTimeout(r, 3000));
        } finally { authWait(false, usb.serial); }
      }
    }
  } finally { autoConnecting = false; }
}

/* ---------- Group selection: actions apply to every linked device until the group is cleared ---------- */
const group = new Set();
const draining = new Set();   // devices deleting right now (files are drawn flowing into the hub)
let selectMode = false, hoverSerial = null, groupPin = null, pendingInstall = null, cardDev = null;
const groupDevs = () => [...group].map((s) => devices.get(s)).filter((d) => d && !d.closed);

function renderDevices() {
  const box = $("devices");
  const n = all().length;
  document.body.classList.toggle("has-dev", !!n);
  document.body.classList.toggle("selecting", selectMode);
  renderHubTools(); // before layout: the select bar and hub tools are areas the devices must avoid
  if (box.classList.contains("orbit")) renderOrbit(box);
  else box.replaceChildren(...all().map((d) => {
    const s = d.info.storage;
    const pct = s && s.total ? Math.round((s.used / s.total) * 100) + "%" : "";
    const ban = d.info.bannedFound && d.info.bannedFound.length ? " · 🚫" + d.info.bannedFound.length : "";
    return el("button", { class: "dev" + (d.serial === selected ? " sel" : ""), onclick: () => { selected = d.serial; renderAll(); } },
      el("b", { text: d.info.model || "เครื่อง" }), el("small", { text: "รหัส " + d.serial.slice(-6) + (pct ? " · ใช้ " + pct : "") + ban }));
  }));
  const g = groupDevs().length;
  $("status").textContent = !n ? "ยังไม่เชื่อมต่อ" : g ? `กลุ่ม ${g} จาก ${n} เครื่อง` : `เชื่อมต่อ ${n} เครื่อง`;
  $("status").className = n ? "pill ok" : "pill";
  if ($("allDevWrap")) { $("allDevWrap").hidden = n < 2; $("devCount").textContent = n; }
  if ($("stdAll")) $("stdAll").parentElement.hidden = n < 2;
  document.querySelectorAll(".need-dev").forEach((e) => (e.hidden = !n));
  const tab = document.querySelector(".tabs .on").dataset.tab;
  // In the space layout the empty-state note lives on the stage, so it shows on every tab
  $("nodev").hidden = !!n || (!box.classList.contains("orbit") && !["data", "device", "apps", "setup"].includes(tab));
  renderWifiSaved();
}

/* ---------- Space layout: devices float on orbits around the connect hub ---------- */
const TINTS = ["#5b8cff", "#3cc6b4", "#c98bff", "#ff9d6b", "#6fd49a", "#ffd36b"];
function tintOf(serial) { let h = 0; for (const c of serial) h = (h * 31 + c.charCodeAt(0)) >>> 0; return TINTS[h % TINTS.length]; }
const satSizeFor = (n, narrow) => Math.min(narrow ? 104 : 999, n <= 4 ? 132 : n <= 8 ? 112 : n <= 12 ? 96 : 86);

/**
 * Free spots around the hub. A honeycomb of cells (wide enough for the floating motion, tall enough for the
 * tags under a device) is laid over the stage, cells that touch the hub, the device card or the edges are
 * dropped, and the cells nearest the hub win. A small fixed jitter keeps neighbours from reading as rows.
 */
function orbitSlots(box, n, size, tagRows) {
  const W = box.clientWidth || 800, H = box.clientHeight || 500;
  const cs = getComputedStyle(box);
  const cx = W * (parseFloat(cs.getPropertyValue("--cx")) || 50) / 100, cy = H * (parseFloat(cs.getPropertyValue("--cy")) || 50) / 100;
  const br = box.getBoundingClientRect();
  const avoid = [];
  const addRect = (e, pad) => { if (!e || e.hidden || !e.offsetParent) return; const r = e.getBoundingClientRect(); if (r.width) avoid.push({ x1: r.left - br.left - pad, y1: r.top - br.top - pad, x2: r.right - br.left + pad, y2: r.bottom - br.top + pad }); };
  addRect($("devCard"), 12); addRect(document.querySelector(".hubwrap"), 10); addRect($("selBar"), 6); addRect($("flashNeed"), 6);
  const tagH = tagRows * 24;
  const sx = size * 1.3, sy = size + tagH + 22;
  const R = size / 2 + 8;
  const fits = (x, y) => x - R >= 0 && x + R <= W && y - R >= 0 && y + R + tagH <= H &&
    !avoid.some((a) => x + R > a.x1 && x - R < a.x2 && y + R + tagH > a.y1 && y - R < a.y2);
  const cells = [];
  const rows = Math.ceil(H / sy) + 1, cols = Math.ceil(W / sx) + 1;
  for (let r = -rows; r <= rows; r++) for (let k = -cols; k <= cols; k++) {
    const j = ((r * 7 + k * 13) % 5 + 5) % 5 - 2, jy = ((r * 11 + k * 5) % 5 + 5) % 5 - 2;
    const x = cx + (k + (r & 1) * 0.5) * sx + j * size * 0.06, y = cy + r * sy + jy * size * 0.05;
    if (fits(x, y)) cells.push({ x, y, d: ((x - cx) / W) ** 2 + ((y - cy) / H) ** 2 });
  }
  cells.sort((a, b) => a.d - b.d);
  // keep a stable, pleasant order: nearest ring first, then clockwise from the top
  const slots = cells.slice(0, n).sort((a, b) => Math.atan2(a.x - cx, cy - a.y) - Math.atan2(b.x - cx, cy - b.y));
  return { slots, cx, cy };
}

function batteryIcon(level) {
  const lv = Math.max(0, Math.min(100, +level || 0));
  const col = lv < 20 ? "var(--bad)" : lv < 50 ? "var(--warn)" : "var(--ok)";
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 26 13"); svg.setAttribute("class", "bat"); svg.setAttribute("aria-hidden", "true");
  svg.innerHTML = `<rect x="0.75" y="0.75" width="21.5" height="11.5" rx="2.5" fill="none" stroke="currentColor" stroke-width="1.5"/><rect x="23" y="4" width="2.2" height="5" rx="1" fill="currentColor"/><rect x="2.5" y="2.5" width="${(18 * lv / 100).toFixed(1)}" height="8" rx="1.2" fill="${col}"/>`;
  return svg;
}

const flashMain = (d) => { const f = d.info.flash || []; return f.find((x) => /courier/.test(x.pkg)) || f[0] || null; };
/**
 * The Flash Kit link always serves the newest build, so "latest" is learned: the highest version seen on any
 * device (connected now or recorded in the device registry), or the number typed in Settings if that is higher.
 */
function latestFlash() {
  let best = st.flashCfg().latest || "0", from = "ตั้งค่า";
  const consider = (v, src) => { if (v && verLess(best, v)) { best = v; from = src; } };
  all().forEach((d) => { const m = flashMain(d); if (m) consider(m.ver, label(d)); });
  Object.values(st.registry()).forEach((r) => consider(r.flashMain, "รหัส " + String(r.serial).slice(-6)));
  return { ver: best, from };
}
function flashState(d) {
  const f = d.info.flash;
  if (!f) return "";
  if (!f.length) return "missing";
  return verLess(flashMain(d).ver, latestFlash().ver) ? "old" : "ok";
}
function verLess(a, b) {
  const pa = String(a || "0").split(/[^\d]+/).map(Number), pb = String(b || "0").split(/[^\d]+/).map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) { const x = pa[i] || 0, y = pb[i] || 0; if (x !== y) return x < y; }
  return false;
}

function renderOrbit(box) {
  const ds = all();
  // devices plugged in but still waiting for "Allow" get a faint placeholder so it is clear which one to look at
  const ghosts = [...pending].filter((s) => !devices.has(s));
  const narrow = innerWidth <= 980;
  const nAll = ds.length + ghosts.length;
  // rows of tags under the busiest device (same rules as the tags drawn below: at most two)
  const tagCount = (d) => Math.min(2, (d.info.screenOn === false ? 1 : 0) + (["missing", "old"].includes(flashState(d)) ? 1 : 0) + ((d.info.bannedFound || []).length ? 1 : 0));
  const tagRows = Math.max(0, ...ds.map(tagCount));
  const fit = (rows) => {
    let s = satSizeFor(nAll, narrow), l;
    for (;;) { l = orbitSlots(box, nAll, s, rows); if (l.slots.length >= nAll || s <= 56) return [s, l]; s = Math.round(s * 0.92); }
  };
  // With many devices the tags shrink into short labels on the ring itself, which frees a whole row of space
  let [size, lay] = fit(tagRows);
  const compact = tagRows > 0 && (size < 92 || lay.slots.length < nAll);
  if (compact) [size, lay] = fit(0.75); // short labels still hang a little below the ring
  box.style.setProperty("--s", size + "px");
  const pos = new Map();
  box.replaceChildren(...ds.map((d, i) => {
    const p = lay.slots[i] || { x: lay.cx + (i - ds.length / 2) * 20, y: lay.cy + 140 };
    pos.set(d.serial, p);
    const s = d.info.storage, b = d.info.battery;
    const pct = s && s.total ? Math.round((s.used / s.total) * 100) : 0;
    const inGroup = group.has(d.serial), off = d.info.screenOn === false, fs = flashState(d);
    const ban = d.info.bannedFound && d.info.bannedFound.length;
    const isSel = group.size ? groupPin === d.serial : d.serial === selected;
    const sat = el("button", {
      class: "sat" + (isSel ? " sel" : "") + (pct > 85 ? " full" : "") + (off ? " off" : ""),
      title: label(d) + (selectMode ? " · กดเพื่อเลือก/เอาออก" : ""), "aria-pressed": String(selectMode ? inGroup : isSel),
      onclick: () => {
        if (selectMode) { inGroup ? group.delete(d.serial) : group.add(d.serial); }
        else if (group.size) groupPin = groupPin === d.serial ? null : d.serial;
        else selected = d.serial;
        renderAll();
      }
    },
      el("span", { class: "sat-ring" }),
      el("span", { class: "sat-body" }, ...satBody(d)),
      inGroup ? el("span", { class: "sat-check", "aria-hidden": "true" }) : null);
    const tags = [];
    if (off) tags.push(el("button", { class: "sat-tag wake", text: compact ? "จอดับ" : "จอดับ · แตะเพื่อเปิด", title: "แตะเพื่อเปิดหน้าจอ", onclick: () => wakeScreen(d) }));
    if (fs === "missing") tags.push(el("span", { class: "sat-tag bad", text: compact ? "ไม่มี Flash" : "ไม่มี Flash Kit" }));
    else if (fs === "old") tags.push(el("span", { class: "sat-tag warn", text: compact ? "Flash เก่า" : "Flash Kit เก่า" }));
    if (ban && tags.length < 2) tags.push(el("span", { class: "sat-tag bad", text: compact ? "แอปห้าม" : "แอปต้องห้าม " + ban }));
    const drain = draining.has(d.serial);
    const w = el("div", {
      class: "satw" + (inGroup ? " in-group" : "") + (drain ? " draining" : d.busy ? " working" : "") + statusClass(d), "data-serial": d.serial, title: d.busy ? "กำลัง" + d.busy : "",
      style: `left:${p.x.toFixed(0)}px;top:${p.y.toFixed(0)}px;--p:${ringPct(d)};--tint:${tintOf(d.serial)};--delay:${(i * -2.3).toFixed(1)}s;--dx:${(lay.cx - p.x).toFixed(0)}px;--dy:${(lay.cy - p.y).toFixed(0)}px`
    }, drain ? el("div", { class: "drops", "aria-hidden": "true" }, [0, 1, 2, 3, 4, 5].map((k) => el("i", { style: `--k:${k}` }))) : null,
      sat, tags.length ? el("div", { class: "sat-tags" + (compact ? " compact" : "") }, tags) : null);
    return w;
  }), ...ghosts.map((serial, j) => {
    const p = lay.slots[ds.length + j] || { x: lay.cx, y: lay.cy + 160 };
    return el("div", { class: "satw ghost", style: `left:${p.x.toFixed(0)}px;top:${p.y.toFixed(0)}px;--p:0;--tint:#556` },
      el("div", { class: "sat" }, el("span", { class: "sat-ring" }),
        el("span", { class: "sat-body" }, el("b", { class: "sat-wait", text: "รอ Allow" }), el("span", { class: "sat-id", text: serial.slice(-6) }))));
  }));
  drawLinks(lay, pos);
  renderCard();
}

/*
 * What a device is doing right now, shown inside its circle instead of the usual numbers:
 * { title: "ลบ success", big: "12,340", unit: "ไฟล์ที่เหลือ", ring: 0-100, done, err }. The id stays, small.
 * A finished status ("เสร็จแล้ว") stays 5 s, then the circle goes back to storage % and battery.
 */
function setStatus(d, s) {
  clearTimeout(d._stTimer);
  d.status = s || null;
  if (s && s.done) d._stTimer = setTimeout(() => { if (d.status === s) { d.status = null; paintStatus(d); } }, 5000);
  paintStatus(d);
}
function storagePct(d) { const s = d.info.storage; return s && s.total ? Math.round((s.used / s.total) * 100) : 0; }
const ringPct = (d) => (d.status && d.status.ring != null ? Math.max(0, Math.min(100, Math.round(d.status.ring))) : storagePct(d));
const statusClass = (d) => (d.status ? " has-status" + (d.status.err ? " st-err" : d.status.done ? " st-done" : "") : "");
function satBody(d) {
  const id = el("span", { class: "sat-id", text: d.serial.slice(-6) });
  const s0 = d.status;
  if (s0) return [el("span", { class: "sat-st", text: s0.title }), s0.big != null ? el("b", { class: "sat-big", text: s0.big }) : null,
    s0.unit ? el("span", { class: "sat-unit", text: s0.unit }) : null, id].filter(Boolean);
  const s = d.info.storage, b = d.info.battery;
  return [el("b", { class: "sat-pct", text: s ? storagePct(d) + "%" : "…" }),
    el("span", { class: "sat-bat" }, batteryIcon(b && b.level), el("span", { text: b && b.level !== "" ? b.level + "%" : "" })), id];
}
/** Update one circle in place (cheap enough to call many times a second while deleting) */
function paintStatus(d) {
  const w = document.querySelector(`.satw[data-serial="${CSS.escape(d.serial)}"]`);
  if (!w) return;
  w.style.setProperty("--p", ringPct(d));
  w.classList.remove("has-status", "st-done", "st-err");
  statusClass(d).trim().split(" ").filter(Boolean).forEach((c) => w.classList.add(c));
  const body = w.querySelector(".sat-body");
  if (body) body.replaceChildren(...satBody(d));
}
const shortJob = (name) => name.replace(/ · .*$/, "").replace(/\.\.\.$/, "").slice(0, 18);

/** Gold lines joining the grouped devices (ordered around the hub) */
function drawLinks(lay, pos) {
  const svg = $("links");
  if (!svg) return;
  const pts = groupDevs().map((d) => pos.get(d.serial)).filter(Boolean)
    .sort((a, b) => Math.atan2(a.y - lay.cy, a.x - lay.cx) - Math.atan2(b.y - lay.cy, b.x - lay.cx));
  svg.innerHTML = "";
  if (pts.length < 2) return;
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", pts.map((p, i) => (i ? "L" : "M") + p.x.toFixed(0) + " " + p.y.toFixed(0)).join(" ") + (pts.length > 2 ? " Z" : ""));
  path.setAttribute("class", "link");
  svg.append(path);
}

function renderHubTools() {
  const tools = $("hubTools");
  if (!tools) return;
  const n = all().length, g = groupDevs().length;
  tools.hidden = n < 1;
  $("selTool").classList.toggle("on", selectMode);
  $("selTool").setAttribute("aria-pressed", String(selectMode));
  $("selBar").hidden = !selectMode && !g;
  $("selInfo").textContent = selectMode ? (g ? `เลือกแล้ว ${g} เครื่อง` : "แตะดาวเพื่อเลือกเครื่อง") : `กลุ่ม ${g} เครื่อง`;
  $("selDone").hidden = !selectMode;
  $("selAll").hidden = !selectMode;
  const need = all().filter((d) => ["missing", "old"].includes(flashState(d)));
  renderFlashSeen();
  $("flashNeed").hidden = !need.length;
  $("flashNeedN").textContent = need.length;
}

/** Left card: the hovered device, else the clicked one; with a group it also lists the group */
function renderCard() {
  const c = $("devCard");
  if (!c) return;
  const gs = groupDevs();
  const d = devices.get(hoverSerial) || (gs.length ? devices.get(groupPin) : devices.get(selected));
  c.hidden = !d && !gs.length;
  $("dcGroup").hidden = !gs.length;
  if (gs.length) {
    $("dcGroupTitle").textContent = `กลุ่มที่เลือก ${gs.length} เครื่อง`;
    $("dcGroupList").replaceChildren(...gs.map((x) => el("span", { class: "chip" + (d === x ? " on" : ""), text: x.serial.slice(-6) })));
  }
  $("dcDetail").hidden = !d;
  cardDev = d || null;
  if (!d) return;
  const s = d.info.storage, i = d.info, b = i.battery;
  $("model").textContent = label(d);
  if (s) {
    const pct = s.total ? Math.round((s.used / s.total) * 100) : 0;
    $("used").textContent = human(s.used) + " (" + pct + "%)";
    $("total").textContent = "เหลือว่าง " + human(s.total - s.used) + " จาก " + human(s.total);
    $("bar").style.width = pct + "%"; $("bar").className = pct > 85 ? "bar bad" : pct > 70 ? "bar warn" : "bar";
  } else { $("used").textContent = "-"; $("total").textContent = ""; $("bar").style.width = 0; }
  $("dcBattery").replaceChildren(...(b ? [batteryIcon(b.level), ` ${b.level}%${b.status ? " · " + b.status : ""}`] : ["-"]));
  $("dcHealth").textContent = b ? b.health + (b.temp ? ` · ${b.temp}°C` : "") : "-";
  $("dcAndroid").textContent = i.android ? "Android " + i.android : "-";
  const fs = flashState(d);
  $("dcFlash").textContent = i.flash ? (i.flash.length ? i.flash.map((f) => f.ver || f.pkg).join(", ") + (fs === "old" ? " (เก่า)" : "") : "ไม่มี") : "-";
  $("dcScreen").textContent = i.screenOn === false ? "ดับอยู่" : i.screenOn ? "เปิดอยู่" : "-";
  $("dcSerial").textContent = d.serial;
}
function renderDevCard() { renderCard(); }

/** Bottom dock numbers: the group added up, or the selected device */
function renderDock() {
  if (!$("dockScope")) return;
  const gs = groupDevs();
  const ds = gs.length ? gs : [devices.get(selected)].filter(Boolean);
  $("dockScope").textContent = gs.length ? `รวม ${gs.length} เครื่อง` : ds[0] ? label(ds[0]) : "";
  if (!ds.length || ds.some((d) => !d.info.storage)) { ["cSuccess", "cTrash", "cFail"].forEach((k) => ($(k).textContent = ds.length ? "กำลังนับ..." : "-")); return; }
  const counting = ds.some((d) => d.info.storage.counting);
  const sum = (k) => ds.reduce((a, d) => [a[0] + (d.info.storage[k] || [0])[0], a[1] + (d.info.storage[k] || [0, 0])[1]], [0, 0]);
  const f = (x) => (counting ? "กำลังนับ..." : x[0].toLocaleString() + " ไฟล์ · " + human(x[1]));
  $("cSuccess").textContent = f(sum("success")); $("cTrash").textContent = f(sum("trash")); $("cFail").textContent = f(sum("fail"));
}

/* ---------- Screen off: wake it, then ask (every time) whether to keep it on while on USB ---------- */
async function wakeScreen(d) {
  await run("เปิดหน้าจอ " + label(d), async () => {
    await d.sh("input keyevent 224");
    d.info.screenOn = true; renderDevices();
    if (await confirmBox(`เปิดหน้าจอ ${label(d)} แล้ว\n\nให้หน้าจอเครื่องนี้เปิดค้างไว้ ไม่ดับเอง ตอนเสียบสาย USB อยู่ไหม?\n(ถอดสายแล้วจอจะดับตามปกติ)`)) {
      await d.shOk("svc power stayon usb");
      log(`${label(d)}: ตั้งให้จอเปิดค้างตอนเสียบสาย USB แล้ว`);
    }
  });
}

/* ---------- Light status poll: screen on/off and battery, every 15 s ---------- */
async function pollStatus(d) {
  const r = await d.sh("dumpsys power | grep -m1 mWakefulness=; dumpsys battery | grep -m1 ' level:'");
  const wake = (r.out.match(/mWakefulness=(\w+)/) || [])[1];
  const lvl = (r.out.match(/level:\s*(\d+)/) || [])[1];
  let changed = false;
  if (wake) { const on = wake === "Awake"; if (d.info.screenOn !== on) { d.info.screenOn = on; changed = true; } }
  if (lvl && d.info.battery && d.info.battery.level !== lvl) { d.info.battery.level = lvl; changed = true; }
  return changed;
}
async function pollAll() {
  if (document.hidden) return;
  let changed = false;
  for (const d of all()) { if (d.busy) continue; try { if (await pollStatus(d)) changed = true; } catch (e) {} }
  if (changed) renderDevices();
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
// Every find uses -H: on Android /sdcard is a symlink, and find does not enter a symlinked start folder without it
// One pass per folder: number of files and total KB. Missing folder -> 0 0
// Fast: list names (readdir only) for the count and one `du -sk` for the size, instead of a stat per file
const statCmd = (dir) =>
  `if [ -d ${q(dir)} ]; then echo $(find -H ${q(dir)} -type f 2>/dev/null | wc -l) $(du -sk ${q(dir)} 2>/dev/null | cut -f1); else echo 0 0; fi`;
// Trash lives next to the photos; Android/ (every app's private data, huge) is skipped instead of searched
const TRASH_FIND = `find -H /sdcard -path /sdcard/Android -prune -o -type f ${TRASH}`;
const trashStatCmd = `${TRASH_FIND} -exec du -k {} + 2>/dev/null | awk '{s+=$1;n++} END {print n+0, s+0}'`;
// Delete in batches of 300, up to 4 at a time (xargs -P), and print how many each batch removed so the page can
// show progress. Phones whose xargs has no -P fall back to one batch at a time.
// (the -P check runs before the pipeline: put inside it, it would swallow the file list)
const PAR_CHECK = `if echo | xargs -P 2 true 2>/dev/null; then P="-P 4"; else P=""; fi;`;
const BATCH_DEL = `xargs -0 -n 300 $P sh -c 'rm -f "$@"; echo $#' _`;
// Photos and videos outside Flash Kit's own folders (camera, screenshots, Pictures, other apps)
const MEDIA = "\\( -iname '*.jpg' -o -iname '*.jpeg' -o -iname '*.png' -o -iname '*.webp' -o -iname '*.heic' -o -iname '*.gif' -o -iname '*.mp4' -o -iname '*.3gp' \\)";
const OTHER_MEDIA = `find -H /sdcard -type f ${MEDIA} -not -path '/sdcard/Android/*' -not -path '*/imagePath/*' -not -name '.trashed-*'`;

async function df(d) {
  const p = (await d.sh("df -k /sdcard | tail -1")).out.trim().split(/\s+/);
  return { total: parseInt(p[1], 10) || 0, used: parseInt(p[2], 10) || 0 };
}

async function refreshStorage(d) {
  const p = d.info.profile;
  const s = await df(d);
  d.info.storage = { ...s, counting: true };
  const counting = !d.status || d.status.done;
  if (counting) setStatus(d, { title: "กำลังนับไฟล์" });
  if (d.serial === selected) renderStorage(d);
  // the three counts run side by side over separate ADB streams
  const num = (r) => { const v = r.out.trim().split(/\s+/).map((x) => parseInt(x, 10) || 0); return [v[0] || 0, v[1] || 0]; };
  const [sc, fc, tc] = await Promise.all([d.sh(statCmd(p.success)), d.sh(statCmd(p.fail)), d.sh(trashStatCmd)]);
  d.info.storage = { ...s, success: num(sc), fail: num(fc), trash: num(tc), at: Date.now() };
  if (counting && d.status && d.status.title === "กำลังนับไฟล์") setStatus(d, null);
  st.updateRegistry(d.serial, { model: d.info.model, storage: `${human(s.used)} / ${human(s.total)}` });
  renderStorage(devices.get(selected)); renderDevices();
}

function renderStorage(d) {
  if ($("devCard")) { renderCard(); renderDock(); return; }
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
  success: { label: "รูป success", short: "ลบ success", cmd: (p) => delCmd(p.success) },
  fail: { label: "รูป fail", short: "ลบ fail", cmd: (p) => delCmd(p.fail) },
  trash: { label: "ขยะ .trashed", short: "ล้างถังขยะ", cmd: () => `${PAR_CHECK} ${TRASH_FIND} -print0 2>/dev/null | ${BATCH_DEL}` }
};
// Files go through find -print0 | xargs (never `rm -rf dir/*`, which fails with "argument list too long").
// Missing folder (fresh device) means nothing to delete, not an error. Each output line = files removed by one batch.
function delCmd(dir) {
  return `${PAR_CHECK} [ -d ${q(dir)} ] || exit 0; find -H ${q(dir)} -type f -print0 | ${BATCH_DEL}`;
}

/* ---------- File manager: every file and folder in the phone storage, biggest first, delete what is ticked ---------- */
const FB_ROOT = "/sdcard";
let fbPath = FB_ROOT, fbItems = [];
// Android/ holds every app's own data (Flash Kit's included): browsing is fine, deleting there is not offered
const fbLocked = (p) => p === FB_ROOT + "/Android" || p.startsWith(FB_ROOT + "/Android/");
const fbWarn = (p) => /\/imagePath(\/fail)?$/.test(p) || /\/imagePath\/fail\//.test(p);
async function fbList(d, path) {
  busyMsg("กำลังอ่านโฟลเดอร์ · " + (path.replace(FB_ROOT, "") || "/"));
  const r = await d.sh(`cd ${q(path)} || exit 1; ls -A | while IFS= read -r f; do if [ -d "$f" ] && [ ! -L "$f" ]; then printf 'd\\t%s\\t%s\\n' "$(du -sk "$f" 2>/dev/null | cut -f1)" "$f"; else printf 'f\\t%s\\t%s\\n' "$(du -k "$f" 2>/dev/null | cut -f1)" "$f"; fi; done`);
  if (r.code) throw new Error("เปิดโฟลเดอร์นี้ไม่ได้: " + (r.err || r.out).trim());
  fbPath = path;
  fbItems = r.out.split("\n").map((l) => { const [t, kb, ...n] = l.split("\t"); return { dir: t === "d", kb: +kb || 0, name: n.join("\t") }; })
    .filter((x) => x.name).sort((a, b) => b.kb - a.kb);
  renderFb();
}
function folderIcon() {
  const s = el("span", { class: "fico", "aria-hidden": "true" });
  s.innerHTML = '<svg class="i"><use href="#i-folder"/></svg>';
  return s;
}
function renderFb() {
  const box = $("fbList");
  if (!box) return;
  $("fbCard").hidden = false;
  $("fbPath").textContent = "ที่เก็บในเครื่อง" + (fbPath.replace(FB_ROOT, "") || "") + "  ·  " + human(fbItems.reduce((s, x) => s + x.kb, 0));
  $("fbUp").hidden = fbPath === FB_ROOT;
  const locked = fbLocked(fbPath);
  $("fbLockNote").hidden = !locked;
  box.replaceChildren(...(fbItems.length ? fbItems.map((x) => {
    const full = fbPath + "/" + x.name;
    const lock = fbLocked(full);
    const c = lock ? el("span", { class: "tag sys", text: "ห้ามลบ" }) : el("input", { type: "checkbox", "data-path": full, "data-kb": x.kb });
    return el("div", { class: "item" },
      el("label", { class: "row", style: "gap:10px;flex-wrap:nowrap;min-width:0;flex:1" }, c,
        x.dir ? folderIcon() : null,
        el("span", { class: "nm" }, x.name, el("small", { text: human(x.kb) + (x.dir ? " · โฟลเดอร์" : "") + (lock ? " · ข้อมูลของแอปต่างๆ" : fbWarn(full) ? " · รูปที่อาจยังไม่ส่ง" : "") }))),
      x.dir ? el("button", { text: "เปิด", onclick: () => run("เปิดโฟลเดอร์", () => fbList(cur(), full)) }) : null);
  }) : [el("div", { class: "item mut", text: "โฟลเดอร์ว่าง" })]));
}
let otherFolders = [];
async function scanOther(ts) {
  const merged = new Map();
  for (const d of ts) {
    busyMsg("กำลังหารูปอื่นในเครื่อง · " + label(d));
    const out = (await d.sh(`${OTHER_MEDIA} -exec du -k {} + 2>/dev/null | awk '{s=$1; sub(/^[0-9]+[ \\t]+/, ""); p=$0; sub(/\\/[^\\/]*$/, "", p); n[p]++; k[p]+=s} END {for (x in n) print k[x] "\\t" n[x] "\\t" x}'`)).out;
    for (const line of out.split("\n")) {
      const [kb, n, dir] = line.split("\t");
      if (!dir) continue;
      const m = merged.get(dir) || { dir, kb: 0, n: 0, devs: 0 };
      m.kb += +kb || 0; m.n += +n || 0; m.devs++;
      merged.set(dir, m);
    }
  }
  otherFolders = [...merged.values()].sort((a, b) => b.kb - a.kb);
  renderOther(ts.length);
}
function renderOther(nDev) {
  const box = $("otherList");
  if (!box) return;
  $("otherCard").hidden = false;
  if (!otherFolders.length) { box.replaceChildren(el("div", { class: "item mut", text: "ไม่เจอรูปอื่นในเครื่อง" })); $("otherDel").hidden = true; return; }
  $("otherDel").hidden = false;
  box.replaceChildren(...otherFolders.map((f) => {
    const name = f.dir.replace(/^\/(sdcard|storage\/emulated\/0)\/?/, "") || "(โฟลเดอร์หลัก)";
    const c = el("input", { type: "checkbox", "data-dir": f.dir });
    return el("label", { class: "item" }, el("span", { class: "row", style: "gap:10px;flex-wrap:nowrap;min-width:0" }, c,
      el("span", { class: "nm" }, name, el("small", { text: `${f.n.toLocaleString()} ไฟล์ · ${human(f.kb)}` + (nDev > 1 ? ` · ใน ${f.devs} เครื่อง` : "") }))));
  }));
}

/* ---------- Live progress while deleting: shared by every device being cleaned at the same time ---------- */
const prog = { jobs: new Map(), start: 0 };
function progStart() { if (!prog.jobs.size) prog.start = Date.now(); }
function progEnd(serial) { prog.jobs.delete(serial); if (!prog.jobs.size) busyMsg("", "prog"); }
function progUpdate(serial, done, total, what) {
  if (!prog.jobs.size && !prog.start) prog.start = Date.now();
  prog.jobs.set(serial, { done, total, what, start: (prog.jobs.get(serial) || {}).start || Date.now() });
  let D = 0, T = 0, R = 0;
  for (const j of prog.jobs.values()) { D += j.done; T += j.total; const s = (Date.now() - j.start) / 1000; if (s >= 1) R += j.done / s; }
  const rate = Math.round(R);
  const many = prog.jobs.size > 1 ? ` · ${prog.jobs.size} เครื่อง` : "";
  const pct = T ? Math.min(100, Math.round((D / T) * 100)) : 0;
  busyMsg(`กำลังลบ${prog.jobs.size > 1 ? "" : what}${many} · ${D.toLocaleString()}${T ? " / " + T.toLocaleString() : ""} ไฟล์${T ? ` (${pct}%)` : ""}${rate ? ` · ${rate.toLocaleString()} ไฟล์/วิ` : ""}`, "prog");
  const b = $("busy"); b.classList.toggle("prog", !!T); b.style.setProperty("--pg", pct + "%");
}

/** Delete the given kinds on one device, record history, return KB freed */
async function cleanup(d, kinds, how = "กดเอง") {
  const before = (await df(d)).used;
  let files = 0, partial = false;
  draining.add(d.serial); renderDevices();
  try {
    for (const k of kinds) {
      const s = d.info.storage && !d.info.storage.counting ? d.info.storage : null;
      const total = s && s[k] ? s[k][0] : 0, kb = s && s[k] ? s[k][1] : 0;
      let done = 0, lastPaint = 0;
      const stTitle = KIND[k].short;
      const showLeft = () => setStatus(d, { title: stTitle, big: Math.max(0, total - done).toLocaleString(), unit: total ? "ไฟล์ที่เหลือ" : "ไฟล์", ring: total ? (done / total) * 100 : 0 });
      progUpdate(d.serial, 0, total, KIND[k].label);
      showLeft();
      const r = await d.shStream(KIND[k].cmd(d.info.profile), (line) => {
        const n = parseInt(line, 10);
        if (!n) return;
        done += n; files += n;
        // count down the numbers on screen as the files go
        if (s && s[k]) s[k] = [Math.max(0, total - done), total ? Math.round(kb * Math.max(0, total - done) / total) : 0];
        if (Date.now() - lastPaint > 250) { lastPaint = Date.now(); progUpdate(d.serial, done, Math.max(total, done), KIND[k].label); renderDock(); showLeft(); }
      });
      progUpdate(d.serial, done, Math.max(total, done), KIND[k].label);
      if (r.code && r.code !== 123) throw new Error(`ลบ${KIND[k].label}ไม่ครบ: ` + (r.err || r.out).trim().slice(-200));
      if (r.code) partial = true;   // xargs 123 = some file could not be removed; the recount below shows what is left
    }
  } finally { draining.delete(d.serial); progEnd(d.serial); renderDevices(); }
  const after = (await df(d)).used;
  const freed = Math.max(0, before - after);
  st.addHistory({ serial: d.serial, model: d.info.model, action: kinds.map((k) => KIND[k].label).join(" + "), how, files, freedKb: freed });
  log(`${label(d)}: ลบ ${files.toLocaleString()} ไฟล์ ได้พื้นที่คืน ${human(freed)}${partial ? " (มีบางไฟล์ลบไม่ได้)" : ""}`);
  setStatus(d, { title: "ลบเสร็จ", big: "+" + human(freed), unit: files.toLocaleString() + " ไฟล์", ring: 100, done: true });
  // No full recount: what was deleted is now empty, only the free space is read again
  if (partial || !d.info.storage || d.info.storage.counting) await refreshStorage(d);
  else { const s = d.info.storage; kinds.forEach((k) => (s[k] = [0, 0])); s.used = after; renderStorage(devices.get(selected)); renderDevices(); }
  renderToday(); renderHistory();
  return freed;
}

async function cleanupAction(kinds, text) {
  const ts = targets();
  const who = ts.length > 1 ? `\n\nจะทำกับทุกเครื่อง ${ts.length} เครื่อง พร้อมกัน` : `\n\nเครื่อง: ${label(ts[0])}`;
  if (!(await confirmBox(text + who))) return false;
  progStart();
  // every device works at the same time; one failing does not stop the others
  const res = await Promise.allSettled(ts.map((d) => cleanup(d, kinds)));
  const bad = res.map((r, i) => (r.status === "rejected" ? `${label(ts[i])}: ${r.reason && r.reason.message}` : "")).filter(Boolean);
  if (bad.length) throw new Error(bad.join(" / "));
}

/* ---------- Back up fail photos to the computer ---------- */
async function pickBackupFolder() {
  if (!window.showDirectoryPicker) throw new Error("NO_FS");
  try { return await window.showDirectoryPicker({ mode: "readwrite", id: "k3s-backup" }); }
  catch (e) { if (e && e.name === "AbortError") return null; throw new Error("NO_FS"); }
}
async function backupFail(d, root) {
  const dir = d.info.profile.fail;
  const list = (await d.sh(`[ -d ${q(dir)} ] && find -H ${q(dir)} -type f`)).out.split("\n").map((s) => s.trim()).filter(Boolean);
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
  const files = (await d.sh("find -H /sdcard -type f -size +1024k -exec du -k {} + 2>/dev/null | sort -rn | head -30")).out;
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
  if (!auto.every || Date.now() < auto.next) return;
  scheduleAuto();
  // devices busy with something else are skipped this round; the rest are cleaned at the same time
  const ds = all().filter((d) => !d.busy);
  if (!ds.length) return;
  ds.forEach((d) => (d.busy = "ลบอัตโนมัติ"));
  renderDevicesSoon();
  let kb = 0;
  try {
    await Promise.all(ds.map(async (d) => {
      try {
        const s = await df(d);
        const pct = s.total ? (s.used / s.total) * 100 : 100;
        if (pct < auto.pct) { log(`ลบอัตโนมัติ: ${label(d)} ใช้ ${Math.round(pct)}% ยังไม่ถึง ${auto.pct}% ข้าม`); return; }
        kb += await cleanup(d, ["success", "trash"], "อัตโนมัติ");
      } catch (e) { log(`ลบอัตโนมัติ ${label(d)} ไม่สำเร็จ: ${e.message}`); }
    }));
    auto.last = { time: Date.now(), kb };
  } finally { ds.forEach((d) => { if (d.busy === "ลบอัตโนมัติ") d.busy = null; }); renderDevicesSoon(); renderAuto(); }
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
    flash: i.flash.map((f) => f.ver || f.pkg).join(", "),
    flashMain: (flashMain(d) || {}).ver || ""
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
  if (!a) {
    if ($("appCount")) $("appCount").textContent = "";
    // Opening the Apps menu loads the full list of the device on screen by itself
    const onApps = document.querySelector(".tabs .on") && document.querySelector(".tabs .on").dataset.tab === "apps";
    if (d && onApps && !d.busy) { box.replaceChildren(el("div", { class: "item mut", text: "กำลังโหลดแอปทั้งหมด..." })); setTimeout(() => { if (!d.info.apps && !d.busy) actions.apps(); }, 0); return; }
    if (d && onApps && d.busy) { box.replaceChildren(el("div", { class: "item mut", text: "เครื่องนี้กำลังทำงานอื่นอยู่ เสร็จแล้วกด โหลดใหม่" })); return; }
    box.replaceChildren(el("div", { class: "item mut", text: d ? "เปิดเมนูนี้แล้วจะโหลดให้เอง หรือกด โหลดใหม่" : "-" })); hid.replaceChildren(el("div", { class: "item mut", text: "-" })); return;
  }
  if ($("appCount")) { const u = a.list.filter((x) => !x.sys).length; $("appCount").textContent = `${label(d)} · ทั้งหมด ${a.list.length} แอป (ติดตั้งเอง ${u} · แอประบบ ${a.list.length - u})`; }
  const s = $("appSearch").value.trim().toLowerCase();
  const showSys = $("showSys").checked;
  const banned = new Set(st.banned());
  const rows = a.list.filter((x) => (showSys || !x.sys || banned.has(x.pkg)) && (!s || x.pkg.toLowerCase().includes(s) || x.name.toLowerCase().includes(s)));
  box.replaceChildren(...(rows.length ? rows.slice(0, 1500).map((x) => el("div", { class: "item" },
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
/* =====================================================================
   Wi-Fi: saved networks, scan, connect one device or the whole group
   ===================================================================== */
async function wifiNow(d) {
  const r = await d.sh("cmd wifi status");
  const t = r.out + r.err;
  const m = t.match(/connected to "([^"]*)"/i);
  if (/Wifi is disabled/i.test(t)) return "Wi-Fi ปิดอยู่";
  return m ? "ต่ออยู่กับ " + m[1] : "ยังไม่ได้ต่อ Wi-Fi";
}
async function renderWifiNow() {
  const box = $("wifiNow");
  if (!box) return;
  const ds = groupDevs().length ? groupDevs() : all();
  if (!ds.length) { box.textContent = "-"; return; }
  const rows = [];
  for (const d of ds) { try { rows.push(label(d) + ": " + (await wifiNow(d))); } catch (e) { rows.push(label(d) + ": อ่านไม่ได้"); } }
  box.replaceChildren(...rows.map((t) => el("div", { text: t })));
}
function renderWifiSaved() {
  const box = $("wifiSaved");
  if (!box) return;
  const list = st.wifiList();
  box.replaceChildren(...(list.length ? list.map((w, i) => el("div", { class: "item" },
    el("div", { class: "nm" }, w.ssid, el("small", { text: w.sec === "open" ? "ไม่มีรหัส" : w.sec.toUpperCase() + " · มีรหัสบันทึกไว้" })),
    el("div", { class: "row" },
      el("button", { class: "blue need-dev", text: "เชื่อมต่อ", onclick: () => wifiConnect(w) }),
      el("button", { class: "red", text: "ลบ", onclick: async () => { if (await confirmBox(`ลบ Wi-Fi "${w.ssid}" ออกจากรายการ?`)) { const l = st.wifiList(); l.splice(i, 1); st.saveWifiList(l); renderWifiSaved(); } } }))
  )) : [el("div", { class: "item mut", text: "ยังไม่มี เพิ่มได้ด้านล่าง" })]));
  box.querySelectorAll(".need-dev").forEach((e) => (e.hidden = !all().length));
}
function wifiConnect(w) {
  run(`ต่อ Wi-Fi ${w.ssid}`, async () => {
    const ts = targets();
    if (ts.length > 1 && !(await confirmBox(`ต่อ Wi-Fi "${w.ssid}" ให้ ${ts.length} เครื่อง?`))) return false;
    const fails = [], manual = [];
    await Promise.all(ts.map(async (d) => {
      setStatus(d, { title: "ต่อ Wi-Fi", big: "…" });
      await d.sh("svc wifi enable");
      const r = await d.sh(`cmd wifi connect-network ${q(w.ssid)} ${w.sec}${w.sec === "open" ? "" : " " + q(w.pass)}`);
      const t = (r.out + r.err).trim();
      // Older Android (11 and below) keeps these Wi-Fi commands for root only: not a company block, a version limit.
      // Then the page opens the device's Wi-Fi screen and can type the saved password for you.
      if (/does not have access to wifi commands|checkRootPermission/i.test(t)) {
        manual.push(d);
        await d.sh("input keyevent 224; am start -a android.settings.WIFI_SETTINGS");
        setStatus(d, { title: "แตะ Wi-Fi ที่เครื่อง", big: w.ssid.slice(0, 10) });
        return;
      }
      if (r.code || /exception|denied|not allowed|error|unknown command/i.test(t)) { fails.push(`${label(d)}: ${t.split("\n")[0].slice(0, 160) || "failed"}`); return; }
      log(`${label(d)}: สั่งต่อ ${w.ssid} แล้ว`);
    }));
    if (manual.length) {
      log(`${manual.map(label).join(", ")}: Android รุ่นนี้ไม่ให้ต่อ Wi-Fi จากคอม เปิดหน้า Wi-Fi ที่เครื่องให้แล้ว`);
      showWifiManual(manual, w);
      if (!fails.length) return;
    }
    await new Promise((res) => setTimeout(res, 4000));
    await renderWifiNow();
    if (fails.length) throw new Error("WIFI: " + fails.join(" / "));
  }, "WIFI");
}
/** Semi-automatic Wi-Fi for older Android: the Wi-Fi screen is open on the device; one button types the password */
function showWifiManual(ds, w) {
  showHelp("WIFI_MANUAL", ds.map((d) => label(d) + (d.info.android ? " · Android " + d.info.android : "")).join(", "), true);
  if (w.sec === "open") return;
  $("help").insertBefore(el("div", { class: "row", style: "margin:8px 0" },
    el("button", { class: "blue", text: `พิมพ์รหัส ${w.ssid} เข้าเครื่อง`, onclick: () => run("พิมพ์รหัส Wi-Fi", async () => {
      for (const d of ds) { await d.shOk(`input text ${q(w.pass.replace(/ /g, "%s"))}`); await d.sh("input keyevent 66"); setStatus(d, { title: "ส่งรหัสแล้ว", done: true }); }
      log("พิมพ์รหัส Wi-Fi เข้าเครื่องแล้ว รอเครื่องต่อสักครู่ แล้วกด เช็กสถานะ");
    }) }),
    el("button", { text: "เช็กสถานะ", onclick: () => run("เช็ก Wi-Fi", renderWifiNow, "WIFI") })), $("help").lastElementChild);
}
function parseScan(out) {
  const seen = new Map();
  for (const line of out.split("\n")) {
    const m = line.match(/^\s*([0-9a-f]{2}(?::[0-9a-f]{2}){5})\s+(\d+)\s+(-?\d+)\s+\S+\s+(.*?)\s*(\[.*\])?\s*$/i);
    if (!m || !m[4]) continue;
    const ssid = m[4], rssi = +m[3], flags = m[5] || "";
    const sec = /SAE/.test(flags) && !/PSK/.test(flags) ? "wpa3" : /WPA|PSK|SAE/.test(flags) ? "wpa2" : "open";
    if (!seen.has(ssid) || seen.get(ssid).rssi < rssi) seen.set(ssid, { ssid, rssi, sec });
  }
  return [...seen.values()].sort((a, b) => b.rssi - a.rssi);
}

function loadFlashForm() {
  if (!$("flUrl")) return;
  const c = st.flashCfg();
  $("flUrl").value = c.url; $("flLatest").value = c.latest;
  document.querySelectorAll("a.flash-link").forEach((a) => (a.href = c.url));
  renderFlashSeen();
}
function renderFlashSeen() {
  if (!$("flSeen")) return;
  const L = latestFlash();
  $("flSeen").textContent = `เวอร์ชันล่าสุดที่ใช้เช็กตอนนี้: ${L.ver} (จาก ${L.from}) · ติดตั้งเวอร์ชันใหม่ให้เครื่องไหนสักเครื่อง เว็บจะจำเลขใหม่เอง`;
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
  findDev: () => run("หาเครื่อง", async () => {
    const d = cardDev && !cardDev.closed ? cardDev : cur();
    const id = d.serial.slice(-6);
    await d.sh("input keyevent 224");
    // A notification with the id on the device's own screen: easy to spot which one on the desk it is
    const r = await d.sh(`cmd notification post -S bigtext -t ${q("IDATA TOOLS")} idata-find ${q("เครื่องนี้คือรหัส " + id + " (" + d.serial + ")")}`);
    d.info.screenOn = true; renderDevices();
    log(`${label(d)}: เปิดจอแล้ว${r.code ? "" : " และขึ้นแจ้งเตือนรหัส " + id + " ที่เครื่อง"}`);
  }),
  fbOpen: () => run("เปิดไฟล์ในเครื่อง", () => fbList(cur(), FB_ROOT)),
  fbUp: () => run("ย้อนกลับ", () => fbList(cur(), fbPath.replace(/\/[^/]+$/, "") || FB_ROOT)),
  fbDelete: () => run("ลบไฟล์ที่เลือก", async () => {
    const picks = [...document.querySelectorAll("#fbList input:checked")].map((c) => ({ path: c.dataset.path, kb: +c.dataset.kb }));
    if (!picks.length) { log("ติ๊กไฟล์หรือโฟลเดอร์ที่จะลบก่อน"); return false; }
    if (picks.some((p) => fbLocked(p.path))) throw new Error("Android/ ห้ามลบ");
    const ts = targets();
    const total = picks.reduce((s, p) => s + p.kb, 0);
    const warn = picks.some((p) => fbWarn(p.path) || /\/imagePath$/.test(p.path)) ? "\n\n⚠️ มีรูป fail ที่อาจยังไม่ส่งอยู่ในที่เลือก" : "";
    const list = picks.slice(0, 12).map((p) => "• " + p.path.replace(FB_ROOT + "/", "")).join("\n") + (picks.length > 12 ? `\n… และอีก ${picks.length - 12} รายการ` : "");
    if (!(await confirmBox(`ลบ ${picks.length} รายการ (${human(total)}) ลบถาวร กู้คืนไม่ได้${ts.length > 1 ? "\nทำกับ " + ts.length + " เครื่องในกลุ่ม" : ""}\n${list}${warn}`))) return false;
    for (const d of ts) {
      const before = (await df(d)).used;
      for (const p of picks) { busyMsg("กำลังลบ " + p.path.replace(FB_ROOT + "/", "") + " · " + label(d)); await d.sh(`rm -rf -- ${q(p.path)}`); }
      const freed = Math.max(0, before - (await df(d)).used);
      st.addHistory({ serial: d.serial, model: d.info.model, action: "ลบไฟล์เอง " + picks.length + " รายการ", how: "กดเอง", files: picks.length, freedKb: freed });
      log(`${label(d)}: ลบ ${picks.length} รายการ ได้พื้นที่คืน ${human(freed)}`);
      await refreshStorage(d);
    }
    renderHistory(); renderToday();
    await fbList(cur(), fbPath);
  }),
  otherScan: () => run("หารูปอื่นในเครื่อง", () => scanOther(targets())),
  otherDelete: () => run("ลบรูปอื่น", async () => {
    const dirs = [...document.querySelectorAll("#otherList input:checked")].map((c) => c.dataset.dir);
    if (!dirs.length) { log("ติ๊กเลือกโฟลเดอร์ที่จะลบก่อน"); return false; }
    const ts = targets();
    const names = dirs.map((x) => "• " + (x.replace(/^\/sdcard\/?/, "") || "(โฟลเดอร์หลัก)")).join("\n");
    if (!(await confirmBox(`ลบรูปและวิดีโอในโฟลเดอร์ต่อไปนี้ ${ts.length > 1 ? "จาก " + ts.length + " เครื่อง" : ""} (ลบถาวร ไม่เข้าถังขยะ)\n${names}\n\nไม่ลบรูปของ Flash Kit ใน success/fail`))) return false;
    for (const d of ts) {
      const before = (await df(d)).used;
      let files = 0;
      for (const dir of dirs) {
        busyMsg("กำลังลบ " + dir.replace(/^\/sdcard\/?/, "") + " · " + label(d));
        const r = await d.sh(`[ -d ${q(dir)} ] || { echo 0; exit 0; }; n=$(find -H ${q(dir)} -maxdepth 1 -type f ${MEDIA} -not -name '.trashed-*' | wc -l); find -H ${q(dir)} -maxdepth 1 -type f ${MEDIA} -not -name '.trashed-*' -delete; echo $n`);
        files += parseInt(r.out.trim().split(/\s+/).pop(), 10) || 0;
      }
      const freed = Math.max(0, before - (await df(d)).used);
      st.addHistory({ serial: d.serial, model: d.info.model, action: "รูปอื่น (" + dirs.length + " โฟลเดอร์)", how: "กดเอง", files, freedKb: freed });
      log(`${label(d)}: ลบรูปอื่น ${files.toLocaleString()} ไฟล์ ได้พื้นที่คืน ${human(freed)}`);
      await refreshStorage(d);
    }
    renderHistory(); renderToday();
    await scanOther(ts);
  }),

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
    const head = `IDATA TOOLS log\nเครื่อง: ${d.info.manufacturer || ""} ${d.info.model} (${d.serial})\nAndroid: ${d.info.android || ""}\nเวลา: ${new Date().toString()}\n\n`;
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
    const sa = $("stdAll");
    const ts = groupDevs().length ? groupDevs() : sa && sa.checked && devices.size > 1 ? all() : [cur()];
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

  selTool: () => { selectMode = !selectMode; if (selectMode && !group.size && selected) group.add(selected); renderAll(); },
  selAll: () => { all().forEach((d) => group.add(d.serial)); renderAll(); },
  selClear: () => { group.clear(); groupPin = null; renderAll(); log("ล้างกลุ่มแล้ว คำสั่งจะทำกับเครื่องที่เลือกเครื่องเดียว"); },
  selDone: () => { selectMode = false; renderAll(); if (group.size) log(`กลุ่ม ${group.size} เครื่อง: ทุกคำสั่งจะทำกับทั้งกลุ่ม จนกว่าจะกด ล้างกลุ่ม`); },
  flashNeed: () => flashInstall(all().filter((d) => ["missing", "old"].includes(flashState(d)))),
  flashSelected: () => { try { flashInstall(targets()); } catch (e) { showHelp(codeOf(e)); } },
  flashSave: () => {
    const url = $("flUrl").value.trim(), latest = $("flLatest").value.trim();
    if (!/^https?:\/\//.test(url)) { showHelp("UNKNOWN", "ลิงก์ต้องขึ้นต้นด้วย https://"); return; }
    st.saveFlashCfg({ url, latest }); loadFlashForm(); renderAll(); log("บันทึกข้อมูล Flash Kit แล้ว");
  },
  typeSend: () => run("ส่งรหัสเข้าเครื่อง", async () => {
    const t = $("typeText").value;
    if (!t) return false;
    // `input text` types ASCII only; spaces must be sent as %s
    if (/[^\x20-\x7e]/.test(t)) throw new Error("TYPE");
    for (const d of targets()) {
      await d.shOk(`input text ${q(t.replace(/ /g, "%s"))}`);
      if ($("typeEnter").checked) await d.sh("input keyevent 66");
      log(`${label(d)}: ส่งข้อความแล้ว`);
    }
    $("typeText").value = "";
  }, "TYPE"),
  wifiStatus: () => run("เช็ก Wi-Fi", renderWifiNow, "WIFI"),
  wifiAdd: () => {
    const ssid = $("wfSsid").value.trim(), pass = $("wfPass").value, sec = $("wfSec").value;
    if (!ssid) { $("wfSsid").focus(); return; }
    if (sec !== "open" && pass.length < 8) { showHelp("WIFI", "รหัส Wi-Fi ต้องยาวอย่างน้อย 8 ตัว"); return; }
    const l = st.wifiList().filter((w) => w.ssid !== ssid);
    l.unshift({ ssid, pass: sec === "open" ? "" : pass, sec });
    st.saveWifiList(l); $("wfSsid").value = ""; $("wfPass").value = "";
    renderWifiSaved(); log(`บันทึก Wi-Fi ${ssid} แล้ว`);
  },
  wifiScan: () => run("ค้นหา Wi-Fi", async () => {
    const d = cur();
    await d.sh("svc wifi enable; cmd wifi start-scan");
    await new Promise((res) => setTimeout(res, 4000));
    const r = await d.sh("cmd wifi list-scan-results");
    const nets = parseScan(r.out);
    $("wifiScanList").replaceChildren(...(nets.length ? nets.map((n) => el("div", { class: "item wifi-row" },
      el("div", { class: "nm" }, n.ssid, el("small", { text: n.sec === "open" ? "ไม่มีรหัส" : n.sec.toUpperCase() })),
      el("div", { class: "row" }, el("span", { class: "sig", text: n.rssi > -60 ? "แรง" : n.rssi > -75 ? "พอใช้" : "อ่อน" }),
        el("button", { text: "ใช้ชื่อนี้", onclick: () => { $("wfSsid").value = n.ssid; $("wfSec").value = n.sec; $("wfPass").focus(); } }))
    )) : [el("div", { class: "item mut", text: "ไม่เจอ Wi-Fi (หรือเครื่องไม่ยอมให้ค้นหา)" })]));
  }, "WIFI"),
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

/* =====================================================================
   Flash Kit: one button downloads the newest build from the link and installs it
   ===================================================================== */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// small key/value store in IndexedDB (a folder handle cannot live in localStorage)
function idb() { return new Promise((res, rej) => { const r = indexedDB.open("idata-tools", 1); r.onupgradeneeded = () => r.result.createObjectStore("kv"); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); }
async function kvGet(k) { try { const db = await idb(); return await new Promise((res) => { const t = db.transaction("kv").objectStore("kv").get(k); t.onsuccess = () => res(t.result); t.onerror = () => res(undefined); }); } catch (e) { return undefined; } }
async function kvSet(k, v) { try { const db = await idb(); await new Promise((res) => { const t = db.transaction("kv", "readwrite").objectStore("kv").put(v, k); t.onsuccess = () => res(); t.onerror = () => res(); }); } catch (e) {} }

async function isApk(blob) { const h = new Uint8Array(await blob.slice(0, 2).arrayBuffer()); return blob.size > 500000 && h[0] === 0x50 && h[1] === 0x4b; }

/** Way 1: the page downloads the file itself (works only if the download site allows it) */
async function flashDirect(url) {
  const r = await fetch(url, { redirect: "follow" });
  if (!r.ok || !r.body) throw new Error("HTTP " + r.status);
  const len = +r.headers.get("content-length") || 0;
  const reader = r.body.getReader(); const parts = []; let got = 0;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    parts.push(value); got += value.length;
    busyMsg(`กำลังโหลด Flash Kit ${human(got / 1024)}${len ? " / " + human(len / 1024) : ""}`, "flash");
  }
  const blob = new Blob(parts);
  if (!(await isApk(blob))) throw new Error("ไฟล์ที่ได้ไม่ใช่ APK");
  return new File([blob], "FlashKit.apk", { type: "application/vnd.android.package-archive" });
}

/** Way 2: Chrome downloads it as usual and the page picks the new .apk up from the Downloads folder */
async function flashViaDownloads(url) {
  if (!window.showDirectoryPicker) throw new Error("NO_FS");
  let dir = await kvGet("dlDir");
  const askGesture = (text) => confirmBox(text);   // the click on ยืนยัน counts as the user gesture the browser wants
  if (dir) {
    let p = await dir.queryPermission({ mode: "read" });
    if (p !== "granted") { try { p = await dir.requestPermission({ mode: "read" }); } catch (e) { if (await askGesture("กด ยืนยัน เพื่ออนุญาตให้เว็บดูโฟลเดอร์ Downloads")) p = await dir.requestPermission({ mode: "read" }); } }
    if (p !== "granted") dir = null;
  }
  if (!dir) {
    const pick = () => window.showDirectoryPicker({ id: "downloads", startIn: "downloads", mode: "read" });
    try { dir = await pick(); }
    catch (e) {
      if (e && e.name === "AbortError") throw new Error("ยกเลิกการเลือกโฟลเดอร์");
      if (!(await askGesture("ครั้งแรกครั้งเดียว: เลือกโฟลเดอร์ Downloads (ที่ Chrome เก็บไฟล์ที่โหลด) แล้วกด อนุญาต\nเว็บจะหยิบไฟล์ Flash Kit ที่โหลดเสร็จไปติดตั้งให้เอง"))) throw new Error("ยกเลิก");
      dir = await pick();
    }
    await kvSet("dlDir", dir);
  }
  const snap = new Map();
  for await (const [n, h] of dir.entries()) if (h.kind === "file" && /\.apk$/i.test(n)) snap.set(n, (await h.getFile()).lastModified);
  const win = window.open(url, "_blank");
  if (!win) {
    $("dlgList").replaceChildren(el("a", { href: url, target: "_blank", rel: "noopener", class: "dl-link", text: "กดตรงนี้เพื่อเริ่มโหลด Flash Kit" }));
    await confirmBox("เบราว์เซอร์กันหน้าต่างใหม่ไว้: กดลิงก์ด้านบนเพื่อเริ่มโหลด แล้วกด ยืนยัน");
    $("dlgList").replaceChildren();
  }
  const t0 = Date.now(); let cand = null;
  while (Date.now() - t0 < 300000) {
    await sleep(1500);
    busyMsg(`รอ Chrome โหลด Flash Kit ลงโฟลเดอร์ ${dir.name} · เสร็จแล้วจะติดตั้งให้เอง`, "flash");
    let newest = null;
    for await (const [n, h] of dir.entries()) {
      if (h.kind !== "file" || !/\.apk$/i.test(n)) continue;
      const f = await h.getFile();
      if (snap.get(n) === f.lastModified) continue;
      if (!newest || f.lastModified > newest.lastModified) newest = f;
    }
    if (newest) { if (cand && cand.name === newest.name && cand.size === newest.size && (await isApk(newest))) return newest; cand = newest; }
  }
  throw new Error("รอไฟล์โหลดเกิน 5 นาที");
}

async function flashInstall(list) {
  list = list.filter((d) => d && !d.closed);
  if (!list.length) return;
  const cfg = st.flashCfg();
  if (!(await confirmBox(`ติดตั้ง / อัปเดต Flash Kit ให้ ${list.length} เครื่อง:\n${list.map((d) => "• " + label(d) + (flashState(d) === "missing" ? " (ยังไม่มี)" : flashState(d) === "old" ? " (เก่า)" : "")).join("\n")}\n\nเว็บจะโหลดไฟล์ล่าสุดจากลิงก์ แล้วติดตั้งให้ทุกเครื่องพร้อมกัน`))) return;
  list.forEach((d) => setStatus(d, { title: "รอไฟล์ Flash Kit", big: "…" }));
  let file = null;
  try {
    try { file = await flashDirect(cfg.url); }
    catch (e) { log("โหลดตรงจากลิงก์ไม่ได้ (" + e.message + ") ใช้วิธีให้ Chrome โหลดแทน"); file = await flashViaDownloads(cfg.url); }
  } catch (e) {
    list.forEach((d) => setStatus(d, null));
    showHelp(e.message === "NO_FS" ? "NO_FS" : "FLASH_DL", e.message);
    return;
  } finally { busyMsg("", "flash"); }
  log(`ได้ไฟล์ Flash Kit แล้ว (${human(file.size / 1024)}) กำลังติดตั้ง`);
  pendingInstall = { list, t: Date.now() };
  await installApk(file);
}

async function installApk(file) {
  await run("ติดตั้ง " + file.name, async () => {
    const ts = await pickDevices(`ติดตั้ง ${file.name}\n(ถ้ามีแอปเดิมอยู่ จะอัปเดตทับ ข้อมูลในแอปยังอยู่)`);
    if (!ts.length) return false;
    const fails = [];
    // every device installs at the same time; each circle shows its own step
    await Promise.all(ts.map(async (d) => {
      const lock = !d.busy; if (lock) d.busy = "ติดตั้งแอป";
      try {
        const tmp = "/data/local/tmp/k3s-tool.apk";
        let last = -1;
        setStatus(d, { title: "ส่งไฟล์แอป", big: "0%", ring: 0 });
        await d.push(file, tmp, (p) => { const v = Math.round(p * 100); if (v !== last) { last = v; setStatus(d, { title: "ส่งไฟล์แอป", big: v + "%", ring: v }); } });
        setStatus(d, { title: "กำลังติดตั้ง", big: "…", ring: 100 });
        const r = await d.sh(`pm install -r ${tmp}`);
        await d.sh(`rm -f ${tmp}`);
        const msg = (r.out + r.err).trim();
        if (/Success/i.test(r.out)) {
          log(`${label(d)}: ติดตั้ง ${file.name} สำเร็จ`);
          await loadInfo(d).catch(() => {});
          const m = flashMain(d);
          setStatus(d, { title: "ติดตั้งแล้ว", big: m && /flash/i.test(file.name + m.pkg) ? m.ver : "สำเร็จ", ring: 100, done: true });
        } else { fails.push(`${label(d)}: ${msg || "install failed"}`); setStatus(d, { title: "ติดตั้งไม่ได้", err: true, done: true }); }
      } catch (e) { fails.push(`${label(d)}: ${e.message}`); setStatus(d, { title: "ติดตั้งไม่ได้", err: true, done: true }); }
      finally { if (lock && d.busy === "ติดตั้งแอป") d.busy = null; }
    }));
    renderDevices();
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
  if (name === "wifi" && all().length) renderWifiNow().catch(() => {});
  if (name === "apps") renderApps(devices.get(selected));
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
  setInterval(pollAll, 15000);
  window.addEventListener("beforeunload", (e) => { if (auto.every && all().length) { e.preventDefault(); e.returnValue = ""; } });

  loadStdForm(); loadBannedText(); loadFlashForm(); renderWifiSaved();
  [["typeShow", "typeText"], ["wfShow", "wfPass"]].forEach(([c, i]) => { if ($(c)) $(c).addEventListener("change", (e) => ($(i).type = e.target.checked ? "text" : "password")); });
  if ($("typeText")) $("typeText").addEventListener("keydown", (e) => { if (e.key === "Enter") actions.typeSend(); });
  if ($("fxMode")) {
    $("fxMode").value = st.load("fx", "auto");
    $("fxMode").addEventListener("change", (e) => { st.save("fx", e.target.value); if (window.__fx) window.__fx(e.target.value); });
  } renderProfTable(); renderRegistry(); renderHistory(); renderAll();
  if (!st.load("everConnected", false)) showTab("guide");

  let rz; window.addEventListener("resize", () => { clearTimeout(rz); rz = setTimeout(() => { if ($("devices").classList.contains("orbit")) renderDevices(); }, 150); });
  // Hover preview survives re-renders: work out the hovered device from whatever is under the pointer
  document.addEventListener("pointerover", (e) => {
    const w = e.target.closest && e.target.closest(".satw");
    const s = w ? w.dataset.serial : null;
    if (s !== hoverSerial) { hoverSerial = s; renderCard(); }
  });
  if (!adb.hasWebUsb()) { showHelp("NO_WEBUSB"); return; }
  navigator.usb.addEventListener("connect", () => setTimeout(autoConnect, 800));
  autoConnect();
});
