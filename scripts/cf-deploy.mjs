// Deploy to Cloudflare: make sure the KV namespace exists, put its id in the config, then `wrangler deploy`.
// Needs CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID in the environment (GitHub repository secrets).
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
const w = (args) => execFileSync("npx", ["wrangler", ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] });
const TITLE = "idata-tools-db";
const list = JSON.parse(w(["kv", "namespace", "list"]).replace(/^[^[]*/, ""));
let ns = list.find((n) => n.title === TITLE);
if (!ns) {
  const out = w(["kv", "namespace", "create", TITLE]);
  const id = (out.match(/[0-9a-f]{32}/) || [])[0];
  if (!id) throw new Error("could not read the new KV namespace id:\n" + out);
  ns = { id };
}
const cfg = readFileSync("wrangler.toml", "utf8").replace(/id = "[0-9a-f]{32}"/, `id = "${ns.id}"`);
writeFileSync("wrangler.deploy.toml", cfg);
execFileSync("npx", ["wrangler", "deploy", "--config", "wrangler.deploy.toml"], { stdio: "inherit" });
