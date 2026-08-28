import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const output = join(root, "dist");
const appUrl = process.env.PUBLIC_APP_URL || "https://chesnikova-pass.201-24-48-93.sslip.io/";
const safeUrl = new URL(appUrl);
if (safeUrl.protocol !== "https:") throw new Error("PUBLIC_APP_URL must use HTTPS");

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await writeFile(join(output, "index.html"), `<!doctype html>
<html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="refresh" content="0;url=${safeUrl.href}"><title>CHESNIKOVA PASS</title>
<style>body{display:grid;place-items:center;min-height:100vh;margin:0;font:16px system-ui;color:#151515;background:#fff}a{color:inherit}</style></head>
<body><p>CHESNIKOVA PASS переехал. <a href="${safeUrl.href}">Открыть приложение</a></p></body></html>`);
await writeFile(join(output, ".nojekyll"), "");

console.log(`Built a safe redirect to ${safeUrl.origin} in ${output}`);
