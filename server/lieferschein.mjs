// Antworten aus den HERO-Lieferscheinen eines Projekts vorausfüllen, damit der Planer nichts doppelt erfasst.
// Erkannt wird über Name und Beschreibung der Positionen (Stichprobe von 40 Lieferscheinen, 17.11.2026).
// Jede Antwort trägt die Lieferschein-Nummer (quelle); die Oberfläche zeigt sie, der Planer kann alles ändern.
import { frageNach, pruefeAntwort } from "./fragen.mjs";

const zahl = (s) => Number(String(s).replace(",", "."));
const kw = (n) => n.toFixed(1).replace(".", ",") + " kW";
const option = (frageId, passt) => frageNach(frageId).optionen.find(passt);
const MARKEN = ["Sungrow", "Fronius", "SMA", "GoodWe", "Huawei", "Deye", "EcoFlow"];

function ausEinem(ls) {
  const a = {}, speicher = [];
  let pv = false, wp = false, kuerzel = null, tower = false, wwSpeicher = false;
  const setze = (id, wert, notiz) => { if (wert && !(id in a)) a[id] = { wert: String(wert), ...(notiz && { notiz }) }; };
  for (const { name = "", beschreibung = "", menge = 1 } of ls.produkte || []) {
    const n = name.trim(), watt = n.match(/\b(\d{3})\s*(?:W|Watt)\b/i);
    if (watt && /solarmodul|kWp/i.test(`${n} ${beschreibung}`) && !/wallbox|speicher|batterie/i.test(n)) {
      pv = true;
      setze("anlagenleistung", beschreibung.match(/(\d+(?:[.,]\d+)?)\s*kWp/i)?.[1]);
      setze("anzahl_module", beschreibung.match(/(\d+)\s*x\s*Solarmodul/i)?.[1]);
      // Listeneintrag "Aiko Neostar 460 W": alle Wörter vor der Leistung im Namen und gleiche Wattzahl.
      const treffer = option("modul", (o) => { const m = o.match(/^(.*) (\d+) W$/); return m && Number(m[2]) === Number(watt[1]) && m[1].toLowerCase().split(" ").every((w) => n.toLowerCase().includes(w)); });
      setze("modul", treffer || "Sonstige (Notiz)", treffer ? "" : "Laut Lieferschein: " + n);
    } else if (/wechselrichter|\bGW\d+(\.\d+)?K|symo|gen24|sungrow|sunny|huawei|deye/i.test(n) && !/batterie|speicher|wallbox|meter/i.test(n)) {
      pv = true;
      const k = n.match(/GW(\d+(?:\.\d+)?)K/i)?.[1] ?? n.match(/GEN24(?: Plus)? (\d+(?:\.\d+)?)/i)?.[1] ?? n.match(/(\d+(?:[.,]\d+)?)\s*kW\b/i)?.[1];
      const marke = MARKEN.find((m) => new RegExp(`\\b${m}\\b`, "i").test(n));
      const ziel = k && marke && (marke === "EcoFlow" ? `EcoFlow PowerOcean ${kw(zahl(k)).replace(",0 kW", " kW")}` : `${marke} ${kw(zahl(k))}`);
      const treffer = ziel && option("wechselrichter", (o) => o === ziel);
      setze("wechselrichter", treffer || "Sonstige (Notiz)", treffer ? "" : "Laut Lieferschein: " + n);
    } else if (/luft[-/]wasser-wärmepumpe/i.test(n)) {
      wp = true;
      kuerzel ??= n.match(/CS\s?\d{4}i\s?AW\s*\d+\s*(MB|M|E)\b/i)?.[1].toUpperCase(); // z. B. "Compress CS6800iAW 12 E"
      const modell = beschreibung.match(/Bosch\s+(CS\s?\d+i\s*AW)/i)?.[1], l = n.match(/AW\s*(\d+(?:[.,]\d+)?)(?:\s*-\s*(\d+(?:[.,]\d+)?))?\s*KW/i);
      setze("bosch_modell", [modell ? "Bosch " + modell : n, l && (l[2] ? `${l[1]}-${l[2]} kW` : `${l[1]} kW`)].filter(Boolean).join(", "));
      if (l && !l[2]) setze("wp_leistung", l[1]);
    } else if (/batterie|speicher|reserva|lynx/i.test(n) && !/warmwasser|puffer|wärmepumpe/i.test(n)) {
      pv = true;
      speicher.push(menge > 1 ? `${menge} x ${n}` : n);
    }
    if (/wallbox/i.test(n)) { setze("wallbox", n); setze("wallbox_wunsch", "ja"); }
    if (/zählerschrank/i.test(n)) { setze("neuer_zs", "ja"); setze("neuer_zs_ac", "ja"); }
    if (/kaskade/i.test(n)) setze("kaskade", "ja");
    if (/heizstab/i.test(n)) setze("heizstab", "ja");
    if (/solarthermie/i.test(n)) setze("solarthermie", "ja");
    if (/warmwasserspeicher/i.test(n)) { setze("warmwasser_wp", "ja"); wwSpeicher = true; }
    if (/puffertower/i.test(n)) tower = true;
    const alt = n.match(/demontage.*alten\s+(öl|gas|pellet)/i)?.[1];
    if (alt) setze("bestandsheizung", { öl: "Ölheizung", gas: "Gasheizung", pellet: "Pelletheizung" }[alt.toLowerCase()]);
  }
  if (speicher.length) setze("speicher", speicher.join(", "));
  // Inneneinheit (27.11., aus 359 echten Lieferscheinen): Kürzel im Namen gilt, Puffertower = MB, separater Warmwasserspeicher
  // = wandhängend E. Ohne Hinweis nichts raten.
  const bauform = kuerzel || (tower ? "MB" : wp && wwSpeicher ? "E" : null);
  if (bauform) setze("inneneinheit", option("inneneinheit", (o) => o.startsWith(bauform + " ")));
  return { a, pv, wp };
}

