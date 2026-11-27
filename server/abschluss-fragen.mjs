// Fragen der Abschlussberichte (Abnahmeprotokolle) nach der Montage. Spec: docs/superpowers/specs/2026-11-27-baustellenabschluss-design.md
// Gleiche Form wie der Besichtigungskatalog in fragen.mjs; zusätzlich bericht: "<key>" (fehlt = gilt für alle Berichte).
// Ein Abschlussbericht ist eine Planung, deren Startfrage "bericht" beantwortet ist. IDs beginnen mit ab_.

export const BERICHTE = { dc: "Dachmontage DC", ac: "Elektrik AC", wp: "Wärmepumpe", klima: "Klima" };
// Frühere Namen (bis 27.11. getrennt): begonnene Berichte damit laufen als „Dachmontage DC“ weiter.
export const ALTE_BERICHTE = { "Dachmontage PV": "dc", "Elektrik DC": "dc" };

export const ABSCHLUSS_BEREICHE = {
  ab_start: "Abschlussbericht",
  ab_kopf: "Baustelle",
  ab_dach: "Dachmontage",
  ab_dc: "DC / Messprotokoll",
  ab_ac: "Elektrik AC",
  ab_wp: "Wärmepumpe",
  ab_klima: "Klima",
  ab_abnahme: "Abnahme mit dem Kunden",
};

const slug = (s) => s.toLowerCase().replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss").replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
const foto = (bericht, name, extra = {}) => [`ab_${bericht}`, `ab_${bericht}_foto_${slug(name)}`, `Foto: ${name}`, "foto", { pflicht: true, titel: name, bericht, ...extra }];
const nur = (bericht, ...fragen) => fragen.map(([bereich, id, frage, art, extra = {}]) => [bereich, id, frage, art, { bericht, ...extra }]);

// Fester Abnahmetext im PDF und über der Unterschrift in der App.
export const ABNAHME_TEXT = ["Die aufgeführten Mängel werden schnellstmöglich aufgearbeitet.",
  "Aufgrund sorgfältiger und fachgerechter Arbeit gewährleisten wir gemäß BGB 5 Jahre ab Abnahme der Leistung, dass diese frei von Sachmängeln sind.",
  "Die Anlage gilt mit Unterschrift als mängelfrei abgenommen (ausgenommen der festgestellten Mängel)."];

// Heldenwerker verbaut nur K2 (Dominik, 27.11.). Systeme laut k2-systems.com, Schrägdach und Flachdach.
const K2_SYSTEME = ["K2 SingleRail", "K2 SolidRail", "K2 MiniRail / MiniFive", "K2 BasicRail", "K2 MultiRail", "K2 Einlegesystem", "K2 Universal KL-Clamp", "Metalldachziegel mit FlexAdapter",
  "K2 Dome 6", "K2 Dome 6 Portrait", "K2 Dome 6 Trapezblech", "K2 Dome Zero", "K2 TiltUp Vento", "K2 Triangle / MultiAngle", "K2 GreenRoof 2.0 / GreenRoof Vento", "Sonstige (Notiz)"];

const MAX_STRINGS = 6;
const ab = (n) => Array.from({ length: MAX_STRINGS - n + 1 }, (_, i) => String(n + i)); // „mindestens n Strings“
const STRING_WERTE = [["module", "Anzahl Module", "Stück"], ["spannung", "Spannung U", "V"], ["strom", "Strom I", "A"], ["erdung", "Erdung R pe", "Ω"], ["isolation", "Isolation R iso", "MΩ"]];
const strings = Array.from({ length: MAX_STRINGS }, (_, i) => i + 1).flatMap((n) => STRING_WERTE.map(([k, name, einheit]) =>
  ["ab_dc", `ab_dc_s${n}_${k}`, `String ${n}: ${name}`, "zahl", { einheit, bericht: "dc", string: n, wenn: { frage: "ab_dc_strings", ist: ab(n) } }]));

