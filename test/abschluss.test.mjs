import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { erstellePlanungen } from "../server/planungen.mjs";
import { erstelleAbschluss, logbuchText, dateiNamen } from "../server/abschluss.mjs";
import { tempDir } from "./hilfe.mjs";

const MONTEURE = { wasWirdGemacht: ["PV 9,9 kWp Süddach"], woKommtWasHin: ["WR Keller links"], achtung: ["Freileitung am Giebel"], material: [], offen: ["Zählernummer"] };

async function aufbau({ projektId = 11541539, fotos = 5, ablageFehlerBei = null } = {}) {
  const datenDir = tempDir();
  const planungen = erstellePlanungen({ datenDir });
  const p = planungen.neu({ projektId, projektTitel: "UNB-1149 Müller", person: "x" });
  const dir = path.join(datenDir, "planungen", p.id, "dateien");
  fs.mkdirSync(dir, { recursive: true });
  const dateien = [];
  for (let i = 1; i <= fotos; i++) {
    const id = "bild000" + i;
    fs.writeFileSync(path.join(dir, id), "JPEG" + i);
    dateien.push({ id, name: `IMG_${i}.jpg`, art: "bild" });
  }
  const antwort = (wert, dateienListe = []) => ({ wert, uebersprungen: false, dateien: dateienListe, notiz: "" });
  p.antworten = { ...p.antworten, typ: antwort("PV"), dachbelag: antwort("Pfanne"), foto_zaehlerschrank: antwort("", dateien.slice(0, 1)), foto_dach_gesamt: antwort("", dateien.slice(1)) };
  p.ergebnis = { monteure: MONTEURE, fehlt: [] };
  p.status = "zusammengefasst";
  planungen.speichern(p);

  const log = { hochgeladen: [], logbuch: [] };
  let zaehler = 0;
  const ablage = { name: "Drive", async hochladen(pfad, name) {
    zaehler++;
    if (ablageFehlerBei && zaehler === ablageFehlerBei) throw new Error("Netz weg");
    log.hochgeladen.push(name);
    return "https://link/" + encodeURIComponent(name);
  } };
  const dateienHero = { async logbuchEintrag(id, text) { log.logbuch.push({ id, text }); return { id: 1 }; } };
  const schreiber = { zielProjekt: (id) => (Number(id) === 11541539 ? { id: 11541539, umgeleitet: false } : { id: 11541539, umgeleitet: true }) };
  return { p, planungen, log, abschluss: erstelleAbschluss({ planungen, schreiber, dateien: dateienHero, ablage, nameVon: () => "Max Muster" }) };
}

test("Logbuch: nur kurz, dass besichtigt wurde und von wem, ohne Stichpunkte und Links", async () => {
  const { p, log, abschluss } = await aufbau();
  await abschluss.abschliessen(p.id);
  assert.match(log.logbuch[0].text, /^Besichtigung durchgeführt\nAufgenommen von Max Muster am \d\d\.\d\d\.\d{4}$/);
  assert.doesNotMatch(log.logbuch[0].text, /https?:|•|Freileitung/);
});

test("Dateinamen: Fotos nach ihrer Frage nummeriert, Umlaute bleiben, andere Dateien behalten ihren Namen", () => {
  const bild = (id) => ({ id, art: "bild", name: id + ".jpg" });
  const n = dateiNamen({ antworten: {
    foto_zaehlerschrank: { dateien: [bild("a"), bild("b")] }, foto_sparren_lattung: { dateien: [bild("d")] },
    dachbelag: { dateien: [bild("c"), { id: "v", art: "video", name: "Rundgang.mp4" }] },
  } });
  assert.deepEqual(n, { a: "Zählerschrank 1.jpg", b: "Zählerschrank 2.jpg", d: "Sparren-Lattung 1.jpg", c: "Dachbelag 1.jpg", v: "Rundgang.mp4" });
});

test("Logbuch-Text ohne Gedankenstriche", () => {
  assert.doesNotMatch(logbuchText("Aufgenommen von A am 01.01.2026"), /–|—/);
});

