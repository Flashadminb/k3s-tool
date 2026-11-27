import { Adb, AdbDaemonTransport } from "@yume-chan/adb";
import { AdbDaemonWebUsbDeviceManager } from "@yume-chan/adb-daemon-webusb";
import AdbWebCredentialStore from "@yume-chan/adb-credential-web";
import { ReadableStream, ConcatBufferStream, ConcatStringStream, TextDecoderStream } from "@yume-chan/stream-extra";

const store = new AdbWebCredentialStore("K3S Tool");
const mgr = AdbDaemonWebUsbDeviceManager.BROWSER;

export const hasWebUsb = () => !!mgr;

// Quote a value for the device shell: a'b -> 'a'\''b'
export const q = (s) => "'" + String(s).replace(/'/g, "'\\''") + "'";

/** One connected Android device. Errors thrown with HELP codes are mapped to guides in app.js */
export class Device {
  constructor(adb, serial) {
    this.adb = adb;
    this.serial = serial;
    this.info = {};       // filled by app: model, profile, storage...
    this.closed = false;
    this.disconnected = adb.disconnected.then(() => { this.closed = true; });
  }

  /** Run a shell command. Returns { out, err, code } */
  async sh(cmd) {
    if (this.closed) throw new Error("UNPLUGGED");
    try { return await this._sh(cmd); }
    catch (e) { if (this.closed || /disconnect|closed|transfer|NetworkError|NotFoundError/i.test(String(e && (e.name + " " + e.message)))) throw new Error("UNPLUGGED"); throw e; }
  }
  async _sh(cmd) {
    const p = this.adb.subprocess.shellProtocol;
    if (p) {
      const r = await p.spawnWaitText(cmd);
      return { out: r.stdout, err: r.stderr, code: r.exitCode };
    }
    // Old devices without shell v2: stdout/stderr are mixed and there is no exit code, so echo it ourselves
    const raw = await this.adb.subprocess.noneProtocol.spawnWaitText(`sh -c ${q(cmd)}; echo __EXIT:$?`);
    const m = raw.match(/__EXIT:(\d+)\s*$/);
    return { out: m ? raw.slice(0, m.index) : raw, err: "", code: m ? +m[1] : 0 };
  }

  /** Like sh(), but hands each output line to onLine as soon as the device prints it (for live progress) */
  async shStream(cmd, onLine) {
    if (this.closed) throw new Error("UNPLUGGED");
    const p = this.adb.subprocess.shellProtocol;
    if (!p) { const r = await this.sh(cmd); r.out.split("\n").forEach((l) => l && onLine(l)); return r; }
    try {
      const proc = await p.spawn(cmd);
      const errText = proc.stderr.pipeThrough(new TextDecoderStream()).pipeThrough(new ConcatStringStream());
      const reader = proc.stdout.getReader();
      const dec = new TextDecoder();
      let buf = "", out = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        const t = dec.decode(value, { stream: true });
        out += t; buf += t;
        let i;
        while ((i = buf.indexOf("\n")) >= 0) { const line = buf.slice(0, i); buf = buf.slice(i + 1); if (line) onLine(line); }
      }
      if (buf) onLine(buf);
      const [err, code] = await Promise.all([errText, proc.exited]);
      return { out, err, code };
    } catch (e) {
      if (this.closed || /disconnect|closed|transfer|NetworkError|NotFoundError/i.test(String(e && (e.name + " " + e.message)))) throw new Error("UNPLUGGED");
      throw e;
    }
  }

  /** Shell command, throws if exit code != 0 */
  async shOk(cmd) {
    const r = await this.sh(cmd);
    if (r.code) throw new Error((r.err || r.out || "command failed").trim());
    return r.out;
  }

  async push(blobOrBytes, remotePath, onProgress) {
    const buf = blobOrBytes instanceof Uint8Array ? blobOrBytes : new Uint8Array(await blobOrBytes.arrayBuffer());
    const sync = await this.adb.sync();
    try {
      const CH = 256 * 1024;
      let sent = 0;
      const stream = new ReadableStream({
        pull(c) {
          if (sent >= buf.length) { c.close(); return; }
          c.enqueue(buf.subarray(sent, sent + CH));
          sent = Math.min(buf.length, sent + CH);
          onProgress && onProgress(sent / buf.length);
        }
      });
      await sync.write({ filename: remotePath, file: stream, permission: 0o644 });
    } finally { await sync.dispose(); }
  }

  /** Read one file from the device into memory */
  async pull(remotePath) {
    const sync = await this.adb.sync();
    try { return await readAll(sync.read(remotePath)); }
    finally { await sync.dispose(); }
  }

  /** Read many files over one sync session. cb(path, bytes, index) is awaited for each */
  async pullMany(paths, cb) {
    const sync = await this.adb.sync();
    try {
      for (let i = 0; i < paths.length; i++) await cb(paths[i], await readAll(sync.read(paths[i])), i);
    } finally { await sync.dispose(); }
  }

  async reboot() { await this.adb.power.reboot(); }
  async close() { try { await this.adb.close(); } catch (e) {} this.closed = true; }
}

async function readAll(stream) {
  return await stream.pipeThrough(new ConcatBufferStream());
}

async function open(usbDev, onAuth) {
  let conn;
  try { conn = await usbDev.connect(); }
  catch (e) {
    if (/busy|claim|access denied|in use/i.test(String(e && (e.name + " " + e.message)))) throw new Error("BUSY");
    throw e;
  }
  // From here the device may show "Allow USB debugging?" and we wait until someone taps it
  onAuth && onAuth(usbDev.serial);
  const transport = await AdbDaemonTransport.authenticate({ serial: usbDev.serial, connection: conn, credentialStore: store });
  return new Device(new Adb(transport), usbDev.serial);
}

/** Ask the user to pick a device in the browser popup */
export async function requestAndOpen(onAuth) {
  if (!mgr) throw new Error("NO_WEBUSB");
  let dev;
  try { dev = await mgr.requestDevice(); }
  catch (e) { throw new Error("NO_DEVICE_SELECTED"); }
  if (!dev) throw new Error("NO_DEVICE_SELECTED");
  return open(dev, onAuth);
}

/** Devices this browser was already allowed to use (no popup needed) */
export async function knownDevices() {
  if (!mgr) return [];
  try { return await mgr.getDevices(); } catch (e) { return []; }
}
export { open as openUsb };
