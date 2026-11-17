// Fragenkatalog der Besichtigung: der feste Ablauf im Planungs-Chat und die Grundlage für das PDF.
// Vorlage: Online-Formular „Technische Besichtigung PV + Wärmepumpe“ (Protokoll Technische Wärmepumpe in HERO).
// Änderungen an Fragen, Reihenfolge oder Antworten nur hier.
//
// art: janein | auswahl (wenige Knöpfe) | liste (lange Auswahlliste) | zahl (mit einheit) | text | foto
// nur: "pv" | "wp" (Bereich gilt nur dafür), wenn: { frage, ist } (Folgefrage), pflicht: true (Pflichtfoto)
import { fehler } from "./router.mjs";

export const BEREICHE = {
  start: "Besichtigung",
  objekt: "Objekt / Kundendaten",
  pv: "PV-System / Angebot",
  dc: "DC / Dachmontage",
  geruest: "Gerüst / Sicherheit / Dachfreigabe",
  fotos: "Pflichtfotos DC / AC",
  ac: "AC / Elektro PV",
  wp_bestand: "Wärmepumpe: Bestand / Auslegung",
  wp_standort: "WP-Standort / Leitungsweg / Elektro",
  abschluss: "Abschluss",
};
const NUR = { pv: "pv", dc: "pv", geruest: "pv", fotos: "pv", ac: "pv", wp_bestand: "wp", wp_standort: "wp" };

const reihe = (name, werte, einheit) => werte.map((w) => `${name} ${w} ${einheit}`);
const MODULE = [...reihe("Aiko Neostar", [440, 445, 450, 455, 460, 465, 470, 475, 480, 485, 490, 495, 500], "W"),
  ...reihe("Trina Vertex S+", [425, 430, 435, 440, 445, 450], "W"), ...reihe("Longi Hi-MO X6", [425, 430, 435, 440, 445, 450, 460], "W"),
  ...reihe("Longi Hi-MO X10", [475, 480, 485, 490, 495, 500, 505], "W"), ...reihe("Bauer Glas-Glas", [420, 425, 430, 440, 445, 450, 460, 470, 475], "W"),
  "Longi EcoLife 475 W", // häufigstes Modul in den HERO-Lieferscheinen (17.11.2026)
  "Sonstige (Notiz)"];
const kw = (name, werte) => reihe(name, werte.map((w) => w.toFixed(1).replace(".", ",")), "kW");
const WECHSELRICHTER = [...kw("Sungrow", [3, 3.6, 4, 5, 6, 8, 10, 12, 15, 20, 25]), ...kw("Fronius", [3, 4, 5, 6, 8, 10, 12]),
  ...kw("SMA", [3, 4, 5, 6, 8, 10, 12, 15, 20, 25]), ...kw("GoodWe", [3, 5, 6, 8, 10, 12, 15, 20, 25]),
  ...kw("Huawei", [3, 4, 5, 6, 8, 10, 12, 15, 17, 20, 25]), ...kw("Deye", [5, 6, 8, 10, 12, 16, 20, 25]),
  "EcoFlow PowerStream 600 W", "EcoFlow PowerStream 800 W", "EcoFlow STREAM Microinverter 600 W", "EcoFlow STREAM Microinverter 800 W",
  "EcoFlow STREAM Ultra", "EcoFlow STREAM Max", "EcoFlow STREAM Pro", ...kw("EcoFlow PowerOcean", [5, 6, 8, 10, 12, 15]).map((s) => s.replace(",0 kW", " kW")), "Sonstige (Notiz)"];

const PFLICHTFOTOS = ["Dach gesamt", "Pfannentyp", "Sparren/Lattung", "Erdung", "Störer", "Gerüstfläche", "Kabelweg", "WR/SP Standort", "Zählerschrank", "HAK"];

