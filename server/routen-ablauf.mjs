import { route, json, leseJson, fehler } from "./router.mjs";
import { KATALOG, BEREICHE, frageNach, naechste, pruefeAntwort } from "./fragen.mjs";

route("GET", "/api/fragen", (req, res) => json(res, 200, { bereiche: BEREICHE, katalog: KATALOG }));

// Eine Antwort im festen Ablauf setzen oder ändern. Felder, die fehlen, bleiben wie sie sind.
route("PUT", "/api/planungen/:id/antworten/:frage", async (req, res, p, k) => {
  const f = frageNach(p.frage);
  if (!f) throw fehler(404, "Unbekannte Frage");
  const pl = k.planungen.laden(p.id);
  const b = await leseJson(req);
  const alt = pl.antworten?.[f.id] || { wert: "", uebersprungen: false, dateien: [], notiz: "" };
  const neu = { ...alt, zeit: new Date().toISOString() };
  if ("wert" in b) { neu.wert = pruefeAntwort(f, b.wert); if (neu.wert) neu.uebersprungen = false; }
  if ("uebersprungen" in b) neu.uebersprungen = !!b.uebersprungen;
  if ("wert" in b || "uebersprungen" in b) delete neu.quelle; // selbst beantwortet, nicht mehr "aus Lieferschein"
  if ("notiz" in b) neu.notiz = String(b.notiz || "").trim().slice(0, 4000);
  if ("dateien" in b) {
    neu.dateien = k.planungen.dateienPruefen(pl, (b.dateien || []).map((d) => ({ id: d.id })));
    // Sprachnotizen einmal mit Whisper umwandeln; der Text bleibt an der Datei.
    for (const d of neu.dateien.filter((x) => x.art === "audio" && !x.text)) {
      try { d.text = (await k.transkribieren(k.planungen.dateiPfad(pl.id, d.id))) || undefined; } catch (e) { console.error("Whisper:", String(e.message).slice(0, 200)); }
      if (d.text) k.planungen.textMerken(pl.id, d.id, d.text);
    }
  }
  // Nach dem Warten auf Whisper frisch laden, damit parallele Antworten nicht verloren gehen.
  const frisch = k.planungen.laden(p.id);
  frisch.antworten = { ...(frisch.antworten || {}), [f.id]: neu };
  k.planungen.speichern(frisch);
  json(res, 200, { antworten: frisch.antworten, naechste: naechste(frisch.antworten)?.id || null });
});
