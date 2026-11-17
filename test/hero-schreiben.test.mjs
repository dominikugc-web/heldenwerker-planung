import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { erstelleSchreiber, TESTPROJEKT_ID } from "../server/hero-schreiben.mjs";
import { speichereJson, ladeJson } from "../server/speicher.mjs";
import { tempDir } from "./hilfe.mjs";

function heroAttrappe(antworten = {}) {
  const aufrufe = [];
  return { aufrufe, abfrage: async (q, v) => { aufrufe.push({ q, v }); const n = Object.keys(antworten).find((k) => q.includes(k)); const a = antworten[n]; if (a instanceof Error) throw a; return a; } };
}

test("TESTPROJEKT_ID ist UNB-1149", () => assert.equal(TESTPROJEKT_ID, 11541539));

test("zielProjekt leitet fremde Projekte ins Testprojekt um", () => {
  const datenDir = tempDir();
  const s = erstelleSchreiber({ hero: heroAttrappe(), datenDir });
  assert.deepEqual(s.zielProjekt(999), { id: 11541539, umgeleitet: true });
  assert.deepEqual(s.zielProjekt(11541539), { id: 11541539, umgeleitet: false });
  speichereJson(path.join(datenDir, "angelegt.json"), [4711]);
  assert.deepEqual(s.zielProjekt(4711), { id: 4711, umgeleitet: false });
  assert.deepEqual(s.zielProjekt("4711"), { id: 4711, umgeleitet: false });
});

test("heroSchreiben verweigert send_mail, delete und fremde Projekte ohne HERO-Aufruf", async () => {
  const h = heroAttrappe();
  const s = erstelleSchreiber({ hero: h, datenDir: tempDir() });
  await assert.rejects(s.heroSchreiben("mutation { send_mail(x:1) { id } }", {}, 11541539));
  await assert.rejects(s.heroSchreiben("mutation { delete_document(document_id:1) }", {}, 11541539));
  await assert.rejects(s.heroSchreiben("mutation { add_logbook_entry(x:1) { id } }", {}, 999));
  assert.equal(h.aufrufe.length, 0);
  await s.heroSchreiben("mutation { add_logbook_entry(x:1) { id } }", {}, 11541539);
  assert.equal(h.aufrufe.length, 1);
});

test("projektAnlegen setzt TEST davor und merkt sich die ID", async () => {
  const h = heroAttrappe({ create_contact: { create_contact: { id: 55, address_id: 66 } }, create_project_match: { create_project_match: { id: 77, project_nr: "UNB-2000" } } });
  const datenDir = tempDir();
  const s = erstelleSchreiber({ hero: h, datenDir });
  const p = await s.projektAnlegen({ vorname: "Jörg", nachname: "Meier", titel: "PV Dach", strasse: "Weg 1", plz: "56307", ort: "Dernbach" });
  assert.deepEqual(p, { id: 77, nummer: "UNB-2000" });
  const kontakt = h.aufrufe[0].v.c;
  assert.equal(kontakt.last_name, "TEST Meier");
  assert.equal(kontakt.address.street, "Weg 1");
  assert.equal(h.aufrufe[1].v.p.project_title, "TEST PV Dach");
  assert.equal(h.aufrufe[1].v.p.customer_id, 55);
  assert.deepEqual(ladeJson(path.join(datenDir, "angelegt.json"), []), [77]);
});

test("projektAnlegen: Fehler beim Projekt lässt angelegt.json unverändert", async () => {
  const h = heroAttrappe({ create_contact: { create_contact: { id: 55, address_id: 66 } }, create_project_match: Object.assign(new Error("kaputt"), { status: 502 }) });
  const datenDir = tempDir();
  const s = erstelleSchreiber({ hero: h, datenDir });
  await assert.rejects(s.projektAnlegen({ nachname: "Meier", titel: "PV" }));
  assert.deepEqual(ladeJson(path.join(datenDir, "angelegt.json"), []), []);
});

test("projektAnlegen verlangt Nachname oder Firma und einen Titel", async () => {
  const s = erstelleSchreiber({ hero: heroAttrappe(), datenDir: tempDir() });
  await assert.rejects(s.projektAnlegen({ titel: "PV" }), (e) => e.status === 400);
  await assert.rejects(s.projektAnlegen({ nachname: "M" }), (e) => e.status === 400);
});

test("POST /api/projekte ohne Pflichtangaben antwortet 400 ohne HERO-Aufruf", async () => {
  const { testServer } = await import("./hilfe.mjs");
  let aufrufe = 0;
  const s = await testServer({ heroKey: "k", heroFetch: async () => { aufrufe++; return new Response("{}"); } });
  try {
    const r = await fetch(s.url + "/api/projekte", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ titel: "PV" }) });
    assert.equal(r.status, 400);
    assert.equal(aufrufe, 0);
  } finally { await s.stop(); }
});
