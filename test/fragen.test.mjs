import { test } from "node:test";
import assert from "node:assert/strict";
import { KATALOG, BEREICHE, sichtbar, naechste, pruefeAntwort, frageNach } from "../server/fragen.mjs";

const ARTEN = ["janein", "auswahl", "mehrfach", "liste", "zahl", "text", "foto"];

test("Katalog: eindeutige IDs, gültige Arten, Bereiche vorhanden, keine Gedankenstriche", () => {
  const ids = KATALOG.map((f) => f.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const f of KATALOG) {
    assert.ok(ARTEN.includes(f.art), f.id);
    assert.ok(BEREICHE[f.bereich], "Bereich fehlt: " + f.id);
    assert.ok(f.frage && !/[–—]/.test(f.frage), f.id);
    if (["auswahl", "mehrfach", "liste"].includes(f.art)) assert.ok(f.optionen?.length >= 2, f.id);
    if (f.wenn) assert.ok(frageNach(f.wenn.frage), "Bedingung zeigt ins Leere: " + f.id);
  }
  assert.equal(KATALOG[0].id, "typ");
  assert.equal(KATALOG.filter((f) => f.art === "foto" && f.pflicht).length, 11);
});

test("Typ PV blendet Wärmepumpe aus und umgekehrt", () => {
  const pv = sichtbar({ typ: { wert: "PV" } }).map((f) => f.id);
  const wp = sichtbar({ typ: { wert: "Wärmepumpe" } }).map((f) => f.id);
  const beides = sichtbar({ typ: { wert: "Beides" } }).map((f) => f.id);
  assert.ok(pv.includes("dachbelag") && !pv.includes("bosch_modell"));
  assert.ok(wp.includes("bosch_modell") && !wp.includes("dachbelag"));
  assert.ok(beides.includes("dachbelag") && beides.includes("bosch_modell"));
  assert.deepEqual(sichtbar({}).map((f) => f.id), ["typ"], "ohne Typ nur die Startfrage");
});

test("Folgefrage erscheint nur, wenn die Bedingung passt", () => {
  const ohne = sichtbar({ typ: { wert: "PV" }, freileitung: { wert: "nein" } }).map((f) => f.id);
  const mit = sichtbar({ typ: { wert: "PV" }, freileitung: { wert: "ja" } }).map((f) => f.id);
  assert.ok(!ohne.includes("freileitung_isoliert"));
  assert.ok(mit.includes("freileitung_isoliert"));
});

test("naechste: erste sichtbare Frage ohne Antwort und nicht übersprungen", () => {
  assert.equal(naechste({}).id, "typ");
  const a = { typ: { wert: "PV" } };
  const erste = naechste(a);
  a[erste.id] = { uebersprungen: true };
  assert.notEqual(naechste(a).id, erste.id);
});

test("pruefeAntwort: Ja/Nein, Auswahl, Zahl mit Komma, Text gekürzt", () => {
  const f = (id) => frageNach(id);
  assert.equal(pruefeAntwort(f("freileitung"), "Ja"), "ja");
  assert.throws(() => pruefeAntwort(f("freileitung"), "vielleicht"), (e) => e.status === 400);
  assert.equal(pruefeAntwort(f("dachbelag"), "pfanne"), "Pfanne");
  assert.throws(() => pruefeAntwort(f("dachbelag"), "Stroh"), (e) => e.status === 400);
  assert.equal(pruefeAntwort(f("dachneigung"), "35,5"), "35,5");
  assert.throws(() => pruefeAntwort(f("dachneigung"), "steil"), (e) => e.status === 400);
  assert.equal(pruefeAntwort(f("regenrinne"), "  ok  "), "ok");
  assert.equal(pruefeAntwort(f("regenrinne"), "x".repeat(5000)).length, 2000);
});

