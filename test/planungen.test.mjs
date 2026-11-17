import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { PDFDocument } from "pdf-lib";
import { erstellePlanungen } from "../server/planungen.mjs";
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

test("Verlauf wird zu Claude-Nachrichten: Bild, PDF, Video als Text", () => {
  const datenDir = tempDir();
  const pl = erstellePlanungen({ datenDir });
  const p = pl.neu({ projektId: 1, projektTitel: "UNB-1 Müller", person: "x" });
  const dir = path.join(datenDir, "planungen", p.id, "dateien");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "bild0001.klein"), "JPEGKLEIN");
  fs.writeFileSync(path.join(dir, "pdf00001"), "%PDF");
  p.verlauf.push({ rolle: "planer", text: "Hier das Dach", zeit: "t", dateien: [
    { id: "bild0001", name: "Dach.jpg", art: "bild" }, { id: "pdf00001", name: "Plan.pdf", art: "pdf" }, { id: "vid00001", name: "Rundgang.mp4", art: "video" }] });
  p.verlauf.push({ rolle: "claude", text: "Danke", zeit: "t", dateien: [] });
  p.verlauf.push({ rolle: "planer", text: "Noch was", zeit: "t", dateien: [] });
  const m = pl.alsNachrichten(p);
  assert.equal(m[0].role, "user");
  assert.deepEqual(m[0].content.map((b) => b.type), ["text", "text", "image", "document", "text", "text"]);
  assert.match(m[0].content[0].text, /UNB-1 Müller/);
  assert.equal(m[0].content[1].text, "[Foto bild0001: Dach.jpg]");
  assert.equal(m[0].content[2].source.data, Buffer.from("JPEGKLEIN").toString("base64"));
  assert.equal(m[0].content[4].text, "[Video: Rundgang.mp4, Inhalt unbekannt]");
  assert.deepEqual(m.map((x) => x.role), ["user", "assistant", "user"]);
});

test("zwei Planer-Nachrichten hintereinander werden zu einer zusammengelegt", () => {
  const pl = erstellePlanungen({ datenDir: tempDir() });
  const p = pl.neu({ projektId: 1, projektTitel: "X", person: "x" });
  p.verlauf.push({ rolle: "planer", text: "eins", zeit: "t", dateien: [] }, { rolle: "planer", text: "zwei", zeit: "t", dateien: [] });
  const m = pl.alsNachrichten(p);
  assert.equal(m.length, 1);
  assert.deepEqual(m[0].content.slice(1).map((b) => b.text), ["eins", "zwei"]);
});

test("mehr als 60 Fotos pro Planung werden abgelehnt", () => {
  const pl = erstellePlanungen({ datenDir: tempDir() });
  const p = pl.neu({ projektId: 1, projektTitel: "X", person: "x" });
  const fotos = (n) => Array.from({ length: n }, (_, i) => ({ id: "f" + i, name: "f.jpg", art: "bild" }));
  p.verlauf.push({ rolle: "planer", text: "", zeit: "t", dateien: fotos(59) });
  assert.doesNotThrow(() => pl.pruefeGrenzen(p, fotos(1)));
  assert.throws(() => pl.pruefeGrenzen(p, fotos(2)), (e) => e.status === 400 && /60 Fotos/.test(e.message));
});

test("PDF über 30 Seiten wird abgelehnt", async () => {
  const datenDir = tempDir();
  const pl = erstellePlanungen({ datenDir });
  const p = pl.neu({ projektId: 1, projektTitel: "X", person: "x" });
  const doc = await PDFDocument.create();
  for (let i = 0; i < 31; i++) doc.addPage();
  const dir = path.join(datenDir, "planungen", p.id, "dateien");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "pdf00031"), await doc.save());
  await assert.rejects(pl.pruefePdfs(p, [{ id: "pdf00031", name: "Gross.pdf", art: "pdf" }]), (e) => e.status === 400 && /30 Seiten/.test(e.message));
});

test("Nachricht ohne Claude-Schlüssel: 503 und Verlauf bleibt leer", async () => {
  const s = await testServer();
  try {
    const p = await neuePlanung(s);
    const r = await fetch(s.url + `/api/planungen/${p.id}/nachricht`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: "Hallo", dateien: [] }) });
    assert.equal(r.status, 503);
    assert.deepEqual((await json(await fetch(s.url + `/api/planungen/${p.id}`))).verlauf, []);
  } finally { await s.stop(); }
});

