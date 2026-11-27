// End-to-end check of the page against a fake device. Run: node test/run.mjs
// Shell commands really run (with dash, close to Android's sh) on a fake /sdcard in a temp folder.
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)("playwright"); // globally installed in CI image; or npm i -D playwright
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync, chmodSync, symlinkSync } from "node:fs";
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
for (let i = 0; i < 60; i++) put(join(SD, "imagePath/success", `2026112${i % 3}`, `img${i}.jpg`), 40);
for (let i = 0; i < 5; i++) put(join(SD, "imagePath/fail", `bad ${i}'s.jpg`), 30);   // spaces + quote in names
for (let i = 0; i < 3; i++) put(join(SD, "DCIM", `.trashed-1700-${i}.jpg`), 100);
put(join(SD, "Download/big video.mp4"), 3000);
mkdirSync(BIN, { recursive: true }); mkdirSync(TMP, { recursive: true });

const stub = (name, body) => { writeFileSync(join(BIN, name), "#!/bin/sh\n" + body + "\n"); chmodSync(join(BIN, name), 0o755); };
stub("getprop", `case "$1" in ro.product.model) echo K3S;; ro.product.manufacturer) echo Urovo;; ro.build.version.release) echo 11;; ro.build.version.sdk) echo 30;; esac`);
stub("dumpsys", `case "$1" in
 battery) printf '  AC powered: false\\n  USB powered: true\\n  status: 2\\n  health: 2\\n  level: 76\\n  temperature: 312\\n';;
 package) echo "    versionName=1.2.$RANDOM";;
 device_policy) echo "  Device Owner: admin=ComponentInfo{com.mdm.agent/com.mdm.agent.Admin} package=com.mdm.agent";;
 power) [ -f "${join(ROOT, "awake-")}$SERIAL" ] && echo "  mWakefulness=Awake" || echo "  mWakefulness=Asleep";;
esac`);
stub("svc", `echo "svc $*" >> "${join(ROOT, "calls.log")}"`);
stub("pm", `S="$PMSTATE"; touch "$S"
case "$1" in
 list) all="com.flashexpress.kit com.zhiliaoapp.musically com.mdm.agent jp.naver.line.android"; sys="com.android.settings com.android.chrome com.oem.bloat"
   case "$*" in *"-3"*) l="$all";; *"-s -u"*) l="$sys";; *"-s"*) l="$sys";; *) l="$all $sys";; esac
   for p in $l; do grep -qx "$p" "$S" && [ "$*" != "list packages -s -u" ] && continue; echo "package:$p"; done;;
 uninstall) p=$(eval echo \\$$#); [ "$p" = com.mdm.agent ] && { echo "Failure [DELETE_FAILED_DEVICE_POLICY_MANAGER]"; exit 1; }; echo "$p" >> "$S"; echo Success;;
 install-existing) echo "Package $2 installed for user: 0";;
 install) echo Success;;
 trim-caches) ;;
esac`);
stub("cmd", `[ "$1" = package ] && [ "$2" = install-existing ] && { grep -vx "$3" "$PMSTATE" > "$PMSTATE.n"; mv "$PMSTATE.n" "$PMSTATE"; echo "Package $3 installed for user: 0"; }
if [ "$1" = wifi ]; then
  echo "cmd $*" >> "${join(ROOT, "calls.log")}"
  W="${join(ROOT, "wifi-")}$SERIAL"
  case "$2" in
    status) [ -f "$W" ] && printf 'Wifi is enabled\\nWifi is connected to "%s"\\n' "$(cat "$W")" || printf 'Wifi is enabled\\nWifi is not connected\\n';;
    connect-network) echo "$3" > "$W"; echo "Connection initiated";;
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

console.log("Flash Kit check");
ok(await page.isVisible("#flashNeed"), "old Flash Kit version flagged at the hub");

console.log("delete success");
await click("success"); await accept(); await idle();
ok(count("imagePath/success") === "0", "success folder emptied");
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
await click("otherScan"); await idle();
const other = await page.textContent("#otherList");
ok(other.includes("DCIM/Camera") && other.includes("camera&muxer") && other.includes("Pictures/Screenshots"), "media folders listed");
ok(!other.includes("Android") && !other.includes("imagePath"), "Android/ and Flash Kit folders not listed");
await page.check('#otherList input[data-dir$="camera&muxer"]');
await click("otherDelete"); await accept(); await idle();
ok(count("camera&muxer") === "1" && existsSync(join(SD, "camera&muxer/notes.txt")), "only photos removed from the ticked folder");
ok(count("DCIM/Camera") === "2", "unticked folder kept");

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
await click("apps"); await idle();
const list = await page.textContent("#appList");
ok(list.includes("LINE") && !list.includes("com.android.settings"), "user apps listed, system hidden");
ok(await page.$$eval("#appList .item", (els) => els.some((e) => e.textContent.includes("com.mdm.agent") && e.textContent.includes("ห้ามถอน") && !e.querySelector("button.red"))), "MDM app protected (no uninstall button)");
ok(await page.$$eval("#appList .item", (els) => els.some((e) => e.textContent.includes("com.flashexpress.kit") && !e.querySelector("button.red"))), "Flash app protected");
await page.click("#bannedFound button.red"); await accept(); await idle();
ok((await page.textContent("#bannedFound")).includes("ไม่เจอแอปต้องห้าม"), "banned app removed");
await page.check("#showSys");
await page.click('#appList .item:has-text("com.oem.bloat") button.red'); await accept(); await idle();
ok((await page.textContent("#hiddenList")).includes("com.oem.bloat"), "system app hidden, shown in restore list");
await page.click('#hiddenList .item:has-text("com.oem.bloat") button'); await idle();
ok(!(await page.textContent("#hiddenList")).includes("com.oem.bloat"), "system app restored");

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
