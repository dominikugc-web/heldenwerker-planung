import fs from "node:fs";
import { PDFDocument, PDFTextField, PDFDropdown, PDFCheckBox } from "pdf-lib";
import { fehler } from "./router.mjs";

const VORLAGE = new URL("../vorlagen/besichtigung.pdf", import.meta.url);

export const PFLICHTFOTOS = ["Dach gesamt", "Dacheindeckung", "Pfannentyp", "Sparren/Lattung", "Dachmaße", "Störer/Gauben",
  "Gerüstfläche", "Kabelweg", "WR-Standort", "Speicher-Standort", "Zählerschrank", "HAK/Zähler"];
// Foto-Haken im PDF in derselben Reihenfolge wie PFLICHTFOTOS.
const FOTO_FELDER = ["foto_Dach_gesamt", "foto_Dacheindeckung", "foto_Pfannentyp", "foto_Sparren_Lattung", "foto_Dachmaße", "foto_Störer_Gauben",
  "foto_Gerüstflaeche", "foto_Kabelweg", "foto_WR-Standort", "foto_Speicher-Standort", "foto_Zaehlerschrank", "foto_HAK_Zaehler"];
export const FOTO_ARTEN = [...PFLICHTFOTOS, "Weitere"];

// Bereich und Beschriftung je Feld, wie im Protokoll gedruckt.
const LABELS = {
  1: { kundenname: "Kundenname", projektnr: "Projekt-Nr.", datum: "Datum (TT.MM.JJJJ)", strasse: "Straße, Nr.", plz_ort: "PLZ, Ort" },
  2: { anlagenleistung: "Anlagenleistung", anzahl_module: "Anzahl Module", speicher: "Speicher", modul: "Modul", wechselrichter: "Wechselrichter", wallbox: "Wallbox", neuer_zs_p2: "Neuer ZS?", wallbox_wunsch: "Wallbox-Wunsch?" },
  3: { dachbelag: "Dachbelag", pfannentyp: "Pfannentyp", k2_haken: "K2-Haken", dachflaeche1: "Dachfläche 1", dachflaeche2: "Dachfläche 2", dachneigung: "Dachneigung",
    dachlaenge: "Dachlänge", dachbreite: "Dachbreite", anz_dachflaechen: "Anz. Dachflächen", sparrenabstand: "Sparrenabstand", sparrenbreite: "Sparrenbreite",
    sparrentiefe: "Sparrentiefe", lattung: "Lattung", kabelweg_laenge: "Kabelweg-Länge", ersatzpfannen: "Ersatzpfannen", aufdachdaemmung: "Aufdachdämmung",
    sturmklammern: "Sturmklammern?", freileitung: "Freileitung?", freil_isoliert: "Freileitung isoliert?" },
  4: { geruesthoehe: "Gerüsthöhe", geruestlaenge: "Gerüstlänge", kabelweg_dach_wr: "Kabelweg", regenrinne: "Regenrinne", geruestflaeche_frei: "Gerüstfläche frei?",
    einschraenkungen: "Einschränkungen?", dachbelegung: "Dachbelegung?", planung_passt: "Planung passt?" },
  5: { wr_standort_p5: "WR-Standort", speicher_standort_p5: "Speicher-Standort", optimierer: "Optimierer", kabelweg_dc: "Kabelweg DC", zs_etage: "ZS Etage",
    wlan_lan: "WLAN / LAN", zaehlernummer: "Zählernummer", zaehlerstand_180: "Zählerstand 1.8.0", zaehlerstand_280: "Zählerstand 2.8.0",
    kabelwege_laengen: "Kabelwege / Längen", waende_beurteilt: "Wände beurteilt", kabel_eingezeichnet: "Kabel eingezeichnet?", neuer_zs_p5: "Neuer ZS?",
    kaskade: "Kaskade?", heizstab: "Heizstab?", potentialausgleich: "Potentialausgleich?", erdspiess: "Erdspieß nötig?", hak_fotos: "HAK-Fotos?" },
  6: { bosch_modell: "Bosch-Modell", wp_leistung: "WP-Leistung", bestandsheizung: "Bestandsheizung", alter_bestandsheizung: "Alter Bestandsheizung",
    verbrauch_jahr: "Verbrauch / Jahr", baujahr: "Baujahr Gebäude", wohnflaeche: "Wohnfläche (m²)", anzahl_wohneinheiten: "Anzahl Wohneinheiten",
    rohrsystem: "Rohrsystem", vorlauftemp: "Vorlauftemp.", oel_im_tank: "Öl im Tank", grundbuch_namen: "Im Grundbuch eingetragene Namen",
    heizlast_vorh: "Heizlast vorh.?", hk_tausch: "HK-Tausch nötig?", tank_ausbau: "Tankausbau durch uns?", warmwasser_wp: "Warmwasser WP?" },
  7: { inneneinheit: "Inneneinheit (Bosch)", ausseneinheit: "Außeneinheit", abstand_innen_aussen: "Abstand innen/außen", leitungsweg_wp: "Leitungsweg WP",
    kernbohrungen: "Kernbohrungen", abstand_grenze: "Abstand Grenze", abstand_fenster: "Abstand Fenster", leitung_zs_wp: "Leitung ZS zur WP",
    hauptsicherung: "Hauptsicherung A", fundament: "Fundament?", kondensat: "Kondensat?", schall_kritisch: "Schall kritisch?",
    zs_ausreichend: "ZS ausreichend?", pv_vorhanden: "PV vorhanden?", speicher_vorhanden: "Speicher vorhanden?" },
};
const PLATZHALTER = new Set(["- bitte wählen -", "TT", "MM", "JJJJ"]);