test("Kabelweg DC: mehrere Punkte wählbar, in Katalog-Reihenfolge, Unbekanntes abgelehnt", () => {
  const f = KATALOG.find((x) => x.id === "kabelweg_dc");
  assert.equal(f.art, "mehrfach");
  assert.equal(f.bereich, "dc");
  assert.deepEqual(f.optionen.slice(0, 7), ["Schacht", "Kamin", "Alu", "Kupfer", "PVC", "PVC 100", "PVC 60"]);
  assert.equal(pruefeAntwort(f, "pvc 60, Schacht"), "Schacht, PVC 60");
  assert.throws(() => pruefeAntwort(f, "Schacht, Dachrinne"), (e) => e.status === 400);
});

test("Kabelweg AC: dieselben Punkte wie DC, mehrere wählbar, alte Einzelantwort bleibt gültig", () => {
  const ac = KATALOG.find((x) => x.id === "kabelweg"), dc = KATALOG.find((x) => x.id === "kabelweg_dc");
  assert.equal(ac.art, "mehrfach");
  assert.equal(ac.frage, "Kabelweg AC");
  assert.deepEqual(ac.optionen, dc.optionen);
  assert.equal(pruefeAntwort(ac, "Kupfer, schacht"), "Schacht, Kupfer");
  assert.equal(pruefeAntwort(ac, "Kamin"), "Kamin");
});

test("AC-Fragen kommen vor den DC-Fragen, im Ablauf und in der Bereichsliste", () => {
  const bereiche = [...new Set(KATALOG.map((f) => f.bereich))];
  assert.deepEqual(bereiche.slice(0, 7), ["start", "objekt", "pv", "ac", "dc", "geruest", "fotos"]);
  assert.deepEqual(Object.keys(BEREICHE).slice(0, 7), bereiche.slice(0, 7));
  const pv = sichtbar({ typ: { wert: "PV" } }).map((f) => f.id);
  assert.ok(pv.indexOf("erdspiess") < pv.indexOf("dachbelag"));
});

test("AC beginnt mit den Zählern, dann Foto WR/SP-Standort, WLAN/LAN und Kabelweg AC", () => {
  const i = (id) => KATALOG.findIndex((f) => f.id === id);
  const ac = KATALOG.filter((f) => f.bereich === "ac").map((f) => f.id);
  assert.equal(ac[0], "anz_zaehler");
  assert.equal(i("foto_wr_sp_standort"), i("zaehler4_280") + 1);
  assert.equal(i("wlan_lan"), i("foto_wr_sp_standort") + 1);
  assert.equal(i("kabelweg"), i("wlan_lan") + 1);
  assert.equal(frageNach("foto_wr_sp_standort").bereich, "ac");
});

test("Foto Erdung sitzt direkt beim Potentialausgleich", () => {
  const i = (id) => KATALOG.findIndex((f) => f.id === id);
  assert.equal(i("foto_erdung"), i("potentialausgleich") + 1);
  assert.equal(frageNach("foto_erdung").bereich, "ac");
  assert.ok(frageNach("foto_erdung").pflicht);
});

test("Gerüst: Höhe und freie Fläche zusammen auf einem Pflichtfoto", () => {
  const geruest = KATALOG.filter((f) => f.bereich === "geruest");
  assert.deepEqual(geruest.map((f) => f.id), ["foto_geruestflaeche", "regenrinne", "wandmontage"]);
  const f = frageNach("foto_geruestflaeche");
  assert.equal(f.frage, "Foto: Gerüsthöhe und Gerüstfläche");
  assert.equal(f.titel, "Gerüsthöhe und Gerüstfläche");
  assert.ok(f.art === "foto" && f.pflicht);
  assert.equal(frageNach("foto_geruesthoehe"), undefined);
});

test("SAT-Frage heißt einbauen/versetzen, WR- und Speicher-Standort nur noch als Foto", () => {
  assert.equal(KATALOG.find((x) => x.id === "sat_schluessel").frage, "SAT-Schlüssel oder Ähnliches einbauen/versetzen?");
  assert.ok(!KATALOG.some((x) => x.id === "wr_standort" || x.id === "speicher_standort"));
  assert.ok(KATALOG.some((x) => x.frage === "Foto: WR/SP Standort"));
});

