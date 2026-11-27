// Builds dist/preview.html: the space design (src/index.html) driven by fake in-browser devices
import { build } from "esbuild";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
const mock = fileURLToPath(new URL("./mock-adb.js", import.meta.url));
const r = await build({
  stdin: { contents: 'import "./test/preview-sim.js"; import "./src/app.js";', resolveDir: ".", loader: "js" },
  bundle: true, format: "iife", minify: true, write: false, target: "chrome100",
  plugins: [{ name: "mock", setup(b) { b.onResolve({ filter: /^\.\/adb\.js$/ }, () => ({ path: mock })); } }]
});
mkdirSync("dist", { recursive: true });
writeFileSync("dist/preview.html", readFileSync("src/index.html", "utf8").replace("/*__BUNDLE__*/", () => r.outputFiles[0].text.replace(/<\/script>/g, "<\\/script>")));
console.log("built dist/preview.html");