// [bereich, id, frage, art, extra]
const F = [
  ["start", "typ", "Was wird besichtigt?", "auswahl", { optionen: ["PV", "Wärmepumpe", "Beides"] }],

  ["objekt", "kunde", "Kundenname", "text"],
  ["objekt", "projektnr", "Projekt-Nr.", "text"],
  ["objekt", "datum", "Datum der Besichtigung", "text"],
  ["objekt", "adresse", "Adresse (Straße, PLZ, Ort)", "text"],

  ["pv", "anlagenleistung", "Anlagenleistung", "zahl", { einheit: "kWp" }],
  ["pv", "anzahl_module", "Anzahl Module", "zahl"],
  ["pv", "speicher", "Speicher", "text"],
  ["pv", "modul", "Modul", "liste", { optionen: MODULE }],
  ["pv", "wechselrichter", "Wechselrichter", "liste", { optionen: WECHSELRICHTER }],
  ["pv", "wallbox", "Wallbox", "text"],
  ["pv", "neuer_zs", "Neuer Zählerschrank?", "janein"],
  ["pv", "wallbox_wunsch", "Wallbox-Wunsch?", "janein"],

  ["dc", "dachbelag", "Dachbelag", "auswahl", { optionen: ["Pfanne", "Bitum", "Trapezblech", "Flachdach", "Sonstige (Notiz)"] }],
  ["dc", "pfannentyp", "Pfannentyp", "liste", { optionen: ["Frankfurter Pfanne", "Doppel-S / Reformpfanne", "Biberschwanz", "Hohlpfanne / Mönch-Nonne", "Falzziegel / Flachdachziegel", "Tegalit / Glattziegel", "Krempziegel", "Strangfalzziegel", "Tonpfanne (sonstige)", "Betondachstein", "Sonstige (Notiz)"], wenn: { frage: "dachbelag", ist: "Pfanne" } }],
  ["dc", "k2_haken", "K2-Haken", "liste", { optionen: ["SingleHook 1.1", "SingleHook 3S", "SingleHook 3S Long", "SingleHook 4S", "SingleHook Vario", "SingleHook Alpin", "SingleHook FT", "SingleHook 2", "SolidHook 3S+", "CrossHook 3S", "TiltUp Hook", "SingleRail SpliceFoot", "SingleRail Stockschrauben", "Falzklemme", "MiniRail", "D-Dome", "S-Dome", "Sonstige (Notiz)"] }],
  ["dc", "dachneigung", "Dachneigung", "zahl", { einheit: "°" }],
  ["dc", "anz_dachflaechen", "Anzahl Dachflächen", "zahl"],
  ["dc", "sparrenabstand", "Sparrenabstand", "zahl", { einheit: "cm" }],
  ["dc", "sparrenbreite", "Sparrenbreite", "zahl", { einheit: "cm" }],
  ["dc", "sparrentiefe", "Sparrentiefe", "zahl", { einheit: "cm" }],
  ["dc", "lattung", "Lattung", "text"],
  ["dc", "ersatzpfannen", "Ersatzpfannen", "zahl", { einheit: "Stück" }],
  ["dc", "leistungsoptimierer", "Leistungsoptimierer", "zahl", { einheit: "Stück" }],
  ["dc", "aufdachdaemmung", "Aufdachdämmung", "zahl", { einheit: "cm" }],
  ["dc", "sat_schluessel", "SAT-Schlüssel oder Ähnliches einbauen?", "text"],
  ["dc", "freileitung", "Freileitung?", "janein"],
  ["dc", "freileitung_isoliert", "Freileitung isoliert?", "janein", { wenn: { frage: "freileitung", ist: "ja" } }],

  ["geruest", "geruesthoehe", "Gerüsthöhe", "zahl", { einheit: "m" }],
  ["geruest", "regenrinne", "Regenrinne", "text"],
  ["geruest", "geruestflaeche_frei", "Gerüstfläche frei?", "janein"],
  ["geruest", "geruest_hindernis", "Was steht im Weg?", "text", { wenn: { frage: "geruestflaeche_frei", ist: "nein" } }],
  ["geruest", "wandmontage", "Wandmontage?", "janein"],

  ...PFLICHTFOTOS.map((name) => ["fotos", "foto_" + name.toLowerCase().replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/[^a-z]+/g, "_"), `Foto: ${name}`, "foto", { pflicht: true, titel: name }]),

  ["ac", "wr_standort", "WR-Standort", "text"],
  ["ac", "speicher_standort", "Speicher-Standort", "text"],
  ["ac", "kabelweg", "Kabelweg", "auswahl", { optionen: ["Schacht", "Kamin", "Alu", "Kupfer", "Sonstige (Notiz)"] }],
  ["ac", "uess_innen", "Wenn länger als 10 m innen: ÜSS", "text"],
  ["ac", "kabelweg_dc", "Kabelweg DC", "text"],
  ["ac", "zs_etage", "Zählerschrank-Etage", "text"],
  ["ac", "wlan_lan", "WLAN oder LAN?", "auswahl", { optionen: ["WLAN", "LAN"] }],
  ["ac", "zaehlernummer", "Zählernummer", "text"],
  ["ac", "zaehlerstand_180", "Zählerstand 1.8.0", "zahl", { einheit: "kWh" }],
  ["ac", "zaehlerstand_280", "Zählerstand 2.8.0", "zahl", { einheit: "kWh" }],
  ["ac", "kabelweg_zs_wr", "Kabelweglänge vom Zählerschrank zum WR", "zahl", { einheit: "m" }],
  ["ac", "waende_beurteilt", "Wände beurteilt", "auswahl", { optionen: ["Massiv", "Holz", "Gipskarton"] }],
  ["ac", "kabel_eingezeichnet", "Kabel eingezeichnet?", "janein"],
  ["ac", "mehrkosten", "Mehrkosten", "text"],
  ["ac", "neuer_zs_ac", "Neuer Zählerschrank?", "janein"],
  ["ac", "zs_plaetze", "Wie viele Plätze im neuen Zählerschrank?", "zahl", { wenn: { frage: "neuer_zs_ac", ist: "ja" } }],
  ["ac", "kabelweg_zs_zs", "Kabelweglänge Zählerschrank zu Zählerschrank", "zahl", { einheit: "m", wenn: { frage: "neuer_zs_ac", ist: "ja" } }],
  ["ac", "kaskade", "Kaskade?", "janein"],
  ["ac", "kabelweg_hak_zs", "Kabelweglänge vom HAK zum neuen Zählerschrank", "zahl", { einheit: "m", wenn: { frage: "neuer_zs_ac", ist: "ja" } }],
  ["ac", "heizstab", "Heizstab?", "janein"],
  ["ac", "potentialausgleich", "Potentialausgleich?", "janein"],
  ["ac", "erdspiess", "Erdspieß nötig?", "janein"],

  ["wp_bestand", "bosch_modell", "Bosch-Modell", "text"],
  ["wp_bestand", "wp_leistung", "WP-Leistung", "zahl", { einheit: "kW" }],
  ["wp_bestand", "bestandsheizung", "Bestandsheizung", "auswahl", { optionen: ["Ölheizung", "Gasheizung", "Pelletheizung", "Fernwärme", "Sonstige (Notiz)"] }],
  ["wp_bestand", "alter_bestandsheizung", "Alter der Bestandsheizung", "zahl", { einheit: "Jahre" }],
  ["wp_bestand", "verbrauch_jahr", "Verbrauch pro Jahr", "zahl", { einheit: "kWh oder l" }],
  ["wp_bestand", "baujahr", "Baujahr Gebäude", "zahl"],
  ["wp_bestand", "wohnflaeche", "Wohnfläche", "zahl", { einheit: "m²" }],
  ["wp_bestand", "anzahl_wohneinheiten", "Anzahl Wohneinheiten", "zahl"],
  ["wp_bestand", "rohrsystem", "Rohrsystem", "auswahl", { optionen: ["1-Rohr", "2-Rohr"] }],
  ["wp_bestand", "vorlauftemp", "Vorlauftemperatur", "zahl", { einheit: "°C" }],
  ["wp_bestand", "tank_art", "Art vom Tank", "auswahl", { optionen: ["Kunststoff", "Stahl", "Erdtank", "Kein Tank", "Sonstige (Notiz)"], wenn: { frage: "bestandsheizung", ist: "Ölheizung" } }],
  ["wp_bestand", "oel_im_tank", "Öl im Tank", "zahl", { einheit: "Liter", wenn: { frage: "bestandsheizung", ist: "Ölheizung" } }],
  ["wp_bestand", "tank_ausbau", "Tankausbau durch uns?", "janein", { wenn: { frage: "bestandsheizung", ist: "Ölheizung" } }],
  ["wp_bestand", "grundbuch_namen", "Im Grundbuch eingetragene Namen", "text"],
  ["wp_bestand", "heizlast_vorh", "Heizlast vorhanden?", "janein"],
  ["wp_bestand", "hk_tausch", "Heizkörper-Tausch nötig?", "janein"],
  ["wp_bestand", "warmwasser_wp", "Warmwasser über WP?", "janein"],

  ["wp_standort", "inneneinheit", "Inneneinheit (Bosch)", "liste", { optionen: ["Compress 3400i AWS", "Compress 3800i AW", "Compress 5000 AW", "Compress 5000 DW", "Compress 5800i AW", "Compress 6800i AW", "Compress 7000i AW", "Compress 7001i AW", "Compress 7400i AW", "Compress 7800i LW", "Compress 8800i AW", "Supraeco STE-1", "Supraeco STM-1", "Supraeco T-2", "Sonstige (Notiz)"] }],
  ["wp_standort", "ausseneinheit", "Außeneinheit (Standort)", "text"],
  ["wp_standort", "abstand_innen_aussen", "Abstand innen zu außen", "zahl", { einheit: "m" }],
  ["wp_standort", "leitungsweg_wp", "Leitungsweg WP", "zahl", { einheit: "m" }],
  ["wp_standort", "kernbohrungen", "Kernbohrungen", "zahl", { einheit: "Stück" }],
  ["wp_standort", "abstand_grenze", "Abstand zur Grenze", "zahl", { einheit: "m" }],
  ["wp_standort", "abstand_fenster", "Abstand zum Fenster", "zahl", { einheit: "m" }],
  ["wp_standort", "leitung_zs_wp", "Leitung Zählerschrank zur WP", "zahl", { einheit: "m" }],
  ["wp_standort", "hauptsicherung", "Hauptsicherung", "zahl", { einheit: "A" }],
  ["wp_standort", "fundament", "Fundament?", "janein"],
  ["wp_standort", "kondensat", "Kondensat wohin?", "auswahl", { optionen: ["Abfluss", "Erde"] }],
  ["wp_standort", "schall_kritisch", "Schall kritisch?", "janein"],
  ["wp_standort", "zs_ausreichend", "Zählerschrank ausreichend?", "janein"],
  ["wp_standort", "pv_vorhanden", "PV vorhanden?", "janein"],
  ["wp_standort", "solarthermie", "Solarthermie vorhanden?", "janein"],
  ["wp_standort", "speicher_vorhanden", "Speicher vorhanden?", "janein"],
  ["wp_standort", "wp_fotos", "Fotos vom WP-Standort und Leitungsweg", "foto"],

  ["abschluss", "hinweis_monteure", "Noch etwas, das die Monteure wissen müssen?", "text"],
];

