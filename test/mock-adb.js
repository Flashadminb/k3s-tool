// Test double for src/adb.js: shell commands go to window.__sh (provided by the Playwright test),
// which runs them with a real POSIX sh against a fake /sdcard folder.
export const q = (s) => "'" + String(s).replace(/'/g, "'\\''") + "'";
export const hasWebUsb = () => true;
export class Device {
  constructor(serial) { this.serial = serial; this.info = {}; this.closed = false; this.disconnected = new Promise((r) => (this._bye = r)).then(() => { this.closed = true; }); }
  async sh(cmd) { if (this.stopped) throw new Error("STOPPED"); return await window.__sh(this.serial, cmd); }
  async stop() { this.stopped = true; window.__stops = (window.__stops || 0) + 1; }
  async shStream(cmd, onLine) {
    const r = await this.sh(cmd);
    for (const l of r.out.split("\n")) { if (!l) continue; if (window.__lineDelay) await new Promise((res) => setTimeout(res, window.__lineDelay)); if (this.stopped) throw new Error("STOPPED"); onLine(l); }
    return r;
  }
  async shOk(cmd) { const r = await this.sh(cmd); if (r.code) throw new Error((r.err || r.out).trim()); return r.out; }
  async push(blob, path, onProgress) { const b = blob instanceof Uint8Array ? blob : new Uint8Array(await blob.arrayBuffer()); await window.__push(this.serial, path, Array.from(b)); onProgress && onProgress(1); }
  async pull(path) { return new Uint8Array(await window.__pull(this.serial, path)); }
  async pullMany(paths, cb) { for (let i = 0; i < paths.length; i++) await cb(paths[i], await this.pull(paths[i]), i); }
  async reboot() { this._bye(); }
  async rebootRecovery() { window.__recovery = this.serial; this._bye(); }
  async close() { this._bye(); }
}
let n = 0;
const cancelled = new Set();
// window.__pick (test only) makes the browser popup return a given serial once, e.g. a device already connected
export async function requestUsb() {
  if (window.__pick) { const s = window.__pick; window.__pick = null; return { serial: s }; }
  n++; return { serial: (window.__serials && window.__serials[n - 1]) || "TESTSERIAL00" + n };
}
export async function openUsb(u, onAuth) {
  onAuth && onAuth(u.serial);
  const until = Date.now() + (window.__authDelay || 0);
  while (Date.now() < until) { if (cancelled.has(u.serial)) { cancelled.delete(u.serial); throw new Error("CANCELLED"); } await new Promise((r) => setTimeout(r, 50)); }
  return new Device(u.serial);
}
export async function requestAndOpen(onAuth) { return openUsb(await requestUsb(), onAuth); }
export async function cancelWait(serial) { cancelled.add(serial); }
export async function knownDevices() { return []; }
// shared ADB keys (login server): nothing to do in the simulation
export const setSharedKeys = () => {};
export async function localKeys() { return []; }
export const b64u = (u8) => btoa(String.fromCharCode(...u8)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
export const unb64u = (t) => Uint8Array.from(atob(t.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
