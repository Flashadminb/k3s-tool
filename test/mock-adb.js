// Test double for src/adb.js: shell commands go to window.__sh (provided by the Playwright test),
// which runs them with a real POSIX sh against a fake /sdcard folder.
export const q = (s) => "'" + String(s).replace(/'/g, "'\\''") + "'";
export const hasWebUsb = () => true;
export class Device {
  constructor(serial) { this.serial = serial; this.info = {}; this.closed = false; this.disconnected = new Promise((r) => (this._bye = r)).then(() => { this.closed = true; }); }
  async sh(cmd) { return await window.__sh(this.serial, cmd); }
  async shStream(cmd, onLine) {
    const r = await this.sh(cmd);
    for (const l of r.out.split("\n")) { if (!l) continue; if (window.__lineDelay) await new Promise((res) => setTimeout(res, window.__lineDelay)); onLine(l); }
    return r;
  }
  async shOk(cmd) { const r = await this.sh(cmd); if (r.code) throw new Error((r.err || r.out).trim()); return r.out; }
  async push(blob, path, onProgress) { const b = blob instanceof Uint8Array ? blob : new Uint8Array(await blob.arrayBuffer()); await window.__push(this.serial, path, Array.from(b)); onProgress && onProgress(1); }
  async pull(path) { return new Uint8Array(await window.__pull(this.serial, path)); }
  async pullMany(paths, cb) { for (let i = 0; i < paths.length; i++) await cb(paths[i], await this.pull(paths[i]), i); }
  async reboot() { this._bye(); }
  async close() { this._bye(); }
}
let n = 0;
export async function requestAndOpen(onAuth) { n++; const s = (window.__serials && window.__serials[n - 1]) || "TESTSERIAL00" + n; onAuth && onAuth(s); if (window.__authDelay) await new Promise((r) => setTimeout(r, window.__authDelay)); return new Device((window.__serials && window.__serials[n - 1]) || "TESTSERIAL00" + n); }
export async function knownDevices() { return []; }
export async function openUsb(u) { return new Device(u.serial); }
