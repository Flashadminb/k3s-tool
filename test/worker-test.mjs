// Runs the login server (worker/index.js) locally with a fake Telegram and checks login, roles, staff passwords,
// the hourly password change, shared settings and the page itself in a browser.
import { unstable_dev } from "wrangler";
import http from "node:http";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { rmSync } from "node:fs";

execFileSync("node", ["build.mjs"], { stdio: "ignore" });
execFileSync("node", ["scripts/make-site.mjs"], { stdio: "ignore" });
rmSync(".wrangler/state", { recursive: true, force: true });

// fake Telegram Bot API: remembers every message
const sent = [];
let hook = null;
const tg = http.createServer((q, s) => {
  let b = ""; q.on("data", (c) => (b += c)); q.on("end", () => {
    const body = b ? JSON.parse(b) : {};
    const m = q.url.split("/").pop();
    let result = true;
    if (m === "getMe") result = { username: "hubtestbot" };
    if (m === "setWebhook") hook = body;
    if (m === "sendMessage") sent.push(body);
    s.setHeader("content-type", "application/json"); s.end(JSON.stringify({ ok: true, result }));
  });
}).listen(0);
const TG = `http://localhost:${tg.address().port}`;

const w = await unstable_dev("worker/index.js", { config: "wrangler.toml", vars: { TG_API: TG }, ip: "localhost", experimental: { disableExperimentalWarning: true, testScheduled: true }, logLevel: "warn" });
const base = `http://localhost:${w.port}`;

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log("  ok  " + m); } else { fail++; console.log("  FAIL " + m); } };
const req = async (path, { method = "GET", body, cookie, type = "application/json", headers = {} } = {}) => {
  const r = await fetch(base + path, { method, redirect: "manual", headers: { ...(body !== undefined ? { "content-type": type } : {}), ...(cookie ? { cookie } : {}), ...headers }, body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body) });
  const text = await r.text();
  let j = null; try { j = JSON.parse(text); } catch (e) {}
  const c = (r.headers.get("set-cookie") || "").match(/idt=([^;]+)/);
  return { status: r.status, j, text, cookie: c ? "idt=" + c[1] : "", loc: r.headers.get("location") || "" };
};

