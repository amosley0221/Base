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

  const DRAFT_SYSTEM =
`You are a writing assistant for a student. Produce a complete, well-structured FIRST DRAFT (an essay or a discussion-board post, per the assignment's Format line) that they can revise and make their own.

Guidelines:
- Write in clear, natural student prose — thoughtful but human, not flowery or obviously AI-generated. For a discussion post, a slightly more conversational register is fine.
- Base the essay on the assignment title and the student's notes (prompt, thesis, key points, required length, tone, sources, rubric). If a target length is given, aim for it.
- Structure it: a focused introduction with a clear thesis, body paragraphs that each develop one idea with evidence and analysis, and a conclusion. Use real paragraph breaks.
- If the notes reference sources or citations, work them in and reference them plainly. Never fabricate quotations, statistics, or page numbers — if a specific citation is needed, leave a short [cite] placeholder.
- Output ONLY the essay text. No preamble, no headers like "Essay:", no meta-commentary, no notes about being an AI.
- This is a starting draft for the student to revise — not a finished, submittable paper.`;

  const REVISE_SYSTEM =
`You are a writing assistant helping a student revise their OWN text. Apply the requested change while preserving their meaning, evidence, structure, and voice. Keep any [cite] placeholders intact. Output ONLY the revised text — no preamble, no quotes around it, no commentary, no notes about being an AI.`;

  // action key -> { label, instr }
  const REVISE = {
    shorten:   { label: "Shorten",     instr: "Make this clearly more concise — tighten wording, cut redundancy and filler — while keeping the argument and key points. Aim for about 25% shorter." },
    expand:    { label: "Expand",      instr: "Develop this further with more depth, supporting detail, and analysis. No padding or repetition. Aim for about 30% longer." },
    formal:    { label: "More formal", instr: "Rewrite in a more formal, academic register: no contractions or casual phrasing, precise word choice, still clear and readable." },
    simpler:   { label: "Simpler",     instr: "Rewrite in clearer, plainer language that's easy to read, without losing any of the ideas." },
    grammar:   { label: "Fix grammar", instr: "Fix grammar, spelling, punctuation, and awkward phrasing. Stay as close to the original wording and meaning as possible." },
    tidy:      { label: "Tidy",        instr: "Clean up grammar, spelling, punctuation, and clarity. Keep it close to the original wording." },
    summarize: { label: "Summarize",   instr: "Rewrite as a concise summary of the key points — a few tight sentences or short bullet points." },
  };

  function getKey() { try { return localStorage.getItem(KEY) || ""; } catch (e) { return ""; } }
  function setKey(k) { try { k = (k || "").trim(); if (k) localStorage.setItem(KEY, k); else localStorage.removeItem(KEY); } catch (e) {} }
  function hasKey() { return !!getKey(); }
  function reviseLabel(a) { return (REVISE[a] && REVISE[a].label) || a; }

  // Core: streams a completion. system + user are strings. Calls onText(chunk)
  // as text arrives; resolves with the full string. Throws Error("no-key") if
  // no key is set, or an Error with a friendly message on failure.
  async function complete(system, user, onText, signal, maxTokens) {
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
          max_tokens: maxTokens || 4000,
          stream: true,
          // fixed system prompt → marked for prompt caching (correct shape; may
          // not engage given its short length, costs nothing).
          system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
          messages: [{ role: "user", content: user }],
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
        if (!line.startsWith("data:")) continue;
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

  function draftEssay(o, onText, signal) {
    const kind = o.type === "discussion" ? "discussion-board post" : "essay";
    const lines = [];
    lines.push("Assignment: " + (o.title || "Essay"));
    if (o.course) lines.push("Course: " + o.course);
    lines.push("Format: a " + kind + ".");
    lines.push("");
    lines.push("Notes and requirements from the student:");
    lines.push((o.notes && o.notes.trim()) ? o.notes.trim() : "(No notes provided — infer a reasonable response from the title.)");
    lines.push("");
    lines.push("Write the " + kind + " draft now.");
    return complete(DRAFT_SYSTEM, lines.join("\n"), onText, signal, 4000);
  }

  // action: a key in REVISE (or a raw instruction string). text: the current draft/note.
  function revise(action, text, ctx, onText, signal) {
    const r = REVISE[action] || { instr: action };
    const lines = [];
    if (ctx && ctx.title) lines.push("Context — this is for: " + ctx.title);
    lines.push("Change to make: " + r.instr);
    lines.push("");
    lines.push("Text to revise:");
    lines.push(text || "");
    return complete(REVISE_SYSTEM, lines.join("\n"), onText, signal, 4000);
  }

  // Download a draft as a Word-openable document (.doc — Word HTML, opens in
  // Word and Google Docs; no library needed).
  function downloadDoc(title, text) {
    const e = (s) => String(s == null ? "" : s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
    const paras = String(text || "").split(/\n{2,}/).map((p) => "<p>" + e(p).replace(/\n/g, "<br/>") + "</p>").join("");
    const html = "<!DOCTYPE html><html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'><head><meta charset='utf-8'><title>" + e(title) +
      "</title><style>body{font-family:Calibri,'Segoe UI',sans-serif;font-size:12pt;line-height:1.5;}h1{font-size:16pt;margin:0 0 12pt;}p{margin:0 0 10pt;}</style></head><body>" +
      (title ? "<h1>" + e(title) + "</h1>" : "") + paras + "</body></html>";
    const blob = new Blob(["﻿", html], { type: "application/msword" });
    const name = (String(title || "draft").replace(/[^\w\- ]+/g, "").trim().slice(0, 60) || "draft");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = name + ".doc";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1500);
  }

  return { getKey, setKey, hasKey, draftEssay, revise, reviseLabel, downloadDoc, REVISE, MODEL };
})();
