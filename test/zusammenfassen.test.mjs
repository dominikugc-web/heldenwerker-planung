import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { erstelleClaude } from "../server/claude.mjs";
import { ladeFelder } from "../server/protokoll.mjs";
import { testServer } from "./hilfe.mjs";

async function antwortVon(felder, extra = {}) {
  return {
    monteure: { wasWirdGemacht: ["PV 9,9 kWp auf Süddach"], woKommtWasHin: ["WR im Keller links"], achtung: ["Freileitung am Giebel"], material: [], offen: [] },
    felder: [{ feld: "dachbelag", wert: "Pfanne" }],
    fotos: [{ dateiId: "bild0001", pflichtfoto: "Dach gesamt" }],
    ...extra,
  };
}

function client(antwort, stop = "end_turn") {
  const anfragen = [];
  return { anfragen, beta: { messages: {
    create: async (p) => { anfragen.push(p); return { stop_reason: stop, content: [{ type: "text", text: JSON.stringify(antwort) }], usage: { input_tokens: 10, output_tokens: 10 } }; },
  } } };
}

test("zusammenfassen nutzt festes JSON-Format und hohen Aufwand", async () => {
  const felder = await ladeFelder();
  const c = client(await antwortVon(felder));
  const r = await erstelleClaude({ client: c }).zusammenfassen([{ role: "user", content: "x" }], felder, ["bild0001"]);
  const a = c.anfragen[0];
  assert.equal(a.output_config.effort, "high");
  assert.equal(a.output_config.format.type, "json_schema");
  assert.deepEqual(a.output_config.format.schema.properties.fotos.items.properties.dateiId.enum, ["bild0001"]);
  assert.equal(a.messages.at(-1).role, "user");
  assert.equal(r.ergebnis.felder.dachbelag, "Pfanne");
});

test("zusammenfassen bei Ablehnung wirft einen verständlichen Fehler", async () => {
  const felder = await ladeFelder();
  await assert.rejects(erstelleClaude({ client: client({}, "refusal") }).zusammenfassen([{ role: "user", content: "x" }], felder, []), (e) => e.status === 502);
});

test("Route: zusammenfassen speichert Ergebnis mit fehlt, PUT prüft Änderungen", async () => {
  const felder = await ladeFelder();
  const s = await testServer({ claudeClient: client(await antwortVon(felder)) });
  try {
    const p = await (await fetch(s.url + "/api/planungen", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ projektId: 11541539, projektTitel: "T" }) })).json();
    const dir = path.join(s.datenDir, "planungen", p.id, "dateien");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "bild0001"), "JPEG");
    fs.writeFileSync(path.join(dir, "bild0001.json"), JSON.stringify({ id: "bild0001", name: "Dach.jpg", art: "bild", groesse: 4 }));
    const pl = JSON.parse(fs.readFileSync(path.join(s.datenDir, "planungen", p.id, "planung.json")));
    pl.verlauf.push({ rolle: "planer", text: "Dach", zeit: "t", dateien: [{ id: "bild0001", name: "Dach.jpg", art: "bild" }] });
    fs.writeFileSync(path.join(s.datenDir, "planungen", p.id, "planung.json"), JSON.stringify(pl));

    const r = await fetch(s.url + `/api/planungen/${p.id}/zusammenfassen`, { method: "POST", headers: { "Content-Type": "application/json" } });
    assert.equal(r.status, 200);
    const e = await r.json();
    assert.equal(e.fehlt.length, 11);
    const gespeichert = await (await fetch(s.url + `/api/planungen/${p.id}`)).json();
    assert.equal(gespeichert.status, "zusammengefasst");

    const kaputt = { ...e, felder: { ...e.felder, dachbelag: "Stroh" } };
    assert.equal((await fetch(s.url + `/api/planungen/${p.id}/ergebnis`, { method: "PUT", body: JSON.stringify(kaputt) })).status, 400);
    const geaendert = { ...e, fotos: [{ dateiId: "bild0001", pflichtfoto: "Zählerschrank" }] };
    const r2 = await fetch(s.url + `/api/planungen/${p.id}/ergebnis`, { method: "PUT", body: JSON.stringify(geaendert) });
    assert.equal(r2.status, 200);
    assert.ok((await r2.json()).fehlt.includes("Dach gesamt"));
  } finally { await s.stop(); }
});

test("Route: Protokoll-PDF zur Vorschau", async () => {
  const felder = await ladeFelder();
  const s = await testServer({ claudeClient: client(await antwortVon(felder)) });
  try {
    const p = await (await fetch(s.url + "/api/planungen", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ projektId: 11541539, projektTitel: "T" }) })).json();
    assert.equal((await fetch(s.url + `/api/planungen/${p.id}/protokoll.pdf`)).status, 409);
    await fetch(s.url + `/api/planungen/${p.id}/zusammenfassen`, { method: "POST", headers: { "Content-Type": "application/json" } });
    const r = await fetch(s.url + `/api/planungen/${p.id}/protokoll.pdf`);
    assert.equal(r.status, 200);
    assert.equal(r.headers.get("content-type"), "application/pdf");
  } finally { await s.stop(); }
});

test("Route: Fotos mit unbekannter ID aus Claudes Antwort werden verworfen", async () => {
  const felder = await ladeFelder();
  const s = await testServer({ claudeClient: client(await antwortVon(felder, { fotos: [{ dateiId: "", pflichtfoto: "Weitere" }] })) });
  try {
    const p = await (await fetch(s.url + "/api/planungen", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ projektId: 11541539, projektTitel: "T" }) })).json();
    const e = await (await fetch(s.url + `/api/planungen/${p.id}/zusammenfassen`, { method: "POST", headers: { "Content-Type": "application/json" } })).json();
    assert.deepEqual(e.fotos, []);
    const r = await fetch(s.url + `/api/planungen/${p.id}/ergebnis`, { method: "PUT", body: JSON.stringify(e) });
    assert.equal(r.status, 200);
  } finally { await s.stop(); }
});
