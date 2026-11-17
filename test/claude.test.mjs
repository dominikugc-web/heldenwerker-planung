import { test } from "node:test";
import assert from "node:assert/strict";
import { erstelleClaude, kostenSchaetzen, MODELL } from "../server/claude.mjs";

const MONTEURE = { wasWirdGemacht: ["PV 9,9 kWp"], woKommtWasHin: ["WR im Keller"], achtung: [], material: [], offen: [] };
function client(antwort = { monteure: MONTEURE }, stop = "end_turn") {
  const anfragen = [];
  return { anfragen, beta: { messages: { create: async (p) => { anfragen.push(p); return { stop_reason: stop, content: [{ type: "text", text: JSON.stringify(antwort) }], usage: { input_tokens: 10, output_tokens: 10 } }; } } } };
}

test("Monteur-Text: Modell, Fallback, festes JSON-Format, Antworten als Eingabe", async () => {
  const c = client();
  const r = await erstelleClaude({ client: c }).monteurText("DC / Dachmontage\n• Dachbelag: Pfanne");
  const a = c.anfragen[0];
  assert.equal(MODELL, "claude-sonnet-5-5");
  assert.equal(a.model, MODELL);
  assert.equal(a.fallbacks, "default");
  assert.deepEqual(a.betas, ["server-side-fallback-2026-07-01"]);
  assert.equal(a.output_config.format.type, "json_schema");
  assert.deepEqual(a.output_config.format.schema.required, ["monteure"]);
  assert.match(a.messages[0].content, /Dachbelag: Pfanne/);
  assert.match(a.system, /Monteure/);
  assert.deepEqual(r.monteure, MONTEURE);
});

test("Monteur-Text: Ablehnung und kaputtes JSON geben verständliche Fehler", async () => {
  await assert.rejects(erstelleClaude({ client: client({}, "refusal") }).monteurText("x"), (e) => e.status === 502 && /abgelehnt/.test(e.message));
  const kaputt = { beta: { messages: { create: async () => ({ stop_reason: "end_turn", content: [{ type: "text", text: "{kein json" }] }) } } };
  await assert.rejects(erstelleClaude({ client: kaputt }).monteurText("x"), (e) => e.status === 502);
});

test("Kosten in Cent: Sonnet 5.5 Preise mit Cache", () => {
  // 1 Mio Eingabe = 2 $, 1 Mio Ausgabe = 10 $, 1 Mio Cache-Lesen = 0,10 $, Cache-Schreiben 2,50 $; 0,92 Euro je $
  assert.equal(kostenSchaetzen({ input_tokens: 1_000_000, output_tokens: 0 }), 184);
  assert.equal(kostenSchaetzen({ input_tokens: 0, output_tokens: 1_000_000 }), 920);
  assert.equal(kostenSchaetzen({ input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 1_000_000, cache_creation_input_tokens: 1_000_000 }), 239.2);
});
