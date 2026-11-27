import * as adb from "./adb.js";
import * as st from "./store.js";
import * as auth from "./auth.js";
import { appName, CRITICAL, APP_NAMES } from "./appnames.js";

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
  DROPPED: ["เครื่องหลุดการเชื่อมต่อ", ["ถ้าถอดสายเอง: ไม่ต้องทำอะไร เสียบกลับเมื่อไหร่ เว็บจะต่อให้เอง", "ถ้าเครื่องใช้ iLauncher: iLauncher ปิด USB debugging ทันทีที่ออกจากหน้า Settings ให้เข้า Settings > เปิด USB debugging แล้วค้างไว้ที่หน้า Settings ระหว่างใช้เว็บ (อย่ากด Home/Back) · ห้ามหาทางเลี่ยงระบบบริษัท", "ถ้าหลุดเองบ่อยๆ: เปลี่ยนสาย หรือเสียบเข้าคอมตรงๆ"]],
  WIFI_MANUAL: ["เครื่องรุ่นนี้ต้องแตะเลือก Wi-Fi เอง 1 ครั้ง", ["Android ของเครื่องนี้ไม่ให้คอมสั่งต่อ Wi-Fi (ใช้ได้กับ Android 12 ขึ้นไป เช่น K3S) ไม่ใช่ระบบบริษัทบล็อก", "เว็บเปิดหน้า Wi-Fi ที่เครื่องให้แล้ว: แตะชื่อ Wi-Fi ที่ต้องการ (ถ้าเครื่องล็อกอยู่ ให้ปลดล็อกก่อน)", "พอขึ้นช่องใส่รหัส กดปุ่ม พิมพ์รหัส... ด้านล่าง เว็บจะพิมพ์รหัสที่บันทึกไว้และกด Enter ให้", "ไม่อยากจับเครื่อง: ใช้ เครื่อง > ดู/คุมหน้าจอสด แล้วคลิกชื่อ Wi-Fi จากคอม"]],
  TYPE: ["ส่งข้อความไม่ได้", ["พิมพ์ได้เฉพาะภาษาอังกฤษ ตัวเลข และสัญลักษณ์บนคีย์บอร์ด (ภาษาไทยส่งไม่ได้)", "ที่เครื่องต้องเปิดช่องใส่รหัสค้างไว้ก่อน แล้วค่อยกดส่ง", "ดูหน้าจอเครื่องผ่าน เครื่อง > ดู/คุมหน้าจอสด ได้"]],
  SCREEN: ["จับภาพ/อัดหน้าจอไม่ได้", ["ปลดล็อกหน้าจอเครื่องแล้วลองใหม่", "บางแอปห้ามจับภาพหน้าจอ (จะได้ภาพดำ)", "ถ้ายังไม่ได้ ระบบบริษัทอาจล็อกการจับหน้าจอ ให้แจ้งไอที"]],
  WALL_TAP: ["เครื่องนี้ต้องกดยืนยันที่เครื่อง 1 ครั้ง (ครั้งแรกของรุ่นนี้)", ["หน้าตั้งวอลเปเปอร์ของรุ่นนี้เว็บยังไม่รู้จัก: แตะที่เครื่องตามปกติ เว็บจะดูแล้วจำไว้ ครั้งหน้ากดเองทุกเครื่องรุ่นนี้","ที่หน้าจอเครื่อง จะขึ้นหน้าตั้งวอลเปเปอร์พร้อมรูปที่เลือก (ถ้าเครื่องล็อกอยู่ ให้ปลดล็อกก่อน)", "กด ตั้งวอลเปเปอร์ (Set wallpaper)", "เลือก หน้าจอหลักและหน้าจอล็อก (Home and lock screens)", "ถ้าไม่อยากจับเครื่อง: แท็บ เครื่อง > ดู/คุมหน้าจอสด แล้วคลิกจากคอมแทนได้", "ถ้าเครื่องถามว่าจะเปิดด้วยแอปไหน ให้เลือก วอลเปเปอร์ หรือ Wallpaper"]],
  FLASH_DL: ["โหลด Flash Kit อัตโนมัติไม่สำเร็จ", ["ตรวจว่าคอมต่อเน็ตอยู่ และลิงก์ใน ตั้งค่า > Flash Kit ถูกต้อง", "ถ้าเว็บให้เลือกไฟล์: คลิกไฟล์ Flash Kit .apk ที่ใหม่สุดในโฟลเดอร์ Downloads แล้วกด Open", "ทางสำรอง: กดปุ่ม Flash Kit มุมขวาบนเพื่อโหลดเอง แล้วใช้ เครื่อง > ติดตั้ง / อัปเดต APK"]],
  DEV_BUSY: ["เครื่องนี้กำลังทำงานอื่นอยู่", ["รอให้งานเดิมเสร็จก่อน (ดูแถบด้านล่างจอ)", "ระหว่างนี้สั่งงานเครื่องอื่นได้ตามปกติ: คลิกดาวเครื่องอื่นก่อน แล้วค่อยกดปุ่ม", "ถ้าเลือกกลุ่มไว้ และมีเครื่องในกลุ่มที่ยังทำงานอยู่ ให้รอ หรือเอาเครื่องนั้นออกจากกลุ่มก่อน"]],
  LOCK_LOST: ["เครื่องนี้เคยล็อกออกงานไว้ แต่ตอนนี้ไม่ล็อกแล้ว", ["อาจถูกรีเซ็ตเครื่อง (Factory reset) หรือมีคนปลดล็อกจากคอมเครื่องอื่น", "ถามคนที่ใช้เครื่องล่าสุดว่าเกิดอะไรขึ้น", "ตั้งกลับให้ครบในคลิกเดียว: แท็บ เครื่อง > ตั้งเครื่องใหม่ทั้งหมด (Flash Kit, ตั้งค่า, Wi-Fi, ล็อก)"]],
  GOOGLE: ["ใส่บัญชี Google ไม่สำเร็จ", ["ดูหน้าจอเครื่อง: ถ้าค้างที่หน้าล็อกอิน ทำต่อเองที่เครื่องได้เลย", "เช็กว่าเครื่องต่อ Wi-Fi อยู่ และอีเมล/รหัสถูก", "ถ้าบัญชีเปิดยืนยัน 2 ขั้นตอน: กดยืนยันที่มือถือ hub แล้วลองใหม่", "เครื่องที่ไม่มีบริการ Google จะเปิดหน้าล็อกอินไม่ได้"]],
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
    // one row per line, kept between repaints so its Stop button stays clickable while the seconds tick
    for (const r of [...b.children]) if (!toast.lines.has(r.dataset.k)) r.remove();
    for (const [k, j] of toast.lines) {
      let row = b.querySelector(`[data-k="${k}"]`);
      if (!row) {
        row = el("div", { class: "busy-row", "data-k": k }, el("span"));
        const job = jobs.get(k);
        if (job && job.devs.length) row.append(el("button", { class: "busy-stop", text: "หยุด", title: "หยุดคำสั่งนี้ (ส่วนที่ทำไปแล้วจะไม่ย้อนกลับ)", onclick: () => stopJob(k) }));
        b.append(row);
      }
      const sec = Math.round((Date.now() - j.start) / 1000);
      row.firstChild.textContent = j.text + (sec >= 3 ? ` · ${sec} วิ` : "");
    }
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
const jobs = new Map();   // running jobs by toast key, for the Stop buttons
/** Stop button: end the commands running on the job's devices; the job then ends as "หยุดแล้ว" */
async function stopJob(key) {
  const job = jobs.get(key);
  if (!job || job.stopped) return;
  job.stopped = true;
  busyMsg("กำลังหยุด " + job.name + " ...", key);
  await Promise.all(job.devs.map((d) => (d.stop ? d.stop() : null)).filter(Boolean).map((p) => p.catch(() => {})));
}
const anyBusy = () => toast.lines.size > 0;
async function run(name, fn, helpCode, opts = {}) {
  let devs = [];
  if (!opts.free) { try { devs = targets(); } catch (e) {} }
  const clash = devs.find((d) => d.busy);
  if (clash) {
    log(`${label(clash)} กำลัง${clash.busy}อยู่ รอให้เสร็จก่อน หรือเลือกเครื่องอื่น`);
    showHelp("DEV_BUSY", `${label(clash)}: ${clash.busy}`);
    return;
  }
  const key = "job" + ++jobSeq;
  // the job record lets the Stop button reach every device it touches (fn may add more with job.devs.push)
  const job = { name, devs: [...devs], stopped: false };
  jobs.set(key, job);
  devs.forEach((d) => { d.stopped = false; d.busy = name; if (!d.status || d.status.done) setStatus(d, { title: shortJob(name) }); });
  if (devs.length) renderDevicesSoon();
  $("help").hidden = true;
  busyMsg(name + (devs.length === 1 ? " · " + label(devs[0]) : devs.length > 1 ? ` · ${devs.length} เครื่อง` : "") + " ...", key);
  log(name + " ...");
  let outcome = "ok";
  try { const r = await fn(job); if (job.stopped) outcome = "stopped"; else if (r === false) outcome = "cancel"; else log(name + " เสร็จแล้ว"); }
  catch (e) {
    if (job.stopped) outcome = "stopped";
    else { outcome = "err"; console.error(e); log(name + " ล้มเหลว: " + (e && e.message)); showHelp(helpCode && codeOf(e) === "UNKNOWN" ? helpCode : codeOf(e), String((e && e.message) || e)); }
  }
  finally {
    if (outcome === "stopped") log(`หยุด${name}แล้ว (ส่วนที่ทำไปแล้วยังอยู่ ไม่ย้อนกลับ)`);
    new Set(job.devs).forEach((d) => {
      if (d.busy === name) d.busy = null;
      d.stopped = false;
      if (outcome === "stopped") { setStatus(d, { title: "หยุดแล้ว", done: true }); return; }
      // a job that set its own finished status keeps it; otherwise show the generic outcome
      if (d.status && !d.status.done) setStatus(d, outcome === "cancel" ? null : outcome === "err" ? { title: "ไม่สำเร็จ", err: true, done: true } : { title: "เสร็จแล้ว", done: true });
    });
    jobs.delete(key);
    busyMsg("", key);
    if (devs.length) renderDevicesSoon();
  }
}

/** A dialog with several answers: choices = [[key, label], ...]; resolves to the key, or null when cancelled */
function choiceBox(text, choices) {
  return new Promise((resolve) => {
    let pick = null;
    $("dlgList").replaceChildren(el("div", { class: "choice-list" }, ...choices.map(([k, t], i) => el("button", { class: i ? "" : "blue", text: t, onclick: () => { pick = k; $("dlgOk").click(); } }))));
    $("dlgOk").hidden = true;
    confirmBox(text).then((ok) => { $("dlgOk").hidden = false; $("dlgList").replaceChildren(); resolve(ok ? pick : null); });
  });
}

/** Ask for one line of text; resolves to the text (may be empty) or null when cancelled */
function promptBox(text, value, placeholder) {
  return new Promise((resolve) => {
    $("dlgText").textContent = text;
    const inp = $("dlgInput"); inp.hidden = false; inp.value = value || ""; inp.placeholder = placeholder || "";
    $("dlg").hidden = false; inp.focus(); inp.select();
    const done = (v) => { $("dlg").hidden = true; inp.hidden = true; $("dlgOk").onclick = $("dlgNo").onclick = inp.onkeydown = null; resolve(v); };
    $("dlgNo").onclick = () => done(null);
    $("dlgOk").onclick = () => done(inp.value.trim());
    inp.onkeydown = (e) => { if (e.key === "Enter") done(inp.value.trim()); };
  });
}
/*
 * The device's name is also kept on the device itself, so any computer or phone shows it as soon as it is plugged in.
 * The device's copy wins (it is the latest one set anywhere); a name known only here is written to the device.
 */
const NAME_FILE = "/data/local/tmp/idata-tools-name.txt";
async function syncName(d) {
  const onDev = (await d.sh(`cat ${NAME_FILE} 2>/dev/null`)).out.trim().slice(0, 24);
  const here = st.nameOf(d.serial);
  if (onDev && onDev !== here) { st.setName(d.serial, onDev); st.updateRegistry(d.serial, { name: onDev }); }
  else if (!onDev && here) await writeName(d, here);
}
const writeName = (d, name) => d.sh(name ? `printf '%s\n' ${q(name)} > ${NAME_FILE}` : `rm -f ${NAME_FILE}`);

