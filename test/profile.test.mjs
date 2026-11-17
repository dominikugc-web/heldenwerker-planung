import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { erstelleProfile } from "../server/profile.mjs";
import { testServer, tempDir } from "./hilfe.mjs";

const J = { "Content-Type": "application/json" };
const wer = (login, name = "") => ({ "Tailscale-User-Login": login, "Tailscale-User-Name": name });

test("erstes Aufrufen legt ein Profil an, der Inhaber wird Admin", () => {
  const p = erstelleProfile({ datenDir: tempDir(), inhaber: "chef@x.de" });
  assert.equal(p.fuer("chef@x.de", "Dominik K").rolle, "admin");
  const planer = p.fuer("max@x.de", "Max Muster");
  assert.deepEqual([planer.name, planer.rolle], ["Max Muster", "planer"]);
  assert.equal(p.alle().length, 2);
  assert.equal(p.nameVon("max@x.de"), "Max Muster");
  assert.equal(p.nameVon("unbekannt@x.de"), "unbekannt@x.de");
});

test("leerer Name fällt auf den Login zurück, Name wird später nachgetragen", () => {
  const p = erstelleProfile({ datenDir: tempDir(), inhaber: null });
  assert.equal(p.fuer("max@x.de", "  ").name, "max@x.de");
  assert.equal(p.fuer("max@x.de", "Max Muster").name, "Max Muster");
});

test("zuletzt aktiv wird höchstens alle 5 Minuten geschrieben", () => {
  const datenDir = tempDir();
  let jetzt = Date.parse("2026-11-17T10:00:00Z");
  const p = erstelleProfile({ datenDir, inhaber: null, uhr: () => jetzt });
  p.fuer("max@x.de", "Max");
  const datei = path.join(datenDir, "profile.json");
  const vorher = fs.statSync(datei).mtimeMs;
  jetzt += 60_000;
  p.fuer("max@x.de", "Max");
  assert.equal(fs.statSync(datei).mtimeMs, vorher);
  jetzt += 5 * 60_000;
  assert.equal(p.fuer("max@x.de", "Max").zuletzt, new Date(jetzt).toISOString());
});

test("Team: Planer bekommt 403, Admin sieht alle und ändert Rolle und Name", async () => {
  const s = await testServer({ lokal: false, inhaber: "chef@x.de" });
  try {
    await fetch(s.url + "/api/ich", { headers: wer("max@x.de", "Max") });
    assert.equal((await fetch(s.url + "/api/team", { headers: wer("max@x.de") })).status, 403);
    const team = await (await fetch(s.url + "/api/team", { headers: wer("chef@x.de", "Dominik") })).json();
    assert.deepEqual(team.map((p) => p.login).sort(), ["chef@x.de", "max@x.de"]);
    const r = await fetch(s.url + "/api/team/" + encodeURIComponent("max@x.de"), { method: "PUT", headers: { ...J, ...wer("chef@x.de") }, body: JSON.stringify({ name: "Max Planer", rolle: "admin" }) });
    assert.equal(r.status, 200);
    const ich = await (await fetch(s.url + "/api/ich", { headers: wer("max@x.de", "Max") })).json();
    assert.deepEqual([ich.name, ich.rolle], ["Max Planer", "admin"]);
  } finally { await s.stop(); }
});

test("Team: ungültige Rolle 400, der letzte Admin kann sich nicht herabstufen", async () => {
  const s = await testServer({ lokal: false, inhaber: "chef@x.de" });
  try {
    const put = (body) => fetch(s.url + "/api/team/" + encodeURIComponent("chef@x.de"), { method: "PUT", headers: { ...J, ...wer("chef@x.de") }, body: JSON.stringify(body) });
    await fetch(s.url + "/api/ich", { headers: wer("chef@x.de", "Dominik") });
    assert.equal((await put({ rolle: "kaiser" })).status, 400);
    assert.equal((await put({ rolle: "planer" })).status, 400);
    assert.equal((await fetch(s.url + "/api/team/" + encodeURIComponent("fremd@x.de"), { method: "PUT", headers: { ...J, ...wer("chef@x.de") }, body: "{}" })).status, 404);
  } finally { await s.stop(); }
});

test("ich: Name aus dem Profil, Rolle und Inhaber-Flag für die Oberfläche", async () => {
  const s = await testServer({ lokal: false, inhaber: "chef@x.de" });
  try {
    const r = await (await fetch(s.url + "/api/ich", { headers: wer("chef@x.de", "Max Muster") })).json();
    assert.deepEqual([r.login, r.name, r.rolle, r.inhaber], ["chef@x.de", "Max Muster", "admin", true]);
  } finally { await s.stop(); }
});

test("Planungen zeigen den Namen des Anlegers aus dem Profil", async () => {
  const s = await testServer({ lokal: false, inhaber: "chef@x.de" });
  try {
    const p = await (await fetch(s.url + "/api/planungen", { method: "POST", headers: { ...J, ...wer("max@x.de", "Max Muster") }, body: JSON.stringify({ projektId: 11541539, projektTitel: "T" }) })).json();
    const liste = await (await fetch(s.url + "/api/planungen", { headers: wer("chef@x.de", "Dominik") })).json();
    assert.equal(liste[0].personName, "Max Muster");
    const eine = await (await fetch(s.url + "/api/planungen/" + p.id, { headers: wer("chef@x.de") })).json();
    assert.equal(eine.personName, "Max Muster");
  } finally { await s.stop(); }
});
