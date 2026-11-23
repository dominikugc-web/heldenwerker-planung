import { test } from "node:test";
import assert from "node:assert/strict";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { heizlastAusText, heizlastAusPdf, antwortenAusHeizlast } from "../server/heizlast.mjs";

// Auszug aus einem echten Autarc-Bericht (Raumweise-Heizlastbericht), Zahlen geändert.
const TEXT = "Heizlast des Gebäudes (Verbrauch) \n7,1   kW \nNorm-Gebäudeheizlast gemäß Raumheizlast \nGebäudeheizlast \nNorm-Heizlast \n11,8   kW \nHeizlast / beheizte Gebäudefläche";

test("Norm-Heizlast aus dem Autarc-Bericht, nicht die Verbrauchsschätzung", () => {
  assert.equal(heizlastAusText(TEXT), "11,8");
  assert.equal(heizlastAusText("Norm-Heizlast \n9   kW"), "9");
  assert.equal(heizlastAusText("Heizlast des Gebäudes (Verbrauch) \n7,1 kW"), null);
  assert.equal(heizlastAusText(""), null);
});

test("Norm-Heizlast aus einer PDF-Datei lesen", async () => {
  const doc = await PDFDocument.create(), font = await doc.embedFont(StandardFonts.Helvetica), seite = doc.addPage();
  seite.drawText("Gebaeudeheizlast", { x: 50, y: 700, font, size: 12 });
  seite.drawText("Norm-Heizlast", { x: 50, y: 680, font, size: 12 });
  seite.drawText("12,4 kW", { x: 50, y: 660, font, size: 12 });
  assert.equal(await heizlastAusPdf(await doc.save()), "12,4");
});

test("Vorbefüllung: Leistung der Außeneinheit und Heizlast vorhanden, mit Quelle zum Prüfen", () => {
  assert.deepEqual(antwortenAusHeizlast("11,8"), {
    wp_leistung: { wert: "11,8", notiz: "Norm-Heizlast laut Heizlastbericht. Außeneinheit passend dazu wählen.", quelle: "Heizlastbericht" },
    heizlast_vorh: { wert: "ja", quelle: "Heizlastbericht" },
  });
  assert.deepEqual(antwortenAusHeizlast(null), {});
});

test("neue Planung: Leistung der Außeneinheit kommt aus dem Heizlastbericht in HERO", async () => {
  const { testServer } = await import("./hilfe.mjs");
  const doc = await PDFDocument.create(), font = await doc.embedFont(StandardFonts.Helvetica);
  doc.addPage().drawText("Norm-Heizlast 10,6 kW", { x: 50, y: 700, font, size: 12 });
  const pdf = await doc.save();
  const heroFetch = async (url, init) => {
    if (url === "https://hero.test/heizlast.pdf") return new Response(pdf);
    const q = JSON.parse(init.body).query;
    if (q.includes("file_uploads")) return Response.json({ data: { project_match: { file_uploads: [{ filename: "Müller-Raumweise-Heizlastbericht.pdf", temporary_url: "https://hero.test/heizlast.pdf", created: "2026-11-01", is_deleted: false }] } } });
    return Response.json({ data: { project_match: { customer_documents: [] } } });
  };
  const s = await testServer({ heroKey: "k", heroFetch });
  try {
    const pl = await (await fetch(s.url + "/api/planungen", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ projektId: 11541539, projektTitel: "X" }) })).json();
    assert.equal(pl.antworten.wp_leistung.wert, "10,6");
    assert.equal(pl.antworten.wp_leistung.quelle, "Heizlastbericht");
    assert.equal(pl.antworten.heizlast_vorh.wert, "ja");
  } finally { await s.stop(); }
});
