/* Stage the web app into www/ for Capacitor to bundle into the APK.
   Copies the root web files + icons/, and writes an index.html that
   loads Home.html (Capacitor's entry point is index.html). */
import { readdirSync, mkdirSync, copyFileSync, writeFileSync, rmSync, statSync } from "node:fs";
import { join, extname } from "node:path";

const ROOT = process.cwd();
const OUT = join(ROOT, "www");
const WEB_EXT = new Set([".html", ".css", ".js", ".webmanifest", ".png", ".ico", ".svg"]);
const SKIP_DIRS = new Set(["www", "android", "node_modules", ".git", ".github", "scripts", "release-notes"]);
// stray design experiments that live in the repo root but aren't part of the app
const SKIP_FILES = new Set(["ONE.html", "Red.html", "Rouge.html"]);

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

// root-level web files
for (const name of readdirSync(ROOT)) {
  if (SKIP_DIRS.has(name) || SKIP_FILES.has(name)) continue;
  const p = join(ROOT, name);
  if (!statSync(p).isFile()) continue;
  if (WEB_EXT.has(extname(name))) copyFileSync(p, join(OUT, name));
}
// icons/ and vendor/ (the bundled Anthropic SDK for the agent)
for (const dir of ["icons", "vendor"]) {
  try {
    mkdirSync(join(OUT, dir), { recursive: true });
    for (const name of readdirSync(join(ROOT, dir))) copyFileSync(join(ROOT, dir, name), join(OUT, dir, name));
  } catch {}
}

// Capacitor loads index.html; send it straight to Home.html
writeFileSync(join(OUT, "index.html"),
  '<!doctype html><meta charset="utf-8"><title>BASE</title><script>location.replace("Home.html")</script>');

console.log("Staged web app into www/");
