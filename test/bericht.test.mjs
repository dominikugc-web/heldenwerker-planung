import { test } from "node:test";
import assert from "node:assert/strict";
import { PDFDocument, PDFName } from "pdf-lib";
import { berichtAbschnitte, berichtText, fehltPflichtfotos, berichtPdf, berichtTitel } from "../server/bericht.mjs";

import fs from "node:fs";
const JPEG = fs.readFileSync(new URL("./daten/foto.jpg", import.meta.url));

const planung = (antworten, extra = {}) => ({ id: "p1", projektTitel: "UNB-1149, Müller", erstellt: "2026-11-17T09:00:00Z", antworten, ...extra });
const a = (wert, mehr = {}) => ({ wert, uebersprungen: false, dateien: [], notiz: "", ...mehr });

test("Abschnitte: nur sichtbare, beantwortete Fragen, Notizen und Sprachtexte dabei", () => {
  const pl = planung({
    typ: a("PV"), kunde: a("Jörg Müller"), dachbelag: a("Pfanne", { notiz: "Ziegel brüchig" }),
    dachneigung: a("", { uebersprungen: true }), bosch_modell: a("CS7000"),
    foto_zaehlerschrank: a("", { dateien: [{ id: "b1", name: "ZS.jpg", art: "bild" }, { id: "s1", name: "Notiz.m4a", art: "audio", text: "ZS im Keller" }] }),
  });
  const ab = berichtAbschnitte(pl);
  const titel = ab.map((x) => x.titel);
  assert.ok(titel.includes("DC / Dachmontage") && !titel.some((t) => t.startsWith("Wärmepumpe")), "WP-Bereiche fehlen bei PV");
  const dc = ab.find((x) => x.titel === "DC / Dachmontage").eintraege;
  assert.deepEqual(dc.map((e) => e.frage), ["Dachbelag"], "übersprungene Frage fehlt");
  assert.equal(dc[0].notiz, "Ziegel brüchig");
  const foto = ab.find((x) => x.titel === "Pflichtfotos DC / AC").eintraege[0];
  assert.deepEqual(foto.bilder.map((b) => b.id), ["b1"]);
  assert.deepEqual(foto.medien.map((m) => [m.name, m.text]), [["Notiz.m4a", "ZS im Keller"]]);
});

test("Text für Claude und Logbuch: Bereich, Frage, Antwort, Notiz", () => {
  const t = berichtText(planung({ typ: a("PV"), dachbelag: a("Pfanne", { notiz: "Ziegel brüchig" }) }));
  assert.match(t, /DC \/ Dachmontage\n• Dachbelag: Pfanne \(Notiz: Ziegel brüchig\)/);
});

test("fehlende Pflichtfotos: nur sichtbare und ohne Bild", () => {
  assert.deepEqual(fehltPflichtfotos(planung({ typ: a("Wärmepumpe") })), []);
  const f = fehltPflichtfotos(planung({ typ: a("PV"), dachbelag: a("Pfanne"), foto_dach_gesamt: a("", { dateien: [{ id: "b1", art: "bild" }] }) }));
  assert.equal(f.length, 9);
  assert.ok(!f.includes("Dach gesamt") && f.includes("HAK") && f.includes("Pfannentyp"));
  assert.ok(!fehltPflichtfotos(planung({ typ: a("PV"), dachbelag: a("Flachdach") })).includes("Pfannentyp"), "ohne Pfanne kein Pfannenfoto");
});

test("PDF: lädt, hat Fotos, anklickbare Links, Seitenumbruch bei vielen Fotos, Umlaute ok", async () => {
  const bilder = Array.from({ length: 14 }, (_, i) => ({ id: "b" + i, name: `B${i}.jpg`, art: "bild" }));
  const pl = planung({
    typ: a("Beides"), kunde: a("Jörg Müller & Söhne"), dachbelag: a("Pfanne"),
    foto_dach_gesamt: a("", { dateien: bilder }),
    wp_fotos: a("", { dateien: [{ id: "v1", name: "Rundgang.mp4", art: "video" }] }),
  }, { ergebnis: { monteure: { wasWirdGemacht: ["PV 9,9 kWp"], woKommtWasHin: [], achtung: ["Hund 🐕"], material: [], offen: [] } } });
  const pdf = await berichtPdf(pl, { links: { v1: "https://drive.google.com/file/d/v1/view" }, bild: async () => JPEG });
  const doc = await PDFDocument.load(pdf);
  assert.ok(doc.getPageCount() >= 2, "mehrere Seiten");
  const annots = doc.getPages().flatMap((s) => s.node.Annots()?.asArray() || []);
  assert.ok(annots.length >= 1, "mindestens ein Link");
  const bildObjekte = [...doc.context.enumerateIndirectObjects()].filter(([, o]) => o?.dict?.get?.(PDFName.of("Subtype"))?.toString() === "/Image");
  assert.ok(bildObjekte.length >= 14, "Fotos eingebettet: " + bildObjekte.length);
});

test("PDF ohne Links: Video zeigt Hinweis statt Link", async () => {
  const pl = planung({ typ: a("Wärmepumpe"), wp_fotos: a("", { dateien: [{ id: "v1", name: "Rundgang.mp4", art: "video" }] }) });
  const doc = await PDFDocument.load(await berichtPdf(pl, { links: {}, bild: async () => JPEG }));
  assert.equal(doc.getPages().flatMap((s) => s.node.Annots()?.asArray() || []).length, 0);
});

test("Titel nennt alle gewählten Typen, alte Antwort Beides bleibt PV + Wärmepumpe", () => {
  assert.equal(berichtTitel({ typ: a("PV") }), "Technische Besichtigung PV");
  assert.equal(berichtTitel({ typ: a("Beides") }), "Technische Besichtigung PV + Wärmepumpe");
  assert.equal(berichtTitel({ typ: a("PV, Klimaanlage") }), "Technische Besichtigung PV + Klimaanlage");
});
