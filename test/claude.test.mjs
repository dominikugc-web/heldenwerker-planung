import { test } from "node:test";
import assert from "node:assert/strict";
import { erstelleClaude, kostenSchaetzen, MODELL } from "../server/claude.mjs";

function clientAttrappe({ texte = ["Hallo ", "Planer"], stop = "end_turn", usage = { input_tokens: 1000, output_tokens: 100 } } = {}) {
  const anfragen = [];
  return {
    anfragen,
    beta: { messages: { stream(params) {
      anfragen.push(params);
      const events = texte.map((t) => ({ type: "content_block_delta", delta: { type: "text_delta", text: t } }));
      return {
        async *[Symbol.asyncIterator]() { yield* events; },
        finalMessage: async () => ({ stop_reason: stop, content: [{ type: "text", text: texte.join("") }], usage }),
      };
    } } },
  };
}

test("Chat streamt Text und schickt Modell, Fallback, Aufwand und Cache mit", async () => {
  const c = clientAttrappe();
  let gestreamt = "";
  const r = await erstelleClaude({ client: c }).chat([{ role: "user", content: "x" }], (t) => (gestreamt += t));
  assert.equal(gestreamt, "Hallo Planer");
  assert.equal(r.text, "Hallo Planer");
  const a = c.anfragen[0];
  assert.equal(a.model, "claude-sonnet-5-5");
  assert.equal(MODELL, "claude-sonnet-5-5");
  assert.deepEqual(a.betas, ["server-side-fallback-2026-07-01"]);
  assert.equal(a.fallbacks, "default");
  assert.deepEqual(a.output_config, { effort: "low" });
  assert.deepEqual(a.cache_control, { type: "ephemeral" });
  assert.match(a.system, /Pflichtfotos/);
});

test("Ablehnung speichert keinen Text, sondern einen Hinweis", async () => {
  const r = await erstelleClaude({ client: clientAttrappe({ stop: "refusal" }) }).chat([{ role: "user", content: "x" }], () => {});
  assert.equal(r.text, "Claude hat diese Nachricht abgelehnt. Formuliere sie bitte anders.");
  assert.equal(r.abgelehnt, true);
});

test("Kosten in Cent: Sonnet 5.5 Preise mit Cache", () => {
  // 1 Mio Eingabe = 2 $, 1 Mio Ausgabe = 10 $, 1 Mio Cache-Lesen = 0,10 $, Cache-Schreiben 2,50 $; 0,92 Euro je $
  assert.equal(kostenSchaetzen({ input_tokens: 1_000_000, output_tokens: 0 }), 184);
  assert.equal(kostenSchaetzen({ input_tokens: 0, output_tokens: 1_000_000 }), 920);
  assert.equal(kostenSchaetzen({ input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 1_000_000, cache_creation_input_tokens: 1_000_000 }), 239.2);
});
