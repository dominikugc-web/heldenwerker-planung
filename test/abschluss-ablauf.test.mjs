import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { testServer } from "./hilfe.mjs";
import { fehltZumSenden } from "../server/bericht.mjs";

const J = { "Content-Type": "application/json" };
const post = (s, pfad, body) => fetch(s.url + pfad, { method: "POST", headers: J, body: JSON.stringify(body) });
const put = (s, pfad, body) => fetch(s.url + pfad, { method: "PUT", headers: J, body: JSON.stringify(body) });

// Abschlussbericht AC über die Startfrage; Unterschrift als hochgeladenes PNG.
async function bericht(s) {
  const p = await (await post(s, "/api/planungen", { projektId: 11541539, projektTitel: "UNB-1149, Muster", kunde: "Erika Muster", nummer: "UNB-1149" })).json();
  assert.equal((await put(s, `/api/planungen/${p.id}/antworten/bericht`, { wert: "Elektrik AC" })).status, 200);
  return p;
}
async function unterschreiben(s, id, dateiId = "unterschrift-1") {
  await fetch(`${s.url}/api/planungen/${id}/dateien/${dateiId}?name=Unterschrift.png&art=bild`, { method: "PUT", body: Buffer.from("png") });
  return put(s, `/api/planungen/${id}/antworten/ab_unterschrift`, { wert: "Erika Muster", dateien: [{ id: dateiId }] });
}
const laden = async (s, id) => (await fetch(`${s.url}/api/planungen/${id}`)).json();

test("Änderung nach der Unterschrift löscht die Unterschrift, Änderung der Unterschrift selbst nicht", async () => {
  const s = await testServer();
  try {
    const p = await bericht(s);
    assert.equal((await unterschreiben(s, p.id)).status, 200);
    assert.equal((await unterschreiben(s, p.id, "unterschrift-2")).status, 200);
    assert.equal((await laden(s, p.id)).antworten.ab_unterschrift.dateien[0].id, "unterschrift-2");
    const r = await (await put(s, `/api/planungen/${p.id}/antworten/ab_ac_wr`, { wert: "Sungrow 10 kW" })).json();
    assert.equal(r.antworten.ab_unterschrift, undefined);
  } finally { await s.stop(); }
});

test("Unterschrift braucht einen Namen", async () => {
  const s = await testServer();
  try {
    const p = await bericht(s);
    assert.equal((await put(s, `/api/planungen/${p.id}/antworten/ab_unterschrift`, { wert: "   " })).status, 400);
  } finally { await s.stop(); }
});

test("Pflichtfoto überspringen nur mit Grund", async () => {
  const s = await testServer();
  try {
    const p = await bericht(s);
    const f = "ab_ac_foto_app_laeuft";
    assert.equal((await put(s, `/api/planungen/${p.id}/antworten/${f}`, { uebersprungen: true })).status, 400);
    assert.equal((await put(s, `/api/planungen/${p.id}/antworten/${f}`, { uebersprungen: true, notiz: "Kunde hat kein Handy" })).status, 200);
    assert.ok(!fehltZumSenden(await laden(s, p.id)).includes("App läuft"));
  } finally { await s.stop(); }
});

test("Gesendeter Bericht ist gesperrt", async () => {
  const s = await testServer();
  try {
    const p = await bericht(s);
    const datei = path.join(s.datenDir, "planungen", p.id, "planung.json");
    fs.writeFileSync(datei, JSON.stringify({ ...JSON.parse(fs.readFileSync(datei, "utf8")), status: "gesendet" }));
    assert.equal((await put(s, `/api/planungen/${p.id}/antworten/ab_ac_wr`, { wert: "X" })).status, 409);
  } finally { await s.stop(); }
});

test("fehltZumSenden: Pflichtfotos und Unterschrift", async () => {
  const s = await testServer();
  try {
    const p = await bericht(s);
    const fehlt = fehltZumSenden(await laden(s, p.id));
    assert.ok(fehlt.includes("Unterschrift"));
    assert.ok(fehlt.includes("Zählerschrank geschlossen"));
    assert.ok(!fehlt.includes("Wallbox"), "Wallbox-Foto nur wenn Wallbox montiert");
    await unterschreiben(s, p.id);
    assert.ok(!fehltZumSenden(await laden(s, p.id)).includes("Unterschrift"));
  } finally { await s.stop(); }
});

test("Bericht-Typ lässt sich nach dem Anlegen nicht mehr ändern", async () => {
  const s = await testServer();
  try {
    const p = await bericht(s);
    assert.equal((await put(s, `/api/planungen/${p.id}/antworten/bericht`, { wert: "Klima" })).status, 400);
  } finally { await s.stop(); }
});

test("Sobald gesendet wird, ist der Bericht gesperrt (Antworten und Dateien)", async () => {
  const s = await testServer();
  try {
    const p = await bericht(s);
    await unterschreiben(s, p.id);
    const datei = path.join(s.datenDir, "planungen", p.id, "planung.json");
    fs.writeFileSync(datei, JSON.stringify({ ...JSON.parse(fs.readFileSync(datei, "utf8")), senden: { status: "fehler", start: new Date().toISOString() } }));
    assert.equal((await put(s, `/api/planungen/${p.id}/antworten/ab_ac_wr`, { wert: "X" })).status, 409);
    assert.equal((await fetch(`${s.url}/api/planungen/${p.id}/dateien/neu00001?name=x.jpg&art=bild`, { method: "PUT", body: Buffer.from("x") })).status, 409);
  } finally { await s.stop(); }
});

