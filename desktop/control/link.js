// Rojo Desktop - the live link to Rojo on your phone (same Wi-Fi).
// A small WebSocket server. Every message is encrypted with AES-256-GCM using a
// key derived from a secret that only travels inside BASE's encrypted sync, so
// nobody else on the network can read it or send commands.
// Phone -> PC: {id, type:"call", op, args}   PC -> phone: {id, type:"result", ...}
// PC -> phone, unprompted: {type:"cursor", x, y} (0..1 across the screen)
const crypto = require("crypto");
const os = require("os");
const { WebSocketServer } = require("ws");

class Link {
  constructor({ secret, port, name, onCommand, onClients }) {
    this.key = crypto.createHash("sha256").update(String(secret), "utf8").digest();
    this.port = port || 47811;
    this.name = name || os.hostname();
    this.onCommand = onCommand;
    this.onClients = onClients || (() => {});
    this.wss = null;
  }

  // AES-GCM, same layout as WebCrypto: base64( iv(12) | ciphertext | tag(16) )
  enc(obj) {
    const iv = crypto.randomBytes(12);
    const c = crypto.createCipheriv("aes-256-gcm", this.key, iv);
    const ct = Buffer.concat([c.update(JSON.stringify(obj), "utf8"), c.final()]);
    return Buffer.concat([iv, ct, c.getAuthTag()]).toString("base64");
  }
  dec(str) {
    const b = Buffer.from(String(str), "base64");
    if (b.length < 29) throw new Error("short");
    const d = crypto.createDecipheriv("aes-256-gcm", this.key, b.subarray(0, 12));
    d.setAuthTag(b.subarray(b.length - 16));
    return JSON.parse(Buffer.concat([d.update(b.subarray(12, b.length - 16)), d.final()]).toString("utf8"));
  }

  start() {
    return new Promise((resolve) => {
      const listen = (port) => {
        const wss = new WebSocketServer({ port, host: "0.0.0.0", maxPayload: 2 * 1024 * 1024 });
        wss.on("listening", () => { this.wss = wss; this.port = wss.address().port; resolve(this.port); });
        wss.on("error", (e) => { if (e.code === "EADDRINUSE" && port !== 0) listen(0); });
        wss.on("connection", (ws, req) => this.attach(ws, req));
      };
      listen(this.port);
    });
  }

  attach(ws) {
    ws.authed = false;
    const kill = setTimeout(() => { if (!ws.authed) ws.terminate(); }, 8000);
    ws.on("message", async (data) => {
      let msg;
      try { msg = this.dec(data.toString()); } catch (e) { ws.terminate(); return; }   // wrong key: drop
      if (!ws.authed) {
        if (msg.type !== "hello" || Math.abs(Date.now() - (msg.t || 0)) > 5 * 60000) { ws.terminate(); return; }
        ws.authed = true;
        clearTimeout(kill);
        ws.send(this.enc({ type: "welcome", name: this.name, platform: process.platform }));
        this.onClients(this.count());
        return;
      }
      if (msg.type === "call") {
        let result;
        try { result = await this.onCommand(msg.op, msg.args || {}); }
        catch (e) { result = { ok: false, error: String((e && e.message) || e) }; }
        if (ws.readyState === 1) ws.send(this.enc(Object.assign({ id: msg.id, type: "result" }, result || { ok: true })));
      }
    });
    ws.on("close", () => { clearTimeout(kill); this.onClients(this.count()); });
    ws.on("error", () => {});
  }

  count() { return this.wss ? [...this.wss.clients].filter((c) => c.authed && c.readyState === 1).length : 0; }

  broadcast(obj) {
    if (!this.wss) return;
    let payload = null;
    for (const c of this.wss.clients) {
      if (!c.authed || c.readyState !== 1) continue;
      payload = payload || this.enc(obj);
      c.send(payload);
    }
  }

  // ws:// addresses the phone can try (private IPv4 on this machine)
  urls() {
    const out = [];
    const nets = os.networkInterfaces();
    for (const name of Object.keys(nets)) {
      for (const n of nets[name] || []) {
        if (n.family !== "IPv4" && n.family !== 4) continue;
        if (n.internal) continue;
        if (!/^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(n.address)) continue;
        out.push(`ws://${n.address}:${this.port}`);
      }
    }
    return out;
  }

  stop() { if (this.wss) { try { this.wss.close(); } catch (e) {} } }
}

module.exports = { Link };
