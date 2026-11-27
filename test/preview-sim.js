// In-browser fake devices for the design preview (no USB). Numbers are made up and the page says so.
window.__serials = ["4660067", "4660112", "4661038", "4660554", "4661290"];
const state = {};
const st = (s) => (state[s] ||= {
  total: 52428800, base: 6800000 + Math.round(Math.random() * 4e6),
  success: [8000 + Math.round(Math.random() * 30000), 0], fail: [Math.round(Math.random() * 40), 0], trash: [Math.round(Math.random() * 9000), 0],
  level: 30 + Math.round(Math.random() * 65)
});
const kb = (o) => { o.success[1] = o.success[0] * 310; o.fail[1] = o.fail[0] * 300; o.trash[1] = o.trash[0] * 520; };
const used = (o) => (kb(o), o.base + o.success[1] + o.fail[1] + o.trash[1]);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
window.__sh = async (serial, cmd) => {
  const o = st(serial); const R = (out) => ({ out, err: "", code: 0 });
  await wait(120 + Math.random() * 250);
  if (cmd.includes("getprop ro.product.model")) return R("K3S\n");
  if (cmd.includes("ro.product.manufacturer")) return R("iData\n");
  if (cmd.includes("ro.build.version.release")) return R("12\n");
  if (cmd.includes("ro.build.version.sdk")) return R("31\n");
  if (cmd.startsWith("df")) return R(`/dev/fuse ${o.total} ${used(o)} ${o.total - used(o)} 0% /storage/emulated\n`);
  if (cmd.includes("-delete")) {
    await wait(1400);
    const k = cmd.includes(".trashed") ? "trash" : cmd.includes("/fail") ? "fail" : "success";
    const n = o[k][0]; o[k][0] = 0; return R(n + "\n");
  }
  if (cmd.includes("awk")) { await wait(700); kb(o); return R(`${o.success[0]} ${o.success[1]}\n${o.fail[0]} ${o.fail[1]}\n${o.trash[0]} ${o.trash[1]}\n`); }
  if (cmd.includes("dumpsys battery")) return R(`  status: 2\n  health: 2\n  level: ${o.level}\n  temperature: 336\n`);
  if (cmd.includes("meminfo")) return R("MemTotal: 3880000 kB\nMemAvailable: 2210000 kB\n");
  if (cmd.includes("/proc/uptime")) return R("15800.2 3000.1\n");
  if (cmd.includes("grep -i flash")) return R("package:com.flashexpress.express.courier\n");
  if (cmd.includes("versionName")) return R("    versionName=8.2.65\n");
  if (cmd.includes("pm list packages")) return R(serial.endsWith("112") ? "package:com.flashexpress.express.courier\npackage:com.zhiliaoapp.musically\npackage:jp.naver.line.android\n" : "package:com.flashexpress.express.courier\npackage:jp.naver.line.android\n");
  return R("");
};
window.__push = async () => { await wait(400); };
window.__pull = async () => [];
// Label the preview so nobody mistakes demo numbers for a real device
addEventListener("DOMContentLoaded", () => {
  const b = document.createElement("div");
  b.textContent = "ตัวอย่างดีไซน์ · เครื่องจำลอง ไม่ได้ต่อเครื่องจริง · กดวงกลมกลางจอเพื่อเพิ่มเครื่อง";
  b.style.cssText = "position:fixed;top:0;left:50%;transform:translateX(-50%);z-index:30;background:#e3b46a;color:#1b1306;font:600 14px/1 Anuphan,sans-serif;padding:7px 16px;border-radius:0 0 12px 12px;pointer-events:none";
  document.body.append(b);
});
