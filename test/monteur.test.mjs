import { test } from "node:test";
import assert from "node:assert/strict";
import { testServer } from "./hilfe.mjs";

const J = { "Content-Type": "application/json" };
const wer = (login) => ({ "Tailscale-User-Login": login });
const heute = new Date().toISOString();
// Montage (Umsetzung) bei Projekt 8 mit Monteur 61479, dazu ein Vor-Ort-Termin bei Projekt 7 und eine Umsetzung bei Projekt 9 ohne ihn.
const EVENTS = { data: { calendar_events: [
  { id: 1, title: "Vor Ort", start: heute, end: heute, all_day: false, project_match_id: 7, category: { name: "Vor-Ort-Termin" }, partners: [{ id: 61479, full_name: "Max Monteur", email: "" }] },
  { id: 2, title: "Montage A", start: heute, end: heute, all_day: false, project_match_id: 8, category: { name: "Umsetzung" }, partners: [{ id: 61479, full_name: "Max Monteur", email: "" }, { id: 5, full_name: "Lisa Kollegin", email: "" }] },
  { id: 3, title: "Montage B", start: heute, end: heute, all_day: false, project_match_id: 9, category: { name: "Umsetzung" }, partners: [{ id: 5, full_name: "Lisa Kollegin", email: "" }] },
] } };
const heroFetch = async () => new Response(JSON.stringify(EVENTS));

async function aufbau() {
  const s = await testServer({ heroKey: "k", heroFetch, inhaber: "chef@x.de" });
  const als = (login) => ({
    get: (pfad) => fetch(s.url + pfad, { headers: wer(login) }),
    post: (pfad, body) => fetch(s.url + pfad, { method: "POST", headers: { ...J, ...wer(login) }, body: JSON.stringify(body) }),
    put: (pfad, body) => fetch(s.url + pfad, { method: "PUT", headers: { ...J, ...wer(login) }, body: JSON.stringify(body) }),
  });
  const chef = als("chef@x.de"), max = als("max@x.de"), lisa = als("lisa@x.de");
  try {
    await chef.get("/api/ich"); await max.get("/api/ich"); await lisa.get("/api/ich");
    for (const [login, id] of [["max@x.de", 61479], ["lisa@x.de", 5]]) {
      const r = await chef.put("/api/team/" + encodeURIComponent(login), { rolle: "monteur", heroPerson: { id, name: login } });
      assert.equal(r.status, 200);
    }
  } catch (e) { await s.stop(); throw e; }
  return { s, chef, max, lisa };
}

test("Monteur: gesperrte Routen und Besichtigung anlegen geben 403", async () => {
  const { s, max } = await aufbau();
  try {
    assert.equal((await max.get("/api/projekte?suche=x")).status, 403);
    assert.equal((await max.post("/api/projekte", { nachname: "X" })).status, 403);
    assert.equal((await max.get("/api/kunden/1/projekte")).status, 403);
    assert.equal((await max.get("/api/hero-personen")).status, 403);
    assert.equal((await max.post("/api/planungen", { projektId: 8 })).status, 403, "Besichtigung");
    assert.equal((await max.post("/api/planungen", { bericht: "ac", projektId: 9 })).status, 403, "nicht eingeteilt");
    assert.equal((await max.post("/api/planungen", { bericht: "ac", projektId: 7 })).status, 403, "kein Montage-Termin");
  } finally { await s.stop(); }
});

test("Monteur: Termine nur eigene Montagen; Bericht anlegen, Kollege im selben Projekt darf weitermachen", async () => {
  const { s, chef, max, lisa } = await aufbau();
  try {
    const t = await (await max.get(`/api/termine?von=${new Date(Date.now() - 864e5).toISOString()}&bis=${new Date(Date.now() + 864e5).toISOString()}`)).json();
    assert.deepEqual(t.map((x) => x.id), [2]);
    const r = await max.post("/api/planungen", { bericht: "ac", projektId: 8, monteure: ["Lisa Kollegin"] });
    assert.equal(r.status, 201);
    const p = await r.json();
    assert.equal((await lisa.post("/api/planungen", { bericht: "ac", projektId: 8 })).status, 200, "Lisa setzt fort");
    assert.equal((await lisa.put(`/api/planungen/${p.id}/antworten/ab_ac_wr`, { wert: "X" })).status, 200);
    const besichtigung = await (await chef.post("/api/planungen", { projektId: 8, projektTitel: "x" })).json();
    assert.equal((await max.get("/api/planungen/" + besichtigung.id)).status, 403, "Besichtigung nicht sichtbar");
    assert.equal((await max.get(`/api/planungen/${besichtigung.id}/protokoll.pdf`)).status, 403);
    const liste = await (await max.get("/api/planungen")).json();
    assert.deepEqual(liste.map((x) => x.id), [p.id]);
    const fremd = await (await chef.post("/api/planungen", { bericht: "ac", projektId: 9 })).json();
    assert.equal((await max.get("/api/planungen/" + fremd.id)).status, 403);
    assert.equal((await max.put(`/api/planungen/${fremd.id}/antworten/ab_ac_wr`, { wert: "X" })).status, 403);
    assert.equal((await max.get("/api/projekte/9")).status, 403);
  } finally { await s.stop(); }
});

test("Mitarbeiterliste für die Auswahl „Wer war dabei“: auch für Monteure, nur Namen", async () => {
  const { s, max } = await aufbau();
  try {
    const r = await max.get("/api/mitarbeiter");
    assert.equal(r.status, 200);
    assert.deepEqual(await r.json(), ["Lisa Kollegin", "Max Monteur"]);
  } finally { await s.stop(); }
});

test("Gewählte Personen stehen im Bericht; beim Fortsetzen ersetzt die neue Auswahl die alte (ohne Unterschrift)", async () => {
  const { s, max } = await aufbau();
  try {
    const p = await (await max.post("/api/planungen", { bericht: "ac", projektId: 8, monteure: ["Max Monteur", "Lisa Kollegin"] })).json();
    assert.equal(p.antworten.ab_monteure.wert, "Max Monteur, Lisa Kollegin");
    const q = await (await max.post("/api/planungen", { bericht: "ac", projektId: 8, monteure: ["Lisa Kollegin"] })).json();
    assert.equal(q.id, p.id);
    assert.equal(q.antworten.ab_monteure.wert, "Lisa Kollegin");
  } finally { await s.stop(); }
});
