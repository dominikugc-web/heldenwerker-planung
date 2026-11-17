import { test } from "node:test";
import assert from "node:assert/strict";
import { PDFDocument } from "pdf-lib";
import { ladeFelder, ergebnisPruefen, fehltBerechnen, protokollPdf, PFLICHTFOTOS, ergebnisSchema } from "../server/protokoll.mjs";

const leer = (felder) => Object.fromEntries(felder.map((f) => [f.name, ""]));

test("Felder aus der PDF-Vorlage: Auswahl, Ja/Nein-Paare, keine Foto-Haken", async () => {
  const felder = await ladeFelder();
  const f = Object.fromEntries(felder.map((x) => [x.name, x]));
  for (const n of ["modul", "dachbelag", "kabelweg_dach_wr", "optimierer", "inneneinheit"]) assert.equal(f[n].art, "auswahl", n);
  assert.equal(f.sturmklammern.art, "janein");
  assert.deepEqual(f.wlan_lan.optionen, ["WLAN", "LAN"]);
  assert.equal(f.datum.art, "text");
  assert.ok(!f.dachbelag.optionen.includes("- bitte wählen -"));
  assert.ok(!felder.some((x) => x.name.startsWith("foto_") || x.name.startsWith("datum_")));
  for (const x of felder) assert.ok(x.bereich >= 1 && x.bereich <= 7 && x.label, "Label fehlt: " + x.name);
});

test("Pflichtfotos sind die 12 aus dem Protokoll", () => {
  assert.equal(PFLICHTFOTOS.length, 12);
  assert.equal(PFLICHTFOTOS[10], "Zählerschrank");
});

test("ergebnisPruefen weist unbekannte Felder und falsche Auswahl ab", async () => {
  const felder = await ladeFelder();
  const gut = { monteure: { wasWirdGemacht: [], woKommtWasHin: [], achtung: [], material: [], offen: [] }, felder: { ...leer(felder), dachbelag: "Pfanne", sturmklammern: "ja" }, fotos: [] };
  assert.doesNotThrow(() => ergebnisPruefen(gut, felder));
  assert.throws(() => ergebnisPruefen({ ...gut, felder: { ...gut.felder, erfunden: "x" } }, felder), (e) => e.status === 400);
  assert.throws(() => ergebnisPruefen({ ...gut, felder: { ...gut.felder, dachbelag: "Stroh" } }, felder), (e) => e.status === 400);
  assert.throws(() => ergebnisPruefen({ ...gut, felder: { ...gut.felder, sturmklammern: "vielleicht" } }, felder), (e) => e.status === 400);
  assert.throws(() => ergebnisPruefen({ ...gut, fotos: [{ dateiId: "abcdef12", pflichtfoto: "Keller" }] }, felder), (e) => e.status === 400);
});

test("fehlt nennt jedes Pflichtfoto ohne zugeordnetes Foto", () => {
  const f = fehltBerechnen([{ dateiId: "a", pflichtfoto: "Dach gesamt" }, { dateiId: "b", pflichtfoto: "Weitere" }]);
  assert.equal(f.length, 11);
  assert.ok(!f.includes("Dach gesamt"));
  assert.ok(f.includes("Zählerschrank"));
});

test("Schema für Claude bleibt klein: Felder als Liste Feld + Wert", async () => {
  const felder = await ladeFelder();
  const s = ergebnisSchema(felder, ["abcdef12"]);
  assert.equal(s.additionalProperties, false);
  const item = s.properties.felder.items;
  assert.deepEqual(item.required, ["feld", "wert"]);
  assert.deepEqual(item.properties.feld.enum.sort(), felder.map((f) => f.name).sort());
  assert.deepEqual(item.properties.wert, { type: "string" });
  assert.deepEqual(s.properties.fotos.items.properties.dateiId.enum, ["abcdef12"]);
  assert.ok(JSON.stringify(s).length < 6000, "Schema zu groß: " + JSON.stringify(s).length);
});

test("felderAusListe: gültige Werte übernehmen, Auswahl ohne Groß/Klein, Rest verwerfen", async () => {
  const { felderAusListe } = await import("../server/protokoll.mjs");
  const felder = await ladeFelder();
  const f = felderAusListe([
    { feld: "dachbelag", wert: "pfanne" }, { feld: "sturmklammern", wert: "Ja" }, { feld: "kundenname", wert: "Müller" },
    { feld: "pfannentyp", wert: "Stroh" }, { feld: "erfunden", wert: "x" },
  ], felder);
  assert.equal(Object.keys(f).length, felder.length);
  assert.equal(f.dachbelag, "Pfanne");
  assert.equal(f.sturmklammern, "ja");
  assert.equal(f.kundenname, "Müller");
  assert.equal(f.pfannentyp, "");
  assert.equal(f.erfunden, undefined);
});

test("Feldliste für den Prompt nennt Bereich, Beschriftung und Auswahlwerte", async () => {
  const { feldListeText } = await import("../server/protokoll.mjs");
  const t = feldListeText(await ladeFelder());
  assert.match(t, /dachbelag \(Dachbelag\): Pfanne \| Bitum/);
  assert.match(t, /sturmklammern \(Sturmklammern\?\): ja \| nein/);
});

test("protokollPdf füllt Felder, Haken und Umlaute und ist danach flach", async () => {
  const felder = await ladeFelder();
  const ergebnis = { monteure: {}, fotos: [{ dateiId: "a", pflichtfoto: "Zählerschrank" }],
    felder: { ...leer(felder), kundenname: "Müller & Söhne", datum: "18.11.2026", dachbelag: "Pfanne", sturmklammern: "ja", wlan_lan: "LAN", vorlauftemp: "45°" } };
  const pdf = await protokollPdf(ergebnis, felder);
  const doc = await PDFDocument.load(pdf);
  assert.equal(doc.getForm().getFields().length, 0);
  assert.ok(doc.getPageCount() >= 3);
});

test("protokollPdf ersetzt Zeichen, die die PDF-Schrift nicht kann", async () => {
  const felder = await ladeFelder();
  const ergebnis = { monteure: {}, fotos: [], felder: { ...leer(felder), kundenname: "Kunde 😀 Ćosić" } };
  await assert.doesNotReject(protokollPdf(ergebnis, felder));
});

test("Route liefert Felder und Pflichtfotos für die Prüfansicht", async () => {
  const { testServer } = await import("./hilfe.mjs");
  const s = await testServer();
  try {
    const r = await (await fetch(s.url + "/api/protokoll-felder")).json();
    assert.equal(r.pflichtfotos.length, 12);
    assert.ok(r.felder.some((f) => f.name === "dachbelag" && f.optionen.includes("Pfanne")));
    assert.deepEqual(r.bereiche.length, 7);
  } finally { await s.stop(); }
});
