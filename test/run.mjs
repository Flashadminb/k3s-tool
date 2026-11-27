// End-to-end check of the page against a fake device. Run: node test/run.mjs
// Shell commands really run (with dash, close to Android's sh) on a fake /sdcard in a temp folder.
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)("playwright"); // globally installed in CI image; or npm i -D playwright
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync, chmodSync, symlinkSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import http from "node:http";

const ROOT = mkdtempSync(join(tmpdir(), "k3s-"));
const SD = join(ROOT, "sdcard"), BIN = join(ROOT, "bin"), TMP = join(ROOT, "tmp");
// Like Android, /sdcard is a symlink to the real storage folder (find must be told to follow it)
mkdirSync(join(ROOT, "storage")); symlinkSync(join(ROOT, "storage"), SD);
const put = (p, kb) => { mkdirSync(join(p, ".."), { recursive: true }); writeFileSync(p, Buffer.alloc(kb * 1024, 1)); };
put(join(SD, "DCIM/Camera/IMG_001.jpg"), 200); put(join(SD, "DCIM/Camera/VID_002.mp4"), 900);
put(join(SD, "camera&muxer/scan 1.jpg"), 180); put(join(SD, "camera&muxer/scan 2.JPG"), 180); put(join(SD, "camera&muxer/notes.txt"), 1);
put(join(SD, "Pictures/Screenshots/s.png"), 50);
put(join(SD, "Android/data/some.app/cache/thumb.jpg"), 10);
put(join(SD, "Documents/fk/imagePath/success/q9.jpg"), 20);   // a new model keeping Flash Kit photos elsewhere
for (let i = 0; i < 60; i++) put(join(SD, "imagePath/success", `2026112${i % 3}`, `img${i}.jpg`), 40);
for (let i = 0; i < 5; i++) put(join(SD, "imagePath/fail", `bad ${i}'s.jpg`), 30);   // spaces + quote in names
for (let i = 0; i < 3; i++) put(join(SD, "DCIM", `.trashed-1700-${i}.jpg`), 100);
put(join(SD, "Download/big video.mp4"), 3000);
mkdirSync(BIN, { recursive: true }); mkdirSync(TMP, { recursive: true });

