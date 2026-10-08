import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const output = path.join(root, ".firebase-site");
await fs.rm(output, { recursive: true, force: true });
await fs.mkdir(output, { recursive: true });
const pages = (await fs.readdir(root)).filter((file) => file.endsWith(".html"));
for (const file of [...pages, "rum-identity.js", "rum-actions.js"]) {
  await fs.copyFile(path.join(root, file), path.join(output, file));
}
await fs.cp(path.join(root, "assets"), path.join(output, "assets"), { recursive: true });
console.log(`Prepared ${pages.length} workshop pages and their assets for Firebase Hosting.`);
