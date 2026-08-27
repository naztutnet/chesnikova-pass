import { copyFile, mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const output = join(root, "dist");
const publicFiles = ["index.html", "styles.css", "app.js", "free-text-parser.js"];

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await Promise.all(publicFiles.map((file) => copyFile(join(root, file), join(output, file))));
await writeFile(join(output, ".nojekyll"), "");

console.log(`Built ${publicFiles.length} public files in ${output}`);
