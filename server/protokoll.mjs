import fs from "node:fs";
import { PDFDocument, PDFTextField, PDFDropdown, PDFCheckBox } from "pdf-lib";
import { fehler } from "./router.mjs";

const VORLAGE = new URL("../vorlagen/besichtigung.pdf", import.meta.url);

// Pflichtfotos wie im Online-Formular „Technische Besichtigung“ (Stand 17.11.2026, Screenshots von Dominik).
export const PFLICHTFOTOS = ["Dach gesamt", "Pfannentyp", "Sparren/Lattung", "Erdung", "Störer", "Gerüstfläche", "Kabelweg", "WR/SP Standort", "Zählerschrank", "HAK"];
// Foto-Haken im PDF je Pflichtfoto (Erdung hat im PDF keinen Haken).
const FOTO_FELDER = { "Dach gesamt": ["foto_Dach_gesamt"], "Pfannentyp": ["foto_Pfannentyp"], "Sparren/Lattung": ["foto_Sparren_Lattung"], "Erdung": [],
  "Störer": ["foto_Störer_Gauben"], "Gerüstfläche": ["foto_Gerüstflaeche"], "Kabelweg": ["foto_Kabelweg"], "WR/SP Standort": ["foto_WR-Standort", "foto_Speicher-Standort"],
  "Zählerschrank": ["foto_Zaehlerschrank"], "HAK": ["foto_HAK_Zaehler"] };
// Felder, die das Online-Formular abfragt, das PDF aber nicht hat. Sie stehen in Prüfansicht und Logbuch, nicht im PDF.
const ZUSATZ = [
  [3, "sat_schluessel", "SAT-Schlüssel o. Ä. einbauen?", "text"],
  [4, "wandmontage", "Wandmontage?", "janein"],
  [4, "geruest_notiz", "Notiz Gerüst", "text"],
  [5, "uess_innen", "Kabelweg innen über 10 m: ÜSS", "text"],
  [5, "kabelweg_zs_wr", "Kabelweglänge ZS zum WR", "text"],
  [5, "mehrkosten", "Mehrkosten", "text"],
  [5, "zs_plaetze", "Plätze im neuen ZS", "text"],
  [5, "kabelweg_zs_zs", "Kabelweglänge ZS zu ZS", "text"],
  [5, "kabelweg_hak_zs", "Kabelweglänge HAK zum neuen ZS", "text"],
  [5, "elektro_notiz", "Notiz Heizstab, Potentialausgleich, Erdspieß", "text"],
  [6, "tank_art", "Art vom Tank", "text"],
  [7, "kondensat_wohin", "Kondensat wohin", "auswahl", ["Abfluss", "Erde"]],
  [7, "solarthermie_vorhanden", "Solarthermie vorhanden?", "janein"],
  [7, "wp_notiz", "Notiz Wärmepumpe", "text"],
];
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
  for (const [bereich, name, label, art, optionen] of ZUSATZ) liste.push({ name, art, ...(optionen && { optionen }), bereich, label, zusatz: true });
  // Nach Bereich sortiert, damit Zusatzfelder in ihrem Bereich stehen (sort ist stabil).
  return (cache = liste.sort((a, b) => a.bereich - b.bereich));
}

export const BEREICHE = ["Objekt und Kunde", "PV-System und Angebot", "DC und Dachmontage", "Gerüst, Sicherheit, Dachfreigabe", "AC und Elektro PV", "Wärmepumpe Bestand", "WP-Standort und Leitungsweg"];

// Kurzfassung der ausgefüllten Felder für das HERO-Logbuch, solange das PDF nicht hochgeladen werden kann.
export function protokollText(werte, felder) {
  return BEREICHE.map((titel, i) => {
    const zeilen = felder.filter((f) => f.bereich === i + 1 && werte[f.name]).map((f) => `• ${f.label}: ${werte[f.name]}`);
    return zeilen.length ? `${titel}\n${zeilen.join("\n")}` : "";
  }).filter(Boolean).join("\n\n");
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
      // Als Liste Feld + Wert: ein Objekt mit ~110 Pflicht-enums ist der API zu groß ("compiled grammar is too large", 17.11.).
      felder: { type: "array", items: { type: "object", additionalProperties: false, required: ["feld", "wert"],
        properties: { feld: { type: "string", enum: felder.map((f) => f.name) }, wert: { type: "string" } } } },
      fotos: { type: "array", items: { type: "object", additionalProperties: false, required: ["dateiId", "pflichtfoto"],
        properties: { dateiId: { type: "string", enum: dateiIds.length ? dateiIds : [""] }, pflichtfoto: { type: "string", enum: FOTO_ARTEN } } } },
    },
  };
}

// Claudes Liste -> Objekt mit allen Feldern. Auswahlwerte ohne Groß/Klein abgleichen, Ungültiges verwerfen
// (der Planer sieht leere Felder in der Prüfung und trägt nach).
export function felderAusListe(liste, felder) {
  const aus = Object.fromEntries(felder.map((f) => [f.name, ""]));
  const nachName = Object.fromEntries(felder.map((f) => [f.name, f]));
  for (const { feld, wert } of liste || []) {
    const f = nachName[feld];
    if (!f || typeof wert !== "string") continue;
    const ok = erlaubt(f);
    if (!ok) aus[feld] = wert.trim();
    else { const treffer = ok.find((o) => o.toLowerCase() === wert.trim().toLowerCase()); if (treffer !== undefined) aus[feld] = treffer; }
  }
  return aus;
}

// Feldbeschreibung für den Auftrag an Claude: Name (Beschriftung): erlaubte Werte.
export function feldListeText(felder) {
  return felder.map((f) => `${f.bereich}. ${f.name} (${f.label})` + (erlaubt(f) ? ": " + erlaubt(f).filter(Boolean).join(" | ") : "")).join("\n");
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
    if (!wert || f.zusatz) continue; // Zusatzfelder haben kein PDF-Feld
    if (f.name === "datum") {
      const [t, m, j] = wert.split(".");
      for (const [n, v] of [["datum_tag", t], ["datum_monat", m], ["datum_jahr", j]]) { try { form.getDropdown(n).select(v); } catch { /* Wert nicht in der Liste */ } }
    } else if (f.name === "wlan_lan") form.getCheckBox("wlan_lan_" + wert.toLowerCase()).check();
    else if (f.art === "janein") form.getCheckBox(`${f.name}_${wert}`).check();
    else if (f.art === "auswahl") form.getDropdown(f.name).select(wert);
    else form.getTextField(f.name).setText(winAnsi(wert));
  }
  for (const p of PFLICHTFOTOS) if (ergebnis.fotos.some((x) => x.pflichtfoto === p)) for (const n of FOTO_FELDER[p]) form.getCheckBox(n).check();
  form.flatten();
  return Buffer.from(await doc.save());
}
