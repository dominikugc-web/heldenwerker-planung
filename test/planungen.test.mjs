import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { testServer, tempDir } from "./hilfe.mjs";

const json = (r) => r.json();
async function neuePlanung(s) {
  return json(await fetch(s.url + "/api/planungen", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ projektId: 11541539, projektTitel: "UNB-1149 Test" }) }));
}

test("neue Planung wird angelegt und gelistet (ohne Verlauf)", async () => {
  const s = await testServer();
  try {
    const p = await neuePlanung(s);
    assert.equal(p.status, "offen");
    assert.equal(p.person, "Lokal");
    assert.deepEqual(p.verlauf, []);
    const liste = await json(await fetch(s.url + "/api/planungen"));
    assert.equal(liste.length, 1);
    assert.equal(liste[0].verlauf, undefined);
    assert.equal((await fetch(s.url + "/api/planungen/gibtsnicht")).status, 404);
  } finally { await s.stop(); }
});

test("abgebrochener Upload hinterlässt keine Datei", async () => {
  const s = await testServer();
  try {
    const p = await neuePlanung(s);
    const u = new URL(s.url + `/api/planungen/${p.id}/dateien/abcdef12?name=Dach.jpg&art=bild&klein=0`);
    await new Promise((ok) => {
      const req = http.request(u, { method: "PUT", headers: { "Content-Length": 100000 } });
      req.on("error", () => ok());
      req.write(Buffer.alloc(1000));
      setTimeout(() => { req.destroy(); setTimeout(ok, 150); }, 50);
    });
    const dir = path.join(s.datenDir, "planungen", p.id, "dateien");
    const dateien = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => !f.endsWith(".tmp")) : [];
    assert.deepEqual(dateien, []);
  } finally { await s.stop(); }
});

test("großer Upload wird gestreamt statt im Speicher gesammelt", async () => {
  const s = await testServer();
  try {
    const p = await neuePlanung(s);
    // Beweis fürs Streaming: Mitten im Upload liegen schon Bytes auf der Platte (RSS im selben Prozess misst den Client mit).
    const MB = 1024 * 1024, block = Buffer.alloc(MB, 7);
    const dir = path.join(s.datenDir, "planungen", p.id, "dateien");
    const aufPlatte = () => (fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith(".tmp")).reduce((n, f) => n + fs.statSync(path.join(dir, f)).size, 0) : 0);
    const u = new URL(s.url + `/api/planungen/${p.id}/dateien/video0001?name=Rundgang.mp4&art=video&klein=0`);
    const status = await new Promise((ok, fail) => {
      const req = http.request(u, { method: "PUT", headers: { "Content-Length": 50 * MB } }, (r) => { r.resume(); ok(r.statusCode); });
      req.on("error", fail);
      for (let i = 0; i < 25; i++) req.write(block);
      const notfall = setTimeout(() => { clearInterval(warte); fail(new Error("Nach 25 MB lag nichts auf der Platte")); }, 5000);
      const warte = setInterval(() => {
        if (aufPlatte() >= 10 * MB) { clearInterval(warte); clearTimeout(notfall); for (let i = 0; i < 25; i++) req.write(block); req.end(); }
      }, 20);
    });
    assert.equal(status, 201);
    assert.equal(fs.statSync(path.join(dir, "video0001")).size, 50 * MB);
  } finally { await s.stop(); }
});

test("ungültige Datei-ID oder Art wird abgewiesen", async () => {
  const s = await testServer();
  try {
    const p = await neuePlanung(s);
    assert.equal((await fetch(s.url + `/api/planungen/${p.id}/dateien/x?name=a&art=bild`, { method: "PUT", body: "x" })).status, 400);
    assert.equal((await fetch(s.url + `/api/planungen/${p.id}/dateien/abcdef12?name=a&art=exe`, { method: "PUT", body: "x" })).status, 400);
  } finally { await s.stop(); }
});

test("hochgeladene Datei lässt sich wieder abrufen, klein bevorzugt, fremde IDs nicht", async () => {
  const s = await testServer();
  try {
    const p = await neuePlanung(s);
    const put = (klein, body) => fetch(s.url + `/api/planungen/${p.id}/dateien/bild0001?name=Dach.jpg&art=bild&klein=${klein}`, { method: "PUT", body });
    assert.equal((await put(0, "GROSS")).status, 201);
    assert.equal((await put(1, "KLEIN")).status, 201);
    const k = await fetch(s.url + `/api/planungen/${p.id}/dateien/bild0001?klein=1`);
    assert.equal(k.headers.get("content-type"), "image/jpeg");
    assert.equal(await k.text(), "KLEIN");
    assert.equal(await (await fetch(s.url + `/api/planungen/${p.id}/dateien/bild0001`)).text(), "GROSS");
    assert.equal((await fetch(s.url + `/api/planungen/${p.id}/dateien/fehlt0001`)).status, 404);
  } finally { await s.stop(); }
});

test("ich: Name aus dem Tailscale-Login und ob Inhaber", async () => {
  const s = await testServer({ lokal: false, inhaber: "chef@x.de" });
  try {
    const r = await (await fetch(s.url + "/api/ich", { headers: { "Tailscale-User-Login": "chef@x.de", "Tailscale-User-Name": "Max Muster" } })).json();
    assert.deepEqual(r, { login: "chef@x.de", name: "Max Muster", rolle: "admin", inhaber: true, feedbackNeu: 0 });
  } finally { await s.stop(); }
});


