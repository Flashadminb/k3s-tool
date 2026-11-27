// In-browser fake devices for the design preview (no USB). Numbers are made up and the page says so.
// 15 serials so the orbit layout can be tried with a full USB hub.
window.__serials = Array.from({ length: 15 }, (_, i) => String(4660067 + i * 97));
const state = {};
let made = 0;
const st = (s) => (state[s] ||= (() => {
  const i = made++;
  return {
    total: 52428800, base: 6800000 + Math.round(Math.random() * 4e6),
    success: [8000 + Math.round(Math.random() * 30000), 0], fail: [Math.round(Math.random() * 40), 0], trash: [Math.round(Math.random() * 9000), 0],
    level: [82, 46, 14, 67, 95, 33, 58, 8, 71, 39, 88, 22, 61, 77, 50][i % 15],
    awake: i % 4 !== 2,                      // every 4th device starts with its screen off
    flash: i === 3 ? "" : i === 1 ? "8.1.0" : "8.2.65",
    wifi: i % 5 === 4 ? "" : "Flash-BPL"
  };
})());
const kb = (o) => { o.success[1] = o.success[0] * 310; o.fail[1] = o.fail[0] * 300; o.trash[1] = o.trash[0] * 520; };
const used = (o) => (kb(o), o.base + o.success[1] + o.fail[1] + o.trash[1]);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
window.__sh = async (serial, cmd) => {
  const o = st(serial); const R = (out) => ({ out, err: "", code: 0 });
  await wait(80 + Math.random() * 180);
  if (cmd.includes("getprop ro.product.model")) return R("K3S\n");
  if (cmd.includes("ro.product.manufacturer")) return R("iData\n");
  if (cmd.includes("ro.build.version.release")) return R("12\n");
  if (cmd.includes("ro.build.version.sdk")) return R("31\n");
  if (cmd.startsWith("df")) return R(`/dev/fuse ${o.total} ${used(o)} ${o.total - used(o)} 0% /storage/emulated\n`);
  if (cmd.includes("-delete")) {
    await wait(1200);
    const k = cmd.includes(".trashed") ? "trash" : cmd.includes("/fail") ? "fail" : "success";
    const n = o[k][0]; o[k][0] = 0; return R(n + "\n");
  }
  if (cmd.includes("awk")) { await wait(500); kb(o); return R(`${o.success[0]} ${o.success[1]}\n${o.fail[0]} ${o.fail[1]}\n${o.trash[0]} ${o.trash[1]}\n`); }
  if (cmd.includes("dumpsys power")) return R(`  mWakefulness=${o.awake ? "Awake" : "Asleep"}\n  level: ${o.level}\n`);
  if (cmd.includes("input keyevent 224")) { o.awake = true; return R(""); }
  if (cmd.includes("dumpsys battery")) return R(`  status: 2\n  health: 2\n  level: ${o.level}\n  temperature: 336\n`);
  if (cmd.includes("meminfo")) return R("MemTotal: 3880000 kB\nMemAvailable: 2210000 kB\n");
  if (cmd.includes("/proc/uptime")) return R("15800.2 3000.1\n");
  if (cmd.includes("grep -i flash")) return R(o.flash ? "package:com.flashexpress.express.courier\n" : "");
  if (cmd.includes("versionName")) return R(`    versionName=${o.flash}\n`);
  if (cmd.includes("pm list packages")) return R(serial.endsWith("164") ? "package:com.flashexpress.express.courier\npackage:com.zhiliaoapp.musically\npackage:jp.naver.line.android\n" : "package:com.flashexpress.express.courier\npackage:jp.naver.line.android\n");
  if (cmd.includes("cmd wifi status")) return R(o.wifi ? `Wifi is enabled\nWifi is connected to "${o.wifi}"\n` : "Wifi is enabled\nWifi is not connected\n");
  if (cmd.includes("connect-network")) { await wait(600); o.wifi = (cmd.match(/connect-network '([^']*)'/) || [])[1] || o.wifi; return R("Connection initiated\n"); }
  if (cmd.includes("list-scan-results")) return R("    BSSID              Frequency      RSSI           Age(sec)     SSID                                 Flags\n  a4:12:42:00:11:22       2437        -48             2.1         Flash-BPL                            [WPA2-PSK-CCMP][ESS]\n  a4:12:42:00:11:33       5180        -63             2.3         Flash-BPL-5G                         [WPA2-PSK-CCMP][ESS]\n  b8:27:eb:10:20:30       2462        -79             4.0         Guest                                [ESS]\n");
  return R("");
};
window.__push = async () => { await wait(300); };
window.__pull = async () => [];
// Label the preview so nobody mistakes demo numbers for a real device
addEventListener("DOMContentLoaded", () => {
  const b = document.createElement("div");
  b.textContent = "ตัวอย่างดีไซน์ · เครื่องจำลอง ไม่ได้ต่อเครื่องจริง · กดวงกลมกลางจอเพื่อเพิ่มเครื่อง (สูงสุด 15)";
  b.style.cssText = "position:fixed;top:0;left:50%;transform:translateX(-50%);z-index:30;background:#e3b46a;color:#1b1306;font:600 14px/1 Anuphan,sans-serif;padding:7px 16px;border-radius:0 0 12px 12px;pointer-events:none";
  document.body.append(b);
});
