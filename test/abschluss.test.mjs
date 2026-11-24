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
  assert.deepEqual(r.ziel, { id: 11541539, umgeleitet: true, nummer: "" });
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
  const uploads = [];
  const heroFetch = async (url, init) => {
    if (url.endsWith("/FileUploads/upload")) { uploads.push({ name: init.body.get("file").name, token: init.headers["x-auth-token"] }); return new Response(JSON.stringify({ status: "success", data: { uuid: "u" + uploads.length } })); }
    const b = JSON.parse(init.body); hero.push(b); if (b.query.includes("add_logbook_entry")) await warten;
    return new Response(JSON.stringify({ data: { add_logbook_entry: { id: 5 }, upload_document: { id: 6 } } }));
  };
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
    assert.deepEqual(st.ergebnis.ziel, { id: 11541539, umgeleitet: true, nummer: "" });
    assert.deepEqual(uploads.map((u) => [u.name.startsWith("Besichtigungsprotokoll"), u.token]), [[true, "k"]], "Protokoll geht ins HERO-Projekt");
    const dok = hero.find((b) => b.query.includes("upload_document"));
    assert.deepEqual([dok.variables.u, dok.variables.id], ["u1", 11541539]);
    assert.equal(st.ergebnis.inHero, 1);
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

test("HERO: Fotos und Protokoll gehen zusätzlich ins Projekt, nur einmal, Logbuch erst danach", async () => {
  const { p, planungen, log } = await aufbau({ fotos: 2 });
  const pl = planungen.laden(p.id);
  pl.antworten.dachbelag.dateien = [{ id: "vid1", name: "Rundgang.mp4", art: "video" }];
  planungen.speichern(pl);
  fs.writeFileSync(planungen.dateiPfad(p.id, "vid1"), "MP4");
  const inHero = [];
  let fehlerBei = 2;
  const dateien = {
    logbuchEintrag: async (id, t) => log.logbuch.push({ id, t }),
    async inHero(id, pfad, name, mime) { if (inHero.length + 1 === fehlerBei) { fehlerBei = 0; throw new Error("HERO weg"); } inHero.push({ id, name, mime, da: fs.existsSync(pfad) }); return 100 + inHero.length; },
  };
  const schreiber = { zielProjekt: () => ({ id: 11541539, umgeleitet: false }) };
  const ablage = { hochladen: async (pfad, name) => "https://link/" + encodeURIComponent(name) };
  const a = erstelleAbschluss({ planungen, schreiber, dateien, ablage });

  const r1 = await a.abschliessen(p.id);
  assert.equal(r1.inHero, 1);
  assert.match(r1.fehler[0], /HERO weg/);
  assert.equal(log.logbuch.length, 0, "Logbuch wartet, bis alles in HERO ist");

  const r2 = await a.abschliessen(p.id);
  assert.equal(r2.inHero, 2);
  assert.deepEqual(r2.fehler, []);
  assert.deepEqual(inHero.map((x) => x.name), ["Zählerschrank 1.jpg", "Dach gesamt 1.jpg", `Besichtigungsprotokoll ${new Date().toLocaleDateString("de-DE", { timeZone: "Europe/Berlin" })}.pdf`]);
  assert.ok(inHero.every((x) => x.id === 11541539 && x.da));
  assert.ok(!inHero.some((x) => /mp4/.test(x.name)), "Videos bleiben auf Drive");
  assert.equal(log.logbuch.length, 1);

  assert.equal((await a.abschliessen(p.id)).inHero, 0, "nichts doppelt");
  assert.equal(inHero.length, 3);
});

test("HERO ohne Drive: Protokoll wird trotzdem erzeugt und hochgeladen", async () => {
  const { p, planungen, log } = await aufbau({ fotos: 1 });
  const inHero = [];
  const dateien = { logbuchEintrag: async (id, t) => log.logbuch.push({ id, t }), inHero: async (id, pfad, name) => { inHero.push({ name, da: fs.existsSync(pfad) }); return 1; } };
  const a = erstelleAbschluss({ planungen, schreiber: { zielProjekt: () => ({ id: 11541539, umgeleitet: false }) }, dateien, ablage: null });
  const r = await a.abschliessen(p.id);
  assert.equal(r.inHero, 2);
  assert.ok(inHero.every((x) => x.da));
  assert.match(inHero[1].name, /^Besichtigungsprotokoll/);
  assert.equal(log.logbuch.length, 1);
});

