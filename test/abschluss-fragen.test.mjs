import { test } from "node:test";
import assert from "node:assert/strict";
import { sichtbar, KATALOG, frageNach, istAbschluss, berichtVon } from "../server/fragen.mjs";
import { BERICHTE, ABSCHLUSS_KATALOG } from "../server/abschluss-fragen.mjs";

const ids = (liste) => liste.map((f) => f.id);

test("Abschluss DC: nur Abschlussfragen, Strings nach Anzahl, Unterschrift am Ende", () => {
  const s = ids(sichtbar({ bericht: { wert: "Dachmontage DC" }, ab_dc_strings: { wert: "2" } }));
  assert.ok(s.includes("ab_dc_s2_spannung"));
  assert.ok(!s.includes("ab_dc_s3_spannung"));
  assert.ok(s.every((id) => id === "bericht" || id.startsWith("ab_")), "keine Besichtigungsfrage");
  assert.equal(s.at(-1), "ab_unterschrift");
  assert.ok(!s.includes("ab_ac_wr"), "nichts aus anderen Berichten");
});

test("Besichtigung sieht keine Abschlussfragen, Startfrage bleibt typ", () => {
  assert.equal(KATALOG[0].id, "typ");
  const s = ids(sichtbar({ typ: { wert: "PV, Wärmepumpe, Klimaanlage" } }));
  assert.ok(!s.some((id) => id.startsWith("ab_") || id === "bericht"));
});

test("IDs eindeutig und sauber, jeder Bericht hat Pflichtfotos", () => {
  const alle = ids(KATALOG);
  assert.equal(new Set(alle).size, alle.length);
  for (const f of ABSCHLUSS_KATALOG) assert.match(f.id, /^(ab_[a-z0-9_]+|bericht)$/);
  for (const [key, name] of Object.entries(BERICHTE)) {
    const s = sichtbar({ bericht: { wert: name } });
    assert.ok(s.some((f) => f.pflicht), key + " ohne Pflichtfoto");
    assert.ok(s.some((f) => f.id === "ab_unterschrift"), key + " ohne Unterschrift");
  }
  assert.equal(frageNach("ab_unterschrift").art, "unterschrift");
});

test("istAbschluss und berichtVon", () => {
  assert.equal(istAbschluss({ typ: { wert: "PV" } }), false);
  assert.equal(istAbschluss({ bericht: { wert: "Klima" } }), true);
  assert.equal(berichtVon({ bericht: { wert: "Wärmepumpe" } }), "wp");
});

test("WP-Bericht: Typenschild Warmwasser- und Pufferspeicher nur, wenn verbaut", () => {
  const ids = (a) => sichtbar({ bericht: { wert: "Wärmepumpe" }, ...a }).map((f) => f.id);
  assert.ok(!ids({}).includes("ab_wp_foto_typenschild_warmwasserspeicher"));
  const mit = ids({ ab_wp_ww_da: { wert: "ja" }, ab_wp_puffer_da: { wert: "ja" } });
  assert.ok(mit.includes("ab_wp_foto_typenschild_warmwasserspeicher") && mit.includes("ab_wp_foto_typenschild_pufferspeicher"));
  assert.ok(frageNach("ab_wp_foto_typenschild_pufferspeicher").pflicht);
});

test("Dachmontage und DC sind ein Bericht; alte Namen zählen weiter", () => {
  assert.deepEqual(Object.values(BERICHTE), ["Dachmontage DC", "Elektrik AC", "Wärmepumpe", "Klima"]);
  const s = sichtbar({ bericht: { wert: "Dachmontage DC" }, ab_dc_strings: { wert: "1" } }).map((f) => f.id);
  assert.ok(s.includes("ab_dach_module") && s.includes("ab_dach_foto_typenschild_modul") && s.includes("ab_dc_s1_spannung"));
  assert.equal(berichtVon({ bericht: { wert: "Dachmontage PV" } }), "dc");
  assert.equal(berichtVon({ bericht: { wert: "Elektrik DC" } }), "dc");
});

