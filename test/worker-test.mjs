// Runs the login server (worker/index.js) locally with a local D1 database and checks the account system:
// first owner, invitations (link + code, single use), login + remember me, 3-strike lock, owner management,
// command verification (8 h / once / RESET), shared settings, protected files, and the page in a browser.
import { unstable_dev } from "wrangler";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { rmSync } from "node:fs";

execFileSync("node", ["build.mjs"], { stdio: "ignore" });
execFileSync("node", ["scripts/make-site.mjs"], { stdio: "ignore" });
rmSync(".wrangler/state", { recursive: true, force: true });

const SETUP = "first-owner-code-123";
const w = await unstable_dev("worker/index.js", { config: "wrangler.toml", vars: { SETUP_CODE: SETUP, PBKDF2_ITER: "10000" }, ip: "localhost", experimental: { disableExperimentalWarning: true }, logLevel: "warn" });
const base = `http://localhost:${w.port}`;

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log("  ok  " + m); } else { fail++; console.log("  FAIL " + m); } };
const req = async (path, { method = "GET", body, cookie, type = "application/json", headers = {} } = {}) => {
  const r = await fetch(base + path, { method, redirect: "manual", headers: { ...(body !== undefined ? { "content-type": type } : {}), ...(cookie ? { cookie } : {}), ...headers }, body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body) });
  const text = await r.text();
  let j = null; try { j = JSON.parse(text); } catch (e) {}
  const sc = r.headers.get("set-cookie") || "";
  const c = sc.match(/idt=([^;]+)/);
  return { status: r.status, j, text, cookie: c && c[1] ? "idt=" + c[1] : "", setCookie: sc, loc: r.headers.get("location") || "" };
};
const post = (path, body, cookie, headers) => req(path, { method: "POST", body, cookie, headers });
const prof = (u, pw = "employee-pass-1") => ({ first: "สมชาย", last: "ใจดี", nick: "ชาย", username: u, password: pw, confirm: pw });