const stub = (name, body) => { writeFileSync(join(BIN, name), "#!/bin/sh\n" + body + "\n"); chmodSync(join(BIN, name), 0o755); };
stub("getprop", `OLD=; [ "$SERIAL" = TESTSERIAL003 ] && OLD=1
case "$1" in ro.product.model) [ "$SERIAL" = TESTSERIAL002 ] && echo Q9 || { [ -n "$OLD" ] && echo "95W Series" || echo K3S; };; ro.product.manufacturer) echo Urovo;; ro.build.version.release) [ -n "$OLD" ] && echo 6.0 || echo 11;; ro.build.version.sdk) [ -n "$OLD" ] && echo 23 || echo 30;; esac`);
// TESTSERIAL003 plays an Android 6 device: no cmd, no find, no xargs, toolbox df ("11.6G 2.1G ..." and no -k)
stub("find", `[ "$SERIAL" = TESTSERIAL003 ] && { echo "sh: find: not found" >&2; exit 127; }; exec /usr/bin/find "$@"`);
stub("xargs", `[ "$SERIAL" = TESTSERIAL003 ] && { echo "sh: xargs: not found" >&2; exit 127; }; exec /usr/bin/xargs "$@"`);
stub("df", `if [ "$SERIAL" = TESTSERIAL003 ]; then [ "$1" = -k ] && { echo "df: Unknown option 'k'" >&2; exit 1; }; printf 'Filesystem               Size     Used     Free   Blksize\n%s     11.6G     2.1G     9.5G   4096\n' "$1"; else exec /usr/bin/df "$@"; fi`);
stub("dumpsys", `case "$1" in
 battery) printf '  AC powered: false\\n  USB powered: true\\n  status: 2\\n  health: 2\\n  level: 76\\n  temperature: 312\\n';;
 package) if [ "$2" = com.android.settings ]; then printf 'Activity Resolver Table:\\n  Non-Data Actions:\\n      android.intent.action.MAIN:\\n        abc com.android.settings/.Settings filter\\n        abd com.android.settings/.Settings$WifiSettingsActivity filter\\n        abe com.android.settings/.network.NetworkProviderSettings filter\\n        abf com.android.settings/.FallbackHome filter\\n        abg com.android.settings/.SubSettings filter\\n        abh com.android.settings/.Settings$AppInfoActivity filter\\n\\nReceiver Resolver Table:\\n        abi com.android.settings/.SomeReceiver filter\\n'; else echo "    versionName=1.2.$RANDOM"; fi;;
 device_policy) echo "  Device Owner: admin=ComponentInfo{com.mdm.agent/com.mdm.agent.Admin} package=com.mdm.agent";;
 power) [ -f "${join(ROOT, "awake-")}$SERIAL" ] && echo "  mWakefulness=Awake" || echo "  mWakefulness=Asleep";;
esac`);
stub("svc", `echo "svc $*" >> "${join(ROOT, "calls.log")}"`);
stub("pm", `S="$PMSTATE"; touch "$S"
case "$1" in
 list) all="com.flashexpress.kit com.zhiliaoapp.musically com.mdm.agent jp.naver.line.android"; sys="com.android.settings com.android.chrome com.oem.bloat"
   case "$*" in *" -d"*) [ -f "$S.dis" ] && sed 's/^/package:/' "$S.dis"; exit 0;; *"-3"*) l="$all";; *"-s -u"*) l="$sys";; *"-s"*) l="$sys";; *) l="$all $sys";; esac
   for p in $l; do grep -qx "$p" "$S" && [ "$*" != "list packages -s -u" ] && continue; echo "package:$p"; done;;
 uninstall) p=$(eval echo \\$$#); [ "$p" = com.mdm.agent ] && { echo "Failure [DELETE_FAILED_DEVICE_POLICY_MANAGER]"; exit 1; }; echo "$p" >> "$S"; echo Success;;
 install-existing) echo "Package $2 installed for user: 0";;
 disable-user) p=$(eval echo \\$$#); echo "$p" >> "$S.dis"; echo "Package $p new state: disabled-user";;
 disable) p=$(eval echo \\$$#); echo "$p" >> "$S.comp"; echo "Component {$p} new state: disabled";;
 enable) p=$(eval echo \\$$#); touch "$S.dis" "$S.comp"; grep -vx "$p" "$S.dis" > "$S.dis.n"; mv "$S.dis.n" "$S.dis"; grep -vxF "$p" "$S.comp" > "$S.comp.n"; mv "$S.comp.n" "$S.comp"; echo "Package $p new state: enabled";;
 install) echo Success;;
 trim-caches) ;;
esac`);
stub("cmd", `[ "$SERIAL" = TESTSERIAL003 ] && { echo "sh: cmd: not found" >&2; exit 127; }
[ "$1" = package ] && [ "$2" = install-existing ] && { grep -vx "$3" "$PMSTATE" > "$PMSTATE.n"; mv "$PMSTATE.n" "$PMSTATE"; echo "Package $3 installed for user: 0"; }
if [ "$2" = query-activities ]; then
  case "$*" in *category.HOME*) echo "com.oem.home/.Home"; exit 0;; esac
  for p in com.flashexpress.kit jp.naver.line.android com.android.chrome com.android.settings; do grep -qx "$p" "$PMSTATE.dis" 2>/dev/null || echo "$p/.Main"; done
fi
if [ "$1" = wifi ]; then
  echo "cmd $*" >> "${join(ROOT, "calls.log")}"
  W="${join(ROOT, "wifi-")}$SERIAL"
  case "$2" in
    status) [ -f "$W" ] && printf 'Wifi is enabled\\nWifi is connected to "%s"\\n' "$(cat "$W")" || printf 'Wifi is enabled\\nWifi is not connected\\n';;
    connect-network) [ "$3" = OldAndroid ] && { echo "Security exception: Uid 2000 does not have access to wifi commands" >&2; exit 255; }; echo "$3" > "$W"; echo "Connection initiated";;
    list-scan-results) printf '    BSSID              Frequency      RSSI           Age(sec)     SSID                                 Flags\\n  a4:12:42:00:11:22       2437        -48             2.1         Flash-BPL                            [WPA2-PSK-CCMP][ESS]\\n  b8:27:eb:10:20:30       2462        -79             4.0         Guest Room                           [ESS]\\n';;
  esac
fi`);
stub("screencap", `cp "${join(ROOT, "shot.png")}" "$2"`);
stub("screenrecord", `echo fake > "$3"`);
for (const c of ["am", "monkey", "settings"]) stub(c, `echo "$0 $*" >> "${join(ROOT, "calls.log")}"`);
stub("input", `echo "input $*" >> "${join(ROOT, "calls.log")}"; [ "$2" = 224 ] && touch "${join(ROOT, "awake-")}$SERIAL"; true`);
stub("content", `echo "Row: 0 _id=42"`);
stub("logcat", `echo "11-27 10:00:00.000 I/Test: hello"`);
// 1x1 png
writeFileSync(join(ROOT, "shot.png"), Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64"));

const map = (s) => s.replaceAll("/sdcard", SD).replaceAll("/data/local/tmp", TMP);
const unmap = (s) => s.replaceAll(SD, "/sdcard").replaceAll(TMP, "/data/local/tmp");
const shell = (serial, cmd) => {
  const r = spawnSync("dash", ["-c", map(cmd)], { encoding: "utf8", env: { ...process.env, PATH: BIN + ":" + process.env.PATH, PMSTATE: join(ROOT, "pm-" + serial), SERIAL: serial } });
  return { out: unmap(r.stdout), err: unmap(r.stderr), code: r.status };
};

const html = readFileSync(new URL("../dist/test.html", import.meta.url));
const srv = http.createServer((q, s) => { s.setHeader("content-type", "text/html; charset=utf-8"); s.end(html); }).listen(0);
const url = `http://localhost:${srv.address().port}/`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
await page.exposeFunction("__sh", shell);
await page.exposeFunction("__push", (s, p, bytes) => { writeFileSync(map(p), Buffer.from(bytes)); });
await page.exposeFunction("__pull", (s, p) => Array.from(readFileSync(map(p))));
await page.goto(url);

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log("  ok  " + m); } else { fail++; console.log("  FAIL " + m); } };
const idle = () => page.waitForFunction(() => document.getElementById("busy").hidden, null, { timeout: 30000 });
const click = async (act) => { await page.click(`button[data-act=${act}]`); };
const accept = async () => { await page.waitForSelector("#dlg:not([hidden])"); await page.click("#dlgOk"); };
const trashCount = () => execFileSync("sh", ["-c", `find -H "${SD}" -type f -name '.trashed-*' | wc -l`]).toString().trim();
const count = (d) => existsSync(join(SD, d)) ? execFileSync("sh", ["-c", `find "${join(SD, d)}" -type f | wc -l`]).toString().trim() : "missing";