test("Unterkonstruktion: Auswahl der K2-Systeme für Schräg- und Flachdach", () => {
  const f = frageNach("ab_dach_uk");
  assert.equal(f.art, "liste");
  for (const n of ["K2 SingleRail", "K2 MiniRail / MiniFive", "K2 Dome 6", "K2 GreenRoof 2.0 / GreenRoof Vento", "Metalldachziegel mit FlexAdapter"]) assert.ok(f.optionen.includes(n), n);
  assert.equal(f.optionen.length, 16);
});

test("Pfannen getauscht: bei Ja Anzahl und Fotos; Besichtigungsfragen fragen nach Zufriedenheit", () => {
  const vis = (w) => sichtbar({ bericht: { wert: "Dachmontage DC" }, ab_dach_pfannen: { wert: w } }).map((f) => f.id);
  assert.ok(vis("Ja").includes("ab_dach_pfannen_anzahl") && vis("Ja").includes("ab_dach_foto_getauschte_pfannen"));
  assert.ok(!vis("Nein").includes("ab_dach_pfannen_anzahl"));
  assert.equal(frageNach("ab_dach_pfannen_anzahl").art, "zahl");
  assert.match(frageNach("ab_komponenten_ok").frage, /Kunde damit zufrieden\?$/);
  assert.match(frageNach("ab_verkabelung_ok").frage, /Kunde damit zufrieden\?$/);
  assert.match(frageNach("ab_sauberkeit_ok").frage, /Kunde damit zufrieden\?$/);
});

test("Zufriedenheitsfragen: bei Nein folgt direkt ein Textfeld, bei Ja nicht", () => {
  for (const k of ["komponenten", "verkabelung", "sauberkeit"]) {
    const vis = (w) => ids(sichtbar({ bericht: { wert: "Klima" }, [`ab_${k}_ok`]: { wert: w } }));
    const nein = vis("nein");
    assert.equal(nein[nein.indexOf(`ab_${k}_ok`) + 1], `ab_${k}_text`, `${k}: Text direkt danach`);
    assert.equal(frageNach(`ab_${k}_text`).art, "text");
    assert.ok(!vis("ja").includes(`ab_${k}_text`), `${k}: bei Ja kein Text`);
    assert.ok(!ids(sichtbar({ bericht: { wert: "Klima" } })).includes(`ab_${k}_text`), `${k}: ohne Antwort kein Text`);
  }
});

test("Mängel: als Frage an den Kunden, bei Ja folgt der Text (auch alte Antwort)", () => {
  assert.equal(frageNach("ab_maengel").frage, "Hat der Kunde etwas zu bemängeln?");
  const vis = (w) => sichtbar({ bericht: { wert: "Klima" }, ab_maengel: { wert: w } }).map((f) => f.id);
  assert.ok(vis("Ja, folgende Mängel").includes("ab_maengel_text"));
  assert.ok(vis("Folgende Mängel").includes("ab_maengel_text"));
  assert.ok(!vis("Nein, keine Mängel").includes("ab_maengel_text"));
});

test("AC: zwei Pflichtfotos für die Typenschilder (Wechselrichter und Speicher)", () => {
  const s = sichtbar({ bericht: { wert: "Elektrik AC" } }).filter((f) => f.pflicht).map((f) => f.titel);
  assert.ok(s.includes("Typenschild Wechselrichter mit Seriennummer") && s.includes("Typenschild Speicher mit Seriennummer"));
});

test("AC: kein Foto „App läuft“ mehr", () => {
  assert.equal(frageNach("ab_ac_foto_app_laeuft"), undefined);
});

test("WP: Fotos von Außeneinheit, Inneneinheit und den verbauten Speichern", () => {
  const titel = (a) => sichtbar({ bericht: { wert: "Wärmepumpe" }, ...a }).filter((f) => f.pflicht).map((f) => f.titel);
  const mit = titel({ ab_wp_ww_da: { wert: "ja" }, ab_wp_puffer_da: { wert: "ja" } });
  for (const t of ["Außeneinheit gesamt mit Abständen", "Inneneinheit mit Hydraulik", "Warmwasserspeicher", "Pufferspeicher"]) assert.ok(mit.includes(t), t);
  assert.ok(!titel({}).includes("Pufferspeicher"));
});