// [bereich, id, frage, art, extra]
const F = [
  ["ab_start", "bericht", "Welcher Abschlussbericht?", "auswahl", { optionen: Object.values(BERICHTE), berichte: Object.keys(BERICHTE), alt: ALTE_BERICHTE }],

  ["ab_kopf", "ab_monteure", "Monteure", "text"],
  ["ab_kopf", "ab_datum", "Datum", "text"],
  ["ab_kopf", "ab_kunde", "Kunde", "text"],
  ["ab_kopf", "ab_projektnr", "Projekt-Nr.", "text"],
  ["ab_kopf", "ab_adresse", "Baustellenadresse", "text"],

  ...nur("dc",
    ["ab_dach", "ab_dach_module", "Module: Anzahl und Typ", "text"],
    ["ab_dach", "ab_dach_uk", "Unterkonstruktion (K2)", "liste", { optionen: K2_SYSTEME }],
    ["ab_dach", "ab_dach_optimierer", "Moduloptimierer: Anzahl und Typ", "text"],
    ["ab_dach", "ab_dach_belegung", "Belegung wie geplant?", "janein"],
    ["ab_dach", "ab_dach_aenderung", "Was wurde geändert? Planungsbild aus HERO öffnen und einzeichnen", "foto", { pflicht: true, titel: "Änderung der Belegung", heroBilder: true, wenn: { frage: "ab_dach_belegung", ist: "nein" } }],
    ["ab_dach", "ab_dach_pfannen", "Beschädigte Pfannen getauscht?", "auswahl", { optionen: ["Ja", "Nein", "Keine beschädigt"] }],
    ["ab_dach", "ab_dach_pfannen_anzahl", "Wie viele Pfannen wurden getauscht?", "zahl", { einheit: "Stück", wenn: { frage: "ab_dach_pfannen", ist: "Ja" } }]),
  foto("dach", "Getauschte Pfannen", { bericht: "dc", wenn: { frage: "ab_dach_pfannen", ist: "Ja" } }),
  foto("dach", "Belegte Dachflächen komplett", { bericht: "dc" }),
  foto("dach", "Unterkonstruktion mit Dachhaken", { bericht: "dc" }),
  foto("dach", "Kabeldurchführung Dach", { bericht: "dc" }),
  foto("dach", "Typenschild Modul", { bericht: "dc" }),

  ["ab_dc", "ab_dc_strings", "Wie viele Strings?", "auswahl", { optionen: ab(1), bericht: "dc" }],
  ...strings,
  ["ab_dc", "ab_dc_ueberspannung", "Überspannungsschutz DC vorhanden?", "janein", { bericht: "dc" }],
  foto("dc", "Messgerät mit Werten"),
  foto("dc", "DC-Kabelweg"),
  foto("dc", "Erdung und Potentialausgleich"),
  foto("dc", "DC-Anschluss am Wechselrichter"),

  ...nur("ac",
    ["ab_ac", "ab_ac_wr", "Wechselrichter", "text"],
    ["ab_ac", "ab_ac_speicher", "Speicher", "text"],
    ["ab_ac", "ab_ls_wallbox", "Wallbox im Lieferschein", "auswahl", { optionen: ["ja", "nein", "unbekannt"], versteckt: true }],
    ["ab_ac", "ab_ac_wallbox_da", "Wallbox montiert?", "janein", { wenn: { frage: "ab_ls_wallbox", ist: ["ja", "unbekannt"] } }],
    ["ab_ac", "ab_ac_wallbox", "Wallbox", "text", { wenn: { frage: "ab_ac_wallbox_da", ist: "ja" } }],
    ["ab_ac", "ab_ac_notstrom", "Notstrom", "auswahl", { optionen: ["Keiner", "Notstrom", "Ersatzstrom"] }],
    ["ab_ac", "ab_ac_inbetrieb", "Inbetriebnahme erfolgt?", "janein"],
    ["ab_ac", "ab_ac_einweisung", "Einweisung in App/System erfolgt?", "janein"]),
  foto("ac", "Wechselrichter und Speicher gesamt"),
  // Zwei Typenschilder, zwei Pflichtfotos (Dominik, 27.11.).
  foto("ac", "Typenschild Wechselrichter mit Seriennummer"),
  foto("ac", "Typenschild Speicher mit Seriennummer"),
  foto("ac", "Zählerschrank offen nach Umbau"),
  foto("ac", "Zählerschrank geschlossen"),
  foto("ac", "Wallbox", { wenn: { frage: "ab_ac_wallbox_da", ist: "ja" } }),

  ...nur("wp",
    ["ab_wp", "ab_wp_aussen", "Außeneinheit", "text"],
    ["ab_wp", "ab_wp_innen", "Inneneinheit", "text"],
    ["ab_wp", "ab_wp_ww_da", "Warmwasserspeicher verbaut?", "janein"],
    ["ab_wp", "ab_wp_ww", "Warmwasserspeicher", "text", { wenn: { frage: "ab_wp_ww_da", ist: "ja" } }],
    ["ab_wp", "ab_wp_puffer_da", "Pufferspeicher verbaut?", "janein"],
    ["ab_wp", "ab_wp_puffer", "Pufferspeicher", "text", { wenn: { frage: "ab_wp_puffer_da", ist: "ja" } }],
    ["ab_wp", "ab_wp_inbetrieb", "Inbetriebnahme erfolgt?", "janein"],
    ["ab_wp", "ab_wp_heizkurve", "Heizkurve eingestellt?", "janein"],
    ["ab_wp", "ab_wp_altkessel", "Altkessel demontiert?", "auswahl", { optionen: ["Ja", "Nein", "Entfällt"] }],
    ["ab_wp", "ab_wp_einweisung", "Einweisung in die Bedienung erfolgt?", "janein"]),
  foto("wp", "Außeneinheit gesamt mit Abständen"),
  foto("wp", "Fundament und Kondensatablauf"),
  foto("wp", "Wanddurchführung gedämmt"),
  foto("wp", "Inneneinheit mit Hydraulik"),
  foto("wp", "Typenschilder innen und außen"),
  foto("wp", "Typenschild Warmwasserspeicher", { wenn: { frage: "ab_wp_ww_da", ist: "ja" } }),
  foto("wp", "Typenschild Pufferspeicher", { wenn: { frage: "ab_wp_puffer_da", ist: "ja" } }),
  foto("wp", "Elektroanschluss"),
  foto("wp", "Regler-Display"),

  ...nur("klima",
    ["ab_klima", "ab_klima_aussen", "Außengerät", "text"],
    ["ab_klima", "ab_klima_innen", "Innengeräte: Anzahl und Modell", "text"],
    ["ab_klima", "ab_klima_druck", "Druckprobe", "zahl", { einheit: "bar" }],
    ["ab_klima", "ab_klima_druck_dauer", "Dauer der Druckprobe", "zahl", { einheit: "min" }],
    ["ab_klima", "ab_klima_vakuum", "Vakuum", "zahl", { einheit: "mbar" }],
    ["ab_klima", "ab_klima_kaeltemittel", "Kältemittel nachgefüllt", "zahl", { einheit: "g" }],
    ["ab_klima", "ab_klima_inbetrieb", "Inbetriebnahme erfolgt?", "janein"],
    ["ab_klima", "ab_klima_einweisung", "Einweisung Fernbedienung oder App erfolgt?", "janein"]),
  foto("klima", "Außengerät"),
  foto("klima", "Innengeräte (jedes)"),
  foto("klima", "Leitungsweg oder Kanal"),
  foto("klima", "Kondensatablauf"),
  foto("klima", "Manometer bei der Druckprobe"),
  foto("klima", "Vakuummeter"),
  foto("klima", "Typenschilder"),

  // Abnahme mit dem Kunden, Wortlaut wie im bisherigen HERO-Abnahmeprotokoll.
  // Bei „Nein“ folgt direkt ein Textfeld, was nicht passt (Dominik, 27.11.).
  ["ab_abnahme", "ab_komponenten_ok", "Gemeinsame Besichtigung der montierten Anlagenkomponenten in Ordnung? Ist der Kunde damit zufrieden?", "janein"],
  ["ab_abnahme", "ab_komponenten_text", "Was ist bei den Anlagenkomponenten nicht in Ordnung?", "text", { wenn: { frage: "ab_komponenten_ok", ist: "nein" } }],
  ["ab_abnahme", "ab_verkabelung_ok", "Gemeinsame Besichtigung der Verkabelung/Leitungsführung in Ordnung? Ist der Kunde damit zufrieden?", "janein"],
  ["ab_abnahme", "ab_verkabelung_text", "Was ist bei der Verkabelung/Leitungsführung nicht in Ordnung?", "text", { wenn: { frage: "ab_verkabelung_ok", ist: "nein" } }],
  ["ab_abnahme", "ab_sauberkeit_ok", "Sauberkeit (Abfall entsorgt, Installationsorte besenrein) in Ordnung? Ist der Kunde damit zufrieden?", "janein"],
  ["ab_abnahme", "ab_sauberkeit_text", "Was ist bei der Sauberkeit nicht in Ordnung?", "text", { wenn: { frage: "ab_sauberkeit_ok", ist: "nein" } }],
  ["ab_abnahme", "ab_maengel", "Hat der Kunde etwas zu bemängeln?", "auswahl", { optionen: ["Nein, keine Mängel", "Ja, folgende Mängel"] }],
  ["ab_abnahme", "ab_maengel_text", "Folgende Mängel wurden festgestellt", "text", { wenn: { frage: "ab_maengel", ist: ["Ja, folgende Mängel", "Folgende Mängel"] } }],
  ["ab_abnahme", "ab_werbung", "Bilder dürfen für Werbezwecke (z. B. Instagram, Facebook) genutzt werden?", "janein"],
  ["ab_abnahme", "ab_unterschrift", "Unterschrift des Kunden", "unterschrift", { hinweis: ABNAHME_TEXT.join(" ") }],
];

export const ABSCHLUSS_KATALOG = F.map(([bereich, id, frage, art, extra = {}]) => ({ bereich, id, frage, art, abschluss: true, ...extra }));

// Gewerk eines HERO-Projekts → passende Berichte (Vorauswahl beim Starten).
export function berichteAusGewerk(gewerk = "") {
  const g = gewerk.toLowerCase(), r = [];
  if (/photovoltaik|pv/.test(g)) r.push("dc", "ac");
  else if (/wallbox|speicher|elektro/.test(g)) r.push("ac");
  if (/wärmepumpe/.test(g)) r.push("wp");
  if (/klima/.test(g)) r.push("klima");
  return r;
}
