import { route, json, leseJson, fehler } from "./router.mjs";
import { KATALOG, BEREICHE, frageNach, naechste, pruefeAntwort, istAbschluss } from "./fragen.mjs";

route("GET", "/api/fragen", (req, res) => json(res, 200, { bereiche: BEREICHE, katalog: KATALOG }));

// Eine Antwort im festen Ablauf setzen oder ändern. Felder, die fehlen, bleiben wie sie sind.
route("PUT", "/api/planungen/:id/antworten/:frage", async (req, res, p, k) => {
  const f = frageNach(p.frage);
  if (!f) throw fehler(404, "Unbekannte Frage");
  const pl = k.planungen.laden(p.id);
  const abschluss = istAbschluss(pl.antworten);
  // Ein Abschlussbericht bleibt nach dem Senden wie unterschrieben; Korrektur = neuer Bericht.
  if (abschluss && pl.status === "gesendet") throw fehler(409, "Bericht ist gesendet");
  // Besichtigung und Abschlussbericht nicht mischen. Startfrage "bericht" nur, solange keine Besichtigung begonnen ist.
  if (f.id === "bericht" ? !!pl.antworten?.typ?.wert || abschluss : !!f.abschluss !== abschluss) throw fehler(400, "Frage passt nicht zu dieser Planung");
  const b = await leseJson(req);
  const alt = pl.antworten?.[f.id] || { wert: "", uebersprungen: false, dateien: [], notiz: "" };
  const neu = { ...alt, zeit: new Date().toISOString() };
  if ("wert" in b) { neu.wert = pruefeAntwort(f, b.wert); if (neu.wert) neu.uebersprungen = false; }
  if ("uebersprungen" in b) neu.uebersprungen = !!b.uebersprungen;
  if ("wert" in b || "uebersprungen" in b) delete neu.quelle; // selbst beantwortet, nicht mehr "aus Lieferschein"
  if ("notiz" in b) neu.notiz = String(b.notiz || "").trim().slice(0, 4000);
  if (abschluss && f.pflicht && neu.uebersprungen && !neu.notiz) throw fehler(400, "Bitte einen Grund angeben, warum das Foto fehlt");
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
  if (abschluss && frisch.status === "gesendet") throw fehler(409, "Bericht ist gesendet");
  frisch.antworten = { ...(frisch.antworten || {}), [f.id]: neu };
  // Der Kunde hat unterschrieben, was er gesehen hat: jede spätere Änderung braucht eine neue Unterschrift.
  if (abschluss && f.id !== "ab_unterschrift") delete frisch.antworten.ab_unterschrift;
  k.planungen.speichern(frisch);
  json(res, 200, { antworten: frisch.antworten, naechste: naechste(frisch.antworten)?.id || null });
});