test("Klima: Foto je Innengerät nach Anzahl, dazu Außengerät und Konsole", () => {
  const t = sichtbar({ bericht: { wert: "Klima" }, ab_klima_anzahl: { wert: "3" } }).filter((f) => f.pflicht).map((f) => f.titel);
  for (const x of ["Außengerät", "Befestigung Außengerät", "Innengerät 1", "Innengerät 2", "Innengerät 3"]) assert.ok(t.includes(x), x);
  assert.ok(!t.includes("Innengerät 4"));
});

test("Klima: Inbetriebnahme vor der Druckprobe; ohne Inbetriebnahme keine Druckprobe, kein Vakuum", () => {
  const ids = (w) => sichtbar({ bericht: { wert: "Klima" }, ab_klima_inbetrieb: { wert: w } }).map((f) => f.id);
  const ja = ids("ja");
  assert.ok(ja.indexOf("ab_klima_inbetrieb") < ja.indexOf("ab_klima_druck"));
  const nein = ids("nein");
  for (const x of ["ab_klima_druck", "ab_klima_druck_dauer", "ab_klima_vakuum", "ab_klima_kaeltemittel", "ab_klima_foto_manometer_bei_der_druckprobe", "ab_klima_foto_vakuummeter"]) assert.ok(!nein.includes(x), x);
});

test("Klima: Foto direkt nach der Frage, Innengeräte vor der Inbetriebnahme, Einweisung nur nach Inbetriebnahme", () => {
  const s = ids(sichtbar({ bericht: { wert: "Klima" }, ab_klima_anzahl: { wert: "1" }, ab_klima_elektro: { wert: "ja" }, ab_klima_inbetrieb: { wert: "ja" } }));
  const reihe = ["ab_klima_aussen", "ab_klima_foto_aussengeraet", "ab_klima_konsole", "ab_klima_foto_befestigung_aussengeraet", "ab_klima_elektro",
    "ab_klima_foto_zaehlerschrank_mit_sicherung_und_beschriftung", "ab_klima_anzahl", "ab_klima_ig1", "ab_klima_foto_innengeraet_1", "ab_klima_inbetrieb",
    "ab_klima_druck", "ab_klima_druck_dauer", "ab_klima_vakuum", "ab_klima_kaeltemittel", "ab_klima_einweisung"];
  for (const x of reihe) assert.ok(s.includes(x), x);
  assert.deepEqual(reihe.map((x) => s.indexOf(x)), reihe.map((x) => s.indexOf(x)).toSorted((a, b) => a - b));
  const nein = ids(sichtbar({ bericht: { wert: "Klima" }, ab_klima_inbetrieb: { wert: "nein" } }));
  assert.ok(!nein.includes("ab_klima_einweisung"));
});

test("Klima: Zählerschrank mit Sicherung bei der Montage, sonst erst bei der Inbetriebnahme", () => {
  const titel = (el, ib) => sichtbar({ bericht: { wert: "Klima" }, ab_klima_elektro: { wert: el }, ab_klima_inbetrieb: { wert: ib } }).filter((f) => f.pflicht).map((f) => f.titel);
  const zs = (t) => t.filter((x) => x.startsWith("Zählerschrank"));
  assert.deepEqual(zs(titel("ja", "ja")), ["Zählerschrank mit Sicherung und Beschriftung"]);
  assert.deepEqual(zs(titel("nein", "nein")), []);
  assert.deepEqual(zs(titel("nein", "ja")), ["Zählerschrank mit Sicherung und Beschriftung (Inbetriebnahme)"]);
  const s = ids(sichtbar({ bericht: { wert: "Klima" }, ab_klima_elektro: { wert: "nein" }, ab_klima_inbetrieb: { wert: "ja" } }));
  assert.ok(s.indexOf("ab_klima_inbetrieb") < s.indexOf("ab_klima_foto_zaehlerschrank_mit_sicherung_und_beschriftung_inbetriebnahme"));
});