console.log("first visit");
ok(await page.isVisible("#tab-guide"), "first visit opens the setup guide");
await page.click("button[data-tab=data]");

console.log("connect + counts");
await click("connect"); await idle();
await page.waitForFunction(() => !document.getElementById("cSuccess").textContent.includes("กำลัง"));
ok((await page.textContent("#cSuccess")).startsWith("60 ไฟล์"), "success count = 60: " + await page.textContent("#cSuccess"));
ok((await page.textContent("#cFail")).startsWith("5 ไฟล์"), "fail count = 5");
ok((await page.textContent("#cTrash")).startsWith("3 ไฟล์"), "trash count = 3");
ok((await page.$$("#devices .satw")).length === 1, "device appears as a satellite");
ok((await page.textContent("#devCard")).includes("K3S"), "device card shows the model");

console.log("screen off: wake + ask to keep on");
await page.waitForSelector(".sat-tag.wake");
await page.click(".sat-tag.wake"); await accept(); await idle();
let calls0 = readFileSync(join(ROOT, "calls.log"), "utf8");
ok(calls0.includes("input keyevent 224") && calls0.includes("svc power stayon usb"), "screen woken and kept on after confirm");
ok(!(await page.isVisible(".sat-tag.wake")), "screen-off tag gone");

console.log("find this device");
await click("findDev"); await idle();
ok((await page.textContent("#log")).includes("เปิดจอแล้ว"), "find button wakes the device");

