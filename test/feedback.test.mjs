import { test } from "node:test";
import assert from "node:assert/strict";
import { testServer } from "./hilfe.mjs";

const senden = (s, body, wer = "planer@x.de") => fetch(s.url + "/api/feedback", { method: "POST", headers: { "Tailscale-User-Login": wer, "Content-Type": "application/json" }, body: JSON.stringify(body) });

test("Feedback wird gespeichert, nur der Inhaber sieht die Liste, neueste oben", async () => {
  const s = await testServer({ lokal: false, inhaber: "chef@x.de" });
  try {
    assert.equal((await senden(s, { art: "idee", text: "Dunkler Knopf" })).status, 201);
    assert.equal((await senden(s, { art: "fehler", text: "Absturz beim Foto" })).status, 201);
    assert.equal((await fetch(s.url + "/api/feedback", { headers: { "Tailscale-User-Login": "planer@x.de" } })).status, 403);
    const liste = await (await fetch(s.url + "/api/feedback", { headers: { "Tailscale-User-Login": "chef@x.de" } })).json();
    assert.deepEqual(liste.map((f) => [f.art, f.text, f.person]), [["fehler", "Absturz beim Foto", "planer@x.de"], ["idee", "Dunkler Knopf", "planer@x.de"]]);
  } finally { await s.stop(); }
});

test("Feedback prüft Art und Textlänge", async () => {
  const s = await testServer({ lokal: false, inhaber: "chef@x.de" });
  try {
    assert.equal((await senden(s, { art: "idee", text: "  " })).status, 400);
    assert.equal((await senden(s, { art: "idee", text: "x".repeat(4001) })).status, 400);
    assert.equal((await senden(s, { art: "lob", text: "super" })).status, 400);
  } finally { await s.stop(); }
});

test("Feedback mit Bildschirmfoto legt das Bild als Datei ab", async () => {
  const s = await testServer({ lokal: false, inhaber: "chef@x.de" });
  try {
    const png = Buffer.from("89504e470d0a1a0a", "hex").toString("base64");
    assert.equal((await senden(s, { art: "fehler", text: "Siehe Bild", bild: png })).status, 201);
    const [f] = await (await fetch(s.url + "/api/feedback", { headers: { "Tailscale-User-Login": "chef@x.de" } })).json();
    assert.match(f.bild, /^[a-z0-9-]+\.png$/);
    const r = await fetch(s.url + "/api/feedback/bild/" + f.bild, { headers: { "Tailscale-User-Login": "chef@x.de" } });
    assert.equal(r.status, 200);
  } finally { await s.stop(); }
});