/** Make a device easy to spot on the desk: screen flashes bright/dark 5 times and it vibrates, brightness restored */
// It stops by itself after a few seconds; Stop (or an error) part way still puts the brightness back
async function signalDevice(d) {
  await d.sh("input keyevent 224");
  setStatus(d, { title: "ส่งสัญญาณ", big: "📳" });
  const was = (await d.sh("settings get system screen_brightness_mode; settings get system screen_brightness")).out.trim().split(/\s+/);
  const mode = /^\d+$/.test(was[0] || "") ? was[0] : "1", bright = /^\d+$/.test(was[1] || "") ? was[1] : "150";
  const restore = `settings put system screen_brightness ${bright}; settings put system screen_brightness_mode ${mode}`;
  try {
    await d.sh(["(cmd vibrator vibrate 1500 idata 2>/dev/null || cmd vibrator_manager synced oneshot 1500 2>/dev/null) >/dev/null 2>&1",
      "settings put system screen_brightness_mode 0",
      "for i in 1 2 3 4 5; do settings put system screen_brightness 255; sleep 0.35 2>/dev/null || sleep 1; settings put system screen_brightness 3; sleep 0.35 2>/dev/null || sleep 1; done",
      restore].join("; "));
  } finally {
    const st0 = d.stopped; d.stopped = false;
    try { await d.sh(restore); } catch (e) {} finally { d.stopped = st0; }
  }
  d.info.screenOn = true;
  setStatus(d, { title: "เครื่องนี้", big: "👋", done: true });
}
async function nameDevice(d) {
  // flash + vibrate the device being named, so it is clear which one on the desk gets the name
  signalDevice(d).catch(() => {});
  const v = await promptBox(`ตั้งชื่อเครื่อง ${d.info.model || ""} รหัส ${d.serial}\n(เครื่องที่จอกะพริบและสั่นอยู่ตอนนี้)\nชื่อจะผูกกับรหัสเครื่องนี้ จำไว้ตลอด เสียบครั้งหน้าขึ้นชื่อเอง (เว้นว่าง = ลบชื่อ)`, st.nameOf(d.serial), "เช่น 07 หรือ K3S-07 หรือ ชื่อคนถือ");
  if (v === null) return;
  const taken = Object.entries(st.names()).find(([s, n]) => s !== d.serial && v && n.toLowerCase() === v.toLowerCase());
  if (taken && !(await confirmBox(`ชื่อ "${v}" ใช้กับเครื่อง ${taken[0]} อยู่แล้ว ใช้ซ้ำไหม?`))) return;
  st.setName(d.serial, v);
  st.updateRegistry(d.serial, { name: v });
  await writeName(d, v).catch(() => log("บันทึกชื่อลงเครื่องไม่ได้ (ชื่อยังจำไว้ในคอมนี้)"));
  log(v ? `ตั้งชื่อ ${d.serial} ว่า "${v}"` : `ลบชื่อของ ${d.serial}`);
  renderAll(); renderRegistry();
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
// A named device shows its name first ("เครื่อง 07 · 294734"), otherwise model + last 6 of the serial
const label = (d) => { const n = st.nameOf(d.serial); return (n || d.info.model || "เครื่อง") + " · " + d.serial.slice(-6); };
const shortName = (d) => st.nameOf(d.serial) || d.serial.slice(-6);

async function addDevice(d) {
  const old = devices.get(d.serial);
  if (old && !old.closed) { await d.close(); return old; }
  d.info.model = (await d.sh("getprop ro.product.model")).out.trim();
  await probeCaps(d).catch(() => {});
  await syncName(d).catch(() => {});
  d.info.profile = st.profileFor(d.info.model);
  await learnProfile(d).catch(() => {});
  devices.set(d.serial, d);
  if (!selected || !devices.get(selected) || devices.get(selected).closed) selected = d.serial;
  log("เชื่อมต่อ " + label(d) + " (ใช้ที่เก็บรูปแบบ " + d.info.profile.name + ")");
  d.disconnected.then(() => {
    log("หลุดการเชื่อมต่อ: " + label(d));
    // The page cannot tell a pulled cable from a device that switched USB debugging off (e.g. entering iLauncher)
    if (!d.rebooting) showHelp("DROPPED", label(d), true);
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

/**
 * A model seen for the first time is learned: find where Flash Kit keeps its photos (imagePath) on that device
 * and save it as a model profile (visible and editable in Settings > models).
 */
/*
 * Older devices (Android 6 and the like) lack tools newer ones have: `cmd` arrived in Android 7, and some builds have
 * no find, no find -H or no xargs -0. Each is tried once at connect; the commands below pick what works per device.
 * Anything not probed (probe failed) is assumed present, i.e. the modern path.
 */
async function probeCaps(d) {
  const r = await d.sh([
    "getprop ro.build.version.sdk",
    "find /sdcard/ -maxdepth 0 >/dev/null 2>&1 && echo has:find",
    "find -H /sdcard -maxdepth 0 >/dev/null 2>&1 && echo has:findH",
    "echo x | xargs -0 echo >/dev/null 2>&1 && echo has:x0",
    "echo x | awk '{print}' >/dev/null 2>&1 && echo has:awk",
    "cmd -l >/dev/null 2>&1 && echo has:cmd",
    "cmd package help >/dev/null 2>&1 && echo has:cmd"
  ].join("; "));
  const has = new Set([...r.out.matchAll(/has:(\w+)/g)].map((m) => m[1]));
  const sdk = parseInt(r.out, 10) || 0;
  d.caps = { sdk, find: has.has("find"), findH: has.has("findH"), x0: has.has("x0"), awk: has.has("awk"), cmd: has.has("cmd") };
  const miss = ["find", "x0", "awk", "cmd"].filter((k) => !d.caps[k]);
  if (sdk && sdk < 24) log(`${label(d)}: Android รุ่นเก่า (API ${sdk}) ใช้วิธีสำรองที่เครื่องรุ่นนี้รองรับ${miss.length ? " (ไม่มี " + miss.join(", ") + ")" : ""}`);
}
const caps = (d) => d.caps || {};
const hasCap = (d, k) => caps(d)[k] !== false;
// `find` over a folder that may be a symlink (/sdcard is one): -H follows it; without -H a trailing slash does the same
const findIn = (d, dir) => (hasCap(d, "findH") ? `find -H ${q(dir)}` : `find ${q(dir.replace(/\/?$/, "/"))}`);
// Trash (.trashed-*) is Android 11+ only: older devices have none, so skip the whole-storage search
const noTrash = (d) => caps(d).sdk > 0 && caps(d).sdk < 30;

async function learnProfile(d) {
  const model = (d.info.model || "").trim();
  if (!model || st.profileFor(model) !== st.DEFAULT_PROFILE) return;
  let base = "/sdcard/imagePath";
  const here = (await d.sh(`[ -d ${q(base)} ] && echo yes`)).out.includes("yes");
  if (!here) {
    const found = (await d.sh(hasCap(d, "find") ? `${findIn(d, "/sdcard")} -maxdepth 4 -path /sdcard/Android -prune -o -type d -name imagePath -print 2>/dev/null` : "for x in /sdcard/*/imagePath /sdcard/*/*/imagePath; do [ -d \"$x\" ] && echo \"$x\"; done")).out.trim().split("\n")[0].trim().replace(/\/+$/, "").replace("/sdcard//", "/sdcard/");
    if (!found) { log(`${label(d)}: รุ่นใหม่ (${model}) ยังไม่เจอโฟลเดอร์รูปของ Flash Kit อาจยังไม่เคยถ่ายรูปงาน ใช้แบบ K3S ไปก่อน แล้วจะเรียนรู้ใหม่ครั้งหน้า`); return; }
    base = found;
  }
  st.saveProfiles([...st.profiles(), { name: model, match: model, success: base + "/success", fail: base + "/fail" }]);
  profDraft = st.profiles(); renderProfTable();
  d.info.profile = st.profileFor(model);
  log(`เรียนรู้รุ่นใหม่: ${model} เก็บรูป Flash Kit ที่ ${base}`);
}

async function connectNew() {
  log("รอเลือกเครื่องในหน้าต่างของเบราว์เซอร์ ...");
  const usb = await adb.requestUsb();
  // Picked a device that is already on the stage: just select it, never ask for "Allow" again
  let have = devices.get(usb.serial);
  if (have && !have.closed) {
    // still answering? (after iLauncher the old link can look alive but be dead)
    const alive = await Promise.race([have.sh("echo ok").then((r) => r.out.includes("ok")).catch(() => false), sleep(3000).then(() => false)]);
    if (!alive) { log(`${label(have)}: การเชื่อมต่อเก่าค้าง ล้างแล้วเชื่อมใหม่`); await have.close(); devices.delete(usb.serial); have = null; }
  }
  if (have && !have.closed) {
    selected = usb.serial; groupPin = group.has(usb.serial) ? usb.serial : groupPin;
    renderAll();
    log(`${label(have)} เชื่อมต่ออยู่แล้ว (เลือกเครื่องนี้ให้แล้ว)`);
    setStatus(have, { title: "ต่ออยู่แล้ว", done: true });
    return false;
  }
  if (pending.has(usb.serial)) { log(`รหัส ${usb.serial.slice(-6)} กำลังรอกด Allow อยู่แล้ว ดูที่หน้าจอเครื่อง`); return false; }
  let d;
  try { d = await adb.openUsb(usb, (s) => { busyMsg(`รอกด Allow ที่เครื่องรหัส ${String(s || "").slice(-6)}`); authWait(true, s); }); }
  catch (e) { if (e.message === "CANCELLED") { log(`ยกเลิกการรอเครื่องรหัส ${usb.serial.slice(-6)}`); return false; } throw e; }
  finally { authWait(false, usb.serial); }
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
      if (pending.has(usb.serial)) continue;
      // Right after plug-in or reboot the device may not be ready yet: try a few times
      for (let tryNo = 1; tryNo <= 5; tryNo++) {
        try {
          log("พบเครื่องที่เคยอนุญาต " + usb.serial.slice(-6) + " กำลังเชื่อมต่อ ...");
          await addDevice(await adb.openUsb(usb, () => authWait(true, usb.serial)));
          break;
        } catch (e) {
          if (e.message === "BUSY") { showHelp("BUSY"); break; }
          if (e.message === "CANCELLED") { log(`ยกเลิกการรอเครื่องรหัส ${usb.serial.slice(-6)}`); break; }
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

/** Names stay on one line: a long one gets smaller letters until it fits inside its circle */
function fitNames(root) {
  (root || document).querySelectorAll(".sat-id.named").forEach((e) => {
    e.style.fontSize = "";
    let size = parseFloat(getComputedStyle(e).fontSize) || 12;
    const room = e.clientWidth;
    if (!room || e.scrollWidth <= room + 1) return;
    size = Math.max(6, size * (room / e.scrollWidth) - 0.2); e.style.fontSize = size + "px";
    while (e.scrollWidth > room + 1 && size > 6) { size -= 0.5; e.style.fontSize = size + "px"; }
  });
}
// the Thai web font can arrive after the first measure and is wider: measure again then
if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => fitNames());
if (document.fonts) document.fonts.addEventListener && document.fonts.addEventListener("loadingdone", () => fitNames());
function renderDevices() {
  const box = $("devices");
  const n = all().length;
  document.body.classList.toggle("has-dev", !!n);
  document.body.classList.toggle("selecting", selectMode);
  renderHubTools(); // before layout: the select bar and hub tools are areas the devices must avoid
  if (box.classList.contains("orbit")) { renderOrbit(box); requestAnimationFrame(() => fitNames(box)); setTimeout(() => fitNames(box), 400); }
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
  const tagCount = (d) => Math.min(2, (d.info.screenOn === false ? 1 : 0) + (["missing", "old"].includes(flashState(d)) ? 1 : 0) + ((d.info.bannedFound || []).length ? 1 : 0) + ((d.info.locked || []).length || d.info.settingsLocked ? 1 : 0));
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
    if (d.info.resetSuspect) tags.push(el("span", { class: "sat-tag bad", text: compact ? "หลุดล็อก" : "หลุดล็อก · อาจรีเซ็ต", title: "เคยล็อกออกงานไว้ ตอนนี้ไม่ล็อกแล้ว" }));
    if (fs === "missing") tags.push(el("span", { class: "sat-tag bad", text: compact ? "ไม่มี Flash" : "ไม่มี Flash Kit" }));
    else if (fs === "old") tags.push(el("span", { class: "sat-tag warn", text: compact ? "Flash เก่า" : "Flash Kit เก่า" }));
    if (ban && tags.length < 2) tags.push(el("span", { class: "sat-tag bad", text: compact ? "แอปห้าม" : "แอปต้องห้าม " + ban }));
    if (((d.info.locked || []).length || d.info.settingsLocked) && tags.length < 2) tags.push(el("span", { class: "sat-tag lock", text: compact ? "ล็อก" : "ล็อกออกงาน" }));
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
  const nm = st.nameOf(d.serial);
  const id = el("span", { class: "sat-id" + (nm ? " named" : ""), text: nm || d.serial.slice(-6), title: nm ? nm + " · " + d.serial : d.serial });
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
  if (body) { body.replaceChildren(...satBody(d)); fitNames(body); }
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
    $("dcGroupList").replaceChildren(...gs.map((x) => el("span", { class: "chip" + (d === x ? " on" : ""), text: shortName(x) })));
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
  if ($("dcName")) $("dcName").textContent = st.nameOf(d.serial) ? "เปลี่ยนชื่อ" : "ตั้งชื่อ";
  if ($("dcKiosk")) $("dcKiosk").hidden = !i.kiosk;
}
/** Commands that bring another app to the front make iLauncher cut USB: warn first on those devices */
async function kioskOk(ds, what) {
  const k = ds.filter((d) => d.info.kiosk);
  if (!k.length) return true;
  return confirmBox(`${k.map(label).join(", ")} ใช้ iLauncher\n${what} จะพาเครื่องออกจากหน้า Settings ทำให้ USB หลุดทันที\n\nทำต่อไหม? (ทำเสร็จแล้วต้องเข้า Settings เปิด USB debugging ใหม่)`);
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
  for (const d of all()) {
    if (d.busy) continue;
    try {
      const r = await Promise.race([pollStatus(d), sleep(8000).then(() => { throw new Error("no answer"); })]);
      d._fails = 0; if (r) changed = true;
    } catch (e) {
      // two silent polls in a row = the link is dead (e.g. the device turned USB debugging off): drop it so it can reconnect
      if (++d._fails >= 2) { log(`${label(d)} ไม่ตอบสนอง ตัดการเชื่อมต่อเก่าแล้ว เสียบใหม่หรือรอเครื่องกลับมา เว็บจะต่อให้เอง`); await d.close(); setTimeout(autoConnect, 3000); }
    }
  }
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
  renderLock(d);
  renderToday();
  renderRegistry();
  // on the Files menu, picking another device opens that device's storage
  const on = document.querySelector(".tabs .on");
  if (on && on.dataset.tab === "files" && d && fbSerial !== d.serial) openFilesTab();
}

/* =====================================================================
   Storage + cleanup (the main feature)
   ===================================================================== */
const TRASH = "-name '.trashed-*'";
// Every find uses -H: on Android /sdcard is a symlink, and find does not enter a symlinked start folder without it
// One pass per folder: number of files and total KB. Missing folder -> 0 0
// Fast: list names (readdir only) for the count and one `du -sk` for the size, instead of a stat per file
// "files KB" for one folder. Without find: count with ls -lR (lines starting with "-" are files)
const statCmd = (d, dir) => hasCap(d, "find")
  ? `if [ -d ${q(dir)} ]; then echo $(${findIn(d, dir)} -type f 2>/dev/null | wc -l) $(du -sk ${q(dir + "/")} 2>/dev/null | cut -f1); else echo 0 0; fi`
  : `if [ -d ${q(dir)} ]; then n=$(ls -lR ${q(dir + "/")} 2>/dev/null | grep -c '^-'); set -- $(du -sk ${q(dir + "/")} 2>/dev/null) 0; echo $n $1; else echo 0 0; fi`;
// Trash lives next to the photos; Android/ (every app's private data, huge) is skipped instead of searched
const TRASH_FIND = `find -H /sdcard -path /sdcard/Android -prune -o -type f ${TRASH}`;
const trashStatCmd = (d) => noTrash(d) || !hasCap(d, "find") ? "echo 0 0" : `${TRASH_FIND} -exec du -k {} + 2>/dev/null | awk '{s+=$1;n++} END {print n+0, s+0}'`;
// Delete in batches of 300, up to 4 at a time (xargs -P), and print how many each batch removed so the page can
// show progress. Phones whose xargs has no -P fall back to one batch at a time.
// (the -P check runs before the pipeline: put inside it, it would swallow the file list)
const PAR_CHECK = `if echo | xargs -P 2 true 2>/dev/null; then P="-P 4"; else P=""; fi;`;
const BATCH_DEL = `xargs -0 -n 300 $P sh -c 'rm -f "$@"; echo $#' _`;
// Photos and videos outside Flash Kit's own folders (camera, screenshots, Pictures, other apps)
const MEDIA = "\\( -iname '*.jpg' -o -iname '*.jpeg' -o -iname '*.png' -o -iname '*.webp' -o -iname '*.heic' -o -iname '*.gif' -o -iname '*.mp4' -o -iname '*.3gp' \\)";
const OTHER_MEDIA = (d) => `${findIn(d, "/sdcard")} -type f ${MEDIA} -not -path '/sdcard/Android/*' -not -path '*/imagePath/*' -not -name '.trashed-*'`;

/*
 * Storage size. Newer phones: `df -k` gives plain KB numbers. Android 6 toolbox df has no -k and prints sizes like
 * "11.6G 2.1G 9.5G"; long filesystem names can also push the numbers onto their own line. Every line is tried.
 */
const KB = { "": 1, K: 1, M: 1024, G: 1024 * 1024, T: 1024 * 1024 * 1024 };
function dfSize(tok, plainKb) {
  const m = /^(\d+(?:\.\d+)?)([KMGT]?)i?B?$/i.exec(tok || "");
  if (!m) return null;
  const u = m[2].toUpperCase();
  return Math.round(parseFloat(m[1]) * (u ? KB[u] : plainKb ? 1 : 1 / 1024));
}
function parseDf(text, plainKb) {
  for (const line of text.split("\n").reverse()) {
    const t = line.trim().split(/\s+/);
    for (let i = 0; i + 1 < t.length; i++) {
      const total = dfSize(t[i], plainKb), used = dfSize(t[i + 1], plainKb);
      if (total && used !== null && used <= total) return { total, used };
    }
  }
  return null;
}
async function df(d) {
  const r = await d.sh("df -k /sdcard/ 2>/dev/null; echo @@; df /sdcard/ 2>/dev/null; df /storage/emulated/0 2>/dev/null; df /data 2>/dev/null");
  const [a, b = ""] = r.out.split("@@");
  return parseDf(a, true) || parseDf(b.split("\n").filter((l) => /\d/.test(l)).slice(0, 2).join("\n"), true) || { total: 0, used: 0 };
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
  const [sc, fc, tc] = await Promise.all([d.sh(statCmd(d, p.success)), d.sh(statCmd(d, p.fail)), d.sh(trashStatCmd(d))]);
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
  success: { label: "รูป success", short: "ลบ success", cmd: (p, d) => delCmd(d, p.success) },
  fail: { label: "รูป fail", short: "ลบ fail", cmd: (p, d) => delCmd(d, p.fail) },
  trash: { label: "ขยะ .trashed", short: "ล้างถังขยะ", cmd: (p, d) => noTrash(d) || !hasCap(d, "find") ? "true" : hasCap(d, "x0") ? `${PAR_CHECK} ${TRASH_FIND} -print0 2>/dev/null | ${BATCH_DEL}` : `${TRASH_FIND} 2>/dev/null | ${LOOP_DEL("rm -f")}` }
};
// Files go through find -print0 | xargs (never `rm -rf dir/*`, which fails with "argument list too long").
// Missing folder (fresh device) means nothing to delete, not an error. Each output line = files removed by one batch.
// Older devices without find or xargs -0: a plain shell loop, printing a count every 100 files for the progress bar
const LOOP_DEL = (rm) => `{ n=0; while IFS= read -r f; do ${rm} "$f"; n=$((n+1)); if [ $n -ge 100 ]; then echo $n; n=0; fi; done; echo $n; }`;
function delCmd(d, dir) {
  if (hasCap(d, "find") && hasCap(d, "x0")) return `${PAR_CHECK} [ -d ${q(dir)} ] || exit 0; ${findIn(d, dir)} -type f -print0 | ${BATCH_DEL}`;
  if (hasCap(d, "find")) return `[ -d ${q(dir)} ] || exit 0; ${findIn(d, dir)} -type f 2>/dev/null | ${LOOP_DEL("rm -f")}`;
  // no find at all: remove each entry of the folder (subfolders whole), the folder itself stays for Flash Kit
  return `cd ${q(dir + "/")} 2>/dev/null || exit 0; ls -a | grep -vx '\\.\\{1,2\\}' | sed 's|^|./|' | ${LOOP_DEL("rm -rf")}`;
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
  fbPath = path; fbSerial = d.serial;
  fbItems = r.out.split("\n").map((l) => { const [t, kb, ...n] = l.split("\t"); return { dir: t === "d", kb: +kb || 0, name: n.join("\t") }; })
    .filter((x) => x.name).sort((a, b) => b.kb - a.kb);
  renderFb();
}
// The Files menu opens the selected device's storage by itself (and again when another device is picked)
let fbSerial = null;
function openFilesTab() {
  const d = devices.get(selected);
  if (!d || d.closed) return;
  if (fbSerial === d.serial && fbItems.length) return;
  if (d.busy) { if ($("fbIdle")) $("fbIdle").textContent = "เครื่องนี้กำลังทำงานอื่นอยู่ เสร็จแล้วเปิดเมนูนี้ใหม่"; return; }
  run("เปิดไฟล์ในเครื่อง", () => fbList(d, FB_ROOT));
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
  if ($("fbIdle")) $("fbIdle").hidden = true;
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
    const out = (await d.sh(`${OTHER_MEDIA(d)} -exec du -k {} + 2>/dev/null | awk '{s=$1; sub(/^[0-9]+[ \\t]+/, ""); p=$0; sub(/\\/[^\\/]*$/, "", p); n[p]++; k[p]+=s} END {for (x in n) print k[x] "\\t" n[x] "\\t" x}'`)).out.replace(/\/\/+/g, "/");
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
      const r = await d.shStream(KIND[k].cmd(d.info.profile, d), (line) => {
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
  const list = (await d.sh(`[ -d ${q(dir)} ] && ${findIn(d, dir)} -type f`)).out.replace(/\/\/+/g, "/").split("\n").map((s) => s.trim()).filter(Boolean);
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
  const files = (await d.sh(findIn(d, "/sdcard") + " -type f -size +1024k -exec du -k {} + 2>/dev/null | sort -rn | head -30")).out.replace(/\/\/+/g, "/");
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
  // Factory reset protection (FRP) needs all of: a place to keep the account through a reset (ro.frp.pst),
  // OEM unlocking switched off, Google's own setup wizard (it asks for the account), and a Google account
  i.frp = { pst: await g("ro.frp.pst"), oem: (await g("sys.oem_unlock_allowed")) === "1",
    wizard: /setupwizard/.test((await d.sh("pm list packages com.google.android.setupwizard 2>/dev/null")).out),
    account: await hasGoogle(d).catch(() => false) };
  const bat = (await d.sh("dumpsys battery")).out;
  const bv = (k) => { const m = bat.match(new RegExp("^\\s*" + k + ":\\s*(.+)$", "m")); return m ? m[1].trim() : ""; };
  i.battery = { level: bv("level"), health: HEALTH[bv("health")] || bv("health"), status: STATUS[bv("status")] || "", temp: bv("temperature") ? (parseInt(bv("temperature"), 10) / 10).toFixed(1) : "" };
  const mem = (await d.sh("cat /proc/meminfo")).out;
  const mv = (k) => { const m = mem.match(new RegExp(k + ":\\s*(\\d+)")); return m ? +m[1] : 0; };
  i.ram = { total: mv("MemTotal"), avail: mv("MemAvailable") };
  i.uptime = parseFloat((await d.sh("cat /proc/uptime")).out) || 0;
  // Which app is the home screen? iLauncher (company kiosk) switches USB debugging off when you leave Settings
  const home = hasCap(d, "cmd")
    ? (await d.sh("cmd package resolve-activity --brief -c android.intent.category.HOME -a android.intent.action.MAIN 2>/dev/null | tail -1")).out.trim()
    // Android 6 has no `cmd`: an installed iLauncher/kiosk app is taken as the home screen
    : ((await d.sh("pm list packages 2>/dev/null | grep -iE 'ilauncher|kiosk'")).out.match(/package:([\w.]+)/) || ["", ""])[1] + "/";
  i.home = (home.match(/^([\w.]+)\//) || [])[1] || "";
  i.kiosk = /ilauncher|kiosk/i.test(i.home);
  // every app that can be the home screen: never switched off by the field lock (no home app = stuck on the logo)
  i.homes = await homeApps(d).catch(() => new Set());
  if (i.home) i.homes.add(i.home);
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

function frpText(f) {
  if (!f) return "-";
  const why = [];
  if (!f.pst) why.push("เครื่องไม่มีที่เก็บบัญชีข้ามการรีเซ็ต (ผู้ผลิตไม่ได้ใส่ระบบนี้)");
  if (!f.wizard) why.push("ไม่มีหน้าตั้งค่าเครื่องของ Google (ตัวที่ถามอีเมล)");
  if (f.oem) why.push("เปิด OEM unlocking อยู่ ให้ปิดใน Developer options");
  if (!f.account) why.push("ยังไม่มีบัญชี Google ในเครื่อง");
  return why.length ? "✘ ไม่ทำงาน: " + why.join(" · ") : "✔ ทำงาน: รีเซ็ตจากปุ่มแล้วจะถามบัญชี Google";
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
    ["แอป Flash", i.flash.length ? i.flash.map((f) => `${f.pkg} ${f.ver}`).join("\n") : "ไม่พบ"],
    ["กันรีเซ็ต (FRP)", frpText(i.frp)]
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
  // apps that have an icon on the home screen (Gmail, Chrome, Flash Kit...) are what people look for: list them first
  const icons = await launcherApps(d, user);
  d.info.apps = {
    list: [...user.map((p) => ({ pkg: p, sys: false })), ...sys.map((p) => ({ pkg: p, sys: true }))]
      .map((a) => ({ ...a, name: appName(a.pkg), ver: ver[a.pkg] || "", prot: isProt(a.pkg), icon: icons.has(a.pkg) }))
      .sort((a, b) => (b.icon - a.icon) || (a.sys - b.sys) || (a.name || a.pkg).localeCompare(b.name || b.pkg)),
    hidden: sysAll.filter((p) => !sysSet.has(p)),
    at: Date.now()
  };
  d.info.bannedFound = bannedIn(d);
}

/*
 * Apps with a home-screen icon. Android 7+: `cmd package query-activities`. Android 6 has no `cmd`, so the
 * resolver table in `dumpsys package` is read instead (component lines followed by their LAUNCHER category).
 * If both come back empty, every user app plus Settings and the known Google apps count as having an icon.
 */
async function homeApps(d) {
  const pk = (txt) => new Set([...txt.matchAll(/([a-zA-Z][\w.]*)\/[\w.$]+/g)].map((m) => m[1]));
  let s = new Set();
  if (hasCap(d, "cmd")) s = pk((await d.sh("cmd package query-activities --brief -a android.intent.action.MAIN -c android.intent.category.HOME 2>/dev/null")).out);
  if (!s.size && hasCap(d, "awk")) s = pk((await d.sh("dumpsys package r 2>/dev/null | awk '/^Activity Resolver Table:/{a=1;next} /Resolver Table:/{a=0} a && / filter /{c=$2} a && /category.HOME/ && c {print c; c=\"\"}' | sort -u")).out);
  return s;
}
async function launcherApps(d, user) {
  const pk = (txt) => new Set([...txt.matchAll(/([a-zA-Z][\w.]*)\/[\w.$]+/g)].map((m) => m[1]));
  if (hasCap(d, "cmd")) {
    const s = pk((await d.sh("cmd package query-activities --brief -a android.intent.action.MAIN -c android.intent.category.LAUNCHER 2>/dev/null")).out);
    if (s.size) return s;
  }
  if (hasCap(d, "awk")) {
    const s = pk((await d.sh("dumpsys package r 2>/dev/null | awk '/^Activity Resolver Table:/{a=1;next} /Resolver Table:/{a=0} a && / filter /{c=$2} a && /category.LAUNCHER/ && c {print c; c=\"\"}' | sort -u")).out);
    if (s.size) return s;
  }
  return new Set([...user, SETTINGS_PKG, ...Object.keys(APP_NAMES)]);
}

function bannedIn(d) {
  const b = new Set(st.banned());
  return d.info.apps ? d.info.apps.list.filter((a) => b.has(a.pkg)).map((a) => a.pkg) : [];
}
async function checkBanned(d) {
  const installed = new Set(pkgList((await d.sh("pm list packages")).out));
  d.info.bannedFound = st.banned().filter((p) => installed.has(p));
  if (d.info.bannedFound.length) log(`⚠️ ${label(d)} มีแอปต้องห้าม ${d.info.bannedFound.length} แอป: ${d.info.bannedFound.map((p) => appName(p) || p).join(", ")}`);
  await readLockState(d).catch(() => {});
}

/* =====================================================================
   Field lock ("โหมดออกงาน"): switch off every app with a home-screen icon except Flash Kit and the scanner.
   Apps are disabled (pm disable-user), not removed: unlocking brings them back with their data.
   ===================================================================== */
// never switched off: Flash Kit, scanning, the home screen, keyboard and the services Flash Kit relies on
const FORCE_KEEP = /flash|scan|barcode|wedge|inputmethod|keyboard|launcher|home|provision|setupwizard|\.gms$|webview|packageinstaller|permissioncontroller|systemui/i;
// kept by default (Flash Kit may open the camera; calls), can be ticked off
const DEFAULT_KEEP = /dialer|telecom|\.phone$|camera/i;
const SETTINGS_PKG = "com.android.settings";
const lockCfg = () => st.load("fieldLock", { keep: null, settings: false });
function lockPlan(d) {
  const a = d.info.apps;
  if (!a) return null;
  const cfg = lockCfg();
  return a.list.filter((x) => x.icon || (d.info.locked || []).includes(x.pkg)).map((x) => {
    const isSettings = x.pkg === SETTINGS_PKG;
    const forced = !isSettings && (x.prot || CRITICAL.includes(x.pkg) || x.pkg === d.info.home || (d.info.homes && d.info.homes.has(x.pkg)) || FORCE_KEEP.test(x.pkg));
    let keep;
    if (forced) keep = true;
    else if (isSettings) keep = !cfg.settings || !!d.info.kiosk;
    else keep = cfg.keep ? cfg.keep.includes(x.pkg) : DEFAULT_KEEP.test(x.pkg);
    return { pkg: x.pkg, name: x.name || x.pkg, forced, isSettings, block: !keep };
  });
}
const lockedKey = (d) => "locked:" + d.serial;
// The list of apps switched off is kept on the device too, so any computer or phone can unlock it on the spot
const LOCK_FILE = "/data/local/tmp/idata-tools-locked.txt";
async function deviceLockList(d) { return pkgList((await d.sh(`cat ${LOCK_FILE} 2>/dev/null`)).out); }
async function saveDeviceLockList(d, list) {
  await d.sh(list.length ? `printf '%s\\n' ${list.map(q).join(" ")} > ${LOCK_FILE}` : `rm -f ${LOCK_FILE}`);
}
/*
 * Experimental: Settings stays installed but every screen in it is switched off except the Wi-Fi screens and the
 * ones the phone needs to start up. The switched-off screens are listed in a file on the device for unlocking.
 */
const SETTINGS_FILE = "/data/local/tmp/idata-tools-settings.txt";
const SETTINGS_KEEP = "wifi|NetworkProvider|SettingsPanel|Internet|FallbackHome|CryptKeeper|Encrypt|Provision|SetupRedirect";
const SETTINGS_ACTIVITIES = "dumpsys package com.android.settings | awk '/^Activity Resolver Table:/{a=1;next} /Resolver Table:/{a=0} a' | grep -oE 'com\\.android\\.settings/[A-Za-z0-9_.$]+' | sort -u";
async function lockSettingsScreens(d, onCount) {
  // decided and done on the device in one go: list Settings screens, keep the Wi-Fi ones, switch the rest off
  const r = await d.shStream(`${SETTINGS_ACTIVITIES} | grep -viE '${SETTINGS_KEEP}' | while read c; do o=$(pm disable --user 0 "$c" 2>&1); case "$o" in *disabled*) echo "$c" >> ${SETTINGS_FILE}; echo "$c";; esac; done`, () => onCount && onCount());
  return r.out.split("\n").filter(Boolean).length;
}
async function unlockSettingsScreens(d) {
  const r = await d.sh(`[ -f ${SETTINGS_FILE} ] || { echo 0; exit 0; }; n=0; while read c; do pm enable --user 0 "$c" >/dev/null 2>&1; n=$((n+1)); done < ${SETTINGS_FILE}; rm -f ${SETTINGS_FILE}; echo $n`);
  return parseInt(r.out.trim().split(/\s+/).pop(), 10) || 0;
}
async function readLockState(d) {
  d.info.settingsLocked = parseInt((await d.sh(`[ -f ${SETTINGS_FILE} ] && sort -u ${SETTINGS_FILE} | wc -l || echo 0`)).out.trim(), 10) || 0;
  const mine = [...new Set([...st.load(lockedKey(d), []), ...(await deviceLockList(d))])];
  if (mine.length) {
    const disabled = new Set(pkgList((await d.sh("pm list packages -d")).out));
    d.info.locked = mine.filter((p) => disabled.has(p));
    st.save(lockedKey(d), d.info.locked);
  } else d.info.locked = [];
  // Locked last time this computer saw it, nothing locked now (and no lock list left on the device): likely a reset
  const reg = st.registry()[d.serial] || {};
  if (reg.fieldLock === "ล็อก" && !d.info.locked.length && !d.info.settingsLocked) {
    const noFlash = d.info.flash && !d.info.flash.length;
    d.info.resetSuspect = true;
    st.updateRegistry(d.serial, { fieldLock: "หลุดล็อก (อาจรีเซ็ต)" });
    log(`⚠️ ${label(d)}: เคยล็อกออกงานไว้ ตอนนี้ไม่ล็อกแล้ว${noFlash ? " และไม่มี Flash Kit" : ""} อาจถูกรีเซ็ตเครื่อง`);
    showHelp("LOCK_LOST", label(d) + (noFlash ? " · Flash Kit หายด้วย (น่าจะรีเซ็ต)" : ""));
  }
}
async function lockDevice(d) {
  if (!d.info.apps) await loadApps(d);
  const plan = lockPlan(d).filter((x) => x.block);
  const done = [], fails = [];
  setStatus(d, { title: "กำลังล็อก", big: "0/" + plan.length, ring: 0 });
  for (const [i, x] of plan.entries()) {
    const r = await d.sh(`pm disable-user --user 0 ${q(x.pkg)}`);
    if (/disabled/i.test(r.out + r.err)) done.push(x.pkg); else fails.push(x.name);
    setStatus(d, { title: "กำลังล็อก", big: `${i + 1}/${plan.length}`, ring: ((i + 1) / plan.length) * 100 });
  }
  const all = [...new Set([...st.load(lockedKey(d), []), ...(await deviceLockList(d)), ...done])];
  st.save(lockedKey(d), all); d.info.locked = all;
  await saveDeviceLockList(d, all);
  if (all.length) { st.updateRegistry(d.serial, { fieldLock: "ล็อก", fieldLockAt: Date.now() }); d.info.resetSuspect = false; }
  const cfg = lockCfg();
  if (cfg.settingsWifi && !cfg.settings) {
    if (d.info.kiosk) log(`${label(d)}: ใช้ iLauncher จึงไม่ปิด Settings (ต้องใช้เปิด USB debugging)`);
    else {
      let n = 0;
      setStatus(d, { title: "ปิดหน้า Settings", big: "0", ring: 50 });
      const c = await lockSettingsScreens(d, () => { n++; if (n % 10 === 0) setStatus(d, { title: "ปิดหน้า Settings", big: String(n), ring: 50 }); });
      d.info.settingsLocked = (d.info.settingsLocked || 0) + c;
      log(`${label(d)}: ปิดหน้าใน Settings ${c} หน้า เหลือหน้า Wi-Fi (ทดลอง) · ลองเข้า Settings จากทุกทางที่เครื่อง แล้วลองต่อ Wi-Fi`);
    }
  }
  await loadApps(d);
  setStatus(d, { title: "ล็อกออกงานแล้ว", big: String(done.length), unit: "แอปถูกปิด", ring: 100, done: true });
  log(`${label(d)}: โหมดออกงาน ปิด ${done.length} แอป${fails.length ? " (ปิดไม่ได้: " + fails.join(", ") + ")" : ""}`);
  return fails;
}
async function unlockDevice(d) {
  if (!d.info.apps) await loadApps(d);
  // everything this page switched off, plus anything in today's plan that is still off
  const disabled = new Set(pkgList((await d.sh("pm list packages -d")).out));
  const plan = (lockPlan(d) || []).filter((x) => x.block && disabled.has(x.pkg)).map((x) => x.pkg);
  const list = [...new Set([...st.load(lockedKey(d), []), ...(await deviceLockList(d)), ...plan])];
  let n = 0;
  for (const p of list) { const r = await d.sh(`pm enable ${q(p)}`); if (/enabled/i.test(r.out + r.err)) n++; }
  st.save(lockedKey(d), []); d.info.locked = [];
  await saveDeviceLockList(d, []);
  st.updateRegistry(d.serial, { fieldLock: "ไม่ล็อก" }); d.info.resetSuspect = false;
  const sN = await unlockSettingsScreens(d);
  if (sN) log(`${label(d)}: เปิดหน้าใน Settings คืน ${sN} หน้า`);
  d.info.settingsLocked = 0;
  await loadApps(d);
  setStatus(d, { title: "ปลดล็อกแล้ว", big: String(n), unit: "แอปกลับมา", ring: 100, done: true });
  log(`${label(d)}: ปลดล็อก เปิดคืน ${n} แอป`);
}
function renderLock(d) {
  const box = $("lockList");
  if (!box) return;
  const plan = d && lockPlan(d);
  const cfg = lockCfg();
  $("lockSettings").checked = !!cfg.settings;
  if ($("lockSettingsWifi")) $("lockSettingsWifi").checked = !!cfg.settingsWifi && !cfg.settings;
  $("lockKioskNote").hidden = !(d && d.info.kiosk);
  const sL = d && d.info.settingsLocked ? ` · ปิดหน้า Settings ${d.info.settingsLocked} หน้า` : "";
  $("lockState").textContent = !d ? "-" : (d.info.locked || []).length || sL ? `${label(d)}: ล็อกอยู่ (${(d.info.locked || []).length} แอปถูกปิด${sL})` : `${label(d)}: ใช้งานปกติ`;
  if (!plan) { box.replaceChildren(el("div", { class: "item mut", text: d ? "กำลังโหลดรายชื่อแอป..." : "-" })); return; }
  const blockN = plan.filter((x) => x.block).length;
  $("lockCount").textContent = `จะปิด ${blockN} แอป · เหลือใช้ได้ ${plan.length - blockN} แอป (ติ๊ก = ปิดตอนออกงาน)`;
  box.replaceChildren(...plan.map((x) => {
    const c = el("input", { type: "checkbox" });
    c.checked = x.block; c.disabled = x.forced || x.isSettings;
    c.addEventListener("change", () => {
      const keep = new Set(lockCfg().keep || plan.filter((y) => !y.block && !y.forced && !y.isSettings).map((y) => y.pkg));
      c.checked ? keep.delete(x.pkg) : keep.add(x.pkg);
      st.save("fieldLock", { ...lockCfg(), keep: [...keep] });
      renderLock(d);
    });
    return el("label", { class: "item" }, el("span", { class: "row", style: "gap:10px;flex-wrap:nowrap;min-width:0;flex:1" }, c,
      el("span", { class: "nm" }, x.name, el("small", { text: x.forced ? "ไม่ปิด (Flash Kit ต้องใช้ / ระบบ)" : x.isSettings ? "ตั้งที่ช่อง Settings ด้านบน" : x.pkg }))),
      (d.info.locked || []).includes(x.pkg) ? el("span", { class: "tag", text: "ปิดอยู่" }) : null);
  }));
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
  if ($("appCount")) { const u = a.list.filter((x) => !x.sys).length, ic = a.list.filter((x) => x.icon).length; $("appCount").textContent = `${label(d)} · ทั้งหมด ${a.list.length} แอป (มีไอคอนบนหน้าจอ ${ic} · ติดตั้งเอง ${u} · แอประบบ ${a.list.length - u}) · แอปที่มีไอคอนอยู่บนสุด`; }
  const s = $("appSearch").value.trim().toLowerCase();
  const showSys = $("showSys").checked;
  const banned = new Set(st.banned());
  const rows = a.list.filter((x) => (showSys || !x.sys || banned.has(x.pkg)) && (!s || x.pkg.toLowerCase().includes(s) || x.name.toLowerCase().includes(s)));
  box.replaceChildren(...(rows.length ? rows.slice(0, 1500).map((x) => el("div", { class: "item" },
    el("div", { class: "nm" }, x.name || x.pkg,
      x.icon ? el("span", { class: "tag ok", text: "มีไอคอน" }) : null,
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
  if (!hasCap(d, "cmd")) {
    // Android 6: read it from dumpsys wifi ("Wi-Fi is enabled" / mWifiInfo SSID: name, ...)
    const t = (await d.sh("dumpsys wifi 2>/dev/null | grep -m3 -E 'Wi-Fi is|mWifiInfo'")).out;
    if (/Wi-Fi is disabled/i.test(t)) return "Wi-Fi ปิดอยู่";
    const m = t.match(/SSID: "?([^",]+)"?,/);
    return m && !/unknown ssid|<none>/i.test(m[1]) && /CONNECTED|COMPLETED/.test(t) ? "ต่ออยู่กับ " + m[1] : "ยังไม่ได้ต่อ Wi-Fi";
  }
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
      el("button", { class: "red admin-only", text: "ลบ", onclick: async () => { if (await confirmBox(`ลบ Wi-Fi "${w.ssid}" ออกจากรายการ?`)) { const l = st.wifiList(); l.splice(i, 1); st.saveWifiList(l); renderWifiSaved(); } } }))
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
      if (!hasCap(d, "cmd") || /does not have access to wifi commands|checkRootPermission|cmd: not found|can't find service/i.test(t)) {
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
/*
 * One click for a device that was reset (or is new): Flash Kit, standard settings, the first saved Wi-Fi, field lock.
 * Flash Kit goes first on its own (it needs the download); the rest runs on every device side by side.
 */
async function setupAll() {
  const ts = targets();
  const w = st.wifiList()[0];
  const need = ts.filter((d) => ["missing", "old"].includes(flashState(d)));
  const steps = [
    need.length ? `1. ลง/อัปเดต Flash Kit (${need.length} เครื่อง)` : "1. Flash Kit ล่าสุดแล้ว ข้าม",
    "2. ตั้งค่ามาตรฐาน (ตามแท็บ ตั้งค่า)",
    w ? `3. ต่อ Wi-Fi ${w.ssid}` : "3. ข้าม Wi-Fi (ยังไม่ได้บันทึก Wi-Fi ในแท็บ Wi-Fi)",
    "4. ล็อกออกงาน (ตามที่ติ๊กไว้ในแท็บ แอป)"
  ];
  if (!(await confirmBox(`ตั้งเครื่องใหม่ ${ts.length > 1 ? ts.length + " เครื่อง" : label(ts[0])}:\n${steps.join("\n")}`))) return;
  if (need.length) await flashInstall(need, true);
  await run("ตั้งเครื่องใหม่", async () => {
    const s = readStdForm(), fails = [], manual = [];
    await Promise.all(ts.map(async (d) => {
      try {
        setStatus(d, { title: "ตั้งค่ามาตรฐาน", big: "2/4", ring: 50 });
        const f = await applyStd(d, s);
        if (f.length) fails.push(`${label(d)} ตั้งค่า: ${f.join(", ")}`);
        if (w) {
          setStatus(d, { title: "ต่อ Wi-Fi", big: "3/4", ring: 75 });
          await d.sh("svc wifi enable");
          const r = hasCap(d, "cmd") ? await d.sh(`cmd wifi connect-network ${q(w.ssid)} ${w.sec}${w.sec === "open" ? "" : " " + q(w.pass)}`) : { out: "", err: "no cmd", code: 1 };
          const t = (r.out + r.err).trim();
          if (!hasCap(d, "cmd") || /does not have access to wifi commands|checkRootPermission|not found|can't find service/i.test(t)) manual.push(d);
          else if (r.code || /exception|denied|not allowed|error|unknown command/i.test(t)) fails.push(`${label(d)} Wi-Fi: ${t.split("\n")[0].slice(0, 120)}`);
        }
        setStatus(d, { title: "ล็อกออกงาน", big: "4/4", ring: 90 });
        const lf = await lockDevice(d);
        if (lf.length) fails.push(`${label(d)} ล็อก: ${lf.join(", ")}`);
        setStatus(d, { title: "ตั้งเครื่องเสร็จ", big: "✓", ring: 100, done: true });
      } catch (e) { fails.push(`${label(d)}: ${e.message}`); setStatus(d, { title: "ตั้งไม่ครบ", err: true, done: true }); }
    }));
    renderAll();
    if (manual.length) {
      // older Android: Wi-Fi only from the device screen; open it there and offer to type the password
      for (const d of manual) await d.sh("input keyevent 224; am start -a android.settings.WIFI_SETTINGS");
      showWifiManual(manual, w);
    }
    log(`ตั้งเครื่องใหม่เสร็จ ${ts.length} เครื่อง${manual.length ? " · " + manual.length + " เครื่องต้องแตะ Wi-Fi เองที่เครื่อง" : ""}`);
    if (fails.length) log("บางขั้นไม่สำเร็จ: " + fails.join(" / "));
  });
}

/*
 * Google account on the device (for FRP: a reset from the buttons then asks for this account).
 * Android only adds a Google account through its own sign-in screens, so the page drives them: it reads the
 * screen with `uiautomator dump`, types the email and password into the fields, and taps Next / I agree.
 * Anything unexpected (2-step check, a new screen) is left for a person and shown in the circle.
 */
const G_NEXT = /^(next|ถัดไป|i agree|ยอมรับ|accept|ตกลง|ok|agree|more|เพิ่มเติม|skip|ข้าม|not now|ไม่ใช่ตอนนี้|no thanks|ไม่เป็นไร|continue|ต่อไป|turn on|done|เสร็จ)$/i;
const G_ERR = /couldn.t find your google account|wrong password|รหัสผ่านไม่ถูกต้อง|ไม่พบบัญชี google|enter a valid email|couldn.t sign you in|ไม่สามารถลงชื่อเข้าใช้/i;
const G_2SV = /2-step verification|ยืนยันแบบ 2 ขั้นตอน|check your phone|ตรวจสอบโทรศัพท์|verify it.s you|ยืนยันว่าเป็นคุณ/i;
async function hasGoogle(d, email) {
  const t = (await d.sh("dumpsys account 2>/dev/null | grep -i 'type=com.google'")).out;
  return email ? t.toLowerCase().includes(email.toLowerCase()) : /com\.google/.test(t);
}
async function readScreen(d) {
  const r = await d.sh("uiautomator dump /data/local/tmp/idt-ui.xml >/dev/null 2>&1; cat /data/local/tmp/idt-ui.xml 2>/dev/null; rm -f /data/local/tmp/idt-ui.xml");
  const doc = new DOMParser().parseFromString(r.out.slice(r.out.indexOf("<")), "text/xml");
  return [...doc.querySelectorAll("node")].map((n) => {
    const b = (n.getAttribute("bounds") || "").match(/\d+/g) || [0, 0, 0, 0];
    return { text: (n.getAttribute("text") || "").trim(), desc: (n.getAttribute("content-desc") || "").trim(), id: n.getAttribute("resource-id") || "", cls: n.getAttribute("class") || "",
      pass: n.getAttribute("password") === "true", click: n.getAttribute("clickable") === "true", x: Math.round((+b[0] + +b[2]) / 2), y: Math.round((+b[1] + +b[3]) / 2), w: b[2] - b[0], h: b[3] - b[1] };
  });
}
const typeable = (s) => s.replace(/ /g, "%s");
async function googleSignIn(d, email, pass) {
  if (await hasGoogle(d, email)) return "มีอยู่แล้ว";
  await d.sh("input keyevent 224; am start -a android.settings.ADD_ACCOUNT_SETTINGS --esa account_types com.google");
  let typedEmail = false, typedPass = false, idle = 0;
  const until = Date.now() + 240000;
  while (Date.now() < until) {
    await sleep(2500);
    if (await hasGoogle(d, email)) return "ok";
    const nodes = await readScreen(d);
    if (!nodes.length) { idle++; continue; }
    const all = nodes.map((n) => n.text + " " + n.desc).join("\n");
    const err = all.match(G_ERR);
    if (err) throw new Error("Google: " + err[0]);
    if (G_2SV.test(all)) { setStatus(d, { title: "ยืนยันที่มือถือ hub", big: "2FA" }); continue; }
    const edits = nodes.filter((n) => /EditText/.test(n.cls) && n.w > 0);
    const pw = edits.find((n) => n.pass);
    if (pw && !typedPass) {
      setStatus(d, { title: "ใส่รหัส Google", big: "2/3", ring: 66 });
      await d.sh(`input tap ${pw.x} ${pw.y}`); await sleep(400);
      await d.shOk(`input text ${q(typeable(pass))}`); await d.sh("input keyevent 66");
      typedPass = true; continue;
    }
    const em = edits.find((n) => !n.pass && (/identifier|email|username/i.test(n.id + n.text + n.desc) || /email|อีเมล/i.test(all)));
    if (em && !typedEmail) {
      setStatus(d, { title: "ใส่อีเมล Google", big: "1/3", ring: 33 });
      await d.sh(`input tap ${em.x} ${em.y}`); await sleep(400);
      await d.shOk(`input text ${q(typeable(email))}`); await d.sh("input keyevent 66");
      typedEmail = true; continue;
    }
    // buttons on the later screens (I agree, More, Accept, Skip backup ...): the lowest matching one is the main action
    const btn = nodes.filter((n) => G_NEXT.test(n.text || n.desc) && n.w > 0).sort((a, b) => b.y - a.y)[0];
    if (btn) { setStatus(d, { title: "กด " + (btn.text || btn.desc), big: "3/3", ring: 85 }); await d.sh(`input tap ${btn.x} ${btn.y}`); idle = 0; continue; }
    if (++idle > 12) break;
  }
  throw new Error("ไปต่อเองไม่ได้ ดูหน้าจอเครื่องแล้วกดต่อเอง");
}
async function googleSetup() {
  const email = $("gEmail").value.trim(), pass = $("gPass").value;
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || !pass) { showHelp("UNKNOWN", "ใส่อีเมลและรหัสให้ครบ"); return; }
  if (/[^\x20-\x7e]/.test(pass)) { showHelp("TYPE"); return; }
  st.save("gEmail", email);
  await run("ใส่บัญชี Google", async () => {
    const ts = targets();
    const doLock = $("gLock").checked;
    if (!(await kioskOk(ts, "การเปิดหน้าล็อกอิน Google"))) return false;
    if (!(await confirmBox(`ใส่บัญชี ${email} ให้ ${ts.length > 1 ? ts.length + " เครื่อง" : label(ts[0])}${doLock ? " แล้วล็อกออกงาน" : ""}?\nเครื่องต้องต่อ Wi-Fi อยู่ ระหว่างนี้อย่าแตะหน้าจอเครื่อง (ประมาณ 1-3 นาที)`))) return false;
    const fails = [];
    await Promise.all(ts.map(async (d) => {
      try {
        // a locked device may have Settings/Google screens switched off: open it first, lock again at the end
        if ((d.info.locked || []).length || d.info.settingsLocked) { setStatus(d, { title: "ปลดล็อกชั่วคราว", big: "…" }); await unlockDevice(d); }
        await d.sh("svc power stayon usb");
        setStatus(d, { title: "เปิดหน้าล็อกอิน Google", big: "…", ring: 10 });
        const r = await googleSignIn(d, email, pass);
        log(`${label(d)}: บัญชี Google ${r === "มีอยู่แล้ว" ? "มีอยู่แล้ว" : "ใส่สำเร็จ"} (${email})`);
        await d.sh("input keyevent 3");
        if (doLock) { await lockDevice(d); }
        setStatus(d, { title: doLock ? "ใส่บัญชี + ล็อกแล้ว" : "ใส่บัญชีแล้ว", big: "✓", ring: 100, done: true });
      } catch (e) {
        fails.push(`${label(d)}: ${e.message}`);
        setStatus(d, { title: "ใส่บัญชีไม่สำเร็จ", err: true, done: true });
      }
    }));
    renderAll();
    if (fails.length) throw new Error(fails.join("\n") + (doLock ? "\n(เครื่องที่ไม่สำเร็จยังไม่ถูกล็อก)" : ""));
  }, "GOOGLE");
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
  renderFlashCache();
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
    el("td", {}, el("b", { text: st.nameOf(x.serial) || "-" }), el("div", { class: "mut", text: x.serial })), el("td", { text: x.model || "" }), el("td", { text: x.android || "" }),
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
  // connecting a new device never locks or marks the devices already on the stage
  connect: () => run("เชื่อมต่อเครื่องใหม่", connectNew, null, { free: true }),
  cancelAuth: () => { [...pending].forEach((s) => adb.cancelWait(s)); },
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
  lockApply: () => run("ล็อกออกงาน", async () => {
    const ts = targets();
    const cfg = lockCfg();
    const warnSettings = cfg.settings ? "\n\n⚠️ ปิด Settings ด้วย: ถ้า USB debugging ถูกปิดระหว่างนั้น จะต่อเว็บกลับมาปลดล็อกไม่ได้ ต้องรีเซ็ตเครื่อง (เครื่องที่ใช้ iLauncher จะไม่ปิด Settings ให้)" : "";
    if (!(await confirmBox(`ล็อกโหมดออกงาน ${ts.length > 1 ? ts.length + " เครื่อง" : label(ts[0])}?\nปิดทุกแอปที่ติ๊กไว้ เหลือ Flash Kit, แอปสแกน และแอปที่เลือกไว้\nไม่ได้ถอนแอป กด ปลดล็อก แล้วกลับมาเหมือนเดิม${warnSettings}`))) return false;
    const fails = [];
    await Promise.all(ts.map(async (d) => { const f = await lockDevice(d); if (f.length) fails.push(label(d) + ": " + f.join(", ")); }));
    renderAll();
    if (fails.length) log("บางแอปปิดไม่ได้ (ระบบบริษัทหรือระบบเครื่องกันไว้): " + fails.join(" / "));
  }),
  setupAll: () => setupAll(),
  googleSetup: () => googleSetup(),
  // Opens Android's "add Google account" screen on every selected device; the sign-in itself is done on the device
  // (or typed with "พิมพ์ข้อความเข้าเครื่อง"). With the account on the device, a reset from the buttons asks for it (FRP).
  addGoogle: () => run("เปิดหน้าเพิ่มบัญชี Google", async () => {
    const ts = targets();
    if (!(await kioskOk(ts, "การเปิดหน้าเพิ่มบัญชี"))) return false;
    const locked = ts.filter((d) => (d.info.locked || []).length || d.info.settingsLocked);
    if (locked.length && !(await confirmBox(`${locked.map(label).join(", ")} ล็อกออกงานอยู่ หน้าเพิ่มบัญชีอาจเปิดไม่ได้\nแนะนำ: กด ปลดล็อก ก่อน เพิ่มบัญชีเสร็จแล้วค่อยล็อกใหม่\n\nเปิดต่อเลยไหม?`))) return false;
    const fails = [];
    await Promise.all(ts.map(async (d) => {
      const r = await d.sh("input keyevent 224; am start -a android.settings.ADD_ACCOUNT_SETTINGS --esa account_types com.google 2>&1");
      if (/Error|not found|Exception/i.test(r.out + r.err)) fails.push(label(d));
      else setStatus(d, { title: "ล็อกอิน Google ที่เครื่อง", big: "@", done: true });
    }));
    log(`เปิดหน้าเพิ่มบัญชี Google ${ts.length - fails.length} เครื่อง · ใส่อีเมลและรหัสที่เครื่อง หรือใช้ เครื่อง > พิมพ์ข้อความเข้าเครื่อง${fails.length ? " · เปิดไม่ได้: " + fails.join(", ") + " (เครื่องอาจไม่มีบริการ Google)" : ""}`);
  }),
  tgSave: () => run("ตั้งบอท Telegram", async () => { const r = await auth.apiPost("/api/telegram", { token: $("tgToken").value }); $("tgToken").value = ""; log("ตั้งบอท @" + r.bot + " แล้ว"); await renderUsers(); }, null, { free: true }),
  staffAdd: () => run("เพิ่มพนักงาน", async () => {
    const name = $("sfName").value.trim();
    if (!name) throw new Error("ใส่ชื่อพนักงาน");
    const s = await auth.apiPost("/api/staff", { name, chatId: $("sfChat").value, times: parseHours($("sfTimes").value) });
    ["sfName", "sfChat", "sfTimes"].forEach((k) => ($(k).value = ""));
    await renderUsers();
    if (await confirmBox(`เพิ่ม ${s.name} แล้ว\nส่งรหัสแรกให้เลยไหม? (ไม่งั้นจะได้รหัสตามเวลาที่ตั้ง)`)) {
      const r = await auth.apiPost("/api/staff/rotate", { id: s.id });
      await confirmBox(`รหัสของ ${s.name}: ${r.password}\n${r.sent ? "ส่งเข้า Telegram แล้ว" : "ส่ง Telegram ไม่ได้ (" + (r.error || "?") + ") ให้บอกรหัสนี้เอง"}`);
      await renderUsers();
    }
  }, null, { free: true }),
  adminPw: () => run("เปลี่ยนรหัสเจ้าของ", async () => { await auth.apiPost("/api/admin/password", { old: $("adOld").value, password: $("adNew").value }); $("adOld").value = $("adNew").value = ""; log("เปลี่ยนรหัสเจ้าของแล้ว"); }, null, { free: true }),
  lockRelease: () => run("ปลดล็อก", async () => {
    const ts = targets();
    await Promise.all(ts.map((d) => unlockDevice(d)));
    renderAll();
  }),
  nameDev: () => { const d = cardDev && !cardDev.closed ? cardDev : devices.get(selected); if (d) nameDevice(d); },
  findDev: () => run("หาเครื่อง", async (job) => {
    const d = cardDev && !cardDev.closed ? cardDev : cur();
    if (!job.devs.includes(d)) { d.stopped = false; job.devs.push(d); }
    const id = d.serial.slice(-6);
    await d.sh("input keyevent 224");
    await signalDevice(d);
    // A notification with the id on the device's own screen: easy to spot which one on the desk it is
    const r = await d.sh(`cmd notification post -S bigtext -t ${q("IDATA TOOLS")} idata-find ${q((st.nameOf(d.serial) ? "เครื่องนี้คือ " + st.nameOf(d.serial) + " · " : "เครื่องนี้คือ") + "รหัส " + id + " (" + d.serial + ")")}`);
    d.info.screenOn = true; renderDevices();
    setStatus(d, { title: "เครื่องนี้", big: "👋", done: true });
    log(`${label(d)}: ส่งสัญญาณแล้ว (จอกะพริบ + สั่น) เปิดจอแล้ว${r.code ? "" : " และขึ้นแจ้งเตือนรหัส " + id + " ที่เครื่อง"}`);
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
        const r = await d.sh(`[ -d ${q(dir)} ] || { echo 0; exit 0; }; n=$(${findIn(d, dir)} -maxdepth 1 -type f ${MEDIA} -not -name '.trashed-*' | wc -l); ${findIn(d, dir)} -maxdepth 1 -type f ${MEDIA} -not -name '.trashed-*' -delete; echo $n`);
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
    if (!(await kioskOk([d], "การเปิดแอป Flash"))) return false;
    for (const p of pk) { await d.sh(`am force-stop ${q(p)}`); await d.sh(`monkey -p ${q(p)} -c android.intent.category.LAUNCHER 1`); }
  }),
  reboot: () => run("รีสตาร์ทเครื่อง", async () => {
    const ts = targets();
    if (!(await confirmBox(`รีสตาร์ท ${ts.length > 1 ? ts.length + " เครื่อง" : label(ts[0])}?\nหลังเปิดเครื่องเสร็จ ให้ปลดล็อกหน้าจอ เว็บจะเชื่อมต่อให้เอง`))) return false;
    for (const d of ts) { d.rebooting = true; await d.reboot().catch(() => {}); }
    log("สั่งรีสตาร์ทแล้ว รอเครื่องเปิดเสร็จ (1-2 นาที) แล้วปลดล็อกหน้าจอ เว็บจะเชื่อมต่อให้เอง");
  }),
  // One device at a time, on purpose: the Recovery menu is where a device can be wiped
  recovery: () => run("เข้าเมนู Recovery", async () => {
    const d = cur();
    if (!(await confirmBox(`เปิดเมนู Recovery ที่ ${label(d)}?\n\nเครื่องจะดับแล้วขึ้นเมนูตัวหนังสือ เว็บจะหลุดการเชื่อมต่อ (ปกติ)\nในเมนู: ปุ่มเสียง ขึ้น/ลง = เลื่อน · ปุ่ม Power = เลือก\n• Reboot system now = เปิดเครื่องตามปกติ ไม่มีอะไรหาย\n• Wipe data/factory reset = ล้างเครื่อง ทุกอย่างหาย (รูป แอป Flash Kit บัญชี การล็อก)\n\nถ้าจะล้างจริง: สำรองรูป fail ก่อน และต้องรู้บัญชี Google ของเครื่อง`))) return false;
    d.rebooting = true;
    await d.rebootRecovery().catch(() => {});
    log(`${label(d)}: สั่งเข้าเมนู Recovery แล้ว ใช้ปุ่มเสียงเลื่อน ปุ่ม Power เลือก`);
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
    d.rebooting = true;
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
  flashDownload: () => run("โหลดไฟล์ Flash Kit เก็บไว้", async () => { await getFlashFile("new"); }, "FLASH_DL", { free: true }),
  flashPick: () => run("เลือกไฟล์ Flash Kit เก็บไว้", async () => { await getFlashFile("pick"); }, "FLASH_DL", { free: true }),
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
    if (!hasCap(d, "cmd")) { $("wifiScanList").replaceChildren(el("div", { class: "item mut", text: "Android รุ่นนี้ (เก่ากว่า 7) ค้นหา Wi-Fi จากคอมไม่ได้ พิมพ์ชื่อ Wi-Fi เองได้เลย" })); return; }
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
    download(st.toCsv([["ชื่อ", "รหัสเครื่อง", "ยี่ห้อ", "รุ่น", "Android", "แบต", "พื้นที่", "แอป Flash", "เห็นครั้งแรก", "เห็นล่าสุด"],
      ...r.map((x) => [st.nameOf(x.serial), x.serial, x.manufacturer, x.model, x.android, x.battery, x.storage, x.flash, isoTime(x.firstSeen), isoTime(x.lastSeen)])]), `devices-${stamp()}.csv`, "text/csv");
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
// Ask for an APK file directly (the confirm click is the gesture the file window needs)
async function pickApkFile(text) {
  if (!(await confirmBox(text))) return null;
  let f = null;
  if (window.showOpenFilePicker) {
    // opens straight in Downloads, newest files are easy to spot
    try { [f] = await window.showOpenFilePicker({ id: "flashapk", startIn: "downloads", types: [{ description: "Android app (.apk)", accept: { "application/vnd.android.package-archive": [".apk"] } }] }); f = await f.getFile(); }
    catch (e) { if (e && e.name === "AbortError") return null; f = null; }
  }
  if (!f) f = await pickApkInput();
  if (f && !(await isApk(f))) { showHelp("FLASH_DL", "ไฟล์ที่เลือกไม่ใช่ APK"); return null; }
  return f;
}
async function pickApkInput() {
  const inp = el("input", { type: "file", accept: ".apk,application/vnd.android.package-archive" });
  return await new Promise((res) => { inp.onchange = () => res(inp.files[0] || null); inp.oncancel = () => res(null); inp.click(); });
}
async function flashViaFilePick(url) {
  const win = window.open(url, "_blank");
  if (!win) $("dlgList").replaceChildren(el("a", { href: url, target: "_blank", rel: "noopener", class: "dl-link", text: "กดตรงนี้เพื่อเริ่มโหลด Flash Kit" }));
  const f = await pickApkFile((win ? "Chrome กำลังโหลด Flash Kit ในแท็บใหม่" : "กดลิงก์ด้านบนเพื่อเริ่มโหลด Flash Kit") +
    "\n\nรอให้โหลดเสร็จ (ดูไอคอนดาวน์โหลดมุมขวาบนของ Chrome) แล้วกลับมาที่หน้านี้ กด ยืนยัน\nจะมีหน้าต่างเปิดที่ Downloads ให้คลิกไฟล์ .apk ที่ใหม่สุด แล้วกด Open\nเว็บจะติดตั้งให้ทุกเครื่องเอง");
  $("dlgList").replaceChildren();
  if (!f) throw new Error("ยกเลิกการเลือกไฟล์");
  return f;
}
async function flashViaDownloads(url) {
  if (!window.showDirectoryPicker) return flashViaFilePick(url);
  let dir = await kvGet("dlDir");
  const askGesture = (text) => confirmBox(text);   // the click on ยืนยัน counts as the user gesture the browser wants
  if (dir) {
    let p = await dir.queryPermission({ mode: "read" });
    if (p !== "granted") { try { p = await dir.requestPermission({ mode: "read" }); } catch (e) { if (await askGesture("กด ยืนยัน เพื่ออนุญาตให้เว็บดูโฟลเดอร์ Downloads")) p = await dir.requestPermission({ mode: "read" }); } }
    if (p !== "granted") dir = null;
  }
  // No folder saved: the folder window confuses people (it shows no files), so use a file window instead:
  // Chrome downloads the link, then they pick the newest .apk from Downloads
  if (!dir) return flashViaFilePick(url);
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
  const f = await pickApkFile("รอไฟล์ในโฟลเดอร์ " + dir.name + " เกิน 5 นาทีแล้ว ถ้าโหลดเสร็จแล้ว กด ยืนยัน แล้วเลือกไฟล์ .apk เอง");
  if (f) return f;
  throw new Error("รอไฟล์โหลดเกิน 5 นาที");
}

/*
 * The Flash Kit APK is kept in this browser (IndexedDB) after one download, so updating many devices does not
 * download it again each time. "โหลดใหม่" refreshes it; the version is learnt the first time it is installed.
 */
async function cachedFlash() { const c = await kvGet("flashApk"); return c && c.blob ? c : null; }
function cacheText(c) {
  if (!c) return "ยังไม่มีไฟล์เก็บไว้ในเว็บ";
  const days = Math.floor((Date.now() - c.at) / 86400000);
  return `ไฟล์ที่เก็บไว้: ${c.ver ? "เวอร์ชัน " + c.ver + " · " : ""}${human(c.size / 1024)} · โหลดเมื่อ ${new Date(c.at).toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" })}${days >= 7 ? ` (${days} วันก่อน อาจมีรุ่นใหม่ กดโหลดใหม่ได้)` : ""}`;
}
async function renderFlashCache() { const b = $("flCache"); if (b) b.textContent = cacheText(await cachedFlash()); }
// how=new: download from the link (direct, else Chrome + pick the file); how=pick: choose an .apk on the computer
async function getFlashFile(how) {
  const cfg = st.flashCfg();
  let file;
  try {
    if (how === "pick") file = await pickApkFile("เลือกไฟล์ Flash Kit .apk ในคอม (กด ยืนยัน แล้วเลือกไฟล์)");
    else {
      try { file = await flashDirect(cfg.url); }
      catch (e) { log("โหลดตรงจากลิงก์ไม่ได้ (" + e.message + ") ใช้วิธีให้ Chrome โหลดแทน"); file = await flashViaDownloads(cfg.url); }
    }
  } finally { busyMsg("", "flash"); }
  if (!file) throw new Error("ยกเลิกการเลือกไฟล์");
  const blob = new Blob([await file.arrayBuffer()], { type: "application/vnd.android.package-archive" });
  await kvSet("flashApk", { blob, name: "FlashKit.apk", size: blob.size, at: Date.now(), ver: "" });
  renderFlashCache();
  log(`เก็บไฟล์ Flash Kit ไว้ในเว็บแล้ว (${human(blob.size / 1024)}) ครั้งหน้าไม่ต้องโหลดซ้ำ`);
  return new File([blob], "FlashKit.apk", { type: blob.type });
}
async function flashInstall(list, quiet) {
  list = list.filter((d) => d && !d.closed);
  if (!list.length) return;
  const c = await cachedFlash();
  const who = list.map((d) => "• " + label(d) + (flashState(d) === "missing" ? " (ยังไม่มี)" : flashState(d) === "old" ? " (เก่า " + ((flashMain(d) || {}).ver || "") + ")" : "")).join("\n");
  let how = c ? "cache" : "new";
  if (!quiet) {
    how = c
      ? await choiceBox(`ติดตั้ง / อัปเดต Flash Kit ให้ ${list.length} เครื่อง:\n${who}\n\n${cacheText(c)}`, [["cache", "ใช้ไฟล์ที่เก็บไว้"], ["new", "โหลดใหม่จากลิงก์"], ["pick", "เลือกไฟล์ .apk เอง"]])
      : await choiceBox(`ติดตั้ง / อัปเดต Flash Kit ให้ ${list.length} เครื่อง:\n${who}\n\nยังไม่มีไฟล์เก็บไว้ในเว็บ: โหลดครั้งเดียว ครั้งต่อไปใช้ไฟล์เดิมได้เลย`, [["new", "โหลดจากลิงก์"], ["pick", "เลือกไฟล์ .apk เอง"]]);
    if (!how) return;
  }
  list.forEach((d) => setStatus(d, { title: "รอไฟล์ Flash Kit", big: "…" }));
  let file;
  try { file = how === "cache" ? new File([c.blob], "FlashKit.apk", { type: "application/vnd.android.package-archive" }) : await getFlashFile(how); }
  catch (e) {
    list.forEach((d) => setStatus(d, null));
    showHelp(e.message === "NO_FS" ? "NO_FS" : "FLASH_DL", e.message);
    return;
  }
  log(`ใช้ไฟล์ Flash Kit ${human(file.size / 1024)} กำลังติดตั้ง`);
  pendingInstall = { list, t: Date.now() };
  await installApk(file);
  // learn which version the kept file is, from a device it was just installed on
  const v = list.map((d) => (flashMain(d) || {}).ver).filter(Boolean).sort((a, b) => (verLess(a, b) ? 1 : -1))[0];
  const now = await cachedFlash();
  if (v && now && now.size === file.size) { now.ver = v; await kvSet("flashApk", now); renderFlashCache(); }
}

async function installApk(file) {
  await run("ติดตั้ง " + file.name, async (job) => {
    const ts = await pickDevices(`ติดตั้ง ${file.name}\n(ถ้ามีแอปเดิมอยู่ จะอัปเดตทับ ข้อมูลในแอปยังอยู่)`);
    if (!ts.length) return false;
    ts.forEach((d) => { if (!job.devs.includes(d)) { d.stopped = false; job.devs.push(d); } });
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

/*
 * Android has no shell command that sets a wallpaper, so after opening its own wallpaper screen the page taps
 * through it like a person: "Set wallpaper", then "Home and lock screens" (or, from an app chooser, "Wallpaper"
 * then "Just once"). Returns false when the screen is not one it knows: then a person taps once.
 */
const W_BOTH = /^(home and lock screens?|home screen and lock screen|both|หน้าจอหลักและหน้าจอล็อก|ทั้งหน้าจอหลักและหน้าจอล็อก|หน้าจอหลักและล็อกหน้าจอ|ทั้งสองอย่าง)$/i;
const W_SET = /^(set wallpaper|set as wallpaper|apply|ตั้งค่าวอลเปเปอร์|ตั้งวอลเปเปอร์|ตั้งเป็นวอลเปเปอร์|ใช้)$/i;
const W_APP = /^(wallpaper|wallpapers|วอลเปเปอร์|ภาพพื้นหลัง)$/i;
const W_ONCE = /^(just once|เพียงครั้งเดียว|ครั้งเดียว)$/i;
// Is a wallpaper screen (or an app chooser opened for it) still in front?
async function inWallpaperFlow(d) {
  const t = (await d.sh("dumpsys activity activities 2>/dev/null | grep -m2 -E 'mResumedActivity|ResumedActivity:'")).out;
  return /wallpaper|Wallpaper|Resolver|Chooser|crop|Crop/.test(t);
}
// Buttons learnt per model by watching a person tap through the screens once (see learnWallpaper)
const wallLearnt = (d) => (st.load("wallLearn", {})[d.info.model || "?"] || []);
const nodeKey = (n) => n.text || n.desc || n.id;
async function autoWallpaper(d) {
  let tapped = false;
  const learnt = wallLearnt(d);
  const until = Date.now() + 25000;
  while (Date.now() < until) {
    await sleep(1500);
    if (tapped && !(await inWallpaperFlow(d))) return true;   // the wallpaper screens closed after our taps = set
    const nodes = (await readScreen(d)).filter((n) => n.w > 0);
    const find = (re) => nodes.find((n) => re.test(n.text) || re.test(n.desc));
    // what a person tapped on this model before comes first, then the screens the page knows
    const lrn = learnt.length && nodes.find((n) => learnt.includes(nodeKey(n)));
    const hit = lrn || find(W_BOTH) || find(W_SET) || find(W_ONCE) || (!tapped && find(W_APP));
    if (hit) { await d.sh(`input tap ${hit.x} ${hit.y}`); tapped = true; continue; }
    if (tapped) return !(await inWallpaperFlow(d));
  }
  return false;
}
/*
 * Learning: on a screen the page does not know, a person taps through it on the device once. Meanwhile the page
 * records the touches (getevent) and the screen under them (uiautomator) and keeps the tapped buttons' names for
 * this model, so next time it taps them itself.
 */
const EV_FILE = "/data/local/tmp/idt-ev.txt";
async function learnWallpaper(d) {
  const model = d.info.model || "?";
  const caps = (await d.sh("getevent -lp 2>/dev/null; wm size 2>/dev/null")).out;
  const mx = parseInt((caps.match(/ABS_MT_POSITION_X[^\n]*max (\d+)/) || [])[1], 10);
  const my = parseInt((caps.match(/ABS_MT_POSITION_Y[^\n]*max (\d+)/) || [])[1], 10);
  const sz = caps.match(/(?:Override|Physical) size: (\d+)x(\d+)/);
  if (!mx || !my || !sz) return [];
  const sx = +sz[1] / (mx + 1), sy = +sz[2] / (my + 1);
  const pid = (await d.sh(`rm -f ${EV_FILE}; getevent -lt > ${EV_FILE} 2>/dev/null & echo $!`)).out.trim();
  const keys = [];
  let screen = await readScreen(d), seen = 0, x = 0, y = 0;
  const until = Date.now() + 120000;
  try {
    while (Date.now() < until) {
      await sleep(1200);
      const ev = (await d.sh(`cat ${EV_FILE} 2>/dev/null`)).out.split("\n");
      for (const line of ev.slice(seen)) {
        const m = line.match(/(ABS_MT_POSITION_X|ABS_MT_POSITION_Y|BTN_TOUCH|ABS_MT_TRACKING_ID)\s+(\w+)/);
        if (!m) continue;
        if (m[1] === "ABS_MT_POSITION_X") x = parseInt(m[2], 16) * sx;
        else if (m[1] === "ABS_MT_POSITION_Y") y = parseInt(m[2], 16) * sy;
        else if ((m[1] === "BTN_TOUCH" && m[2] === "UP") || (m[1] === "ABS_MT_TRACKING_ID" && m[2] === "ffffffff")) {
          // the smallest named thing under the finger on the screen that was showing before the tap
          const under = screen.filter((n) => n.w > 0 && nodeKey(n) && Math.abs(n.x - x) <= n.w / 2 && Math.abs(n.y - y) <= Math.max(24, n.h / 2)).sort((a, b) => a.w - b.w)[0];
          if (under && !keys.includes(nodeKey(under))) keys.push(nodeKey(under));
        }
      }
      seen = Math.max(0, ev.length - 1);
      if (!(await inWallpaperFlow(d))) break;
      screen = await readScreen(d);
    }
  } finally { await d.sh(`kill ${parseInt(pid, 10) || 0} 2>/dev/null; rm -f ${EV_FILE}`).catch(() => {}); }
  if (keys.length) {
    const all = st.load("wallLearn", {});
    all[model] = keys;
    st.save("wallLearn", all);
    log(`เรียนรู้หน้าตั้งวอลเปเปอร์ของ ${model} แล้ว: ${keys.join(" → ")} · ครั้งหน้าเว็บกดเอง`);
  }
  return keys;
}
async function setWallpaper(file) {
  await run("ส่งรูปหน้าจอ", async () => {
    const ts = await pickDevices("ส่งรูปหน้าจอ " + file.name);
    if (!ts.length) return false;
    if (!(await kioskOk(ts, "การเปิดหน้าตั้งวอลเปเปอร์"))) return false;
    const ext = ((file.name.match(/\.(\w+)$/) || [, "jpg"])[1]).toLowerCase();
    const mime = ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";
    const fails = [], done = [], manual = [];
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
      if (/Error|unable|not found|Exception/i.test(r.out + r.err)) { fails.push(label(d) + ": เปิดหน้าตั้งวอลเปเปอร์ไม่ได้"); continue; }
      // the page reads the screen and taps "Set wallpaper" → "Home and lock screens" itself
      setStatus(d, { title: "ตั้งวอลเปเปอร์", big: "…" });
      if (await autoWallpaper(d)) { done.push(d); setStatus(d, { title: "ตั้งวอลเปเปอร์แล้ว", big: "✓", ring: 100, done: true }); log(`${label(d)}: ตั้งวอลเปเปอร์ หน้าจอหลัก + หน้าจอล็อก แล้ว`); }
      else { manual.push(d); setStatus(d, { title: "กดตั้งที่เครื่อง · เว็บกำลังจำ", big: "👆" }); }
    }
    if (fails.length) throw new Error(fails.join("\n"));
    if (manual.length) {
      showHelp("WALL_TAP", manual.map(label).join(", "), true);
      // watch the person tap through it once, and remember the buttons for that model
      await Promise.all(manual.map(async (d) => {
        const keys = await learnWallpaper(d).catch(() => []);
        setStatus(d, keys.length ? { title: "จำวิธีตั้งแล้ว", big: "✓", ring: 100, done: true } : { title: "ตั้งที่เครื่องเอง", big: "👆", done: true });
      }));
    }
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
  if (name === "files") openFilesTab();
}

/* ---------- Login roles and the owner's user management (only when served by the login server) ---------- */
function applyRole(me) {
  document.body.classList.add("role-" + me.role);
  if (me.role === "local") return;
  const w = $("who");
  if (!w) return;
  w.hidden = false;
  w.replaceChildren(el("span", { text: (me.role === "admin" ? "เจ้าของ · " : "พนักงาน · ") + me.name }), el("button", { text: "ออกจากระบบ", onclick: () => auth.logout() }));
  if ($("wifiNote")) $("wifiNote").textContent = "รายการ Wi-Fi (และค่าหลังบ้านอื่นๆ) เก็บไว้ที่ระบบล็อกอิน: บันทึกครั้งเดียว ทุกคอมและมือถือที่ล็อกอินได้รายการนี้ · พนักงานเห็นแต่ใช้ต่อ Wi-Fi ได้ แก้ไม่ได้";
  if (me.role === "admin") renderUsers();
}
const hoursText = (t) => (t && t.length ? t.map((h) => String(h).padStart(2, "0") + ":00").join(", ") : "ไม่ได้ตั้ง (เปลี่ยนเองเท่านั้น)");
const parseHours = (s) => String(s || "").split(/[\s,]+/).map((x) => parseInt(x, 10)).filter((h) => h >= 0 && h <= 23);
async function renderUsers() {
  if (auth.me.role !== "admin" || !$("staffList")) return;
  try {
    const tg = await auth.apiGet("/api/telegram");
    $("tgState").textContent = tg.set ? `ตั้งบอทแล้ว: @${tg.bot} · พนักงานทัก @${tg.bot} ใน Telegram แล้วบอทจะตอบ Chat ID ให้` : "ยังไม่ได้ตั้งบอท: สร้างบอทที่ @BotFather ใน Telegram (คำสั่ง /newbot) แล้ววาง Token ที่ได้ลงช่องนี้";
    const list = await auth.apiGet("/api/staff");
    $("staffList").replaceChildren(...(list.length ? list.map((s) => {
      const chat = el("input", { type: "text", value: s.chatId, placeholder: "Chat ID", inputmode: "numeric" });
      const times = el("input", { type: "text", value: s.times.join(","), placeholder: "เวลา เช่น 7,19" });
      const save = (extra) => run("บันทึกพนักงาน", async () => { await auth.apiPost("/api/staff", { id: s.id, name: s.name, chatId: chat.value, times: parseHours(times.value), enabled: s.enabled, ...extra }); await renderUsers(); }, null, { free: true });
      return el("div", { class: "item staff-row" },
        el("div", { class: "nm" }, s.name + (s.enabled ? "" : " (ปิดอยู่)"),
          el("small", { text: `เปลี่ยนรหัส ${hoursText(s.times)}${s.next ? " · รอบถัดไป " + s.next : ""} · ${s.sentAt ? "ส่งรหัสล่าสุด " + new Date(s.sentAt).toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" }) : "ยังไม่เคยส่งรหัส"}${s.sendError ? " · ⚠️ " + s.sendError : ""}` })),
        el("div", { class: "row" }, chat, times, el("button", { text: "บันทึก", onclick: () => save({}) })),
        el("div", { class: "row" },
          el("button", { class: "blue", text: "ส่งรหัสใหม่ตอนนี้", onclick: () => run("ส่งรหัสใหม่", async () => {
            const r = await auth.apiPost("/api/staff/rotate", { id: s.id });
            await confirmBox(`รหัสใหม่ของ ${s.name}: ${r.password}\n\n${r.sent ? "ส่งเข้า Telegram แล้ว" : "ส่ง Telegram ไม่ได้ (" + (r.error || "?") + ") ให้บอกรหัสนี้เอง"}\nรหัสเก่าใช้เข้าไม่ได้แล้ว`);
            await renderUsers();
          }, null, { free: true }) }),
          el("button", { text: s.enabled ? "ปิดการเข้า" : "เปิดการเข้า", onclick: () => save({ enabled: !s.enabled }) }),
          el("button", { class: "red", text: "ลบ", onclick: async () => { if (await confirmBox(`ลบ ${s.name}? เข้าเว็บไม่ได้ทันที`)) run("ลบพนักงาน", async () => { await auth.apiDel("/api/staff?id=" + encodeURIComponent(s.id)); await renderUsers(); }, null, { free: true }); } })));
    }) : [el("div", { class: "item mut", text: "ยังไม่มีพนักงาน" })]));
  } catch (e) { $("staffList").replaceChildren(el("div", { class: "item mut", text: "โหลดรายชื่อไม่ได้: " + e.message })); }
}

window.addEventListener("DOMContentLoaded", async () => {
  applyRole(await auth.initAuth());
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
  // full Settings off and "Settings off except Wi-Fi" are alternatives: ticking one clears the other
  if ($("lockSettings")) $("lockSettings").addEventListener("change", (e) => { st.save("fieldLock", { ...lockCfg(), settings: e.target.checked, settingsWifi: e.target.checked ? false : lockCfg().settingsWifi }); renderLock(devices.get(selected)); });
  if ($("lockSettingsWifi")) $("lockSettingsWifi").addEventListener("change", (e) => { st.save("fieldLock", { ...lockCfg(), settingsWifi: e.target.checked, settings: e.target.checked ? false : lockCfg().settings }); renderLock(devices.get(selected)); });
  if ($("gEmail")) $("gEmail").value = st.load("gEmail", "");
  [["typeShow", "typeText"], ["wfShow", "wfPass"], ["gShow", "gPass"]].forEach(([c, i]) => { if ($(c)) $(c).addEventListener("change", (e) => ($(i).type = e.target.checked ? "text" : "password")); });
  if ($("typeText")) $("typeText").addEventListener("keydown", (e) => { if (e.key === "Enter") actions.typeSend(); });
  if ($("fxMode")) {
    $("fxMode").value = st.load("fx", "full");
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
