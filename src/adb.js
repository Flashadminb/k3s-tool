import { Adb, AdbDaemonTransport } from "@yume-chan/adb";
import { AdbDaemonWebUsbDeviceManager } from "@yume-chan/adb-daemon-webusb";
import AdbWebCredentialStore from "@yume-chan/adb-credential-web";
import { ReadableStream } from "@yume-chan/stream-extra";

const store = new AdbWebCredentialStore("K3S Tool");
let adb = null;

export const hasWebUsb = () => !!AdbDaemonWebUsbDeviceManager.BROWSER;
export const isConnected = () => !!adb;

// Errors thrown with these codes are mapped to help guides in app.js
export async function connect() {
  const mgr = AdbDaemonWebUsbDeviceManager.BROWSER;
  if (!mgr) throw new Error("NO_WEBUSB");
  const dev = await mgr.requestDevice();
  if (!dev) throw new Error("NO_DEVICE_SELECTED");
  let conn;
  try { conn = await dev.connect(); }
  catch (e) {
    if (/busy|claim|access denied/i.test(String(e && (e.name + e.message)))) throw new Error("BUSY");
    throw e;
  }
  const transport = await AdbDaemonTransport.authenticate({ serial: dev.serial, connection: conn, credentialStore: store });
  adb = new Adb(transport);
  return { serial: dev.serial };
}

export async function sh(cmd) {
  if (!adb) throw new Error("NOT_CONNECTED");
  const p = adb.subprocess.shellProtocol;
  if (p) { const r = await p.spawnWaitText(cmd); return { out: r.stdout, err: r.stderr, code: r.exitCode }; }
  return { out: await adb.subprocess.noneProtocol.spawnWaitText(cmd), err: "", code: 0 };
}

export async function pushFile(file, remotePath, onProgress) {
  if (!adb) throw new Error("NOT_CONNECTED");
  const sync = await adb.sync();
  try {
    const buf = new Uint8Array(await file.arrayBuffer());
    const CH = 1024 * 1024;
    const stream = new ReadableStream({
      start(c) {
        for (let i = 0; i < buf.length; i += CH) c.enqueue(buf.subarray(i, i + CH));
        c.close();
      }
    });
    onProgress && onProgress(0.5);
    await sync.write({ filename: remotePath, file: stream, permission: 0o644 });
    onProgress && onProgress(1);
  } finally { await sync.dispose(); }
}

export async function disconnect() { if (adb) { try { await adb.close(); } catch (e) {} adb = null; } }
