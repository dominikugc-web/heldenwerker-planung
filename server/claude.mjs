import { EURO_JE_DOLLAR } from "./konfig.mjs";
import { fehler } from "./router.mjs";

// Claude schreibt nur noch den kurzen Text für die Monteure aus den Antworten des festen Ablaufs.
export const MODELL = "claude-sonnet-5-5";

const SYSTEM = `Du bist Assistent bei Heldenwerker (PV-Anlagen und Wärmepumpen). Du bekommst die Antworten einer technischen Besichtigung.
Schreib daraus eine kurze Zusammenfassung für die Monteure, die auf der Baustelle sofort verstehen müssen, was gemacht wird.
Regeln: kurze Stichpunkte ohne Anrede, keine Gedankenstriche, nur was in den Antworten steht, nichts erfinden.
wasWirdGemacht: der Auftrag in wenigen Punkten. woKommtWasHin: Standorte und Wege. achtung: Gefahren und Besonderheiten auf der Baustelle (Freileitung, Gerüst, Schall, Tank, Mehrkosten, Notizen).
material: Material und Besonderheiten. offen: wichtige Punkte, die nicht beantwortet wurden.`;

const LISTE = { type: "array", items: { type: "string" } };
const SCHEMA = {
  type: "object", additionalProperties: false, required: ["monteure"],
  properties: { monteure: { type: "object", additionalProperties: false, required: ["wasWirdGemacht", "woKommtWasHin", "achtung", "material", "offen"],
    properties: { wasWirdGemacht: LISTE, woKommtWasHin: LISTE, achtung: LISTE, material: LISTE, offen: LISTE } } },
};

// Sonnet 5.5 in Dollar je 1 Mio. Token; Cache-Schreiben (5 Minuten) = 1,25 x Eingabe.
const PREIS = { input: 2, output: 10, cacheRead: 0.1, cacheWrite: 2.5 };

export function kostenSchaetzen(u = {}) {
  const dollar = ((u.input_tokens || 0) * PREIS.input + (u.output_tokens || 0) * PREIS.output
    + (u.cache_read_input_tokens || 0) * PREIS.cacheRead + (u.cache_creation_input_tokens || 0) * PREIS.cacheWrite) / 1e6;
  return Math.round(dollar * EURO_JE_DOLLAR * 100 * 100) / 100;
}

// SDK-Fehler (Netz, Limits, ungültige Anfrage) nur allgemein melden; Details ins Server-Log.
async function geschuetzt(fn) {
  try { return await fn(); } catch (e) {
    if (e.eigen) throw e;
    console.error("Claude-Fehler", e.status, String(e.message).slice(0, 300));
    throw fehler(502, e.status === 429 ? "Claude ist gerade ausgelastet, bitte gleich noch einmal" : "Claude antwortet nicht wie erwartet");
  }
}

export function erstelleClaude({ client }) {
  return {
    monteurText: (antwortenText) => geschuetzt(async () => {
      const m = await client.beta.messages.create({
        model: MODELL, betas: ["server-side-fallback-2026-07-01"], fallbacks: "default", max_tokens: 4000, system: SYSTEM,
        output_config: { effort: "medium", format: { type: "json_schema", schema: SCHEMA } },
        messages: [{ role: "user", content: antwortenText || "Keine Antworten erfasst." }],
      });
      if (m.stop_reason === "refusal") throw fehler(502, "Claude hat die Zusammenfassung abgelehnt");
      if (m.stop_reason === "max_tokens") throw fehler(502, "Die Zusammenfassung war zu lang, bitte noch einmal versuchen");
      const text = m.content.filter((b) => b.type === "text").map((b) => b.text).join("");
      let roh;
      try { roh = JSON.parse(text); } catch { throw fehler(502, "Claude hat kein gültiges Ergebnis geliefert"); }
      return { monteure: roh.monteure, usage: m.usage };
    }),
  };
}
