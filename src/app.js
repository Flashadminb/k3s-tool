import * as adb from "./adb.js";

const $ = (id) => document.getElementById(id);
const IMG = "/sdcard/imagePath";
const SUCCESS = IMG + "/success";
const FAIL = IMG + "/fail";

const HELP = {
  NO_WEBUSB: ["ใช้เบราว์เซอร์ไม่ถูก", ["เปิดหน้านี้ด้วย Google Chrome หรือ Microsoft Edge บนคอม (Firefox/Safari ใช้ไม่ได้)", "ต้องเป็นไฟล์ที่เปิดจากคอม ไม่ใช่จากมือถือ"]],
  NO_DEVICE_SELECTED: ["ยังไม่ได้เลือกเครื่อง", ["กดเชื่อมต่ออีกครั้ง แล้วเลือกเครื่อง K3S ในหน้าต่างที่เด้งขึ้น", "ถ้าไม่เห็นเครื่องในรายการ ให้ดูขั้นตอนครั้งแรกด้านบน"]],
  BUSY: ["เครื่องถูกโปรแกรมอื่นใช้อยู่", ["เปิด Command Prompt พิมพ์ adb kill-server แล้วกด Enter", "ปิดโปรแกรมอื่นที่ใช้ ADB เช่น Android Studio, scrcpy", "ถอดสาย USB แล้วเสียบใหม่ แล้วกดเชื่อมต่ออีกครั้ง"], { label: "โหลด Platform-Tools (เพื่อใช้ adb kill-server)", url: "https://developer.android.com/tools/releases/platform-tools" }],
  NOT_CONNECTED: ["ยังไม่ได้เชื่อมต่อ", ["กดปุ่ม เชื่อมต่อเครื่อง ก่อน"]],
  AUTH: ["เครื่องยังไม่อนุญาต", ["ดูที่หน้าจอ K3S จะมี popup Allow USB debugging ให้ติ๊ก Always allow แล้วกด Allow", "ถ้าไม่เห็น popup ให้ถอดสายแล้วเสียบใหม่", "ถ้าเคยกด Deny: Developer options > Revoke USB debugging authorizations แล้วลองใหม่"]],
  INSTALL: ["ติดตั้ง APK ไม่ได้", ["พื้นที่เครื่องอาจเต็ม: กด ลบขยะ และ ลบรูป success ก่อน", "ถ้าขึ้น INSTALL_FAILED_USER_RESTRICTED หรือ blocked: ระบบบริษัทบล็อกการติดตั้ง ให้แจ้งไอที Flash", "ถ้าเป็นแอปเดิมที่ลายเซ็นไม่ตรง ต้องถอนแอปเดิมก่อน"]],
  RESET: ["สั่งรีเซ็ตผ่านโปรแกรมไม่ได้", ["ทำมือที่เครื่อง: Settings > System > Reset options > Erase all data (factory reset)", "บางรุ่นเมนูชื่อไม่เหมือนกัน ลองค้นหาคำว่า Reset ในช่อง Search ของ Settings", "ถ้าไม่มีเมนูนี้ ระบบบริษัทอาจล็อกไว้ ให้แจ้งไอที"]],
  WALLPAPER: ["ตั้งรูปหน้าจออัตโนมัติไม่ได้", ["รูปถูกส่งเข้าเครื่องแล้วที่โฟลเดอร์ Download", "ทำมือ: เปิดแอป Gallery/Files > เปิดรูป > เมนู 3 จุด > Set as wallpaper", "เลือกได้ว่าจะตั้งหน้าจอหลัก หรือหน้าจอล็อก"]],
  UNKNOWN: ["เกิดข้อผิดพลาด", ["ถ่ายภาพหน้าจอส่วน Log ด้านล่างส่งให้ผู้ดูแล", "ลองถอดสายแล้วเชื่อมต่อใหม่"]]
};

function log(msg) {
  const el = $("log");
  const t = new Date().toLocaleTimeString("th-TH");
  el.textContent = `[${t}] ${msg}\n` + el.textContent;
}