test("Neuer Zählerschrank und Plätze kommen vor den Mehrkosten", () => {
  const i = (id) => KATALOG.findIndex((f) => f.id === id);
  assert.ok(i("neuer_zs_ac") < i("mehrkosten") && i("zs_plaetze") < i("mehrkosten"));
  assert.equal(i("zs_plaetze"), i("neuer_zs_ac") + 1);
});

test("Zähler: Anzahl zuerst, je Zähler Nummer, 1.8.0 und 2.8.0", () => {
  assert.deepEqual(frageNach("anz_zaehler").optionen, ["1", "2", "3", "4"]);
  const zaehlerFragen = (anzahl) => sichtbar({ typ: { wert: "PV" }, anz_zaehler: { wert: anzahl } }).filter((f) => /^Zähler \d/.test(f.frage)).map((f) => f.frage);
  assert.deepEqual(zaehlerFragen("2"), ["Zähler 1: Zählernummer", "Zähler 1: Zählerstand 1.8.0", "Zähler 1: Zählerstand 2.8.0", "Zähler 2: Zählernummer", "Zähler 2: Zählerstand 1.8.0", "Zähler 2: Zählerstand 2.8.0"]);
  assert.equal(zaehlerFragen("4").length, 12);
  assert.equal(zaehlerFragen("1").length, 3);
});

test("Startfrage: PV, Wärmepumpe und Klimaanlage frei kombinierbar, nur Gewähltes wird abgefragt", () => {
  const typ = frageNach("typ");
  assert.equal(typ.art, "mehrfach");
  assert.deepEqual(typ.optionen, ["PV", "Wärmepumpe", "Klimaanlage"]);
  const ids = (wert) => sichtbar({ typ: { wert } }).map((f) => f.id);
  const klima = ids("Klimaanlage");
  assert.ok(klima.includes("klima_paket") && !klima.includes("dachbelag") && !klima.includes("bosch_modell"));
  assert.ok(klima.includes("kunde") && klima.includes("hinweis_monteure"), "Objekt und Abschluss gelten immer");
  const pvKlima = ids("PV, Klimaanlage");
  assert.ok(pvKlima.includes("dachbelag") && pvKlima.includes("klima_paket") && !pvKlima.includes("bosch_modell"));
  const alt = ids("Beides");
  assert.ok(alt.includes("dachbelag") && alt.includes("bosch_modell") && !alt.includes("klima_paket"), "alte Antwort Beides = PV und Wärmepumpe");
  assert.ok(!ids("PV").includes("klima_paket"));
});

test("Klima: Räume je nach Anzahl, App nur beim Basispaket, Höhe nur bei Hauswand", () => {
  const ids = (a) => sichtbar({ typ: { wert: "Klimaanlage" }, ...a }).map((f) => f.id);
  const zwei = ids({ klima_anzahl: { wert: "2" } });
  assert.ok(zwei.includes("klima_raum2_flaeche") && !zwei.includes("klima_raum3_flaeche"));
  assert.ok(ids({ klima_anzahl: { wert: "5" } }).includes("klima_raum5_leitung"));
  assert.ok(ids({}).includes("klima_raum1_flaeche"), "Raum 1 immer");
  assert.ok(ids({ klima_paket: { wert: "Basispaket (Bosch Climate 5000)" } }).includes("klima_app"));
  assert.ok(!ids({ klima_paket: { wert: "Premiumpaket (Bosch Climate 7000)" } }).includes("klima_app"));
  assert.ok(ids({ klima_aussen_ort: { wert: "An der Hauswand" } }).includes("klima_aussen_hoehe"));
  assert.ok(!ids({ klima_aussen_ort: { wert: "Auf dem Boden" } }).includes("klima_aussen_hoehe"));
  assert.ok(frageNach("foto_aussengeraet_standort").pflicht && frageNach("foto_aussengeraet_standort").bereich === "klima");
});