console.log("Flash Kit check");
ok(await page.isVisible("#flashNeed"), "old Flash Kit version flagged at the hub");
// the download site is replaced by a fake APK so the one-click flow can be checked end to end
await page.evaluate(() => { const b = new Uint8Array(600000); b[0] = 0x50; b[1] = 0x4b; window.fetch = async () => new Response(new Blob([b])); });
await click("flashNeed"); await accept();
await page.waitForFunction(() => /ติดตั้ง FlashKit\.apk (สำเร็จ|ล้มเหลว)|ใช้วิธีให้ Chrome/.test(document.getElementById("log").textContent), null, { timeout: 20000 }).catch(() => {});
await idle();
const flLog = await page.textContent("#log");
ok(flLog.includes("ติดตั้ง FlashKit.apk สำเร็จ"), "one click: Flash Kit downloaded and installed" + (flLog.includes("สำเร็จ") ? "" : "\n" + flLog.slice(0, 600)));
ok((await page.textContent(".satw")).includes("ติดตั้งแล้ว"), "circle shows the install finished");

console.log("delete success");
await click("success"); await accept(); await idle();
ok(count("imagePath/success") === "0", "success folder emptied");
ok((await page.textContent(".satw")).includes("ลบเสร็จ"), "circle shows the delete finished");
ok(existsSync(join(SD, "imagePath/success")), "success folder itself kept");
ok(count("imagePath/fail") === "5", "fail untouched");

console.log("cancel does nothing");
await click("trash"); await page.waitForSelector("#dlg:not([hidden])"); await page.click("#dlgNo"); await idle();
ok(trashCount() === "3", "trash kept after cancel");

console.log("fail: confirm only, no typing");
await click("fail"); await page.waitForSelector("#dlg:not([hidden])");
ok(await page.isHidden("#dlgInput"), "no DELETE text box");
await page.click("#dlgOk"); await idle();
ok(count("imagePath/fail") === "0", "fail emptied (names with spaces and quotes)");

console.log("delete all on a fresh device (folders missing)");
execFileSync("rm", ["-rf", join(SD, "imagePath")]);
for (let i = 0; i < 2; i++) put(join(SD, "DCIM", `.trashed-x${i}.jpg`), 10);
await click("all"); await accept(); await idle();
ok(trashCount() === "0", "trash deleted by delete-all");
ok(count("DCIM/Camera") === "2", "camera photos are not touched by delete-all");
ok(!(await page.isVisible("#help")), "missing folders are not an error");

console.log("history");
await page.click("button[data-tab=records]");
const rows = await page.$$eval("#histTable tr", (t) => t.length);
ok(rows === 3, "3 history rows: " + rows);
ok((await page.textContent("#regTable")).includes("TESTSERIAL001"), "device registry has the device");
const [csv] = await Promise.all([page.waitForEvent("download"), click("histCsv")]);
ok(readFileSync(await csv.path(), "utf8").startsWith("﻿เวลา"), "history CSV has BOM + Thai header");

console.log("big files");
await page.click("button[data-tab=data]");
await click("bigFiles"); await idle();
ok((await page.textContent("#bigList")).includes("big video.mp4"), "big file listed");

