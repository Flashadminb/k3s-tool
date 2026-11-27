// Builds dist/test.html: the real app with the USB layer swapped for mock-adb.js
import { build } from "esbuild";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
const mock = fileURLToPath(new URL("./mock-adb.js", import.meta.url));
const r = await build({
  entryPoints: ["src/app.js"], bundle: true, format: "iife", write: false, target: "chrome100",
  plugins: [{ name: "mock", setup(b) { b.onResolve({ filter: /^\.\/adb\.js$/ }, () => ({ path: mock })); } }]
});
writeFileSync("dist/test.html", readFileSync("src/index.html", "utf8").replace("/*__BUNDLE__*/", () => r.outputFiles[0].text.replace(/<\/script>/g, "<\\/script>")));
console.log("built dist/test.html");