// Neuester Lieferschein gewinnt; PV und Wärmepumpe aus verschiedenen Lieferscheinen ergeben beide Typen.
export function antwortenAusLieferscheinen(liste = []) {
  const raus = {};
  let pv = null, wp = null;
  for (const ls of [...liste].sort((x, y) => String(y.datum || "").localeCompare(String(x.datum || "")))) {
    const e = ausEinem(ls);
    for (const [id, x] of Object.entries(e.a)) if (!(id in raus)) raus[id] = { ...x, quelle: ls.nr };
    if (e.pv) pv ??= ls.nr;
    if (e.wp) wp ??= ls.nr;
  }
  if (pv || wp) raus.typ = { wert: [pv && "PV", wp && "Wärmepumpe"].filter(Boolean).join(", "), quelle: pv || wp };
  // Nur was der Katalog als Antwort annimmt; alles andere lieber weglassen als falsch vorausfüllen.
  for (const [id, x] of Object.entries(raus)) {
    try { x.wert = pruefeAntwort(frageNach(id), x.wert); if (!x.wert) delete raus[id]; } catch { delete raus[id]; }
  }
  return raus;
}

// Abschlussbericht (Abnahmeprotokoll): dieselben Lieferscheine, umgeschrieben auf die ab_-Fragen.
// Klimageräte und Optimierer kennt die Besichtigung nicht; sie kommen direkt aus den Positionen (Stichprobe KLA-Lieferscheine 27.11.).
const SONSTIGE = "Sonstige (Notiz)";
const klar = (x) => x && (x.wert === SONSTIGE ? x.notiz?.replace(/^Laut Lieferschein:\s*/, "") : x.wert);
const mitMenge = (p) => (p.menge > 1 ? `${p.menge} x ${p.name}` : p.name);
export function abschlussAusLieferscheinen(liste = []) {
  const b = antwortenAusLieferscheinen(liste), raus = {};
  const setze = (id, wert, quelle) => { if (wert && !(id in raus)) raus[id] = { wert: String(wert), quelle }; };
  const modul = klar(b.modul);
  setze("ab_dach_module", modul && (b.anzahl_module ? `${b.anzahl_module.wert} x ${modul}` : modul), b.modul?.quelle);
  setze("ab_ac_wr", klar(b.wechselrichter), b.wechselrichter?.quelle);
  setze("ab_ac_speicher", b.speicher?.wert, b.speicher?.quelle);
  if (b.wallbox?.wert) { setze("ab_ac_wallbox_da", "ja", b.wallbox.quelle); setze("ab_ac_wallbox", b.wallbox.wert, b.wallbox.quelle); }
  setze("ab_wp_aussen", b.bosch_modell?.wert, b.bosch_modell?.quelle);
  setze("ab_wp_innen", b.inneneinheit?.wert, b.inneneinheit?.quelle);
  // Neuester Lieferschein gewinnt, wie oben.
  for (const ls of [...liste].sort((x, y) => String(y.datum || "").localeCompare(String(x.datum || "")))) {
    const p = ls.produkte || [];
    const innen = p.filter((x) => /klima/i.test(x.name) && /inneneinheit/i.test(x.name));
    const aussen = p.filter((x) => /klimagerät|split-klima/i.test(x.name) && !/inneneinheit|konsole/i.test(x.name));
    const optimierer = p.filter((x) => /tigo|optimierer/i.test(x.name));
    setze("ab_klima_aussen", aussen.map(mitMenge).join(", "), ls.nr);
    setze("ab_klima_innen", innen.map(mitMenge).join(", "), ls.nr);
    setze("ab_dach_optimierer", optimierer.map(mitMenge).join(", "), ls.nr);
  }
  return raus;
}