export const KATALOG = F.map(([bereich, id, frage, art, extra = {}]) => ({ bereich, id, frage, art, ...(NUR[bereich] && { nur: NUR[bereich] }), ...extra }));
const NACH_ID = Object.fromEntries(KATALOG.map((f) => [f.id, f]));
export const frageNach = (id) => NACH_ID[id];

// Welche Fragen gelten bei diesen Antworten? Ohne Typ nur die Startfrage.
export function sichtbar(antworten = {}) {
  const typ = antworten.typ?.wert;
  if (!typ) return [KATALOG[0]];
  const pv = typ === "PV" || typ === "Beides", wp = typ === "Wärmepumpe" || typ === "Beides";
  return KATALOG.filter((f) => (f.nur !== "pv" || pv) && (f.nur !== "wp" || wp) && (!f.wenn || antworten[f.wenn.frage]?.wert === f.wenn.ist));
}

const erledigt = (a) => a && (a.uebersprungen || (a.wert ?? "") !== "" || a.dateien?.length);
export const naechste = (antworten = {}) => sichtbar(antworten).find((f) => !erledigt(antworten[f.id])) || null;

// Prüft und vereinheitlicht eine Antwort. Leerer Wert ist erlaubt (nur Foto oder Notiz).
export function pruefeAntwort(f, eingabe) {
  const w = String(eingabe ?? "").trim();
  if (!w) return "";
  if (f.art === "janein") {
    const j = w.toLowerCase();
    if (j !== "ja" && j !== "nein") throw fehler(400, `„${f.frage}“: bitte Ja oder Nein`);
    return j;
  }
  if (f.art === "auswahl" || f.art === "liste") {
    const treffer = f.optionen.find((o) => o.toLowerCase() === w.toLowerCase());
    if (!treffer) throw fehler(400, `„${f.frage}“: unbekannte Auswahl`);
    return treffer;
  }
  if (f.art === "zahl") {
    if (!/^-?\d+([.,]\d+)?$/.test(w.replace(/\s/g, ""))) throw fehler(400, `„${f.frage}“: bitte eine Zahl`);
    return w.replace(/\s/g, "");
  }
  return w.slice(0, 2000);
}