test("Unterschrift-Datei lässt sich nicht überschreiben, ein überschriebenes Foto löscht die Unterschrift", async () => {
  const s = await testServer();
  try {
    const p = await bericht(s);
    await fetch(`${s.url}/api/planungen/${p.id}/dateien/foto0001?name=a.jpg&art=bild`, { method: "PUT", body: Buffer.from("a") });
    await put(s, `/api/planungen/${p.id}/antworten/ab_ac_foto_app_laeuft`, { dateien: [{ id: "foto0001" }] });
    await unterschreiben(s, p.id);
    assert.equal((await fetch(`${s.url}/api/planungen/${p.id}/dateien/unterschrift-1?name=U.png&art=bild`, { method: "PUT", body: Buffer.from("neu") })).status, 409);
    assert.equal((await fetch(`${s.url}/api/planungen/${p.id}/dateien/foto0001?name=a.jpg&art=bild`, { method: "PUT", body: Buffer.from("b") })).status, 201);
    assert.equal((await laden(s, p.id)).antworten.ab_unterschrift, undefined);
  } finally { await s.stop(); }
});

test("Unterschrift lässt sich nicht überspringen", async () => {
  const s = await testServer();
  try {
    const p = await bericht(s);
    assert.equal((await put(s, `/api/planungen/${p.id}/antworten/ab_unterschrift`, { uebersprungen: true })).status, 400);
  } finally { await s.stop(); }
});

test("Bericht neu starten: Antworten und Unterschrift weg, Kopf und Monteure bleiben; gesendet geht nicht", async () => {
  const s = await testServer();
  try {
    const p = await (await post(s, "/api/planungen", { bericht: "ac", projektId: 11541539, projektTitel: "UNB-1149, Muster", kunde: "Erika Muster", nummer: "UNB-1149", monteure: ["Max M."] })).json();
    await put(s, `/api/planungen/${p.id}/antworten/ab_ac_wr`, { wert: "Sungrow 10 kW" });
    await unterschreiben(s, p.id);
    const r = await post(s, `/api/planungen/${p.id}/neustart`, {});
    assert.equal(r.status, 200);
    const neu = await r.json();
    assert.equal(neu.id, p.id);
    assert.equal(neu.antworten.ab_ac_wr, undefined);
    assert.equal(neu.antworten.ab_unterschrift, undefined);
    assert.equal(neu.antworten.ab_kunde.wert, "Erika Muster");
    assert.equal(neu.antworten.ab_monteure.wert, "Max M.");
    assert.equal(neu.antworten.bericht.wert, "Elektrik AC");
    const datei = path.join(s.datenDir, "planungen", p.id, "planung.json");
    fs.writeFileSync(datei, JSON.stringify({ ...JSON.parse(fs.readFileSync(datei, "utf8")), status: "gesendet" }));
    assert.equal((await post(s, `/api/planungen/${p.id}/neustart`, {})).status, 409);
  } finally { await s.stop(); }
});

test("Besichtigung neu starten: Antworten und Zusammenfassung weg, Kundendaten und Typ bleiben; gesendet geht nicht", async () => {
  const s = await testServer();
  try {
    const p = await (await post(s, "/api/planungen", { projektId: 11541539, projektTitel: "UNB-1149, Muster", kunde: "Erika Muster", nummer: "UNB-1149", adresse: "Weg 1", typen: ["PV"] })).json();
    await put(s, `/api/planungen/${p.id}/antworten/dachbelag`, { wert: "Pfanne" });
    const datei = path.join(s.datenDir, "planungen", p.id, "planung.json");
    fs.writeFileSync(datei, JSON.stringify({ ...JSON.parse(fs.readFileSync(datei, "utf8")), status: "zusammengefasst", ergebnis: { monteure: {}, fehlt: [] } }));
    const neu = await (await post(s, `/api/planungen/${p.id}/neustart`, {})).json();
    assert.equal(neu.antworten.dachbelag, undefined);
    assert.equal(neu.antworten.kunde.wert, "Erika Muster");
    assert.equal(neu.antworten.typ.wert, "PV");
    assert.equal(neu.status, "offen");
    assert.equal(neu.ergebnis, null);
    fs.writeFileSync(datei, JSON.stringify({ ...JSON.parse(fs.readFileSync(datei, "utf8")), status: "gesendet" }));
    assert.equal((await post(s, `/api/planungen/${p.id}/neustart`, {})).status, 409);
  } finally { await s.stop(); }
});

test("Neu starten mit neuer Auswahl: anderer Bericht und andere Monteure, bzw. andere Typen bei der Besichtigung", async () => {
  const s = await testServer();
  try {
    const a = await (await post(s, "/api/planungen", { bericht: "ac", projektId: 11541539, projektTitel: "UNB-1149", kunde: "K", monteure: ["Max"] })).json();
    const a2 = await (await post(s, `/api/planungen/${a.id}/neustart`, { bericht: "wp", monteure: ["Lisa", "Tom"] })).json();
    assert.equal(a2.antworten.bericht.wert, "Wärmepumpe");
    assert.equal(a2.antworten.ab_monteure.wert, "Lisa, Tom");
    assert.equal((await post(s, `/api/planungen/${a.id}/neustart`, { bericht: "sauna" })).status, 400);
    const b = await (await post(s, "/api/planungen", { projektId: 11541539, projektTitel: "UNB-1149", kunde: "K", typen: ["PV"] })).json();
    const b2 = await (await post(s, `/api/planungen/${b.id}/neustart`, { typen: ["Wärmepumpe", "Klimaanlage"], projekte: [{ id: 11541539, nummer: "UNB-1149", richtungen: ["Wärmepumpe", "Klimaanlage"] }] })).json();
    assert.equal(b2.antworten.typ.wert, "Wärmepumpe, Klimaanlage");
    assert.deepEqual(b2.projekte[0].richtungen, ["Wärmepumpe", "Klimaanlage"]);
  } finally { await s.stop(); }
});