try {
  console.log("first visit + owner setup");
  let r = await req("/");
  ok(r.status === 302 && r.loc.endsWith("/login"), "site needs login");
  ok((await req("/login")).text.includes("ตั้งค่าครั้งแรก"), "first visit asks the owner to set a password");
  ok((await req("/manifest.webmanifest")).status === 200, "app icon/manifest stay public (install as app)");
  ok((await req("/api/setup", { method: "POST", body: { name: "Best", password: "short" } })).status === 400, "owner password must be 8+");
  r = await req("/api/setup", { method: "POST", body: { name: "Best", password: "owner-pass-1" } });
  const admin = r.cookie;
  ok(r.status === 200 && admin, "owner set up and logged in");
  ok((await req("/api/setup", { method: "POST", body: { name: "X", password: "another-pass" } })).status === 409, "setup cannot be done twice");
  ok(!(await req("/login")).text.includes("ตั้งค่าครั้งแรก"), "login page no longer offers setup");
  r = await req("/", { cookie: admin });
  ok(r.status === 200 && r.text.includes("IDATA TOOLS"), "owner gets the tool");
  ok((await req("/api/login", { method: "POST", body: "name=Best&password=owner-pass-1", type: "application/x-www-form-urlencoded" })).status === 415, "form posts from other sites refused");
  ok((await req("/api/login", { method: "POST", body: { name: "best", password: "owner-pass-1" } })).j.role === "admin", "owner login (name not case-sensitive)");

  console.log("shared settings");
  ok((await req("/api/settings", { method: "PUT", cookie: admin, body: { wifi: [{ ssid: "Hub", pass: "secret12", sec: "wpa2" }] } })).status === 200, "owner saves shared settings");
  ok((await req("/api/settings")).status === 401, "settings (Wi-Fi passwords) hidden without login");

  console.log("telegram bot");
  ok((await req("/api/telegram", { method: "POST", cookie: admin, body: { token: "bad" } })).status === 400, "bad token refused");
  r = await req("/api/telegram", { method: "POST", cookie: admin, body: { token: "123456:ABCDEFGHIJKLMNOPQRSTUVWXYZabcdef12" } });
  ok(r.status === 200 && r.j.bot === "hubtestbot" && hook && hook.url.includes("/tg/"), "bot set, webhook registered");
  const secret = hook.secret_token;
  ok((await req("/tg/" + secret, { method: "POST", body: { message: { chat: { id: 777 }, text: "/start" } } })).status === 403, "webhook without Telegram's secret header refused");
  await req("/tg/" + secret, { method: "POST", body: { message: { chat: { id: 777 }, text: "/start" } }, headers: { "x-telegram-bot-api-secret-token": secret } });
  ok(sent.some((m) => m.chat_id === 777 && m.text.includes("777")), "bot answers a new person with their Chat ID");

  console.log("staff");
  const thaiHour = (new Date(Date.now() + 7 * 3600e3).getUTCHours() + 3) % 24;
  r = await req("/api/staff", { method: "POST", cookie: admin, body: { name: "Somchai", chatId: "777", times: [thaiHour] } });
  const sid = r.j.id;
  ok(r.status === 200 && sid, "staff added");
  ok((await req("/api/staff", { method: "POST", cookie: admin, body: { name: "best" } })).status === 400, "staff cannot take the owner's name");
  r = await req("/api/staff/rotate", { method: "POST", cookie: admin, body: { id: sid } });
  const pw1 = r.j.password;
  ok(r.j.sent && /^[A-Z2-9]{8}$/.test(pw1) && sent.some((m) => m.chat_id === "777" && m.text.includes(pw1)), "new password sent to the staff member's Telegram");
  r = await req("/api/login", { method: "POST", body: { name: "somchai", password: pw1.toLowerCase() } });
  const staff = r.cookie;
  ok(r.j && r.j.role === "staff", "staff logs in (password typed in small letters is fine)");
  ok((await req("/api/settings", { cookie: staff })).j.wifi[0].ssid === "Hub", "staff gets the shared settings (fresh computer is ready)");
  ok((await req("/api/settings", { method: "PUT", cookie: staff, body: {} })).status === 403, "staff cannot change shared settings");
  ok((await req("/api/staff", { cookie: staff })).status === 403, "staff cannot see the staff list");
  ok((await req("/", { cookie: staff })).status === 200, "staff gets the tool");

  console.log("hourly password change");
  const at = Date.now() + 3 * 3600e3;   // the chosen hour
  const before = sent.length;
  for (const p of ["/cdn-cgi/handler/scheduled", "/__scheduled"]) {
    const x = await fetch(`${base}${p}?cron=${encodeURIComponent("0 * * * *")}&time=${at}`);
    if (x.status === 200) break;
  }
  await new Promise((res) => setTimeout(res, 500));
  const msg = sent.slice(before).find((m) => m.chat_id === "777");
  const pw2 = msg && (msg.text.match(/: ([A-Z2-9]{8})/) || [])[1];
  ok(pw2 && pw2 !== pw1, "password changed and sent at the chosen hour");
  ok((await req("/api/login", { method: "POST", body: { name: "Somchai", password: pw1 } })).status === 401, "old password no longer works");
  ok((await req("/api/login", { method: "POST", body: { name: "Somchai", password: pw2 } })).status === 200, "new password works");
  ok((await req("/api/me", { cookie: staff })).status === 200, "already logged-in staff keeps working");
  await req("/api/staff", { method: "POST", cookie: admin, body: { id: sid, name: "Somchai", chatId: "777", times: [thaiHour], enabled: false } });
  ok((await req("/api/me", { cookie: staff })).status === 401, "switching staff off ends their session at once");

  console.log("browser");
  const require = createRequire(import.meta.url);
  process.env.NODE_PATH = execFileSync("npm", ["root", "-g"], { encoding: "utf8" }).trim();
  require("module").Module._initPaths();
  const { chromium } = require("playwright");
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errs = []; page.on("pageerror", (e) => errs.push(e.message));
  await page.goto(base + "/");
  await page.fill("#n", "Best"); await page.fill("#p", "owner-pass-1"); await page.click("button");
  await page.waitForSelector("#who:not([hidden])", { timeout: 15000 });
  ok((await page.textContent("#who")).includes("เจ้าของ"), "owner sees their name in the header");
  await page.click("button[data-tab=wifi]");
  ok((await page.textContent("#wifiSaved")).includes("Hub"), "Wi-Fi list arrives from the server on a fresh browser");
  await page.click("button[data-tab=setup]");
  await page.waitForFunction(() => document.getElementById("staffList").textContent.includes("Somchai"), null, { timeout: 10000 });
  ok(await page.isVisible("#usersCard"), "owner sees user management");
  ok((await page.textContent("#tgState")).includes("@hubtestbot"), "bot shown as set");
  await page.click("#who button"); await page.waitForURL(/\/login$/);
  ok(true, "logout goes back to the login page");
  await req("/api/staff", { method: "POST", cookie: admin, body: { id: sid, name: "Somchai", chatId: "777", times: [thaiHour], enabled: true } });
  const pw3 = (await req("/api/staff/rotate", { method: "POST", cookie: admin, body: { id: sid } })).j.password;
  await page.fill("#n", "Somchai"); await page.fill("#p", pw3); await page.click("button");
  await page.waitForSelector("#who:not([hidden])", { timeout: 15000 });
  await page.click("button[data-tab=setup]");
  ok(!(await page.isVisible("#usersCard")) && !(await page.isVisible("button[data-act=flashSave]")), "staff: no user management, no settings save");
  await page.click("button[data-tab=wifi]");
  ok((await page.textContent("#wifiSaved")).includes("Hub") && !(await page.isVisible("button[data-act=wifiAdd]")), "staff can use saved Wi-Fi but not edit the list");
  ok(errs.length === 0, "no page errors " + errs.join(" | "));
  await browser.close();

  console.log("too many wrong passwords");
  let last;
  for (let i = 0; i < 11; i++) last = await req("/api/login", { method: "POST", body: { name: "x", password: "wrong" } });
  ok(last.status === 429, "blocked after 10 wrong tries");
} finally {
  await w.stop(); tg.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