let cache;
// Liest die Felder einmal aus der PDF-Vorlage: Ja/Nein-Paare und WLAN/LAN werden zu einem Feld, Datum zu einem Textfeld.
export async function ladeFelder() {
  if (cache) return cache;
  const form = (await PDFDocument.load(fs.readFileSync(VORLAGE))).getForm();
  const felder = new Map([["datum", { name: "datum", art: "text" }], ["wlan_lan", { name: "wlan_lan", art: "auswahl", optionen: ["WLAN", "LAN"] }]]);
  for (const f of form.getFields()) {
    const n = f.getName();
    if (n.startsWith("foto_") || n.startsWith("datum_") || n.startsWith("wlan_lan_")) continue;
    if (f instanceof PDFCheckBox) { const basis = n.replace(/_(ja|nein)$/, ""); felder.set(basis, { name: basis, art: "janein" }); }
    else if (f instanceof PDFDropdown) felder.set(n, { name: n, art: "auswahl", optionen: f.getOptions().filter((o) => !PLATZHALTER.has(o)) });
    else if (f instanceof PDFTextField) felder.set(n, { name: n, art: "text" });
  }
  const liste = [];
  for (const [bereich, labels] of Object.entries(LABELS)) for (const [name, label] of Object.entries(labels)) {
    const f = felder.get(name);
    if (!f) throw new Error("Feld fehlt in der Vorlage: " + name);
    liste.push({ ...f, bereich: Number(bereich), label });
    felder.delete(name);
  }
  if (felder.size) throw new Error("Feld ohne Beschriftung: " + [...felder.keys()].join(", "));
  return (cache = liste);
}

const erlaubt = (f) => (f.art === "janein" ? ["ja", "nein", ""] : f.art === "auswahl" ? [...f.optionen, ""] : null);

// JSON-Schema für Claudes Zusammenfassung (structured outputs): jedes Feld Pflicht, leerer Text = unbekannt.
export function ergebnisSchema(felder, dateiIds) {
  const liste = { type: "array", items: { type: "string" } };
  return {
    type: "object", additionalProperties: false, required: ["monteure", "felder", "fotos"],
    properties: {
      monteure: { type: "object", additionalProperties: false, required: ["wasWirdGemacht", "woKommtWasHin", "achtung", "material", "offen"],
        properties: { wasWirdGemacht: liste, woKommtWasHin: liste, achtung: liste, material: liste, offen: liste } },
      felder: { type: "object", additionalProperties: false, required: felder.map((f) => f.name),
        properties: Object.fromEntries(felder.map((f) => [f.name, erlaubt(f) ? { type: "string", enum: erlaubt(f) } : { type: "string" }])) },
      fotos: { type: "array", items: { type: "object", additionalProperties: false, required: ["dateiId", "pflichtfoto"],
        properties: { dateiId: { type: "string", enum: dateiIds.length ? dateiIds : [""] }, pflichtfoto: { type: "string", enum: FOTO_ARTEN } } } },
    },
  };
}

export function ergebnisPruefen(e, felder) {
  const nachName = Object.fromEntries(felder.map((f) => [f.name, f]));
  if (!e || typeof e.felder !== "object" || !Array.isArray(e.fotos)) throw fehler(400, "Ergebnis unvollständig");
  for (const [name, wert] of Object.entries(e.felder)) {
    const f = nachName[name];
    if (!f) throw fehler(400, "Unbekanntes Feld: " + name);
    if (typeof wert !== "string" || (erlaubt(f) && !erlaubt(f).includes(wert))) throw fehler(400, `Ungültiger Wert bei ${f.label}`);
  }
  for (const foto of e.fotos) if (!FOTO_ARTEN.includes(foto.pflichtfoto)) throw fehler(400, "Unbekanntes Pflichtfoto: " + foto.pflichtfoto);
  return e;
}

export const fehltBerechnen = (fotos) => PFLICHTFOTOS.filter((p) => !fotos.some((f) => f.pflichtfoto === p));

// Standardschrift des PDFs kann nur WinAnsi; alles andere wird ersetzt statt abzustürzen.
const winAnsi = (s) => String(s).normalize("NFC").replace(/[^\x20-\x7E\xA0-\xFF€–—‘’“”•\n]/gu, "?");

export async function protokollPdf(ergebnis, felder) {
  const doc = await PDFDocument.load(fs.readFileSync(VORLAGE));
  const form = doc.getForm();
  for (const f of felder) {
    const wert = ergebnis.felder[f.name] || "";
    if (!wert) continue;
    if (f.name === "datum") {
      const [t, m, j] = wert.split(".");
      for (const [n, v] of [["datum_tag", t], ["datum_monat", m], ["datum_jahr", j]]) { try { form.getDropdown(n).select(v); } catch { /* Wert nicht in der Liste */ } }
    } else if (f.name === "wlan_lan") form.getCheckBox("wlan_lan_" + wert.toLowerCase()).check();
    else if (f.art === "janein") form.getCheckBox(`${f.name}_${wert}`).check();
    else if (f.art === "auswahl") form.getDropdown(f.name).select(wert);
    else form.getTextField(f.name).setText(winAnsi(wert));
  }
  PFLICHTFOTOS.forEach((p, i) => { if (ergebnis.fotos.some((x) => x.pflichtfoto === p)) form.getCheckBox(FOTO_FELDER[i]).check(); });
  form.flatten();
  return Buffer.from(await doc.save());
}
