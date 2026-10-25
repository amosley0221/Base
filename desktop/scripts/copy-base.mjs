// Copies Rojo's shared brain and face from the BASE web app into the desktop app.
import { mkdirSync, copyFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..");
const out = join(here, "..", "app", "base");
mkdirSync(join(out, "vendor"), { recursive: true });
for (const f of ["store.js", "sync.js", "focus.js", "rojo-face.js", "agent-core.js", "vendor/anthropic.js"]) copyFileSync(join(root, f), join(out, f));
console.log("Copied BASE files into desktop/app/base");
