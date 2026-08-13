import { readFile, writeFile } from "node:fs/promises";

const loaderUrl = new URL("../node_modules/.prisma/client/wasm-worker-loader.mjs", import.meta.url);
const workerImport = "export default import('./query_compiler_bg.wasm')";
const moduleImport = "export default import('./query_compiler_bg.wasm?module')";
const source = await readFile(loaderUrl, "utf8");

if (source.includes(moduleImport)) {
  console.log("Prisma Worker compiler loader already uses a raw WASM module.");
} else if (source.includes(workerImport)) {
  await writeFile(loaderUrl, source.replace(workerImport, moduleImport));
  console.log("Prepared Prisma compiler WASM for the OpenNext Worker bundle.");
} else {
  throw new Error("Prisma's generated Worker compiler loader has changed; review the Cloudflare preparation step.");
}