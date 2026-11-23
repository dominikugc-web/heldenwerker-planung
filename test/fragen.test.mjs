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

test("SAT-Frage heißt einbauen/versetzen, WR- und Speicher-Standort nur noch als Foto", () => {
  assert.equal(KATALOG.find((x) => x.id === "sat_schluessel").frage, "SAT-Schlüssel oder Ähnliches einbauen/versetzen?");
  assert.ok(!KATALOG.some((x) => x.id === "wr_standort" || x.id === "speicher_standort"));
  assert.ok(KATALOG.some((x) => x.frage === "Foto: WR/SP Standort"));
});