console.log("other photos (Camera, camera&muxer, Pictures)");
await page.click("button[data-tab=files]");
await page.waitForFunction(() => document.getElementById("fbList").textContent.length > 0, null, { timeout: 20000 }); await idle();
ok((await page.textContent("#fbList")).includes("DCIM"), "Files menu opens the device storage by itself");
await click("otherScan"); await idle();
const other = await page.textContent("#otherList");
ok(other.includes("DCIM/Camera") && other.includes("camera&muxer") && other.includes("Pictures/Screenshots"), "media folders listed");
ok(!other.includes("Android") && !other.includes("imagePath"), "Android/ and Flash Kit folders not listed");
await page.check('#otherList input[data-dir$="camera&muxer"]');
await click("otherDelete"); await accept(); await idle();
ok(count("camera&muxer") === "1" && existsSync(join(SD, "camera&muxer/notes.txt")), "only photos removed from the ticked folder");
ok(count("DCIM/Camera") === "2", "unticked folder kept");

console.log("file manager");
await click("fbOpen"); await idle();   // back to the top folder
const fb = await page.textContent("#fbList");
ok(fb.includes("DCIM") && fb.includes("Download") && fb.includes("Android"), "top folders listed");
ok(!(await page.$('#fbList input[data-path$="/Android"]')), "Android folder cannot be ticked");
await page.click('#fbList .item:has-text("DCIM") button'); await idle();
ok((await page.textContent("#fbList")).includes("Camera") && (await page.textContent("#fbPath")).includes("/DCIM"), "opened a folder");
await click("fbUp"); await idle();
await page.check('#fbList input[data-path$="/Download"]');
await click("fbDelete"); await accept(); await idle();
ok(!existsSync(join(SD, "Download")), "ticked folder deleted with everything in it");
ok(existsSync(join(SD, "Android/data/some.app/cache/thumb.jpg")), "Android data untouched");

console.log("device info");
await page.click("button[data-tab=device]");
const info = await page.textContent("#infoGrid");
ok(info.includes("76%") && info.includes("ดี") && info.includes("com.flashexpress.kit"), "battery + flash app shown");
const [shot] = await Promise.all([page.waitForEvent("download"), click("screenshot")]); await idle();
ok(shot.suggestedFilename().endsWith(".png"), "screenshot downloaded");
const [lg] = await Promise.all([page.waitForEvent("download"), click("logcat")]); await idle();
ok(readFileSync(await lg.path(), "utf8").includes("hello"), "logcat downloaded");

console.log("apps");
await page.click("button[data-tab=apps]");
ok((await page.textContent("#bannedFound")).includes("TikTok"), "banned TikTok detected on connect");
await page.waitForFunction(() => document.getElementById("appCount").textContent.includes("ทั้งหมด"), null, { timeout: 30000 }); await idle();
const list = await page.textContent("#appList");
ok(list.includes("LINE") && list.includes("com.android.settings"), "opening Apps loads every app, system apps included");
ok((await page.textContent("#appCount")).includes("ทั้งหมด 7 แอป"), "app count shown: " + await page.textContent("#appCount"));
ok(await page.$$eval("#appList .item", (els) => els.some((e) => e.textContent.includes("com.mdm.agent") && e.textContent.includes("ห้ามถอน") && !e.querySelector("button.red"))), "MDM app protected (no uninstall button)");
ok(await page.$$eval("#appList .item", (els) => els.some((e) => e.textContent.includes("com.flashexpress.kit") && !e.querySelector("button.red"))), "Flash app protected");
await page.click("#bannedFound button.red"); await accept(); await idle();
ok((await page.textContent("#bannedFound")).includes("ไม่เจอแอปต้องห้าม"), "banned app removed");
await page.check("#showSys");
await page.click('#appList .item:has-text("com.oem.bloat") button.red'); await accept(); await idle();
ok((await page.textContent("#hiddenList")).includes("com.oem.bloat"), "system app hidden, shown in restore list");
await page.click('#hiddenList .item:has-text("com.oem.bloat") button'); await idle();
ok(!(await page.textContent("#hiddenList")).includes("com.oem.bloat"), "system app restored");

