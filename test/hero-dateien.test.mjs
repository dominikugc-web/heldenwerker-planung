import { test } from "node:test";
import assert from "node:assert/strict";
import { erstelleDateien } from "../server/hero-dateien.mjs";

function schreiberAttrappe() {
  const aufrufe = [];
  return { aufrufe, heroSchreiben: async (m, v, id) => { aufrufe.push({ m, v, id }); return { add_logbook_entry: { id: 9 }, upload_image: { id: 7 }, upload_document: { id: 8 } }; } };
}

test("logbuchEintrag schreibt Text an das Projekt über den Schreibschutz", async () => {
  const s = schreiberAttrappe();
  await erstelleDateien({ schreiber: s }).logbuchEintrag(11541539, "Für die Monteure:\n• Zählerschrank im Keller");
  assert.equal(s.aufrufe[0].id, 11541539);
  assert.deepEqual(s.aufrufe[0].v.e, { target: "project_match", target_id: 11541539, custom_text: "Für die Monteure:\n• Zählerschrank im Keller" });
});

test("inHero: Foto erst hochladen, dann als Bild Besichtigung ans Projekt, PDF als Dokument Allgemein", async () => {
  const s = schreiberAttrappe();
  const hero = { hochgeladen: [], async hochladen(pfad, name, mime) { this.hochgeladen.push({ pfad, name, mime }); return "uuid-" + this.hochgeladen.length; } };
  const d = erstelleDateien({ schreiber: s, hero });
  await d.inHero(11541539, "/p/a", "Zählerschrank 1.jpg", "image/jpeg");
  await d.inHero(11541539, "/p/b", "Besichtigungsprotokoll.pdf", "application/pdf");
  assert.deepEqual(hero.hochgeladen.map((h) => h.name), ["Zählerschrank 1.jpg", "Besichtigungsprotokoll.pdf"]);
  assert.match(s.aufrufe[0].m, /upload_image/);
  assert.deepEqual(s.aufrufe[0].v, { u: "uuid-1", id: 11541539, k: "Besichtigung" });
  assert.match(s.aufrufe[1].m, /upload_document/);
  assert.deepEqual(s.aufrufe[1].v, { u: "uuid-2", id: 11541539, d: { document_type_id: 380912 } });
  assert.deepEqual(s.aufrufe.map((a) => a.id), [11541539, 11541539], "über den Schreibschutz");
});