test("zweiter Lauf lädt nichts doppelt und schreibt keinen zweiten Logbuch-Eintrag", async () => {
  const { p, log, abschluss } = await aufbau();
  const r1 = await abschluss.abschliessen(p.id);
  assert.equal(r1.hochgeladen, 6); // 5 Fotos + Protokoll-PDF
  assert.equal(log.logbuch.length, 1);
  const r2 = await abschluss.abschliessen(p.id);
  assert.equal(r2.hochgeladen, 0);
  assert.equal(r2.uebersprungen, 6);
  assert.equal(log.logbuch.length, 1);
});

test("Abbruch beim dritten Upload: nächster Lauf holt nur die fehlenden nach, Logbuch erst am Ende", async () => {
  const { p, planungen, log, abschluss } = await aufbau({ ablageFehlerBei: 3 });
  const r1 = await abschluss.abschliessen(p.id);
  assert.equal(r1.fehler.length, 1);
  assert.equal(Object.keys(planungen.laden(p.id).gesendet.dateien).length, 2);
  assert.equal(log.logbuch.length, 0);
  const r2 = await abschluss.abschliessen(p.id);
  assert.equal(r2.hochgeladen, 4);
  assert.equal(r2.fehler.length, 0);
  assert.equal(log.logbuch.length, 1);
  assert.equal(planungen.laden(p.id).status, "gesendet");
});

test("gleichzeitiger zweiter Aufruf bekommt 409", async () => {
  const { p, abschluss } = await aufbau();
  const [a, b] = await Promise.allSettled([abschluss.abschliessen(p.id), abschluss.abschliessen(p.id)]);
  assert.equal(a.status, "fulfilled");
  assert.equal(b.status, "rejected");
  assert.equal(b.reason.status, 409);
});

test("fremdes Projekt landet im Testprojekt und meldet das", async () => {
  const { p, log, abschluss } = await aufbau({ projektId: 999 });
  const r = await abschluss.abschliessen(p.id);
  assert.deepEqual(r.ziel, { id: 11541539, umgeleitet: true });
  assert.equal(log.logbuch[0].id, 11541539);
});

test("ohne Zusammenfassung kein Abschluss", async () => {
  const { p, planungen, abschluss } = await aufbau();
  const pl = planungen.laden(p.id); pl.ergebnis = null; planungen.speichern(pl);
  await assert.rejects(abschluss.abschliessen(p.id), (e) => e.status === 409);
});

test("ohne Ablage geht nur der Logbuch-Eintrag raus, Dateien bleiben offen", async () => {
  const { p, planungen, log } = await aufbau();
  const schreiber = { zielProjekt: () => ({ id: 11541539, umgeleitet: false }) };
  const ohne = erstelleAbschluss({ planungen, schreiber, dateien: { logbuchEintrag: async (id, t) => log.logbuch.push({ id, t }) }, ablage: null });
  const r = await ohne.abschliessen(p.id);
  assert.equal(r.hochgeladen, 0);
  assert.equal(r.offen, 6);
  assert.match(log.logbuch[0].t, /^Besichtigung durchgeführt/);
  assert.equal(planungen.laden(p.id).gesendet.logbuch, true);
  assert.equal(planungen.laden(p.id).status, "gesendet");
  assert.equal((await ohne.abschliessen(p.id)).offen, 6);
  assert.equal(log.logbuch.length, 1, "kein zweiter Eintrag");

  // Sobald eine Ablage da ist: Dateien nachholen, aber kein zweiter Logbuch-Eintrag.
  const mit = erstelleAbschluss({ planungen, schreiber, dateien: { logbuchEintrag: async (id, t) => log.logbuch.push({ id, t }) },
    ablage: { hochladen: async (pfad, name) => "https://link/" + encodeURIComponent(name) } });
  assert.equal((await mit.abschliessen(p.id)).hochgeladen, 6);
  assert.equal(log.logbuch.length, 1);
  assert.equal(planungen.laden(p.id).gesendet.logbuch, true);
});