console.log("field lock (โหมดออกงาน)");
const lockText = await page.textContent("#lockList");
ok(lockText.includes("LINE") && lockText.includes("Chrome"), "lock plan lists apps with an icon");
ok(await page.$eval('#lockList label:has-text("แอป Flash") input', (c) => !c.checked && c.disabled), "Flash Kit is never switched off");
ok(await page.$eval('#lockList label:has-text("Settings") input', (c) => !c.checked), "Settings stays on by default");
await click("lockApply"); await accept(); await idle();
const dis = () => (existsSync(join(ROOT, "pm-TESTSERIAL001.dis")) ? readFileSync(join(ROOT, "pm-TESTSERIAL001.dis"), "utf8") : "");
ok(dis().includes("jp.naver.line.android") && dis().includes("com.android.chrome") && !dis().includes("flash") && !dis().includes("com.android.settings"), "lock: LINE and Chrome off, Flash Kit and Settings untouched");
ok(await page.isVisible(".sat-tag.lock"), "device circle tagged as locked");
// unlocking from another computer/phone: this browser's memory is wiped, the list kept on the device is used
await page.evaluate(() => { for (const k of Object.keys(localStorage)) if (k.includes("locked:")) localStorage.removeItem(k); localStorage.removeItem("k3s-tool:fieldLock"); });
await click("lockRelease"); await idle();
ok(dis().trim() === "", "unlock from a different browser: every app back on (list read from the device)");
// experimental: Settings off except its Wi-Fi screens
const comp = () => (existsSync(join(ROOT, "pm-TESTSERIAL001.comp")) ? readFileSync(join(ROOT, "pm-TESTSERIAL001.comp"), "utf8") : "");
await page.check("#lockSettingsWifi");
await click("lockApply"); await accept(); await idle();
const c1 = comp();
ok(c1.includes("com.android.settings/.Settings\n") && c1.includes(".SubSettings") && c1.includes("AppInfoActivity"), "Settings screens switched off");
ok(!c1.includes("Wifi") && !c1.includes("NetworkProvider") && !c1.includes("FallbackHome") && !c1.includes("Receiver"), "Wi-Fi screens, start-up screen and non-screens kept");
await page.evaluate(() => { for (const k of Object.keys(localStorage)) if (k.includes("locked:")) localStorage.removeItem(k); });
await click("lockRelease"); await idle();
ok(comp().trim() === "" && dis().trim() === "", "unlock: Settings screens and apps all back");
await page.uncheck("#lockSettingsWifi");
// device locked, then factory reset (all apps back on, lock list on the device gone), then plugged in again
await click("lockApply"); await accept(); await idle();
ok(dis().includes("jp.naver.line.android"), "locked again before the simulated reset");
writeFileSync(join(ROOT, "pm-TESTSERIAL001.dis"), ""); rmSync(join(TMP, "idata-tools-locked.txt"), { force: true });
await page.click("button[data-tab=device]");
await click("reboot"); await accept(); await idle();
await page.waitForFunction(() => !document.querySelector("#devices .satw"), null, { timeout: 10000 });
await page.evaluate(() => { window.__pick = "TESTSERIAL001"; });
await click("connect"); await idle();
await page.waitForFunction(() => document.getElementById("log").textContent.includes("อาจถูกรีเซ็ต"), null, { timeout: 20000 }).catch(() => {});
ok((await page.textContent("#log")).includes("อาจถูกรีเซ็ต") && (await page.textContent("#help")).includes("เคยล็อกออกงานไว้"), "lock lost after a reset is reported on connect");
ok((await page.textContent(".satw")).includes("หลุดล็อก"), "circle tagged as lock lost");
await page.evaluate(() => { document.getElementById("help").hidden = true; });
await page.click("button[data-tab=apps]");

console.log("settings");
await page.click("button[data-tab=setup]");
await click("stdApply"); await accept(); await idle();
const calls = readFileSync(join(ROOT, "calls.log"), "utf8");
ok(calls.includes("put system screen_off_timeout 300000") && calls.includes("window_animation_scale 0"), "standard settings sent");

console.log("type text into the device (iLauncher password etc.)");
await page.click("button[data-tab=device]");
await page.fill("#typeText", "ab cd"); await click("typeSend"); await idle();
calls0 = readFileSync(join(ROOT, "calls.log"), "utf8");
ok(calls0.includes("input text ab%scd") && calls0.includes("input keyevent 66"), "text typed with Enter");

