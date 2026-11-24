import { test } from "node:test";
import assert from "node:assert/strict";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { testServer } from "./hilfe.mjs";

const J = { "Content-Type": "application/json" };

test("Besichtigung für einen Kunden mit mehreren Projekten: Richtungen vorausgewählt, Nummern einmal, Heizlast aus dem WP-Projekt", async () => {
  const doc = await PDFDocument.create(), font = await doc.embedFont(StandardFonts.Helvetica);
  doc.addPage().drawText("Norm-Heizlast 8,4 kW", { x: 50, y: 700, font, size: 12 });
  const pdf = await doc.save();
  const gefragt = [];
  const heroFetch = async (url, init) => {
    if (url === "https://hero.test/hl.pdf") return new Response(pdf);
    const b = JSON.parse(init.body);
    gefragt.push(b.variables.id);
    if (b.query.includes("file_uploads")) return Response.json({ data: { project_match: { file_uploads: b.variables.id === 22
      ? [{ filename: "Muster-Raumweise-Heizlastbericht.pdf", temporary_url: "https://hero.test/hl.pdf", created: "2026-11-01", is_deleted: false }] : [] } } });
    return Response.json({ data: { project_match: { customer_documents: [] } } });
  };
  const s = await testServer({ heroKey: "k", heroFetch });
  try {
    const body = { projektId: 21, projektTitel: "PV-21, Muster", kunde: "Muster", nummer: "PV-21", typen: ["Klimaanlage", "PV", "Wärmepumpe"],
      projekte: [{ id: 21, nummer: "PV-21", richtungen: ["PV"] }, { id: 22, nummer: "WÄP-22", richtungen: ["Wärmepumpe"] }, { id: 23, nummer: "KLA-23", richtungen: ["Klimaanlage"] }] };
    const pl = await (await fetch(s.url + "/api/planungen", { method: "POST", headers: J, body: JSON.stringify(body) })).json();
    assert.equal(pl.antworten.typ.wert, "PV, Wärmepumpe, Klimaanlage", "Startfrage schon beantwortet, in Katalog-Reihenfolge");
    assert.equal(pl.antworten.projektnr.wert, "PV-21, WÄP-22, KLA-23");
    assert.deepEqual(pl.projekte.map((p) => p.id), [21, 22, 23]);
    assert.equal(pl.antworten.wp_leistung.wert, "8,4");
    assert.deepEqual([...new Set(gefragt)].sort(), [21, 22, 23]);

    const kaputt = await fetch(s.url + "/api/planungen", { method: "POST", headers: J, body: JSON.stringify({ ...body, projekte: [{ id: "x" }] }) });
    assert.equal(kaputt.status, 400);
    const alt = await (await fetch(s.url + "/api/planungen", { method: "POST", headers: J, body: JSON.stringify({ projektId: 21, projektTitel: "X", nummer: "PV-21" }) })).json();
    assert.deepEqual(alt.projekte, [{ id: 21, nummer: "PV-21", richtungen: [] }], "ohne Auswahl wie bisher ein Projekt");
    assert.equal(alt.antworten.typ, undefined);
  } finally { await s.stop(); }
});
