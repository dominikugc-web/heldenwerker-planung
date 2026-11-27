import { test } from "node:test";
import assert from "node:assert/strict";
import { testServer } from "./hilfe.mjs";

const J = { "Content-Type": "application/json" };
const wer = (login) => ({ "Tailscale-User-Login": login });

test("Teams: Admin legt an, alle lesen, Namen werden bereinigt", async () => {
  const s = await testServer({ inhaber: "chef@x.de" });
  try {
    await fetch(s.url + "/api/ich", { headers: wer("planer@x.de") });
    const neu = { teams: [{ name: " Dachteam 1 ", mitglieder: ["Max", " Moritz ", "Max", ""] }, { name: "SHK 1", mitglieder: [] }] };
    assert.equal((await fetch(s.url + "/api/teams", { method: "PUT", headers: { ...J, ...wer("planer@x.de") }, body: JSON.stringify(neu) })).status, 403);
    const r = await fetch(s.url + "/api/teams", { method: "PUT", headers: { ...J, ...wer("chef@x.de") }, body: JSON.stringify(neu) });
    assert.equal(r.status, 200);
    const liste = await (await fetch(s.url + "/api/teams", { headers: wer("planer@x.de") })).json();
    assert.deepEqual(liste, [{ name: "Dachteam 1", mitglieder: ["Max", "Moritz"] }, { name: "SHK 1", mitglieder: [] }]);
  } finally { await s.stop(); }
});

test("Teams: doppelter Teamname oder leerer Name abgelehnt", async () => {
  const s = await testServer({ inhaber: "chef@x.de" });
  try {
    const put = (teams) => fetch(s.url + "/api/teams", { method: "PUT", headers: { ...J, ...wer("chef@x.de") }, body: JSON.stringify({ teams }) });
    assert.equal((await put([{ name: "A", mitglieder: [] }, { name: "a", mitglieder: [] }])).status, 400);
    assert.equal((await put([{ name: "  ", mitglieder: [] }])).status, 400);
  } finally { await s.stop(); }
});
