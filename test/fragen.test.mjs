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
  assert.equal(KATALOG.filter((f) => f.art === "foto" && f.pflicht).length, 10);
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

test("AC beginnt mit den Zählern, dann Foto WR/SP-Standort, dann Kabelweg AC", () => {
  const i = (id) => KATALOG.findIndex((f) => f.id === id);
  const ac = KATALOG.filter((f) => f.bereich === "ac").map((f) => f.id);
  assert.deepEqual(ac.slice(0, 2), ["wlan_lan", "anz_zaehler"]);
  assert.equal(i("foto_wr_sp_standort"), i("zaehler4_280") + 1);
  assert.equal(i("kabelweg"), i("foto_wr_sp_standort") + 1);
  assert.equal(frageNach("foto_wr_sp_standort").bereich, "ac");
});

test("Foto Erdung sitzt direkt beim Potentialausgleich", () => {
  const i = (id) => KATALOG.findIndex((f) => f.id === id);
  assert.equal(i("foto_erdung"), i("potentialausgleich") + 1);
  assert.equal(frageNach("foto_erdung").bereich, "ac");
  assert.ok(frageNach("foto_erdung").pflicht);
});

test("Gerüst: Höhe und freie Fläche werden per Foto erfasst", () => {
  const geruest = KATALOG.filter((f) => f.bereich === "geruest");
  assert.deepEqual(geruest.map((f) => f.id), ["foto_geruesthoehe", "regenrinne", "foto_geruestflaeche", "wandmontage"]);
  assert.equal(frageNach("foto_geruesthoehe").art, "foto");
  assert.ok(!frageNach("foto_geruesthoehe").pflicht);
  assert.ok(frageNach("foto_geruestflaeche").pflicht);
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

test("Zähler: Anzahl nach WLAN/LAN, je Zähler Nummer, 1.8.0 und 2.8.0", () => {
  const i = (id) => KATALOG.findIndex((f) => f.id === id);
  assert.equal(i("anz_zaehler"), i("wlan_lan") + 1);
  assert.deepEqual(frageNach("anz_zaehler").optionen, ["1", "2", "3", "4"]);
  const zaehlerFragen = (anzahl) => sichtbar({ typ: { wert: "PV" }, anz_zaehler: { wert: anzahl } }).filter((f) => /^Zähler \d/.test(f.frage)).map((f) => f.frage);
  assert.deepEqual(zaehlerFragen("2"), ["Zähler 1: Zählernummer", "Zähler 1: Zählerstand 1.8.0", "Zähler 1: Zählerstand 2.8.0", "Zähler 2: Zählernummer", "Zähler 2: Zählerstand 1.8.0", "Zähler 2: Zählerstand 2.8.0"]);
  assert.equal(zaehlerFragen("4").length, 12);
  assert.equal(zaehlerFragen("1").length, 3);
});
