import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { pipeline } from "node:stream/promises";
import { ladeJson, speichereJson } from "./speicher.mjs";
import { fehler } from "./router.mjs";

const ID = /^[a-z0-9-]{8,40}$/i;
const ARTEN = ["bild", "video", "pdf", "audio"];

// Planungs-Chats als JSON unter daten/planungen/<id>/, Dateien daneben unter dateien/.
export function erstellePlanungen({ datenDir }) {
  const wurzel = path.join(datenDir, "planungen");
  const ordner = (id) => {
    if (!ID.test(id)) throw fehler(404, "Planung nicht gefunden");
    return path.join(wurzel, id);
  };
  const dateiPfad = (id, dateiId, klein = false) => path.join(ordner(id), "dateien", dateiId + (klein ? ".klein" : ""));

  const api = {
    neu({ projektId, projektTitel, person, kunde = "", adresse = "", nummer = "", vorbefuellt = {}, projekte = [{ id: Number(projektId), nummer, richtungen: [] }] }) {
      // Kundendaten aus HERO und das heutige Datum sind schon beantwortet (änderbar wie jede Antwort).
      const jetzt = new Date();
      const heute = jetzt.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Europe/Berlin" });
      const vor = (wert) => ({ wert: String(wert || "").trim(), uebersprungen: false, dateien: [], notiz: "", zeit: jetzt.toISOString() });
      const antworten = { datum: vor(heute) };
      if (kunde) antworten.kunde = vor(kunde);
      if (nummer) antworten.projektnr = vor(nummer);
      if (adresse) antworten.adresse = vor(adresse);
      // Aus Lieferscheinen (quelle = Nummer); Kundendaten oben haben Vorrang.
      for (const [id, x] of Object.entries(vorbefuellt)) antworten[id] ??= { ...vor(x.wert), notiz: x.notiz || "", quelle: x.quelle };
      const p = { id: crypto.randomUUID(), projektId: Number(projektId), projekte, projektTitel: String(projektTitel || ""), person, erstellt: jetzt.toISOString(),
        status: "offen", kostenCent: 0, verlauf: [], antworten, ergebnis: null, gesendet: { dateien: {}, logbuch: false, pdf: false } };
      speichereJson(path.join(ordner(p.id), "planung.json"), p);
      return p;
    },
    laden(id) {
      const p = ladeJson(path.join(ordner(id), "planung.json"), null);
      if (!p) throw fehler(404, "Planung nicht gefunden");
      return p;
    },
    speichern(p) { speichereJson(path.join(ordner(p.id), "planung.json"), p); },
    liste() {
      if (!fs.existsSync(wurzel)) return [];
      return fs.readdirSync(wurzel).filter((id) => ID.test(id))
        .map((id) => ladeJson(path.join(wurzel, id, "planung.json"), null)).filter(Boolean)
        .map(({ verlauf, ...rest }) => ({ ...rest, nachrichten: verlauf.length }))
        .sort((a, b) => b.erstellt.localeCompare(a.erstellt));
    },
    dateiPfad,

    // Schreibt den Body als Stream in eine tmp-Datei und benennt erst nach vollständigem Empfang um.
    async dateiEmpfangen(req, id, dateiId, { name, art, klein }) {
      api.laden(id);
      if (!ID.test(dateiId) || !ARTEN.includes(art) || !name) throw fehler(400, "Ungültige Datei");
      const ziel = dateiPfad(id, dateiId, klein);
      fs.mkdirSync(path.dirname(ziel), { recursive: true });
      const tmp = ziel + "." + crypto.randomUUID().slice(0, 8) + ".tmp";
      try {
        await pipeline(req, fs.createWriteStream(tmp));
        if (!req.complete) throw new Error("abgebrochen");
      } catch (e) {
        fs.rmSync(tmp, { force: true });
        throw fehler(400, "Upload abgebrochen");
      }
      fs.renameSync(tmp, ziel);
      const groesse = fs.statSync(ziel).size, metaDatei = dateiPfad(id, dateiId) + ".json";
      // v = Version: ändert sich bei jedem Upload (z. B. nach dem Bemalen), damit die Oberfläche das neue Bild lädt.
      const v = Date.now(), alt = ladeJson(metaDatei, null);
      if (!klein) speichereJson(metaDatei, { ...alt, id: dateiId, name, art, groesse, v });
      else if (alt) speichereJson(metaDatei, { ...alt, v });
      return { id: dateiId, name, art, groesse, v };
    },

    // Prüft, dass die Dateien einer Nachricht wirklich hochgeladen sind, und liefert ihre gespeicherten Angaben.
    dateienPruefen(p, refs = []) {
      return refs.map((r) => {
        const meta = ID.test(r.id || "") && ladeJson(dateiPfad(p.id, r.id) + ".json", null);
        if (!meta) throw fehler(400, "Datei fehlt: " + (r.name || r.id));
        return { id: meta.id, name: meta.name, art: meta.art, groesse: meta.groesse, v: meta.v, klein: fs.existsSync(dateiPfad(p.id, r.id, true)), ...(meta.text && { text: meta.text }) };
      });
    },
    // Umgewandelter Text einer Sprachnachricht, damit sie nur einmal durch Whisper muss.
    textMerken(id, dateiId, text) {
      const metaDatei = dateiPfad(id, dateiId) + ".json";
      speichereJson(metaDatei, { ...ladeJson(metaDatei, {}), text });
    },
    // Fürs PDF die verkleinerte Fassung (spart Platz), sonst das Original.
    bildFuerPdf(id, dateiId) {
      const klein = dateiPfad(id, dateiId, true);
      return fs.readFileSync(fs.existsSync(klein) ? klein : dateiPfad(id, dateiId));
    },
  };

  return api;
}