test("Nachricht mit Claude-Attrappe: Stream kommt an, beide Nachrichten und Kosten gespeichert", async () => {
  const client = { beta: { messages: { stream: () => ({
    async *[Symbol.asyncIterator]() { yield { type: "content_block_delta", delta: { type: "text_delta", text: "Wo ist der Zählerschrank?" } }; },
    finalMessage: async () => ({ stop_reason: "end_turn", content: [], usage: { input_tokens: 1000, output_tokens: 100 } }),
  }) } } };
  const s = await testServer({ claudeClient: client });
  try {
    const p = await neuePlanung(s);
    const r = await fetch(s.url + `/api/planungen/${p.id}/nachricht`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: "Dach ist fertig", dateien: [] }) });
    assert.equal(r.status, 200);
    assert.equal(await r.text(), "Wo ist der Zählerschrank?");
    const neu = await json(await fetch(s.url + `/api/planungen/${p.id}`));
    assert.deepEqual(neu.verlauf.map((n) => [n.rolle, n.text]), [["planer", "Dach ist fertig"], ["claude", "Wo ist der Zählerschrank?"]]);
    assert.ok(neu.kostenCent > 0);
  } finally { await s.stop(); }
});

test("Nachricht mit unbekannter Datei wird abgewiesen", async () => {
  const s = await testServer({ claudeClient: { beta: { messages: { stream: () => { throw new Error("darf nicht laufen"); } } } } });
  try {
    const p = await neuePlanung(s);
    const r = await fetch(s.url + `/api/planungen/${p.id}/nachricht`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: "x", dateien: [{ id: "fehlt0001", name: "a.jpg", art: "bild" }] }) });
    assert.equal(r.status, 400);
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

function claudeMerker() {
  const anfragen = [];
  return { anfragen, beta: { messages: { stream: (p) => { anfragen.push(p); return {
    async *[Symbol.asyncIterator]() { yield { type: "content_block_delta", delta: { type: "text_delta", text: "Ok" } }; },
    finalMessage: async () => ({ stop_reason: "end_turn", content: [], usage: { input_tokens: 1, output_tokens: 1 } }),
  }; } } } };
}

test("Sprachnachricht: wird einmal umgewandelt, Claude bekommt den Text, Verlauf speichert ihn", async () => {
  const client = claudeMerker();
  const gehoert = [];
  const s = await testServer({ claudeClient: client, transkribieren: async (pfad) => { gehoert.push(pfad); return "Zählerschrank im Keller"; } });
  try {
    const p = await neuePlanung(s);
    const up = await fetch(s.url + `/api/planungen/${p.id}/dateien/audio0001?name=Sprachnachricht%201.m4a&art=audio&klein=0`, { method: "PUT", body: "AUDIO" });
    assert.equal(up.status, 201);
    const r = await fetch(s.url + `/api/planungen/${p.id}/nachricht`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: "", dateien: [{ id: "audio0001", name: "Sprachnachricht 1.m4a", art: "audio" }] }) });
    assert.equal(r.status, 200); await r.text();
    assert.equal(gehoert.length, 1);
    const inhalt = JSON.stringify(client.anfragen[0].messages);
    assert.match(inhalt, /\[Sprachnachricht: Zählerschrank im Keller\]/);
    const pl = await (await fetch(s.url + `/api/planungen/${p.id}`)).json();
    assert.equal(pl.verlauf[0].dateien[0].text, "Zählerschrank im Keller");
    const a = await fetch(s.url + `/api/planungen/${p.id}/dateien/audio0001`);
    assert.equal(a.headers.get("content-type"), "audio/mp4");
  } finally { await s.stop(); }
});

test("Sprachnachricht: klappt die Umwandlung nicht, geht es trotzdem weiter", async () => {
  const client = claudeMerker();
  const s = await testServer({ claudeClient: client, transkribieren: async () => { throw new Error("kein Python"); } });
  try {
    const p = await neuePlanung(s);
    await fetch(s.url + `/api/planungen/${p.id}/dateien/audio0002?name=Sprachnachricht.webm&art=audio&klein=0`, { method: "PUT", body: "AUDIO" });
    const r = await fetch(s.url + `/api/planungen/${p.id}/nachricht`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: "Hier noch was", dateien: [{ id: "audio0002", name: "Sprachnachricht.webm", art: "audio" }] }) });
    assert.equal(r.status, 200); await r.text();
    assert.match(JSON.stringify(client.anfragen[0].messages), /Sprachnachricht, nicht verstanden/);
  } finally { await s.stop(); }
});
