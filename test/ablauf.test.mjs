import { test } from "node:test";
import assert from "node:assert/strict";
import { testServer } from "./hilfe.mjs";

const J = { "Content-Type": "application/json" };
const post = (s, pfad, body) => fetch(s.url + pfad, { method: "POST", headers: J, body: JSON.stringify(body) });
const put = (s, pfad, body) => fetch(s.url + pfad, { method: "PUT", headers: J, body: JSON.stringify(body) });

async function neu(s) {
  return (await post(s, "/api/planungen", { projektId: 11541539, projektTitel: "UNB-1149, Müller", kunde: "Jörg Müller", adresse: "Weg 1, 56307 Dernbach", nummer: "UNB-1149" })).json();
}

test("Fragenkatalog kommt mit Bereichen", async () => {
  const s = await testServer();
  try {
    const r = await (await fetch(s.url + "/api/fragen")).json();
    assert.equal(r.katalog[0].id, "typ");
    assert.ok(r.bereiche.dc);
  } finally { await s.stop(); }
});

test("neue Planung: Kundendaten aus HERO und Datum sind schon beantwortet, IDs ohne Umlaute", async () => {
  const s = await testServer();
  try {
    const p = await neu(s);
    assert.equal(p.antworten.kunde.wert, "Jörg Müller");
    assert.equal(p.antworten.projektnr.wert, "UNB-1149");
    assert.equal(p.antworten.adresse.wert, "Weg 1, 56307 Dernbach");
    assert.match(p.antworten.datum.wert, /^\d\d\.\d\d\.\d{4}$/);
    const { katalog } = await (await fetch(s.url + "/api/fragen")).json();
    assert.ok(katalog.every((f) => /^[a-z0-9_]+$/.test(f.id)), "IDs nur a-z, 0-9, _");
  } finally { await s.stop(); }
});

test("Antwort speichern, prüfen, überspringen, nächste Frage", async () => {
  const s = await testServer();
  try {
    const p = await neu(s);
    let r = await (await put(s, `/api/planungen/${p.id}/antworten/typ`, { wert: "pv" })).json();
    assert.equal(r.antworten.typ.wert, "PV");
    assert.equal(r.naechste, "anlagenleistung");
    assert.equal((await put(s, `/api/planungen/${p.id}/antworten/dachbelag`, { wert: "Stroh" })).status, 400);
    assert.equal((await put(s, `/api/planungen/${p.id}/antworten/gibtsnicht`, { wert: "x" })).status, 404);
    r = await (await put(s, `/api/planungen/${p.id}/antworten/anlagenleistung`, { uebersprungen: true })).json();
    assert.equal(r.antworten.anlagenleistung.uebersprungen, true);
    assert.equal(r.naechste, "anzahl_module");
    r = await (await put(s, `/api/planungen/${p.id}/antworten/anlagenleistung`, { wert: "9,9" })).json();
    assert.deepEqual([r.antworten.anlagenleistung.wert, r.antworten.anlagenleistung.uebersprungen], ["9,9", false]);
  } finally { await s.stop(); }
});

test("Fotos und Sprachnotiz an einer Antwort: Datei muss existieren, Sprache wird umgewandelt", async () => {
  const gehoert = [];
  const s = await testServer({ transkribieren: async () => { gehoert.push(1); return "Zählerschrank im Keller"; } });
  try {
    const p = await neu(s);
    await put(s, `/api/planungen/${p.id}/antworten/typ`, { wert: "PV" });
    assert.equal((await put(s, `/api/planungen/${p.id}/antworten/foto_zaehlerschrank`, { dateien: [{ id: "fehlt0001" }] })).status, 400);
    await fetch(s.url + `/api/planungen/${p.id}/dateien/bild0001?name=ZS.jpg&art=bild&klein=0`, { method: "PUT", body: "JPEG" });
    await fetch(s.url + `/api/planungen/${p.id}/dateien/audio001?name=Notiz.m4a&art=audio&klein=0`, { method: "PUT", body: "AUDIO" });
    const r = await (await put(s, `/api/planungen/${p.id}/antworten/foto_zaehlerschrank`, { dateien: [{ id: "bild0001" }, { id: "audio001" }], notiz: "Alt, muss raus" })).json();
    const a = r.antworten.foto_zaehlerschrank;
    assert.deepEqual(a.dateien.map((d) => [d.id, d.art]), [["bild0001", "bild"], ["audio001", "audio"]]);
    assert.equal(a.dateien[1].text, "Zählerschrank im Keller");
    assert.equal(a.notiz, "Alt, muss raus");
    assert.equal(gehoert.length, 1);
    assert.notEqual(r.naechste, "foto_zaehlerschrank");
  } finally { await s.stop(); }
});