console.log("second device + group");
await page.click("button[data-tab=data]");
await click("connect"); await idle();
ok((await page.$$("#devices .satw")).length === 2, "2 satellites");
// picking a device that is already connected in the browser popup: no second "Allow", it just gets selected
await page.evaluate(() => { window.__pick = "TESTSERIAL001"; window.__authDelay = 3000; });
await click("connect"); await idle();
ok((await page.textContent("#log")).includes("เชื่อมต่ออยู่แล้ว") && (await page.$$("#devices .satw")).length === 2 && await page.isHidden("#authWait"), "already-connected device is selected, not re-authorised");
await page.evaluate(() => { window.__authDelay = 0; });
ok((await page.textContent("#log")).includes("เรียนรู้รุ่นใหม่: Q9") && (await page.inputValue('#profTable tr:last-child td:nth-child(3) input')).includes("/sdcard/Documents/fk/imagePath/success"), "new model learned: photo folder found and saved");
await page.click("#selTool"); await page.click("#selAll");
ok((await page.textContent("#status")).includes("กลุ่ม 2"), "status shows the group");
ok((await page.$$("#links path")).length === 1, "gold line joins the group");
await page.click("#selDone");
ok((await page.textContent("#dockScope")).includes("รวม 2"), "dock shows totals for the group");

console.log("wallpaper to the group, then APK with the picker");
await page.click("button[data-tab=device]");
writeFileSync(join(ROOT, "w.jpg"), Buffer.alloc(2048, 7));
await page.setInputFiles("#wallFile", join(ROOT, "w.jpg")); await idle();
const wc = readFileSync(join(ROOT, "calls.log"), "utf8").split("CROP_AND_SET_WALLPAPER").length - 1;
ok(wc === 2, "group: wallpaper screen opened on both devices without asking: " + wc);
ok(await page.isVisible("#help.info"), "green 'tap once' guide shown");
ok(readdirSync(join(SD, "Pictures")).filter((f) => f.startsWith("k3s-wallpaper")).length === 2, "2 wallpapers pushed");
await page.click("#dcGroup button");
ok(!(await page.textContent("#status")).includes("กลุ่ม"), "group cleared");
writeFileSync(join(ROOT, "a.apk"), Buffer.alloc(1024, 1));
await page.setInputFiles("#apkFile", join(ROOT, "a.apk"));
await page.waitForSelector("#dlgList label");
ok((await page.$$("#dlgList input")).length === 3, "no group: picker lists 'all' + 2 devices");
await page.click("#dlgOk"); await idle();
ok((await page.textContent("#log")).includes("ติดตั้ง a.apk สำเร็จ") && !(await page.isVisible("#help:not(.info)")), "APK installed on the selected device");

console.log("Wi-Fi");
await page.click("button[data-tab=wifi]");
await click("wifiScan"); await idle();
ok((await page.textContent("#wifiScanList")).includes("Guest Room"), "scan lists networks (SSID with a space)");
await page.fill("#wfSsid", "Flash-BPL"); await page.fill("#wfPass", "pass word1"); await click("wifiAdd");
ok((await page.textContent("#wifiSaved")).includes("Flash-BPL"), "network saved");
await page.click("#wifiSaved button.blue"); await idle();
ok(readFileSync(join(ROOT, "calls.log"), "utf8").includes("connect-network Flash-BPL wpa2 pass word1"), "connect sent with the password");
ok((await page.textContent("#wifiNow")).includes("ต่ออยู่กับ Flash-BPL"), "status shows the new Wi-Fi");
// older Android: Wi-Fi commands are root-only, so the Wi-Fi screen is opened and the password typed on request
await page.fill("#wfSsid", "OldAndroid"); await page.fill("#wfPass", "abcdefgh"); await click("wifiAdd");
await page.click('#wifiSaved .item:has-text("OldAndroid") button.blue'); await idle();
ok(await page.isVisible("#help.info") && (await page.textContent("#help")).includes("แตะเลือก Wi-Fi เอง"), "older Android: guide instead of an error");
ok(readFileSync(join(ROOT, "calls.log"), "utf8").includes("android.settings.WIFI_SETTINGS"), "device Wi-Fi screen opened");
await page.click('#help button:has-text("พิมพ์รหัส")'); await idle();
ok(readFileSync(join(ROOT, "calls.log"), "utf8").includes("input text abcdefgh"), "saved password typed into the device");