test("Route abschliessen: ohne Zusammenfassung 409, danach sofort 202 und Senden im Hintergrund mit Status", async () => {
  const { testServer } = await import("./hilfe.mjs");
  const hero = [];
  let freigabe; const warten = new Promise((r) => (freigabe = r));
  const heroFetch = async (url, init) => { const b = JSON.parse(init.body); hero.push(b); if (b.query.includes("add_logbook_entry")) await warten; return new Response(JSON.stringify({ data: { add_logbook_entry: { id: 5 } } })); };
  const s = await testServer({ heroKey: "k", heroFetch });
  const J = { "Content-Type": "application/json" };
  try {
    const p = await (await fetch(s.url + "/api/planungen", { method: "POST", headers: J, body: JSON.stringify({ projektId: 4242, projektTitel: "Fremd" }) })).json();
    assert.equal((await fetch(s.url + `/api/planungen/${p.id}/abschliessen`, { method: "POST", headers: J })).status, 409);
    const datei = path.join(s.datenDir, "planungen", p.id, "planung.json");
    const pl = JSON.parse(fs.readFileSync(datei));
    pl.ergebnis = { monteure: MONTEURE, fehlt: [] };
    fs.writeFileSync(datei, JSON.stringify(pl));
    const r = await fetch(s.url + `/api/planungen/${p.id}/abschliessen`, { method: "POST", headers: J });
    assert.equal(r.status, 202, "kommt sofort zurück, HERO wartet noch");
    assert.equal((await r.json()).status, "laeuft");
    const zweit = await fetch(s.url + `/api/planungen/${p.id}/abschliessen`, { method: "POST", headers: J });
    assert.equal(zweit.status, 202, "zweimal drücken startet nichts doppelt");
    assert.equal((await (await fetch(s.url + "/api/planungen/" + p.id)).json()).senden.status, "laeuft");
    freigabe();
    let st;
    for (let i = 0; i < 50 && (st = (await (await fetch(s.url + "/api/planungen/" + p.id)).json()).senden).status === "laeuft"; i++) await new Promise((x) => setTimeout(x, 20));
    assert.equal(st.status, "fertig");
    assert.deepEqual(st.ergebnis.ziel, { id: 11541539, umgeleitet: true });
    const logbuch = hero.filter((b) => b.query.includes("add_logbook_entry"));
    assert.equal(logbuch.length, 1);
    assert.equal(logbuch[0].variables.e.target_id, 11541539);
    assert.match(logbuch[0].variables.e.custom_text, /^Besichtigung durchgeführt\nAufgenommen von /);
  } finally { await s.stop(); }
});

test("Server neu gestartet, während gesendet wurde: Status zeigt unterbrochen statt ewig laufend", async () => {
  const { testServer } = await import("./hilfe.mjs");
  const s = await testServer();
  try {
    const p = await (await fetch(s.url + "/api/planungen", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ projektId: 11541539, projektTitel: "X" }) })).json();
    const datei = path.join(s.datenDir, "planungen", p.id, "planung.json");
    fs.writeFileSync(datei, JSON.stringify({ ...JSON.parse(fs.readFileSync(datei)), senden: { status: "laeuft", start: "2026-11-17T10:00:00Z" } }));
    const st = (await (await fetch(s.url + "/api/planungen/" + p.id)).json()).senden;
    assert.equal(st.status, "fehler");
    assert.match(st.meldung, /unterbrochen/i);
  } finally { await s.stop(); }
});

test("Ablage darf eine Funktion sein (Drive-Zugang wird ohne Neustart erkannt), Ordner = Nummer und Kunde", async () => {
  const { p, planungen, log } = await aufbau();
  const ordner = [];
  let da = false;
  const ablage = () => (da ? { hochladen: async (pfad, name, mime, o) => { ordner.push(o); return "https://l/" + name; } } : null);
  const schreiber = { zielProjekt: () => ({ id: 11541539, umgeleitet: false }) };
  const a = erstelleAbschluss({ planungen, schreiber, dateien: { logbuchEintrag: async (id, t) => log.logbuch.push({ id, t }) }, ablage });
  assert.equal((await a.abschliessen(p.id)).offen, 6);
  da = true;
  assert.equal((await a.abschliessen(p.id)).hochgeladen, 6);
  assert.equal(ordner[0], "UNB-1149 Müller");
});
