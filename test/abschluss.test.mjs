import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { erstellePlanungen } from "../server/planungen.mjs";
import { erstelleAbschluss, monteurText, dateiNamen } from "../server/abschluss.mjs";
import { ladeFelder } from "../server/protokoll.mjs";
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
  p.verlauf.push({ rolle: "planer", text: "", zeit: "t", dateien });
  const felder = await ladeFelder();
  p.ergebnis = { monteure: MONTEURE, felder: Object.fromEntries(felder.map((f) => [f.name, ""])), fotos: dateien.map((d, i) => ({ dateiId: d.id, pflichtfoto: i === 0 ? "Zählerschrank" : "Weitere" })), fehlt: [] };
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

test("Logbuch nennt, wer die Besichtigung aufgenommen hat", async () => {
  const { p, log, abschluss } = await aufbau();
  await abschluss.abschliessen(p.id);
  assert.match(log.logbuch[0].text, /^Für die Monteure \(Besichtigung\)\nAufgenommen von Max Muster am \d\d\.\d\d\.\d{4}\n/);
});

test("Dateinamen: Pflichtfoto mit Nummer, Umlaute bleiben", () => {
  const n = dateiNamen([{ dateiId: "a", pflichtfoto: "Zählerschrank" }, { dateiId: "b", pflichtfoto: "Zählerschrank" }, { dateiId: "c", pflichtfoto: "Weitere" }, { dateiId: "d", pflichtfoto: "Sparren/Lattung" }]);
  assert.deepEqual(n, { a: "Zählerschrank 1.jpg", b: "Zählerschrank 2.jpg", c: "Weitere 1.jpg", d: "Sparren-Lattung 1.jpg" });
});

test("Monteur-Text hat feste Abschnitte und Links, leere Abschnitte fehlen", () => {
  const t = monteurText(MONTEURE, [["Protokoll", "https://l/p"]]);
  assert.match(t, /^Für die Monteure/);
  assert.match(t, /Was wird gemacht\n• PV 9,9 kWp Süddach/);
  assert.match(t, /Achtung auf der Baustelle\n• Freileitung am Giebel/);
  assert.doesNotMatch(t, /Material/);
  assert.match(t, /Protokoll: https:\/\/l\/p/);
  assert.doesNotMatch(t, /–|—/);
});

test("Monteur-Text hängt die Protokoll-Kurzfassung an", () => {
  const t = monteurText(MONTEURE, [], "", "DC und Dachmontage\n• Dachbelag: Pfanne");
  assert.match(t, /Aus dem Besichtigungsprotokoll\n\nDC und Dachmontage\n• Dachbelag: Pfanne/);
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
  assert.match(log.logbuch[0].t, /Fotos und Protokoll-PDF folgen/);
  assert.equal(planungen.laden(p.id).gesendet.logbuch, "vorlaeufig");
  assert.equal(planungen.laden(p.id).status, "gesendet");
  assert.equal((await ohne.abschliessen(p.id)).offen, 6);
  assert.equal(log.logbuch.length, 1, "kein zweiter vorläufiger Eintrag");

  // Sobald eine Ablage da ist: Dateien nachholen und einen Nachtrag mit Links schreiben.
  const mit = erstelleAbschluss({ planungen, schreiber, dateien: { logbuchEintrag: async (id, t) => log.logbuch.push({ id, t }) },
    ablage: { hochladen: async (pfad, name) => "https://link/" + encodeURIComponent(name) } });
  assert.equal((await mit.abschliessen(p.id)).hochgeladen, 6);
  assert.equal(log.logbuch.length, 2);
  assert.match(log.logbuch[1].t, /^Nachtrag zur Besichtigung: Fotos und Protokoll\n\nDateien\n/);
  assert.match(log.logbuch[1].t, /Z%C3%A4hlerschrank%201\.jpg/);
  assert.equal(planungen.laden(p.id).gesendet.logbuch, true);
});

test("Route abschliessen: ohne Zusammenfassung 409, danach Logbuch-Eintrag in HERO", async () => {
  const { testServer } = await import("./hilfe.mjs");
  const hero = [];
  const heroFetch = async (url, init) => { const b = JSON.parse(init.body); hero.push(b); return new Response(JSON.stringify({ data: { add_logbook_entry: { id: 5 } } })); };
  const s = await testServer({ heroKey: "k", heroFetch });
  try {
    const p = await (await fetch(s.url + "/api/planungen", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ projektId: 4242, projektTitel: "Fremd" }) })).json();
    assert.equal((await fetch(s.url + `/api/planungen/${p.id}/abschliessen`, { method: "POST", headers: { "Content-Type": "application/json" } })).status, 409);
    const datei = path.join(s.datenDir, "planungen", p.id, "planung.json");
    const pl = JSON.parse(fs.readFileSync(datei));
    pl.ergebnis = { monteure: MONTEURE, felder: {}, fotos: [], fehlt: [] };
    fs.writeFileSync(datei, JSON.stringify(pl));
    const r = await fetch(s.url + `/api/planungen/${p.id}/abschliessen`, { method: "POST", headers: { "Content-Type": "application/json" } });
    assert.equal(r.status, 200);
    const e = await r.json();
    assert.deepEqual(e.ziel, { id: 11541539, umgeleitet: true });
    assert.equal(hero.length, 1);
    assert.equal(hero[0].variables.e.target_id, 11541539);
    assert.match(hero[0].variables.e.custom_text, /Freileitung am Giebel/);
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
