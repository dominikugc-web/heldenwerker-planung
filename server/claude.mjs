import fs from "node:fs";
import { EURO_JE_DOLLAR } from "./konfig.mjs";
import { ergebnisSchema, felderAusListe, feldListeText } from "./protokoll.mjs";
import { fehler } from "./router.mjs";

const ZUSAMMENFASSEN = `Die Besichtigung ist fertig. Fasse jetzt alles zusammen.
monteure: kurze Stichpunkte ohne Anrede, so dass ein Monteur auf der Baustelle sofort versteht, was gemacht wird (wasWirdGemacht), wo was hinkommt (woKommtWasHin), worauf er achten muss (achtung), Material und Besonderheiten (material) und was noch offen ist (offen). Keine Gedankenstriche. Nur was im Chat steht, nichts erfinden.
felder: nur Felder, deren Wert im Chat vorkommt, als Liste aus feld und wert. Bei Auswahlfeldern genau einen der genannten Werte, bei Ja/Nein "ja" oder "nein". Datum als TT.MM.JJJJ.
fotos: ordne jedes Foto (ID aus der Beschriftung [Foto ID: Name]) genau einem Pflichtfoto zu, sonst "Weitere".`;

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
    chat: (messages, onText) => geschuetzt(async () => {
      const stream = client.beta.messages.stream({ ...basis("low"), max_tokens: 4000, messages });
      let text = "";
      for await (const e of stream) {
        if (e.type === "content_block_delta" && e.delta.type === "text_delta") { text += e.delta.text; onText(e.delta.text); }
      }
      const m = await stream.finalMessage();
      // Bei einer Ablehnung (auch mitten im Stream) wird der Teiltext verworfen.
      if (m.stop_reason === "refusal") return { text: ABGELEHNT, abgelehnt: true, usage: m.usage };
      return { text, abgelehnt: false, usage: m.usage };
    }),

    // Ein Aufruf mit festem JSON-Format: Monteur-Text, Protokoll-Felder, Foto-Zuordnung.
    zusammenfassen: (messages, felder, dateiIds) => geschuetzt(async () => {
      const auftrag = { role: "user", content: [{ type: "text", text: `${ZUSAMMENFASSEN}\n\nFelder des Protokolls:\n${feldListeText(felder)}` }] };
      const letzte = messages.at(-1);
      const msgs = letzte?.role === "user" ? [...messages.slice(0, -1), { role: "user", content: [...letzte.content, ...auftrag.content] }] : [...messages, auftrag];
      const m = await client.beta.messages.create({
        ...basis("high"), max_tokens: 16000, messages: msgs,
        output_config: { effort: "high", format: { type: "json_schema", schema: ergebnisSchema(felder, dateiIds) } },
      });
      if (m.stop_reason === "refusal") throw fehler(502, "Claude hat die Zusammenfassung abgelehnt");
      if (m.stop_reason === "max_tokens") throw fehler(502, "Die Zusammenfassung war zu lang, bitte noch einmal versuchen");
      const text = m.content.filter((b) => b.type === "text").map((b) => b.text).join("");
      let roh;
      try { roh = JSON.parse(text); } catch { throw fehler(502, "Claude hat kein gültiges Ergebnis geliefert"); }
      return { ergebnis: { ...roh, felder: felderAusListe(roh.felder, felder) }, usage: m.usage };
    }),
    basis,
  };
}
