import { test } from "node:test";
import assert from "node:assert/strict";
import { testServer } from "./hilfe.mjs";
import { frageNach, sichtbar } from "../server/fragen.mjs";

const J = { "Content-Type": "application/json" };
const DATEIEN = [
  { id: 1, filename: "plan-alt.jpg", image_category: "Dachplanung", type: "image/jpeg", created: "2026-11-01T08:00:00+00:00", is_deleted: false, temporary_url: "https://hero.test/1" },
  { id: 2, filename: "plan-neu.jpg", image_category: "Planung ", type: "image/jpeg", created: "2026-11-20T08:00:00+00:00", is_deleted: false, temporary_url: "https://hero.test/2" },
  { id: 3, filename: "montage.jpg", image_category: "AC Montage", type: "image/jpeg", created: "2026-11-21T08:00:00+00:00", is_deleted: false, temporary_url: "https://hero.test/3" },
  { id: 4, filename: "geloescht.jpg", image_category: "Planung ", type: "image/jpeg", created: "2026-11-22T08:00:00+00:00", is_deleted: true, temporary_url: "https://hero.test/4" },
];
const heroFetch = async (url) => (String(url).startsWith("https://hero.test/") ? new Response("BILD" + url.slice(-1), { headers: { "Content-Type": "image/jpeg" } })
  : new Response(JSON.stringify({ data: { project_match: { file_uploads: DATEIEN } } })));

test("Folgefrage: Belegung nicht wie geplant führt zum Planungsbild aus HERO", () => {
  const vis = (w) => sichtbar({ bericht: { wert: "Dachmontage DC" }, ab_dach_belegung: { wert: w } }).map((f) => f.id);
  assert.ok(!vis("ja").includes("ab_dach_aenderung"));
  assert.ok(vis("nein").includes("ab_dach_aenderung"));
  assert.ok(frageNach("ab_dach_aenderung").pflicht && frageNach("ab_dach_aenderung").heroBilder);
});

test("Planungsbilder: nur Planungs-Kategorien, neueste zuerst; Bild wird durchgereicht", async () => {
  const s = await testServer({ heroKey: "k", heroFetch });
  try {
    const p = await (await fetch(s.url + "/api/planungen", { method: "POST", headers: J, body: JSON.stringify({ bericht: "dc", projektId: 11033951, projektTitel: "X" }) })).json();
    const liste = await (await fetch(`${s.url}/api/planungen/${p.id}/planungsbilder`)).json();
    assert.deepEqual(liste.map((b) => b.id), [2, 1]);
    assert.equal(liste[0].kategorie, "Planung");
    const r = await fetch(`${s.url}/api/planungen/${p.id}/planungsbilder/1`);
    assert.equal(r.status, 200);
    assert.equal(await r.text(), "BILD1");
    assert.equal((await fetch(`${s.url}/api/planungen/${p.id}/planungsbilder/3`)).status, 404, "keine fremden Bilder");
  } finally { await s.stop(); }
});
