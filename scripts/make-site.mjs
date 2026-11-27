// Collect what the site serves into site/: the built pages plus the PWA files in public/
import { mkdirSync, copyFileSync, readdirSync, existsSync } from "node:fs";
mkdirSync("site", { recursive: true });
copyFileSync("dist/k3s-tool.html", "site/index.html");
copyFileSync("dist/classic.html", "site/classic.html");
if (existsSync("dist/preview.html")) copyFileSync("dist/preview.html", "site/preview.html");
for (const f of readdirSync("public")) copyFileSync("public/" + f, "site/" + f);
console.log("site/ ready");
