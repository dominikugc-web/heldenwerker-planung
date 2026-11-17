import fs from "node:fs";
import { EURO_JE_DOLLAR } from "./konfig.mjs";

export const MODELL = "claude-sonnet-5-5";
const PROMPT = fs.readFileSync(new URL("./prompt-besichtigung.md", import.meta.url), "utf8");
export const ABGELEHNT = "Claude hat diese Nachricht abgelehnt. Formuliere sie bitte anders.";

// Sonnet 5.5 in Dollar je 1 Mio. Token; Cache-Schreiben (5 Minuten) = 1,25 x Eingabe.
const PREIS = { input: 2, output: 10, cacheRead: 0.1, cacheWrite: 2.5 };

export function kostenSchaetzen(u = {}) {
  const dollar = ((u.input_tokens || 0) * PREIS.input + (u.output_tokens || 0) * PREIS.output
    + (u.cache_read_input_tokens || 0) * PREIS.cacheRead + (u.cache_creation_input_tokens || 0) * PREIS.cacheWrite) / 1e6;
  return Math.round(dollar * EURO_JE_DOLLAR * 100 * 100) / 100;
}

// Gemeinsame Felder jeder Anfrage: fester Systemprompt zuerst, damit der Cache greift.
const basis = (effort) => ({
  model: MODELL,
  betas: ["server-side-fallback-2026-07-01"],
  fallbacks: "default",
  output_config: { effort },
  cache_control: { type: "ephemeral" },
  system: PROMPT,
});

export function erstelleClaude({ client }) {
  return {
    async chat(messages, onText) {
      const stream = client.beta.messages.stream({ ...basis("low"), max_tokens: 4000, messages });
      let text = "";
      for await (const e of stream) {
        if (e.type === "content_block_delta" && e.delta.type === "text_delta") { text += e.delta.text; onText(e.delta.text); }
      }
      const m = await stream.finalMessage();
      // Bei einer Ablehnung (auch mitten im Stream) wird der Teiltext verworfen.
      if (m.stop_reason === "refusal") return { text: ABGELEHNT, abgelehnt: true, usage: m.usage };
      return { text, abgelehnt: false, usage: m.usage };
    },
    basis,
  };
}
