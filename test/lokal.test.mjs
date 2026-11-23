import { test } from "node:test";
import assert from "node:assert/strict";
import { antwortAnwenden } from "../web/lokal.js";

const JN = { id: "freileitung", art: "janein" }, AUSWAHL = { id: "dachbelag", art: "auswahl", optionen: ["Pfanne", "Bitum"] }, ZAHL = { id: "leistung", art: "zahl" };

test("offline: Antwort wird wie auf dem Server eingetragen (Ja/Nein klein, Auswahl wie im Katalog, Zahl ohne Leerzeichen)", () => {
  let a = antwortAnwenden({}, JN, { wert: "Ja" });
  a = antwortAnwenden(a, AUSWAHL, { wert: "pfanne" });
  a = antwortAnwenden(a, ZAHL, { wert: " 9, 9 ".replace(", ", ",") });
  assert.equal(a.freileitung.wert, "ja");
  assert.equal(a.dachbelag.wert, "Pfanne");
  assert.equal(a.leistung.wert, "9,9");
});

test("offline: Überspringen und spätere Antwort, Notiz bleibt", () => {
  let a = antwortAnwenden({}, JN, { uebersprungen: true });
  a = antwortAnwenden(a, JN, { notiz: " Kabel prüfen " });
  assert.equal(a.freileitung.uebersprungen, true);
  a = antwortAnwenden(a, JN, { wert: "nein" });
  assert.deepEqual([a.freileitung.uebersprungen, a.freileitung.wert, a.freileitung.notiz], [false, "nein", "Kabel prüfen"]);
});

test("offline: Dateien behalten ihre Angaben, neue bekommen sie aus meta, bemalte die neue Version", () => {
  let a = antwortAnwenden({}, AUSWAHL, { dateien: [{ id: "f1" }] }, { f1: { id: "f1", art: "bild", name: "A.jpg", v: 1 } });
  a = antwortAnwenden(a, AUSWAHL, { dateien: [{ id: "f1" }, { id: "f2" }] }, { f2: { id: "f2", art: "audio", name: "S.m4a", v: 2 } });
  assert.deepEqual(a.dachbelag.dateien.map((d) => [d.id, d.art, d.v]), [["f1", "bild", 1], ["f2", "audio", 2]]);
  a = antwortAnwenden(a, AUSWAHL, { dateien: [{ id: "f1" }, { id: "f2" }] }, { f1: { v: 9 } });
  assert.equal(a.dachbelag.dateien[0].v, 9);
  assert.equal(a.dachbelag.dateien[0].name, "A.jpg");
});

test("offline: geänderte Antwort verliert den Lieferschein-Hinweis, Notiz oder Foto nicht", () => {
  const a0 = { leistung: { wert: "11,4", uebersprungen: false, dateien: [], notiz: "", quelle: "LS-883" } };
  assert.equal(antwortAnwenden(a0, ZAHL, { notiz: "x" }).leistung.quelle, "LS-883");
  assert.equal(antwortAnwenden(a0, ZAHL, { wert: "12" }).leistung.quelle, undefined);
});

test("Zeitlimit: hängende Anfrage wird abgebrochen, eigener Abbruch bleibt erkennbar", async () => {
  const { zeitSignal } = await import("../web/lokal.js");
  const s = zeitSignal(undefined, 20);
  await new Promise((ok) => setTimeout(ok, 60));
  assert.equal(s.aborted, true);
  const eigen = new AbortController(), t = zeitSignal(eigen.signal, 10_000);
  eigen.abort();
  assert.equal(t.aborted, true);
  assert.equal(eigen.signal.aborted, true); // daran erkennt api(), dass der Aufrufer abgebrochen hat und nicht das Netz
});
