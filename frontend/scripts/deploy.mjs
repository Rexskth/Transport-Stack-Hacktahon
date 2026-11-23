// Copy the static export (./out) into ../web, which the Python API serves at "/".
// The previous contents of ../web are replaced (older versions are in git history).
import { cpSync, existsSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, "..", "out");
const web = join(here, "..", "..", "web");
if (!existsSync(join(out, "index.html"))) throw new Error("Run `npm run build` first: out/index.html not found");
rmSync(web, { recursive: true, force: true });
cpSync(out, web, { recursive: true });
console.log(`Copied ${out} -> ${web}`);
