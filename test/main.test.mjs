import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { testServer, tempDir } from "./hilfe.mjs";

const GH = "https://dominikugc-web.github.io";

test("gesund meldet nur, ob Schlüssel da sind, nie den Wert", async () => {
  const home = tempDir();
  fs.mkdirSync(path.join(home, ".hero"));
  fs.writeFileSync(path.join(home, ".hero", "graphql.env"), "HERO_GRAPHQL_KEY=geheim123\n");
  const s = await testServer({ homeDir: home });
  try {
    const r = await fetch(s.url + "/api/gesund");
    const text = await r.text();
    assert.equal(r.status, 200);
    assert.deepEqual(JSON.parse(text), { ok: true, hero: true, claude: false, echt: false });
    assert.ok(!text.includes("geheim123"));
  } finally { await s.stop(); }
});

test("CORS-Vorabfrage von GitHub Pages wird erlaubt", async () => {
  const s = await testServer();
  try {
    const r = await fetch(s.url + "/api/gesund", { method: "OPTIONS", headers: { Origin: GH, "Access-Control-Request-Method": "GET", "Access-Control-Request-Private-Network": "true" } });
    assert.equal(r.status, 204);
    assert.equal(r.headers.get("access-control-allow-origin"), GH);
    assert.equal(r.headers.get("access-control-allow-private-network"), "true");
  } finally { await s.stop(); }
});

test("fremder Origin bekommt keinen CORS-Kopf", async () => {
  const s = await testServer();
  try {
    const r = await fetch(s.url + "/api/gesund", { headers: { Origin: "https://boese.example" } });
    assert.equal(r.headers.get("access-control-allow-origin"), null);
  } finally { await s.stop(); }
});

test("ohne Tailscale-Login und ohne lokal gibt es 401", async () => {
  const s = await testServer({ lokal: false });
  try {
    assert.equal((await fetch(s.url + "/api/gesund")).status, 401);
    const mit = await fetch(s.url + "/api/gesund", { headers: { "Tailscale-User-Login": "dominik@example.com" } });
    assert.equal(mit.status, 200);
  } finally { await s.stop(); }
});

test("liefert index.html aus und verhindert Pfad-Ausbruch", async () => {
  const s = await testServer();
  try {
    const r = await fetch(s.url + "/");
    assert.equal(r.status, 200);
    assert.match(r.headers.get("content-type"), /text\/html/);
    const raus = await fetch(s.url + "/%2e%2e/package.json");
    assert.equal(raus.status, 404);
  } finally { await s.stop(); }
});

test("roher Pfad mit ..%2f kommt nicht aus web/ heraus", async () => {
  const http = await import("node:http");
  const s = await testServer();
  try {
    const status = await new Promise((ok, fail) => http.get(s.url + "/..%2fpackage.json", (r) => { r.resume(); ok(r.statusCode); }).on("error", fail));
    assert.equal(status, 404);
  } finally { await s.stop(); }
});

test("POST ohne JSON-Kennung wird abgewiesen (Schutz gegen fremde Seiten)", async () => {
  const s = await testServer();
  try {
    const r = await fetch(s.url + "/api/planungen", { method: "POST", headers: { "Content-Type": "text/plain" }, body: JSON.stringify({ projektId: 1 }) });
    assert.equal(r.status, 415);
    const ok = await fetch(s.url + "/api/planungen", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ projektId: 1 }) });
    assert.equal(ok.status, 201);
  } finally { await s.stop(); }
});

test("fremde Fehler mit status (z. B. aus dem SDK) gehen nur allgemein raus", async () => {
  const geheim = Object.assign(new Error("400 invalid_request_error request_id req_123"), { status: 400 });
  const client = { beta: { messages: { create: async () => { throw geheim; } } } };
  const s = await testServer({ claudeClient: client });
  try {
    const p = await (await fetch(s.url + "/api/planungen", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ projektId: 1, projektTitel: "T" }) })).json();
    const r = await fetch(s.url + `/api/planungen/${p.id}/zusammenfassen`, { method: "POST", headers: { "Content-Type": "application/json" } });
    assert.equal(r.status, 502);
    const text = await r.text();
    assert.ok(!text.includes("req_123"), text);
    assert.match(text, /Claude/);
  } finally { await s.stop(); }
});

test("HERO-Schlüssel: eigener aus planung.env vor dem allgemeinen", async () => {
  const { heroSchluessel } = await import("../server/konfig.mjs");
  const home = tempDir();
  fs.mkdirSync(path.join(home, ".hero"));
  assert.equal(heroSchluessel(home), null);
  fs.writeFileSync(path.join(home, ".hero", "graphql.env"), "HERO_GRAPHQL_KEY=allgemein\n");
  assert.equal(heroSchluessel(home), "allgemein");
  fs.writeFileSync(path.join(home, ".hero", "planung.env"), "HERO_GRAPHQL_KEY=\n");
  assert.equal(heroSchluessel(home), "allgemein", "leere planung.env zählt nicht");
  fs.writeFileSync(path.join(home, ".hero", "planung.env"), "HERO_GRAPHQL_KEY=planung\n");
  assert.equal(heroSchluessel(home), "planung");
});

test("Fehlerbericht der Oberfläche landet im Server-Log, gekürzt", async () => {
  const s = await testServer();
  const alt = console.error, zeilen = [];
  console.error = (...a) => zeilen.push(a.join(" "));
  try {
    const r = await fetch(s.url + "/api/fehlerbericht", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ort: "aufnahme", meldung: "NotSupportedError: " + "x".repeat(2000), geraet: "iPhone Safari" }) });
    assert.equal(r.status, 204);
    const z = zeilen.find((l) => l.includes("Oberfläche"));
    assert.ok(z && z.includes("aufnahme") && z.includes("NotSupportedError") && z.includes("iPhone"));
    assert.ok(z.length < 1200);
  } finally { console.error = alt; await s.stop(); }
});
