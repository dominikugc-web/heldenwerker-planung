import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { testServer } from "./hilfe.mjs";
import { abschlussAusLieferscheinen } from "../server/lieferschein.mjs";

const J = { "Content-Type": "application/json" };
const post = (s, pfad, body) => fetch(s.url + pfad, { method: "POST", headers: J, body: JSON.stringify(body) });
const neu = (s, extra = {}) => post(s, "/api/planungen", { bericht: "ac", projektId: 11541539, projektTitel: "UNB-1149, Muster", kunde: "Erika Muster", adresse: "Weg 1, 12345 Dorf", nummer: "UNB-1149", monteure: ["Max M.", "Lokal"], ...extra });

test("Abschlussbericht anlegen: Startfrage, Kopf und Monteure vorausgefüllt", async () => {
  const s = await testServer();
  try {
    const r = await neu(s);
    assert.equal(r.status, 201);
    const p = await r.json();
    assert.equal(p.art, "abschluss");
    assert.equal(p.antworten.bericht.wert, "Elektrik AC");
    assert.equal(p.antworten.ab_kunde.wert, "Erika Muster");
    assert.equal(p.antworten.ab_projektnr.wert, "UNB-1149");
    assert.equal(p.antworten.ab_adresse.wert, "Weg 1, 12345 Dorf");
    assert.match(p.antworten.ab_datum.wert, /^\d\d\.\d\d\.\d{4}$/);
    assert.equal(p.antworten.ab_monteure.wert, "Lokal, Max M.");
    assert.equal(p.antworten.typ, undefined);
    assert.equal(p.antworten.kunde, undefined, "keine Besichtigungsfelder");
  } finally { await s.stop(); }
});

test("Begonnener Bericht wird fortgesetzt, gesendeter nicht, anderer Typ ist neu", async () => {
  const s = await testServer();
  try {
    const a = await (await neu(s)).json();
    const b = await neu(s);
    assert.equal(b.status, 200);
    assert.equal((await b.json()).id, a.id);
    assert.notEqual((await (await neu(s, { bericht: "dc" })).json()).id, a.id);
    const datei = path.join(s.datenDir, "planungen", a.id, "planung.json");
    fs.writeFileSync(datei, JSON.stringify({ ...JSON.parse(fs.readFileSync(datei, "utf8")), status: "gesendet" }));
    assert.notEqual((await (await neu(s)).json()).id, a.id);
  } finally { await s.stop(); }
});

test("Unbekannter Bericht: 400", async () => {
  const s = await testServer();
  try { assert.equal((await neu(s, { bericht: "sauna" })).status, 400); } finally { await s.stop(); }
});

test("Lieferschein füllt die Abschlussfelder", () => {
  const a = abschlussAusLieferscheinen([{ nr: "LS-1", datum: "2026-11-01", produkte: [
    { name: "Longi Hi-MO X6 450 W", beschreibung: "18 x Solarmodul 8,1 kWp", menge: 18 },
    { name: "Sungrow SH10RT Wechselrichter 10 kW", menge: 1 },
    { name: "Wallbox Sungrow AC22E", menge: 1 },
    { name: "Tigo TS4-A-O Optimierer", menge: 2 },
    { name: "Bosch Klimagerät Multisplit 5,3kW CL5000M53/2E", menge: 1 },
    { name: "Bosch Klimagerät Inneneinheit 2,6kW CL3200iUW26E Schlafzimmer", menge: 2 },
    { name: "Wandkonsole f.Split-Außeneinheit WKS-WP", menge: 1 },
  ] }]);
  assert.equal(a.ab_ac_wr.quelle, "LS-1");
  assert.match(a.ab_ac_wr.wert, /Sungrow/);
  assert.match(a.ab_dach_module.wert, /^18 x .*450/);
  assert.equal(a.ab_ac_wallbox_da.wert, "ja");
  assert.match(a.ab_ac_wallbox.wert, /Wallbox/);
  assert.equal(a.ab_dach_optimierer.wert, "2 x Tigo TS4-A-O Optimierer");
  assert.equal(a.ab_klima_aussen.wert, "Bosch Klimagerät Multisplit 5,3kW CL5000M53/2E");
  assert.equal(a.ab_klima_innen.wert, "2 x Bosch Klimagerät Inneneinheit 2,6kW CL3200iUW26E Schlafzimmer");
});

test("Lieferschein: Warmwasser- und Pufferspeicher als verbaut vorbelegt", () => {
  const a = abschlussAusLieferscheinen([{ nr: "LS-2", datum: "2026-11-01", produkte: [
    { name: "Bosch Warmwasserspeicher Stora WH 370 LP", menge: 1 }, { name: "Bosch Pufferspeicher Stora BH 200", menge: 1 },
  ] }]);
  assert.equal(a.ab_wp_ww_da.wert, "ja");
  assert.equal(a.ab_wp_puffer_da.wert, "ja");
});