test("Mehrere Projekte: jedes bekommt Fotos, Protokoll und Logbuch, im Testmodus nur einmal UNB-1149", async () => {
  const { p, planungen, log } = await aufbau({ fotos: 1 });
  const pl = planungen.laden(p.id);
  pl.projekte = [{ id: 11541539, nummer: "PV-1", richtungen: ["PV"] }, { id: 777, nummer: "WÄP-2", richtungen: ["Wärmepumpe"] }];
  planungen.speichern(pl);
  const inHero = [];
  const dateien = { logbuchEintrag: async (id, t) => log.logbuch.push({ id, t }), inHero: async (id, pfad, name) => { inHero.push([id, name.slice(0, 12)]); return 1; } };
  const frei = { zielProjekt: (id) => ({ id: Number(id), umgeleitet: false }) };
  const a = erstelleAbschluss({ planungen, schreiber: frei, dateien, ablage: null });
  const r = await a.abschliessen(p.id);
  assert.deepEqual(inHero, [[11541539, "Zählerschran"], [11541539, "Besichtigung"], [777, "Zählerschran"], [777, "Besichtigung"]]);
  assert.deepEqual(log.logbuch.map((x) => x.id), [11541539, 777]);
  assert.deepEqual(r.ziele, [{ id: 11541539, umgeleitet: false, nummer: "PV-1" }, { id: 777, umgeleitet: false, nummer: "WÄP-2" }]);
  assert.equal(planungen.laden(p.id).status, "gesendet");
  await a.abschliessen(p.id);
  assert.equal(inHero.length, 4, "nichts doppelt");
  assert.equal(log.logbuch.length, 2);

  // Testmodus: beide Projekte werden auf UNB-1149 umgeleitet, dort landet alles nur einmal.
  const { p: p2, planungen: pl2, log: log2 } = await aufbau({ fotos: 1 });
  const x = pl2.laden(p2.id); x.projekte = [{ id: 5, nummer: "PV-5" }, { id: 6, nummer: "KLA-6" }]; pl2.speichern(x);
  const hero2 = [];
  const test = { zielProjekt: () => ({ id: 11541539, umgeleitet: true }) };
  const r2 = await erstelleAbschluss({ planungen: pl2, schreiber: test, dateien: { logbuchEintrag: async (id) => log2.logbuch.push(id), inHero: async (id) => hero2.push(id) }, ablage: null }).abschliessen(p2.id);
  assert.deepEqual(hero2, [11541539, 11541539]);
  assert.equal(log2.logbuch.length, 1);
  assert.equal(r2.ziele.length, 1);
});

test("Neustart mitten im Senden: der Server setzt abgebrochene Sendungen selbst fort", async () => {
  const { testServer, tempDir } = await import("./hilfe.mjs");
  const { erstellePlanungen } = await import("../server/planungen.mjs");
  const datenDir = tempDir();
  const planungen = erstellePlanungen({ datenDir });
  const p = planungen.neu({ projektId: 11541539, projektTitel: "UNB-1149 X", person: "x" });
  p.ergebnis = { monteure: MONTEURE, fehlt: [] };
  p.senden = { status: "laeuft", start: "2026-11-24T07:33:12Z" };
  planungen.speichern(p);
  const ohne = planungen.neu({ projektId: 11541539, projektTitel: "ohne Zusammenfassung", person: "x" });
  ohne.senden = { status: "laeuft", start: "2026-11-24T07:00:00Z" };
  planungen.speichern(ohne);
  const logbuch = [];
  const heroFetch = async (url, init) => {
    if (url.endsWith("/FileUploads/upload")) return Response.json({ status: "success", data: { uuid: "u1" } });
    const b = JSON.parse(init.body);
    if (b.query.includes("add_logbook_entry")) logbuch.push(b.variables.e.target_id);
    return Response.json({ data: { add_logbook_entry: { id: 5 }, upload_document: { id: 6 } } });
  };
  const s = await testServer({ heroKey: "k", heroFetch, datenDir });
  try {
    let st;
    for (let i = 0; i < 50 && (st = (await (await fetch(s.url + "/api/planungen/" + p.id)).json()).senden).status === "laeuft"; i++) await new Promise((x) => setTimeout(x, 20));
    assert.equal(st.status, "fertig");
    assert.deepEqual(logbuch, [11541539]);
    const st2 = (await (await fetch(s.url + "/api/planungen/" + ohne.id)).json()).senden;
    assert.equal(st2.status, "fehler", "ohne Zusammenfassung bleibt es beim Hinweis");
  } finally { await s.stop(); }
});
