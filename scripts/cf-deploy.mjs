// Deploy to Cloudflare: make sure the D1 database exists, put its id in the config, `wrangler deploy`, then store the
// first-owner / recovery code as the Worker secret SETUP_CODE (tables are created by the Worker itself on first use).
// Needs CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID (GitHub repository secrets); IDT_SETUP_CODE is optional after
// the owner account exists (it is only needed for the first setup and for owner recovery).
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
// The account id is 32 hex characters; a pasted value may carry spaces, a new line or the rest of the dashboard link
const rawId = process.env.CLOUDFLARE_ACCOUNT_ID || "";
const accountId = (rawId.match(/[0-9a-f]{32}/i) || [])[0];
if (!accountId) {
  console.error(`CLOUDFLARE_ACCOUNT_ID does not contain a 32-character account id (it has ${rawId.length} characters). ` +
    "Copy it again from the Cloudflare dashboard (Workers & Pages > Account ID) into the GitHub secret.");
  process.exit(1);
}
process.env.CLOUDFLARE_ACCOUNT_ID = accountId.toLowerCase();
process.env.CLOUDFLARE_API_TOKEN = (process.env.CLOUDFLARE_API_TOKEN || "").trim();
const w = (args, input) => execFileSync("npx", ["wrangler", ...args], { encoding: "utf8", input, stdio: [input ? "pipe" : "ignore", "pipe", "inherit"] });
const NAME = "idata-tools";
const list = JSON.parse(w(["d1", "list", "--json"]).replace(/^[^[]*/, ""));
let db = list.find((d) => d.name === NAME);
if (!db) {
  const out = w(["d1", "create", NAME]);
  const id = (out.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/) || [])[0];
  if (!id) throw new Error("could not read the new D1 database id:\n" + out);
  db = { uuid: id };
}
const cfg = readFileSync("wrangler.toml", "utf8").replace(/database_id = "[^"]*"/, `database_id = "${db.uuid || db.database_id}"`);
writeFileSync("wrangler.deploy.toml", cfg);
execFileSync("npx", ["wrangler", "deploy", "--config", "wrangler.deploy.toml"], { stdio: "inherit" });
const code = process.env.IDT_SETUP_CODE || "";
if (code.length >= 12) { w(["secret", "put", "SETUP_CODE", "--config", "wrangler.deploy.toml"], code); console.log("SETUP_CODE secret updated"); }
else console.log("IDT_SETUP_CODE not set (or shorter than 12): first-owner setup and owner recovery stay off");
