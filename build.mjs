import { build } from "esbuild";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
// One bundle, two pages: the main space layout (src/index.html) and the older plain layout kept as a fallback
const r = await build({ entryPoints: ["src/app.js"], bundle: true, format: "iife", minify: true, target: "chrome100", write: false });
const js = r.outputFiles[0].text.replace(/<\/script>/g, "<\\/script>");
mkdirSync("dist", { recursive: true });
for (const [src, out] of [["src/index.html", "dist/k3s-tool.html"], ["src/classic.html", "dist/classic.html"]]) {
  const html = readFileSync(src, "utf8").replace("/*__BUNDLE__*/", () => js);
  writeFileSync(out, html);
  console.log("built " + out, Math.round(html.length / 1024) + " KB");
}
