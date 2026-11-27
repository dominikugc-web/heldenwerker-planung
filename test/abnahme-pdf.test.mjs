import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import zlib from "node:zlib";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { PDFName, PDFDocument } from "pdf-lib";
import { berichtPdf, berichtAbschnitte, pdfDateiname } from "../server/bericht.mjs";

const JPEG = fs.readFileSync(new URL("./daten/foto.jpg", import.meta.url));
// Kleinstes gültiges PNG (1x1, weiß) als Unterschrift.
const png = () => {
  const chunk = (typ, daten) => { const l = Buffer.alloc(4); l.writeUInt32BE(daten.length); const t = Buffer.from(typ); const crc = Buffer.alloc(4); crc.writeUInt32BE(zlib.crc32(Buffer.concat([t, daten]))); return Buffer.concat([l, t, daten, crc]); };
  const ihdr = Buffer.from([0, 0, 0, 1, 0, 0, 0, 1, 8, 2, 0, 0, 0]);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(Buffer.from([0, 255, 255, 255]))), chunk("IEND", Buffer.alloc(0))]);
};
const a = (wert, mehr = {}) => ({ wert, uebersprungen: false, dateien: [], notiz: "", ...mehr });
const pl = {
  id: "p1", art: "abschluss", projektTitel: "UNB-1149, Muster", erstellt: "2026-11-27T09:00:00Z",
  antworten: {
    bericht: a("Elektrik DC"), ab_kunde: a("Erika Muster"), ab_projektnr: a("UNB-1149"), ab_datum: a("27.11.2026"), ab_monteure: a("Max M."),
    ab_dc_strings: a("1"), ab_dc_s1_spannung: a("391"), ab_dc_foto_dc_kabelweg: a("", { uebersprungen: true, notiz: "Kabel unter Putz" }),
    ab_dc_foto_messgeraet_mit_werten: a("", { dateien: [{ id: "f1", art: "bild", name: "x.jpg" }] }),
    ab_unterschrift: a("Erika Muster", { dateien: [{ id: "u1", art: "bild", name: "Unterschrift.png" }] }),
  },
};
const text = async (bytes) => {
  const doc = await getDocument({ data: new Uint8Array(bytes), isEvalSupported: false, verbosity: 0 }).promise;
  let t = "";
  for (let i = 1; i <= doc.numPages; i++) t += (await (await doc.getPage(i)).getTextContent()).items.map((x) => x.str).join(" ") + "\n";
  await doc.destroy();
  return t;
};

test("Abnahmeprotokoll-PDF: Titel, Messwert, Abnahmetext, Unterzeichner, Grund für fehlendes Foto", async () => {
  const pdf = await berichtPdf(pl, { bild: async (id) => (id === "u1" ? png() : JPEG) });
  const t = await text(pdf);
  assert.match(t, /Abnahmeprotokoll Elektrik DC/);
  assert.match(t, /391 V/);
  assert.match(t, /gewährleisten wir gemäß BGB 5 Jahre/);
  assert.match(t, /Erika Muster, 27\.11\.2026/);
  assert.match(t, /Nicht möglich/);
  assert.match(t, /Kabel unter Putz/);
  assert.doesNotMatch(t, /Für die Monteure/);
  const bilder = async (bytes) => [...(await PDFDocument.load(bytes)).context.enumerateIndirectObjects()].filter(([, o]) => o?.dict?.get?.(PDFName.of("Subtype"))?.toString() === "/Image").length;
  const ohne = await berichtPdf({ ...pl, antworten: { ...pl.antworten, ab_unterschrift: undefined } }, { bild: async () => JPEG });
  assert.equal(await bilder(pdf), (await bilder(ohne)) + 1, "Unterschrift genau einmal, nicht zusätzlich als Foto");
});

test("Abschnitte ohne Startfrage und ohne Unterschrift-Eintrag", () => {
  const ids = berichtAbschnitte(pl).flatMap((g) => g.eintraege.map((e) => e.id));
  assert.ok(!ids.includes("bericht") && !ids.includes("ab_unterschrift"));
});

test("Dateiname", () => {
  assert.equal(pdfDateiname(pl, "27.11.2026"), "Abnahmeprotokoll Elektrik DC Erika Muster 27.11.2026.pdf");
  assert.equal(pdfDateiname({ antworten: {} }, "27.11.2026"), "Besichtigungsprotokoll 27.11.2026.pdf");
});