console.log("one-click setup after a reset");
await page.evaluate(() => { document.getElementById("help").hidden = true; });
await page.click("button[data-tab=device]");
await click("setupAll"); await accept();
await page.waitForFunction(() => document.getElementById("log").textContent.includes("ตั้งเครื่องใหม่เสร็จ"), null, { timeout: 30000 }).catch(() => {}); await idle();
const su = readFileSync(join(ROOT, "calls.log"), "utf8");
ok((await page.textContent("#log")).includes("ตั้งเครื่องใหม่เสร็จ"), "one-click setup finished");
ok(su.split("screen_off_timeout").length > 2 && su.includes("connect-network OldAndroid"), "setup: standard settings + first saved Wi-Fi");
ok(await page.isVisible(".sat-tag.lock"), "setup: device field-locked");
await page.click("button[data-tab=apps]"); await click("lockRelease"); await idle();

console.log("old Android 6 device (95W Series)");
for (let i = 0; i < 7; i++) put(join(SD, "imagePath/success", `old${i}.jpg`), 40);
put(join(SD, "imagePath/success/sub/old-in-folder.jpg"), 40);
await page.click("button[data-tab=data]");
await click("connect"); await idle();
await page.click('#devices .satw:has-text("IAL003")');
await page.waitForFunction(() => !document.getElementById("cSuccess").textContent.includes("กำลัง"), null, { timeout: 20000 });
const card3 = await page.textContent("#devCard");
ok(card3.includes("95W Series") && !card3.includes("0 KB (0%)") && /2\.1 GB|2,1|GB/.test(card3), "Android 6 storage read from toolbox df: " + card3.replace(/\s+/g, " ").slice(0, 160));
ok((await page.textContent("#cSuccess")).startsWith("8 ไฟล์"), "Android 6 count without find = 8: " + await page.textContent("#cSuccess"));
ok((await page.textContent("#cTrash")).startsWith("0 ไฟล์"), "no trash search on Android 6");
await click("success"); await accept(); await idle();
ok(count("imagePath/success") === "0" && existsSync(join(SD, "imagePath/success")), "Android 6 delete without find/xargs: folder emptied, kept");
ok(!(await page.isVisible("#help:not(.info)")), "no error on Android 6 delete");
await page.click("button[data-tab=apps]");
await page.waitForFunction(() => document.getElementById("appCount").textContent.includes("ทั้งหมด"), null, { timeout: 30000 }); await idle();
ok(!(await page.textContent("#lockCount")).includes("จะปิด 0 แอป"), "Android 6 lock plan has apps without cmd: " + await page.textContent("#lockCount"));

console.log("mobile width");
await page.setViewportSize({ width: 375, height: 800 });
await page.waitForTimeout(400);
const wide = await page.evaluate(() => document.documentElement.scrollWidth <= 375 ? "" :
  [...document.querySelectorAll("body *")].filter((e) => e.getBoundingClientRect().right > 377 && !e.closest(".tabs")).slice(0, 6).map((e) => e.tagName + "." + e.className + "#" + e.id + ":" + Math.round(e.getBoundingClientRect().right)).join(", "));
ok(!wide, "no horizontal scroll at phone width " + wide);

ok(errors.length === 0, "no JS errors " + errors.join(" | "));
await page.screenshot({ path: join(ROOT, "page.png"), fullPage: true });
console.log(`\n${pass} passed, ${fail} failed · screenshot ${join(ROOT, "page.png")}`);
await browser.close(); srv.close();
process.exit(fail ? 1 : 0);
