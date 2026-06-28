/* ===========================================================
   BASE — Claude API helper (client-side, the user's own key)
   Direct browser access to the Anthropic Messages API. The key
   lives only in this device's localStorage and is never put in
   the data store / backups. Exposes window.BaseAI.
   =========================================================== */
window.BaseAI = (function () {
  "use strict";

  const KEY = "base_anthropic_key";
  const MODEL = "claude-opus-4-8";
  const ENDPOINT = "https://api.anthropic.com/v1/messages";

  // Fixed system prompt — cache_control marks it for prompt caching so repeat
  // drafts reuse the prefix (it's short, so caching may not engage, but it's
  // the correct shape and costs nothing).
  const SYSTEM =
`You are an essay-writing assistant for a student. Produce a complete, well-structured FIRST DRAFT they can revise and make their own.

Guidelines:
- Write in clear, natural student prose — academic but human, not flowery or obviously AI-generated.
- Base the essay on the assignment title and the student's notes (prompt, thesis, key points, required length, tone, sources, rubric). If a target length is given, aim for it.
- Structure it: a focused introduction with a clear thesis, body paragraphs that each develop one idea with evidence and analysis, and a conclusion. Use real paragraph breaks.
- If the notes reference sources or citations, work them in and reference them plainly. Never fabricate quotations, statistics, or page numbers — if a specific citation is needed, leave a short [cite] placeholder.
- Output ONLY the essay text. No preamble, no headers like "Essay:", no meta-commentary, no notes about being an AI.
- This is a starting draft for the student to revise — not a finished, submittable paper.`;

  function getKey() { try { return localStorage.getItem(KEY) || ""; } catch (e) { return ""; } }
  function setKey(k) {
    try { k = (k || "").trim(); if (k) localStorage.setItem(KEY, k); else localStorage.removeItem(KEY); } catch (e) {}
  }
  function hasKey() { return !!getKey(); }

  function buildPrompt(o) {
    const out = [];
    out.push("Assignment: " + (o.title || "Essay"));
    if (o.course) out.push("Course: " + o.course);
    out.push("");
    out.push("Notes and requirements from the student:");
    out.push((o.notes && o.notes.trim()) ? o.notes.trim() : "(No notes provided — infer a reasonable essay from the title.)");
    out.push("");
    out.push("Write the essay draft now.");
    return out.join("\n");
  }

  // Streams the draft. Calls onText(chunk) as text arrives; resolves with the
  // full string. Pass an AbortSignal to cancel. Throws Error("no-key") if no
  // key is set, or an Error with a friendly message on failure.
  async function draftEssay(opts, onText, signal) {
    if (!hasKey()) throw new Error("no-key");
    let res;
    try {
      res = await fetch(ENDPOINT, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": getKey(),
          "anthropic-version": "2023-06-01",
          "anthropic-dangerous-direct-browser-access": "true",
        },
        body: JSON.stringify({
          model: MODEL,
          max_tokens: 4000,
          stream: true,
          system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
          messages: [{ role: "user", content: buildPrompt(opts) }],
        }),
        signal,
      });
    } catch (e) {
      if (e && e.name === "AbortError") throw e;
      throw new Error("Couldn't reach the Claude API — check your connection.");
    }

    if (!res.ok) {
      let msg = "Request failed (" + res.status + ").";
      try { const j = await res.json(); if (j && j.error && j.error.message) msg = j.error.message; } catch (e) {}
      if (res.status === 401) msg = "That API key was rejected. Re-check it in Settings.";
      else if (res.status === 429) msg = "Rate limited or out of credit — try again shortly.";
      else if (res.status === 400 && /credit|balance|billing/i.test(msg)) msg = "Your Anthropic account needs billing/credit enabled.";
      throw new Error(msg);
    }

    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = "", full = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let nl;
      while ((nl = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line.startsWith("data:")) continue;        // skip "event:" lines / blanks
        const data = line.slice(5).trim();
        if (!data || data === "[DONE]") continue;
        let ev; try { ev = JSON.parse(data); } catch (e) { continue; }
        if (ev.type === "content_block_delta" && ev.delta && ev.delta.type === "text_delta") {
          full += ev.delta.text;
          if (onText) onText(ev.delta.text);
        } else if (ev.type === "error") {
          throw new Error((ev.error && ev.error.message) || "The stream errored.");
        }
      }
    }
    return full;
  }

  return { getKey, setKey, hasKey, draftEssay, MODEL };
})();
