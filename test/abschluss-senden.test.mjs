import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { erstellePlanungen } from "../server/planungen.mjs";
import { erstelleAbschluss } from "../server/abschluss.mjs";
import { tempDir, testServer } from "./hilfe.mjs";

const JPEG = fs.readFileSync(new URL("./daten/foto.jpg", import.meta.url));
const a = (wert, dateien = [], mehr = {}) => ({ wert, uebersprungen: false, dateien, notiz: "", ...mehr });

// AC-Bericht mit einem Foto und Unterschrift; Fakes zählen, was nach HERO und ins Logbuch geht.
function aufbau() {
  const datenDir = tempDir();
  const planungen = erstellePlanungen({ datenDir });
  const p = planungen.neu({ art: "abschluss", projektId: 11541539, projektTitel: "UNB-1149, Muster", person: "x", kunde: "Erika Muster", vorbefuellt: { bericht: { wert: "Elektrik AC" }, ab_monteure: { wert: "Max M., Lisa L." } } });
  const dir = path.join(datenDir, "planungen", p.id, "dateien");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "foto0001"), JPEG);
  fs.writeFileSync(path.join(dir, "unter001"), JPEG);
  p.antworten.ab_ac_foto_app_laeuft = a("", [{ id: "foto0001", name: "IMG.jpg", art: "bild" }]);
  p.antworten.ab_unterschrift = a("Erika Muster", [{ id: "unter001", name: "Unterschrift.png", art: "bild" }]);
  p.ergebnis = { fehlt: [], abschluss: true };
  planungen.speichern(p);
  const log = { hero: [], logbuch: [], ablage: [] };
  const dateien = {
    async inHero(id, pfad, name, mime, opt) { log.hero.push({ id, name, mime, opt }); return log.hero.length; },
    async logbuchEintrag(id, text) { log.logbuch.push({ id, text }); return { id: 1 }; },
    async aufgabe(id, opt) { (log.aufgaben ||= []).push({ id, ...opt }); return 99; },
  };
  const ablage = { async hochladen(pfad, name) { log.ablage.push(name); return "https://drive/" + name; } };
  const schreiber = { zielProjekt: (id) => ({ id: Number(id), umgeleitet: false }) };
  return { p, planungen, log, abschluss: erstelleAbschluss({ planungen, schreiber, dateien, ablage, nameVon: () => "Max Muster" }) };
}

test("Senden: PDF als Abnahmeprotokoll, Fotos mit Kategorie des Berichts, Unterschrift nicht als Foto, Logbuch", async () => {
  const { p, planungen, log, abschluss } = aufbau();
  const r = await abschluss.abschliessen(p.id);
  assert.deepEqual(r.fehler, []);
  const pdf = log.hero.find((x) => x.mime === "application/pdf");
  assert.equal(pdf.name, `Abnahmeprotokoll Elektrik AC Erika Muster ${new Date().toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Europe/Berlin" })}.pdf`);
  assert.equal(pdf.opt.dokumenttyp, 380908);
  const fotos = log.hero.filter((x) => x.mime === "image/jpeg");
  assert.equal(fotos.length, 1, "nur das Foto, nicht die Unterschrift");
  assert.equal(fotos[0].opt.bildkategorie, "AC Montage");
  assert.ok(!log.ablage.some((n) => /Unterschrift/.test(n)));
  assert.match(log.logbuch[0].text, /^Baustelle abgeschlossen: Elektrik AC\nMonteure: Max M\., Lisa L\.$/);
  assert.equal(planungen.laden(p.id).status, "gesendet");
});

test("Abschließen über die Route: ohne Unterschrift 409 mit Liste, Besichtigung braucht weiter Zusammenfassen", async () => {
  const s = await testServer();
  try {
    const J = { "Content-Type": "application/json" };
    const p = await (await fetch(s.url + "/api/planungen", { method: "POST", headers: J, body: JSON.stringify({ bericht: "ac", projektId: 11541539, projektTitel: "UNB-1149" }) })).json();
    const r = await fetch(`${s.url}/api/planungen/${p.id}/abschliessen`, { method: "POST", headers: J, body: "{}" });
    assert.equal(r.status, 409);
    assert.match((await r.json()).fehler, /Unterschrift/);
    const b = await (await fetch(s.url + "/api/planungen", { method: "POST", headers: J, body: JSON.stringify({ projektId: 11541539, projektTitel: "UNB-1149" }) })).json();
    assert.equal((await fetch(`${s.url}/api/planungen/${b.id}/abschliessen`, { method: "POST", headers: J, body: "{}" })).status, 409);
  } finally { await s.stop(); }
});

test("Angehängtes PDF bleibt Dokumenttyp Allgemein, nur das Protokoll ist Abnahmeprotokoll", async () => {
  const { p, planungen, log, abschluss } = aufbau();
  const pl = planungen.laden(p.id);
  fs.writeFileSync(path.join(path.dirname(planungen.dateiPfad(p.id, "x")), "mess0001"), "%PDF-1.4");
  pl.antworten.ab_ac_wr = a("X", [{ id: "mess0001", name: "Messung.pdf", art: "pdf" }]);
  planungen.speichern(pl);
  await abschluss.abschliessen(p.id);
  const pdfs = log.hero.filter((x) => x.mime === "application/pdf");
  assert.equal(pdfs.find((x) => x.name === "Messung.pdf").opt.dokumenttyp, undefined);
  assert.equal(pdfs.find((x) => /^Abnahmeprotokoll/.test(x.name)).opt.dokumenttyp, 380908);
});

test("Wallbox im Lieferschein, aber nicht montiert: HERO-Aufgabe für Sebastian Regehr, nur einmal", async () => {
  const { p, planungen, log, abschluss } = aufbau();
  const aufgaben = [];
  const pl = planungen.laden(p.id);
  pl.antworten.ab_ls_wallbox = a("ja");
  pl.antworten.ab_ac_wallbox_da = a("nein");
  pl.antworten.ab_ac_wallbox = a("Wallbox Sungrow AC22E");
  pl.antworten.ab_kunde = a("Erika Muster");
  pl.antworten.ab_projektnr = a("PV-1");
  planungen.speichern(pl);
  log.aufgaben = aufgaben;
  await abschluss.abschliessen(p.id);
  await abschluss.abschliessen(p.id);
  assert.equal(log.aufgaben.length, 1);
  assert.equal(log.aufgaben[0].userId, 212973);
  assert.match(log.aufgaben[0].titel, /^Wallbox-Montage terminieren: Erika Muster \(PV-1\)$/);
  assert.match(log.aufgaben[0].text, /Wallbox Sungrow AC22E/);
});

test("Wallbox montiert oder nicht im Lieferschein: keine Aufgabe", async () => {
  const { p, planungen, log, abschluss } = aufbau();
  log.aufgaben = [];
  const pl = planungen.laden(p.id);
  pl.antworten.ab_ls_wallbox = a("ja"); pl.antworten.ab_ac_wallbox_da = a("ja");
  planungen.speichern(pl);
  await abschluss.abschliessen(p.id);
  assert.equal(log.aufgaben.length, 0);
});
