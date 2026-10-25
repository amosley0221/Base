// Rojo Desktop - talks to the per-OS input helper (Windows: PowerShell + SendInput,
// macOS: JavaScript for Automation + CoreGraphics). One command in, one result out.
const { spawn, execFile } = require("child_process");
const fs = require("fs");
const path = require("path");

class Input {
  constructor(userDataDir) {
    this.platform = process.platform;
    this.dir = userDataDir;
    this.proc = null;
    this.queue = [];
    this.buf = "";
    this.ready = null;
  }

  // Copy the helper out of the app bundle (asar) so the OS can run it.
  helperPath(name) {
    const dest = path.join(this.dir, name);
    fs.writeFileSync(dest, fs.readFileSync(path.join(__dirname, name)));
    return dest;
  }

  startWindows() {
    if (this.ready) return this.ready;
    const script = this.helperPath("win-input.ps1");
    this.ready = new Promise((resolve, reject) => {
      this.proc = spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", script], { windowsHide: true });
      let first = true;
      this.proc.stdout.on("data", (d) => {
        this.buf += d.toString("utf8");
        let i;
        while ((i = this.buf.indexOf("\n")) >= 0) {
          const line = this.buf.slice(0, i).trim();
          this.buf = this.buf.slice(i + 1);
          if (!line) continue;
          let msg;
          try { msg = JSON.parse(line); } catch (e) { continue; }
          if (first && msg.ready) { first = false; resolve(); continue; }
          const q = this.queue.shift();
          if (q) q(msg);
        }
      });
      this.proc.stderr.on("data", (d) => console.error("[win-input]", d.toString()));
      this.proc.on("exit", () => {
        this.proc = null; this.ready = null;
        this.queue.splice(0).forEach((q) => q({ ok: false, error: "Input helper stopped" }));
        if (first) reject(new Error("Input helper failed to start"));
      });
      setTimeout(() => { if (first) reject(new Error("Input helper timed out")); }, 20000);
    });
    return this.ready;
  }

  async send(cmd) {
    if (this.platform === "win32") {
      await this.startWindows();
      return new Promise((resolve) => {
        this.queue.push(resolve);
        this.proc.stdin.write(JSON.stringify(cmd) + "\n");
      });
    }
    if (this.platform === "darwin") {
      const script = this.macScript || (this.macScript = this.helperPath("mac-input.js"));
      return new Promise((resolve) => {
        execFile("osascript", ["-l", "JavaScript", script, JSON.stringify(cmd)], { timeout: 30000 }, (err, stdout, stderr) => {
          if (err) return resolve({ ok: false, error: (stderr || err.message || "").trim().slice(0, 300) });
          try { resolve(JSON.parse(String(stdout).trim())); } catch (e) { resolve({ ok: false, error: "Bad helper output" }); }
        });
      });
    }
    return { ok: false, error: "Rojo Desktop only controls Windows and macOS." };
  }

  stop() { if (this.proc) { try { this.proc.kill(); } catch (e) {} } }
}

module.exports = { Input };
