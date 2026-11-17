import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { pipeline } from "node:stream/promises";
import { PDFDocument } from "pdf-lib";
import { ladeJson, speichereJson } from "./speicher.mjs";
import { fehler } from "./router.mjs";

const ID = /^[a-z0-9-]{8,40}$/i;
const ARTEN = ["bild", "video", "pdf"];
export const MAX_FOTOS = 60, MAX_PDF_SEITEN = 30;

// Planungs-Chats als JSON unter daten/planungen/<id>/, Dateien daneben unter dateien/.
export function erstellePlanungen({ datenDir }) {
  const wurzel = path.join(datenDir, "planungen");
  const ordner = (id) => {
    if (!ID.test(id)) throw fehler(404, "Planung nicht gefunden");
    return path.join(wurzel, id);
  };
  const dateiPfad = (id, dateiId, klein = false) => path.join(ordner(id), "dateien", dateiId + (klein ? ".klein" : ""));

  const api = {
    neu({ projektId, projektTitel, person }) {
      const p = { id: crypto.randomUUID(), projektId: Number(projektId), projektTitel: String(projektTitel || ""), person, erstellt: new Date().toISOString(),
        status: "offen", kostenCent: 0, verlauf: [], ergebnis: null, gesendet: { dateien: {}, logbuch: false, pdf: false } };
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
      const groesse = fs.statSync(ziel).size;
      if (!klein) speichereJson(dateiPfad(id, dateiId) + ".json", { id: dateiId, name, art, groesse });
      return { id: dateiId, name, art, groesse };
    },

    // Prüft, dass die Dateien einer Nachricht wirklich hochgeladen sind, und liefert ihre gespeicherten Angaben.
    dateienPruefen(p, refs = []) {
      return refs.map((r) => {
        const meta = ID.test(r.id || "") && ladeJson(dateiPfad(p.id, r.id) + ".json", null);
        if (!meta) throw fehler(400, "Datei fehlt: " + (r.name || r.id));
        return { id: meta.id, name: meta.name, art: meta.art, groesse: meta.groesse, klein: fs.existsSync(dateiPfad(p.id, r.id, true)) };
      });
    },
    pruefeGrenzen(p, neue) {
      const fotos = p.verlauf.flatMap((n) => n.dateien).concat(neue).filter((d) => d.art === "bild").length;
      if (fotos > MAX_FOTOS) throw fehler(400, `Höchstens ${MAX_FOTOS} Fotos pro Planung`);
    },
    async pruefePdfs(p, neue) {
      for (const d of neue.filter((x) => x.art === "pdf")) {
        let seiten;
        try { seiten = (await PDFDocument.load(fs.readFileSync(dateiPfad(p.id, d.id)), { ignoreEncryption: true })).getPageCount(); }
        catch { throw fehler(400, "PDF lässt sich nicht lesen: " + d.name); }
        if (seiten > MAX_PDF_SEITEN) throw fehler(400, `PDFs bitte bis ${MAX_PDF_SEITEN} Seiten (${d.name} hat ${seiten})`);
      }
    },

    // Verlauf -> Claude-Nachrichten. Gleiche Rollen hintereinander werden zusammengelegt.
    alsNachrichten(p) {
      const msgs = [{ role: "user", content: [{ type: "text", text: `Projekt: ${p.projektTitel}` }] }];
      for (const n of p.verlauf) {
        const role = n.rolle === "claude" ? "assistant" : "user";
        const bloecke = [];
        if (role === "user") for (const d of n.dateien) {
          // Beschriftung vor jedem Foto, damit Claude beim Zusammenfassen Fotos per ID zuordnen kann.
          if (d.art === "bild") bloecke.push({ type: "text", text: `[Foto ${d.id}: ${d.name}]` });
          bloecke.push(dateiBlock(p, d));
        }
        if (n.text?.trim()) bloecke.push({ type: "text", text: n.text });
        if (!bloecke.length) continue;
        const letzte = msgs[msgs.length - 1];
        if (letzte.role === role) letzte.content.push(...bloecke);
        else msgs.push({ role, content: bloecke });
      }
      return msgs;
    },
  };

  function dateiBlock(p, d) {
    if (d.art === "video") return { type: "text", text: `[Video: ${d.name}, Inhalt unbekannt]` };
    if (d.art === "pdf") return { type: "document", source: { type: "base64", media_type: "application/pdf", data: fs.readFileSync(dateiPfad(p.id, d.id)).toString("base64") } };
    const klein = dateiPfad(p.id, d.id, true);
    const datei = fs.existsSync(klein) ? klein : dateiPfad(p.id, d.id);
    return { type: "image", source: { type: "base64", media_type: "image/jpeg", data: fs.readFileSync(datei).toString("base64") } };
  }

  return api;
}