try {
  console.log("protected site");
  let r = await req("/");
  ok(r.status === 302 && r.loc.endsWith("/login"), "tool page needs login");
  for (const f of ["/index.html", "/classic.html", "/preview.html"]) ok((await req(f)).status === 302, `${f} not served without login`);
  ok((await req("/api/settings")).status === 401 && (await req("/api/users")).status === 401, "internal APIs refuse anonymous calls");
  ok((await req("/manifest.webmanifest")).status === 200, "install-as-app files stay public");

  console.log("first owner");
  ok((await req("/login")).text.includes("สร้างบัญชีเจ้าของระบบ"), "first visit offers owner setup");
  ok((await post("/api/setup", { code: "wrong-code-0000", ...prof("boss", "owner-pass-1") })).status === 403, "setup needs the setup code");
  r = await post("/api/setup", { code: SETUP, ...prof("boss", "owner-pass-1"), nick: "Best" });
  const owner = r.cookie;
  ok(r.status === 200 && owner, "owner account created and logged in");
  ok((await post("/api/setup", { code: SETUP, ...prof("boss2", "owner-pass-2") })).status === 409, "a second owner cannot be set up");
  ok((await req("/login")).text.includes("จำฉันไว้"), "login page has username, password and remember me");
  r = await req("/", { cookie: owner });
  ok(r.status === 200 && r.text.includes("IDATA TOOLS"), "owner gets the tool");
  ok((await req("/api/me", { cookie: owner })).j.role === "admin", "owner role");
  ok((await req("/api/login", { method: "POST", body: "username=boss&password=x", type: "application/x-www-form-urlencoded" })).status === 415, "form posts from other sites refused");
  ok((await post("/api/login", { username: "boss", password: "owner-pass-1" }, null, { origin: "https://evil.example" })).status === 403, "requests from another origin refused");

  console.log("invitations");
  r = await post("/api/invites", { first: "สมชาย", nick: "ชาย", message: "ยินดีต้อนรับสู่ทีม", days: 3 }, owner);
  const inv1 = r.j;
  ok(r.status === 200 && /\/invite\/[\w-]{40,}$/.test(inv1.link) && /^[A-Z2-9]{5}-[A-Z2-9]{5}$/.test(inv1.code), "owner creates a personal link and a code");
  const token = inv1.link.split("/invite/")[1];
  r = await req("/invite/" + token);
  ok(r.status === 200 && r.text.includes("ยินดีต้อนรับสู่ทีม") && r.text.includes('value="สมชาย"'), "invite link opens with the owner's message and pre-filled name");
  ok((await req("/invite/" + token)).text.includes("สมัครและเข้าใช้งาน"), "opening the link does not use it up");
  const list0 = (await req("/api/invites", { cookie: owner })).j;
  ok(list0[0].status === "pending" && list0[0].opened_at && !("token_hash" in list0[0]), "invite list shows opened, never the secret");
  ok((await post("/api/invite/accept", { token, ...prof("somchai"), confirm: "different-1" })).status === 400, "password and confirm must match");
  r = await post("/api/invite/accept", { token, ...prof("SomChai") });
  const emp = r.cookie;
  ok(r.status === 200 && emp, "employee signs up and is in at once (no approval)");
  ok((await req("/api/me", { cookie: emp })).j.name === "ชาย" && (await req("/api/me", { cookie: emp })).j.role === "staff", "nickname shown, employee role");
  ok((await post("/api/invite/accept", { token, ...prof("other1") })).status === 410, "used link cannot sign up another account");
  ok((await post("/api/invite/accept", { code: inv1.code, ...prof("other2") })).status === 410, "its code is dead too");
  ok((await req("/invite/" + token)).text.includes("ใช้ไม่ได้แล้ว"), "used link page says it is no longer valid");
  // code route
  const inv2 = (await post("/api/invites", { nick: "นก" }, owner)).j;
  ok((await post("/api/invite/check", { code: inv2.code.toLowerCase().replace("-", " ") })).j.nickname === "นก", "invite code accepted (any case / spacing)");
  ok((await post("/api/invite/accept", { code: inv2.code, ...prof("somchai") })).status === 409, "username already taken refused (invite kept)");
  r = await post("/api/invite/accept", { code: inv2.code, ...prof("nok", "nok-pass-12") });
  ok(r.status === 200, "sign up with the code");
  ok((await post("/api/invite/check", { code: inv2.code })).status === 410, "code single use");
  // two people racing for one invitation
  const inv3 = (await post("/api/invites", {}, owner)).j;
  const t3 = inv3.link.split("/invite/")[1];
  const race = await Promise.all([post("/api/invite/accept", { token: t3, ...prof("race1") }), post("/api/invite/accept", { token: t3, ...prof("race2") })]);
  ok(race.filter((x) => x.status === 200).length === 1, "only one sign-up wins an invitation");
  const inv4 = (await post("/api/invites", {}, owner)).j;
  ok((await post("/api/invites/revoke", { id: inv4.id }, owner)).status === 200 && (await post("/api/invite/check", { code: inv4.code })).status === 410, "owner can cancel an invitation");
  ok((await post("/api/invites", {}, emp)).status === 403, "employees cannot invite");

  console.log("login, remember me, logout");
  r = await post("/api/login", { username: "somchai", password: "employee-pass-1", remember: false });
  ok(r.status === 200 && !/Max-Age/i.test(r.setCookie) && /HttpOnly/.test(r.setCookie) && /Secure/.test(r.setCookie) && /SameSite=Strict/.test(r.setCookie), "without remember me: browser-session cookie, HttpOnly Secure SameSite");
  r = await post("/api/login", { username: "somchai", password: "employee-pass-1", remember: true });
  const empRemember = r.cookie;
  ok(/Max-Age=3456/.test(r.setCookie), "remember me: long-lived cookie");
  ok((await post("/api/logout", {}, empRemember)).status === 200 && (await req("/api/me", { cookie: empRemember })).status === 401, "logout ends that session on the server");

  console.log("3 wrong passwords lock the account (counted on the server)");
  r = await post("/api/login", { username: "nok", password: "wrong-1" });
  ok(r.status === 401 && r.j.error.includes("เหลืออีก 2"), "wrong password shows tries left");
  await post("/api/login", { username: "nok", password: "wrong-2" }, null, { "user-agent": "other browser" });
  r = await post("/api/login", { username: "nok", password: "wrong-3" });
  ok(r.status === 403 && r.j.error === "บัญชีถูกระงับ กรุณาติดต่อเจ้าของระบบ", "third wrong try (from another browser too) locks");
  ok((await post("/api/login", { username: "nok", password: "nok-pass-12" })).status === 403, "right password no longer gets in");
  let users = (await req("/api/users", { cookie: owner })).j;
  const nok = users.find((u) => u.username === "nok");
  ok(nok.locked_at, "owner sees the lock");
  const ev = (await req("/api/events?user=" + nok.id, { cookie: owner })).j;
  ok(ev.some((e) => e.type === "locked") && ev.filter((e) => e.type === "login_fail").length === 3, "lock recorded with the failed tries");
  ok((await post("/api/users/unlock", { id: nok.id }, owner)).status === 200 && (await post("/api/login", { username: "nok", password: "nok-pass-12" })).status === 200, "owner unlocks, the person gets in again");
  ok((await req("/api/events?user=" + nok.id, { cookie: owner })).j.some((e) => e.type === "unlocked"), "unlock recorded");

  console.log("owner manages members");
  users = (await req("/api/users", { cookie: owner })).j;
  ok(users.every((u) => !("pw_hash" in u)) && !JSON.stringify(users).includes("pbkdf2"), "member list never contains passwords or hashes");
  const som = users.find((u) => u.username === "somchai");
  ok((await post("/api/users/update", { id: som.id, username: "somchai.j", first: "สมชาย", last: "ใจดีมาก", nick: "ชายJ" }, owner)).status === 200, "owner edits a member and changes the username");
  ok((await post("/api/login", { username: "somchai.j", password: "employee-pass-1" })).status === 200, "new username works");
  r = await post("/api/users/password", { id: som.id, generate: true }, owner);
  ok(r.status === 200 && /^[A-Z2-9]{10}$/.test(r.j.password), "owner sets a new password (shown once)");
  ok((await req("/api/me", { cookie: emp })).status === 401, "password reset ends the member's sessions");
  r = await post("/api/login", { username: "somchai.j", password: r.j.password });
  const emp2 = r.cookie;
  ok(r.status === 200, "member logs in with the new password");
  ok((await post("/api/users/revoke", { id: som.id }, owner)).j.revoked >= 1 && (await req("/api/me", { cookie: emp2 })).status === 401, "owner ends all the member's sessions");
  ok((await post("/api/users/status", { id: som.id, active: false }, owner)).status === 200 && (await post("/api/login", { username: "somchai.j", password: "x" })).j.error === "บัญชีถูกระงับ กรุณาติดต่อเจ้าของระบบ", "disabled account cannot log in");
  await post("/api/users/status", { id: som.id, active: true }, owner);
  ok((await post("/api/users", { username: "direct", first: "ก", last: "ข", nick: "ค", password: "direct-pass-1" }, owner)).status === 200, "owner adds an account directly");
  const direct = (await req("/api/users", { cookie: owner })).j.find((u) => u.username === "direct");
  ok((await req("/api/users?id=" + direct.id, { method: "DELETE", cookie: owner })).status === 200 && (await post("/api/login", { username: "direct", password: "direct-pass-1" })).status === 401, "owner deletes an account");
  ok((await req("/api/users", { cookie: (await post("/api/login", { username: "nok", password: "nok-pass-12" })).cookie })).status === 403, "employees cannot see members");

  console.log("own profile and password");
  let nokC = (await post("/api/login", { username: "nok", password: "nok-pass-12" })).cookie;
  const nokOther = (await post("/api/login", { username: "nok", password: "nok-pass-12" })).cookie;
  ok((await post("/api/me/profile", { first: "นกน้อย", last: "บินได้", nick: "นกๆ" }, nokC)).status === 200 && (await req("/api/me", { cookie: nokC })).j.name === "นกๆ", "employee edits own profile");
  ok((await post("/api/me/password", { old: "nok-pass-12", password: "nok-pass-34" }, nokC)).status === 200, "employee changes own password");
  ok((await req("/api/me", { cookie: nokOther })).status === 401 && (await req("/api/me", { cookie: nokC })).status === 200, "other devices logged out, this one stays");

  console.log("command verification");
  r = await post("/api/authorize", { action: "unlock" }, nokC);
  ok(r.status === 403 && r.j.verify, "risky command without verification refused by the server");
  r = await post("/api/verify", { action: "unlock", password: "wrong-pass", remember: true }, nokC);
  ok(r.status === 422 && r.j.error.includes("เหลืออีก 2"), "wrong password on verification counts too");
  r = await post("/api/verify", { action: "unlock", password: "nok-pass-34", remember: false }, nokC);
  ok(r.status === 200 && !r.j.verifiedUntil, "verify this time only");
  ok((await post("/api/authorize", { action: "delete" }, nokC)).status === 403, "'this time only' does not open later commands");
  r = await post("/api/verify", { action: "delete", password: "nok-pass-34", remember: true }, nokC);
  ok(r.status === 200 && Math.abs(r.j.verifiedUntil - Date.now() - 8 * 3600e3) < 60e3, "remember for 8 hours");
  ok((await post("/api/authorize", { action: "unlock" }, nokC)).status === 200, "inside 8 h: no password needed");
  ok((await post("/api/authorize", { action: "reset" }, nokC)).j.needReset && (await post("/api/authorize", { action: "reset", confirm: "RESET" }, nokC)).status === 200, "factory reset still needs RESET typed");
  const nokSame = nokC;
  const fresh = (await post("/api/login", { username: "nok", password: "nok-pass-34" })).cookie;
  ok((await post("/api/authorize", { action: "unlock" }, fresh)).status === 403, "verification belongs to its session, not the account");
  await post("/api/logout", {}, nokSame);
  nokC = (await post("/api/login", { username: "nok", password: "nok-pass-34" })).cookie;
  ok((await post("/api/authorize", { action: "unlock" }, nokC)).status === 403, "logout ends the verification");
  await post("/api/verify", { action: "unlock", password: "nok-pass-34", remember: true }, nokC);
  await post("/api/me/password", { old: "nok-pass-34", password: "nok-pass-56" }, nokC);
  ok((await post("/api/authorize", { action: "unlock" }, nokC)).status === 403, "password change ends the verification");
  ok((await post("/api/authorize", { action: "settings" }, nokC)).status === 403 && (await post("/api/verify", { action: "settings", password: "nok-pass-56" }, nokC)).status === 403, "employees cannot verify for back-office settings");
  const actEv = (await req("/api/events?user=" + nok.id, { cookie: owner })).j;
  ok(actEv.some((e) => e.type === "action" && e.detail.includes("ปลดล็อกแอป")), "authorized commands are recorded");

  console.log("shared settings");
  r = await req("/api/settings", { method: "PUT", cookie: owner, body: { wifi: [{ ssid: "Hub", pass: "secret12", sec: "wpa2" }] } });
  ok(r.status === 403 && r.j.verify, "important settings change needs verification");
  ok((await req("/api/settings", { method: "PUT", cookie: owner, body: { names: { A1: "Desk-1" } } })).status === 200, "device nicknames save without a password");
  r = await post("/api/verify", { action: "settings", password: "owner-pass-1", remember: false }, owner);
  ok(r.status === 200 && r.j.ticket, "one-time ticket for one settings save");
  ok((await req("/api/settings", { method: "PUT", cookie: owner, body: { wifi: [{ ssid: "Hub", pass: "secret12", sec: "wpa2" }] }, headers: { "x-idt-ticket": r.j.ticket } })).status === 200, "settings saved with the ticket");
  ok((await req("/api/settings", { method: "PUT", cookie: owner, body: { wifi: [] }, headers: { "x-idt-ticket": r.j.ticket } })).status === 403, "ticket works once");
  ok((await req("/api/settings", { cookie: nokC })).j.wifi[0].ssid === "Hub", "members get the shared settings on any computer");
  ok((await req("/api/settings", { method: "PUT", cookie: nokC, body: {} })).status === 403, "members cannot change shared settings");

  console.log("shared ADB keys");
  const fakeKey = "A".repeat(1600), fakeKey2 = "B".repeat(1600);
  r = await post("/api/adbkeys", { keys: [fakeKey] }, nokC);
  ok(r.status === 403 && r.j.verify, "importing ADB keys needs the password");
  r = await post("/api/verify", { action: "adbkey", password: "nok-pass-56", remember: false }, nokC);
  ok((await post("/api/adbkeys", { keys: [fakeKey, fakeKey, fakeKey2], label: "old site" }, nokC, { "x-idt-ticket": r.j.ticket })).j.added === 2, "keys imported once each with the one-time ticket");
  ok((await req("/api/adbkeys", { cookie: owner })).j.length === 2 && (await req("/api/adbkeys", { cookie: nokC })).j[0].k === fakeKey, "every member's browser gets the shared keys");
  ok((await req("/api/adbkeys")).status === 401, "keys never served without login");

  console.log("owner recovery");
  for (const pw of ["x1", "x2", "x3"]) await post("/api/login", { username: "boss", password: pw });
  ok((await post("/api/login", { username: "boss", password: "owner-pass-1" })).status === 403, "owner locked after 3 wrong");
  ok((await post("/api/recover", { code: "nope-nope-nope", username: "boss", password: "owner-pass-9" })).status === 403, "recovery needs the setup code");
  ok((await post("/api/recover", { code: SETUP, username: "boss", password: "owner-pass-9" })).status === 200, "recovery with the setup code");
  r = await post("/api/login", { username: "boss", password: "owner-pass-9" });
  const owner2 = r.cookie;
  ok(r.status === 200, "owner back in");

  console.log("browser");
  const require = createRequire(import.meta.url);
  process.env.NODE_PATH = execFileSync("npm", ["root", "-g"], { encoding: "utf8" }).trim();
  require("module").Module._initPaths();
  const { chromium } = require("playwright");
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.addCookies([{ name: "idt", value: owner2.slice(4), url: base }]);
  const page = await ctx.newPage();
  const errs = []; page.on("pageerror", (e) => errs.push(e.message));
  await page.goto(base + "/");
  await page.waitForSelector("#who:not([hidden])", { timeout: 15000 });
  ok((await page.textContent("#who")).includes("เจ้าของ"), "owner sees their name in the header");
  await page.click("button[data-tab=wifi]");
  ok((await page.textContent("#wifiSaved")).includes("Hub"), "Wi-Fi list arrives from the server on a fresh browser");
  await page.click("button[data-tab=setup]");
  await page.waitForFunction(() => document.getElementById("memberList").textContent.includes("nok"), null, { timeout: 10000 });
  ok(await page.isVisible("#usersCard"), "owner sees member management");
  await page.fill("#ivNick", "ใหม่"); await page.click("button[data-act=inviteCreate]");
  await page.waitForFunction(() => /\/invite\//.test(document.getElementById("ivOut").textContent), null, { timeout: 10000 });
  ok(/[A-Z2-9]{5}-[A-Z2-9]{5}/.test(await page.textContent("#ivOut")), "invite link and code shown after creating");
  // coming from the old site with this browser's keys in the link: asks the password once, then the keys are shared
  await page.goto("about:blank"); await page.goto(base + "/#adbkeys=" + "C".repeat(1600));
  await page.waitForSelector("#vfy:not([hidden])", { timeout: 15000 });
  await page.fill("#vfyPw", "owner-pass-9"); await page.click("#vfyOk");
  await page.waitForSelector("#vfy", { state: "hidden", timeout: 10000 });
  await page.waitForTimeout(800);
  ok((await req("/api/adbkeys", { cookie: owner2 })).j.length === 3 && !(await page.evaluate(() => location.hash)), "keys from the old site link imported, link cleaned");
  // an important setting changed in the page asks for the password (Energy Shield) and then saves
  await page.click("button[data-tab=wifi]");
  await page.click('details.fold:has(#wfSsid) > summary');
  await page.fill("#wfSsid", "Hub2"); await page.fill("#wfPass", "pass-word-2"); await page.click("button[data-act=wifiAdd]");
  await page.waitForSelector("#vfy:not([hidden])", { timeout: 10000 });
  ok(await page.isVisible("#vfy .shield"), "verification window with the energy shield");
  await page.fill("#vfyPw", "owner-pass-9"); await page.check("#vfyRemember"); await page.click("#vfyOk");
  await page.waitForSelector("#vfy", { state: "hidden", timeout: 10000 });
  await page.waitForTimeout(2500);
  ok((await req("/api/settings", { cookie: owner2 })).j.wifi.some((x) => x.ssid === "Hub2"), "setting saved on the server after verification");
  await page.click("#who button"); await page.waitForURL(/\/login$/);
  ok(true, "logout goes back to the login page");
  // employee: log in through the page with remember me
  await page.fill("#u", "nok"); await page.fill("#p", "nok-pass-56"); await page.check("#r"); await page.click("#b");
  await page.waitForSelector("#who:not([hidden])", { timeout: 15000 });
  ok((await page.textContent("#who")).includes("พนักงาน · นกๆ"), "employee logs in through the page");
  await page.click("button[data-tab=setup]");
  ok(!(await page.isVisible("#usersCard")) && (await page.isVisible("#meCard")), "employee: own account card, no member management");
  ok(errs.length === 0, "no page errors " + errs.join(" | "));
  await browser.close();

  console.log("rate limit");
  let last;
  for (let i = 0; i < 22; i++) last = await post("/api/login", { username: "ghost" + i, password: "wrong" });
  ok(last.status === 429, "too many login tries from one place are blocked");
} finally {
  await w.stop();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