function showHelp(code, detail) {
  const key = HELP[code] ? code : "UNKNOWN";
  const [title, steps, link] = HELP[key];
  const box = $("help");
  box.innerHTML = "";
  const h = document.createElement("div"); h.className = "help-title"; h.textContent = title; box.appendChild(h);
  const ol = document.createElement("ol");
  steps.forEach((s) => { const li = document.createElement("li"); li.textContent = s; ol.appendChild(li); });
  box.appendChild(ol);
  if (link) { const a = document.createElement("a"); a.href = link.url; a.target = "_blank"; a.rel = "noopener"; a.className = "btn-link"; a.textContent = link.label; box.appendChild(a); }
  if (detail) { const d = document.createElement("div"); d.className = "help-detail"; d.textContent = "รายละเอียด: " + detail; box.appendChild(d); }
  box.hidden = false;
  box.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function codeOf(e) {
  const m = String((e && e.message) || e);
  if (HELP[m]) return m;
  if (/auth|unauthor/i.test(m)) return "AUTH";
  return "UNKNOWN";
}

async function run(name, fn, helpCode) {
  const btns = document.querySelectorAll("button[data-act]");
  btns.forEach((b) => (b.disabled = true));
  $("help").hidden = true;
  log(name + " ...");
  try { await fn(); log(name + " เสร็จแล้ว"); }
  catch (e) { log(name + " ล้มเหลว: " + (e && e.message)); showHelp(helpCode || codeOf(e), String((e && e.message) || e)); }
  finally { btns.forEach((b) => (b.disabled = false)); }
}

function human(kb) {
  if (kb >= 1048576) return (kb / 1048576).toFixed(1) + " GB";
  if (kb >= 1024) return (kb / 1024).toFixed(0) + " MB";
  return kb + " KB";
}

async function count(dir, pattern) {
  const r = await adb.sh(pattern
    ? `find ${dir} -type f -name '${pattern}' 2>/dev/null | wc -l`
    : `find ${dir} -type f 2>/dev/null | wc -l`);
  return parseInt(r.out.trim(), 10) || 0;
}
async function sizeKb(dir, pattern) {
  const r = await adb.sh(pattern
    ? `find ${dir} -type f -name '${pattern}' -exec du -k {} + 2>/dev/null | awk '{s+=$1} END {print s+0}'`
    : `du -sk ${dir} 2>/dev/null | cut -f1`);
  return parseInt(r.out.trim(), 10) || 0;
}

async function refresh() {
  const model = (await adb.sh("getprop ro.product.model")).out.trim();
  $("model").textContent = model || "ไม่ทราบรุ่น";
  const df = (await adb.sh("df -k /sdcard | tail -1")).out.trim().split(/\s+/);
  const total = parseInt(df[1], 10), used = parseInt(df[2], 10);
  if (total) {
    const pct = Math.round((used / total) * 100);
    $("used").textContent = human(used);
    $("total").textContent = "จาก " + human(total);
    const bar = $("bar"); bar.style.width = pct + "%"; bar.className = pct > 85 ? "bar bad" : pct > 70 ? "bar warn" : "bar";
  }
  $("cSuccess").textContent = "กำลังนับ...";
  $("cTrash").textContent = "กำลังนับ...";
  $("cFail").textContent = "กำลังนับ...";
  const [cs, ss] = [await count(SUCCESS), await sizeKb(SUCCESS)];
  $("cSuccess").textContent = cs.toLocaleString() + " ไฟล์ · " + human(ss);
  const [ct, st] = [await count("/sdcard", ".trashed-*"), await sizeKb("/sdcard", ".trashed-*")];
  $("cTrash").textContent = ct.toLocaleString() + " ไฟล์ · " + human(st);
  const [cf, sf] = [await count(FAIL), await sizeKb(FAIL)];
  $("cFail").textContent = cf.toLocaleString() + " ไฟล์ · " + human(sf);
}

async function deleteDirContents(dir) {
  // find -delete avoids "argument list too long" that rm -rf dir/* hits with tens of thousands of files
  // Folder may not exist yet on a freshly reset device: nothing to delete is not an error
  const r = await adb.sh(`[ -d ${dir} ] || exit 0; find ${dir} -type f -delete`);
  if (r.code) throw new Error(r.err || "delete failed");
}
async function deleteTrash() {
  const r = await adb.sh(`find /sdcard -type f -name '.trashed-*' -delete`);
  if (r.code) throw new Error(r.err || "delete failed");
}
function freedNote(before) { return adb.sh("df -k /sdcard | tail -1").then((o) => { const used = parseInt(o.out.trim().split(/\s+/)[2], 10); if (before && used) log("ได้พื้นที่คืน " + human(Math.max(0, before - used))); }); }
async function usedNow() { const o = await adb.sh("df -k /sdcard | tail -1"); return parseInt(o.out.trim().split(/\s+/)[2], 10) || 0; }

function confirmBox(text, word) {
  return new Promise((resolve) => {
    const dlg = $("dlg"); $("dlgText").textContent = text;
    const inp = $("dlgInput"); inp.value = ""; inp.hidden = !word; inp.placeholder = word ? `พิมพ์ ${word} เพื่อยืนยัน` : "";
    dlg.hidden = false;
    const done = (v) => { dlg.hidden = true; $("dlgOk").onclick = $("dlgNo").onclick = null; resolve(v); };
    $("dlgNo").onclick = () => done(false);
    $("dlgOk").onclick = () => { if (word && inp.value.trim().toUpperCase() !== word) { inp.focus(); return; } done(true); };
  });
}

const actions = {
  connect: () => run("เชื่อมต่อเครื่อง", async () => { const r = await adb.connect(); log("เชื่อมต่อ " + r.serial); $("app").hidden = false; $("status").textContent = "เชื่อมต่อแล้ว"; $("status").className = "pill ok"; await refresh(); }),
  refresh: () => run("อัปเดตตัวเลข", refresh),
  success: () => run("ลบรูป success", async () => { if (!(await confirmBox("ลบรูปทั้งหมดในโฟลเดอร์ success (ข้ามถังขยะ ลบถาวร)"))) return; const b = await usedNow(); await deleteDirContents(SUCCESS); await freedNote(b); await refresh(); }),
  trash: () => run("ลบขยะ", async () => { if (!(await confirmBox("ลบไฟล์ขยะ .trashed- ทั้งเครื่อง (ลบถาวร)"))) return; const b = await usedNow(); await deleteTrash(); await freedNote(b); await refresh(); }),
  all: () => run("ลบทั้งหมด", async () => { if (!(await confirmBox("ลบรูป success และไฟล์ขยะ ทั้งหมด (ลบถาวร)"))) return; const b = await usedNow(); await deleteDirContents(SUCCESS); await deleteTrash(); await freedNote(b); await refresh(); }),
  fail: () => run("ลบ fail", async () => { if (!(await confirmBox("รูปใน fail น่าจะยังไม่ถูกอัปโหลด ลบแล้วกู้คืนไม่ได้ ตรวจกับหัวหน้าแล้วหรือยัง", "DELETE"))) return; const b = await usedNow(); await deleteDirContents(FAIL); await freedNote(b); await refresh(); }),
  cache: () => run("ล้างแคชแอป", async () => { const b = await usedNow(); const r = await adb.sh("pm trim-caches 999G"); log(r.out + r.err); await freedNote(b); await refresh(); }),
  apk: () => $("apkFile").click(),
  wall: () => $("wallFile").click(),
  reset: () => run("รีเซ็ตเครื่อง", async () => {
    if (!(await confirmBox("รีเซ็ตเครื่องจะลบข้อมูลทุกอย่างในเครื่อง กู้คืนไม่ได้ และต้องติดตั้ง Flash Kit ใหม่", "RESET"))) return;
    if (!(await confirmBox("ยืนยันอีกครั้ง: ลบข้อมูลทั้งเครื่องจริงๆ ใช่ไหม", "YES"))) return;
    const r = await adb.sh("am broadcast -a android.intent.action.FACTORY_RESET -p android");
    log(r.out + r.err);
    if (r.code || /Permission Denial|Exception|not allowed/i.test(r.out + r.err)) throw new Error("reset blocked");
  }, "RESET")
};

async function installApk(file) {
  await run("ติดตั้ง " + file.name, async () => {
    const tmp = "/data/local/tmp/k3s-tool.apk";
    await adb.pushFile(file, tmp, (p) => log("ส่งไฟล์ " + Math.round(p * 100) + "%"));
    const r = await adb.sh(`pm install -r ${tmp}`);
    log(r.out + r.err);
    await adb.sh(`rm -f ${tmp}`);
    if (!/Success/i.test(r.out)) throw new Error(r.out + r.err || "install failed");
  }, "INSTALL");
}

async function setWallpaper(file) {
  await run("ส่งรูปเข้าเครื่อง", async () => {
    const dest = "/sdcard/Download/k3s-wallpaper-" + Date.now() + ".jpg";
    await adb.pushFile(file, dest, (p) => log("ส่งไฟล์ " + Math.round(p * 100) + "%"));
    await adb.sh(`am broadcast -a android.intent.action.MEDIA_SCANNER_SCAN_FILE -d file://${dest}`);
    // Best effort: opens the system "set as wallpaper" screen on the device. User may still need to tap once.
    const r = await adb.sh(`am start -a android.intent.action.ATTACH_DATA -d file://${dest} -t image/* --grant-read-uri-permission`);
    log(r.out + r.err);
    throw new Error("wallpaper manual step");
  }, "WALLPAPER");
}

window.addEventListener("DOMContentLoaded", () => {
  document.querySelectorAll("button[data-act]").forEach((b) => b.addEventListener("click", () => actions[b.dataset.act]()));
  $("apkFile").addEventListener("change", (e) => { const f = e.target.files[0]; e.target.value = ""; if (f) installApk(f); });
  $("wallFile").addEventListener("change", (e) => { const f = e.target.files[0]; e.target.value = ""; if (f) setWallpaper(f); });
  if (!adb.hasWebUsb()) showHelp("NO_WEBUSB");
});
