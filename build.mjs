import { build } from "esbuild";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
const r = await build({ entryPoints: ["src/app.js"], bundle: true, format: "iife", minify: true, target: "chrome100", write: false });
const js = r.outputFiles[0].text.replace(/<\/script>/g, "<\\/script>");
const html = readFileSync("src/index.html", "utf8").replace("/*__BUNDLE__*/", () => js);
mkdirSync("dist", { recursive: true });
writeFileSync("dist/k3s-tool.html", html);
console.log("built dist/k3s-tool.html", Math.round(html.length / 1024) + " KB");
