import { test } from "node:test";
import assert from "node:assert/strict";
import { testServer } from "./hilfe.mjs";

const J = { "Content-Type": "application/json" };
const wer = (login, name = "") => ({ "Tailscale-User-Login": login, "Tailscale-User-Name": name });
const EVENTS = { data: { calendar_events: [
  { id: 1, title: "Vor Ort Müller", start: "2026-11-18T08:00:00Z", end: "2026-11-18T09:00:00Z", all_day: false, project_match_id: 7, category: { name: "Vor-Ort-Termin" },
    partners: [{ id: 86860, full_name: "Daniel Fech", email: "fech@heldenwerker.de" }] },
  { id: 2, title: "Montage Schmidt", start: "2026-11-18T07:00:00Z", end: "2026-11-18T15:00:00Z", all_day: false, project_match_id: 8, category: { name: "Umsetzung" },
    partners: [{ id: 67107, full_name: "Steffen Wall", email: "wall@heldenwerker.de" }, { id: 61479, full_name: "Dachteam 1", email: "montage@heldenwerker.de" }] },
  { id: 3, title: "Büro", start: "2026-11-19T07:00:00Z", end: "2026-11-19T08:00:00Z", all_day: false, project_match_id: null, category: { name: "Büro" }, partners: [] },
] } };
const heroFetch = async () => new Response(JSON.stringify(EVENTS));
const termine = (s, login) => fetch(s.url + "/api/termine?von=2026-11-16T00:00:00Z&bis=2026-11-23T00:00:00Z", { headers: wer(login) }).then((r) => r.json());

test("Termine: wer eingeteilt ist (nur Namen, keine E-Mail-Adressen), meins über die E-Mail-Adresse", async () => {
  const s = await testServer({ heroKey: "k", heroFetch, inhaber: "chef@x.de" });
  try {
    const t = await termine(s, "fech@heldenwerker.de");
    assert.deepEqual(t.map((x) => [x.id, x.meins]), [[1, true], [2, false], [3, false]]);
    assert.deepEqual(t[1].personen, ["Steffen Wall", "Dachteam 1"]);
    assert.doesNotMatch(JSON.stringify(t), /@heldenwerker/);
  } finally { await s.stop(); }
});

test("Termine: meins über die zugeordnete HERO-Person, die der Admin im Team einstellt; /api/ich nennt sie", async () => {
  const s = await testServer({ heroKey: "k", heroFetch, inhaber: "chef@x.de" });
  try {
    await termine(s, "daniel@gmail.com"); // Profil entsteht beim ersten Aufruf
    assert.ok((await termine(s, "daniel@gmail.com")).every((x) => !x.meins), "ohne Zuordnung nichts meins");
    await fetch(s.url + "/api/ich", { headers: wer("chef@x.de", "Chef") });
    const r = await fetch(s.url + "/api/team/" + encodeURIComponent("daniel@gmail.com"), { method: "PUT", headers: { ...J, ...wer("chef@x.de") }, body: JSON.stringify({ heroPerson: { id: 86860, name: "Daniel Fech" } }) });
    assert.equal(r.status, 200);
    assert.deepEqual((await termine(s, "daniel@gmail.com")).map((x) => x.meins), [true, false, false]);
    assert.deepEqual((await (await fetch(s.url + "/api/ich", { headers: wer("daniel@gmail.com") })).json()).heroPerson, { id: 86860, name: "Daniel Fech" });
    // Zuordnung wieder lösen
    await fetch(s.url + "/api/team/" + encodeURIComponent("daniel@gmail.com"), { method: "PUT", headers: { ...J, ...wer("chef@x.de") }, body: JSON.stringify({ heroPerson: null }) });
    assert.equal((await (await fetch(s.url + "/api/ich", { headers: wer("daniel@gmail.com") })).json()).heroPerson, null);
  } finally { await s.stop(); }
});

test("HERO-Personen für die Zuordnung: aus den Terminen, einmal je Person, sortiert, nur für Admins", async () => {
  const s = await testServer({ heroKey: "k", heroFetch, inhaber: "chef@x.de" });
  try {
    assert.equal((await fetch(s.url + "/api/hero-personen", { headers: wer("planer@x.de") })).status, 403);
    const p = await (await fetch(s.url + "/api/hero-personen", { headers: wer("chef@x.de") })).json();
    assert.deepEqual(p, [{ id: 61479, name: "Dachteam 1" }, { id: 86860, name: "Daniel Fech" }, { id: 67107, name: "Steffen Wall" }]);
  } finally { await s.stop(); }
});

test("Team: ungültige HERO-Person wird abgelehnt", async () => {
  const s = await testServer({ heroKey: "k", heroFetch, inhaber: "chef@x.de" });
  try {
    await fetch(s.url + "/api/ich", { headers: wer("chef@x.de") });
    const r = await fetch(s.url + "/api/team/" + encodeURIComponent("chef@x.de"), { method: "PUT", headers: { ...J, ...wer("chef@x.de") }, body: JSON.stringify({ heroPerson: { id: "abc" } }) });
    assert.equal(r.status, 400);
  } finally { await s.stop(); }
});

test("Termine: mehrere Besichtigungen beim selben Kunden am selben Tag werden ein Termin", async () => {
  const kunde = { customer: { id: 55, full_name: "Muster, Max", company_name: "" } };
  const ev = (id, start, end, pm, wer = []) => ({ id, title: "Besichtigung " + id, start, end, all_day: false, project_match_id: pm, project_match: kunde, category: { name: "Vor-Ort-Termin" }, partners: wer });
  const daniel = [{ id: 86860, full_name: "Daniel Fech", email: "fech@heldenwerker.de" }];
  const daten = { data: { calendar_events: [
    ev(1, "2026-11-18T08:00:00Z", "2026-11-18T09:00:00Z", 7),
    ev(2, "2026-11-18T09:00:00Z", "2026-11-18T10:00:00Z", 9, daniel),
    ev(3, "2026-11-19T08:00:00Z", "2026-11-19T09:00:00Z", 10),
  ] } };
  const s = await testServer({ heroKey: "k", heroFetch: async () => new Response(JSON.stringify(daten)), inhaber: "chef@x.de" });
  try {
    const t = await termine(s, "fech@heldenwerker.de");
    assert.equal(t.length, 2, "anderer Tag bleibt eigener Termin");
    assert.deepEqual([t[0].projektIds, t[0].start, t[0].ende, t[0].meins, t[0].titel], [[7, 9], "2026-11-18T08:00:00Z", "2026-11-18T10:00:00Z", true, "Muster, Max"]);
    assert.deepEqual(t[1].projektIds, [10]);
  } finally { await s.stop(); }
});
