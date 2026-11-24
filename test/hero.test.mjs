import { test } from "node:test";
import assert from "node:assert/strict";
import { erstelleHero, HeroFehler } from "../server/hero.mjs";
import { testServer } from "./hilfe.mjs";

// fetch-Attrappe: merkt sich die Anfrage und liefert eine feste Antwort
function attrappe(antwort, status = 200) {
  const aufrufe = [];
  const f = async (url, init) => { aufrufe.push({ url, body: JSON.parse(init.body), headers: init.headers }); return new Response(JSON.stringify(antwort), { status }); };
  f.aufrufe = aufrufe;
  return f;
}

const PM = { id: 7, project_nr: "UNB-7", project_title: "PV Dach", name: "", customer: { full_name: " Müller & Söhne ", company_name: "" },
  address: { street: "Hauptstraße 1", zipcode: "56307", city: "Dernbach" }, current_project_match_status: { name: "Neu" } };

test("Suche geht als Variable mit, nicht im Query-Text", async () => {
  const f = attrappe({ data: { project_matches: [] } });
  await erstelleHero({ key: "k", fetch: f }).projekteSuchen("Müller & Söhne");
  assert.equal(f.aufrufe[0].body.variables.s, "Müller & Söhne");
  assert.ok(!f.aufrufe[0].body.query.includes("Müller"));
  assert.equal(f.aufrufe[0].headers.Authorization, "Bearer k");
});

test("HERO-Objekt wird auf Projekt abgebildet", async () => {
  const f = attrappe({ data: { project_matches: [PM] } });
  const [p] = await erstelleHero({ key: "k", fetch: f }).projekteSuchen("");
  assert.deepEqual(p, { id: 7, nummer: "UNB-7", titel: "PV Dach", kunde: "Müller & Söhne", kundeId: null, adresse: "Hauptstraße 1, 56307 Dernbach", status: "Neu", gewerk: "", richtungen: [] });
});

test("errors in der Antwort werden zu HeroFehler", async () => {
  const f = attrappe({ errors: [{ message: "kaputt" }] });
  await assert.rejects(erstelleHero({ key: "k", fetch: f }).projekteSuchen("x"), HeroFehler);
});

test("Route antwortet 502 ohne Schlüssel im Text, wenn HERO streikt", async () => {
  const f = attrappe({ errors: [{ message: "Bearer geheimKEY ungültig" }] });
  const s = await testServer({ heroFetch: f, heroKey: "geheimKEY" });
  try {
    const r = await fetch(s.url + "/api/projekte?suche=a");
    const text = await r.text();
    assert.equal(r.status, 502);
    assert.deepEqual(JSON.parse(text), { fehler: "HERO antwortet nicht wie erwartet" });
    assert.ok(!text.includes("geheimKEY"));
  } finally { await s.stop(); }
});

test("ohne HERO-Schlüssel antwortet die Route 503", async () => {
  const s = await testServer({ heroFetch: attrappe({}) });
  try {
    assert.equal((await fetch(s.url + "/api/projekte")).status, 503);
  } finally { await s.stop(); }
});

test("Termine bekommen Zeitraum als Variablen und werden abgebildet", async () => {
  const f = attrappe({ data: { calendar_events: [{ id: 1, title: "Besichtigung Müller", start: "2026-11-18T09:00:00+01:00", end: "2026-11-18T10:00:00+01:00", project_match_id: 7, all_day: false, category: { name: "Besichtigung" } }] } });
  const t = await erstelleHero({ key: "k", fetch: f }).termineLaden("2026-11-18T00:00:00Z", "2026-11-19T00:00:00Z");
  assert.equal(f.aufrufe[0].body.variables.von, "2026-11-18T00:00:00Z");
  assert.deepEqual(t[0], { id: 1, titel: "Besichtigung Müller", start: "2026-11-18T09:00:00+01:00", ende: "2026-11-18T10:00:00+01:00", projektId: 7, kundeId: null, kunde: "", kategorie: "Besichtigung", ganztags: false, personen: [] });
});

test("projektLaden nimmt das Logbuch aus histories, neueste zuerst, höchstens 30", async () => {
  const histories = Array.from({ length: 40 }, (_, i) => ({ created: `2026-11-${String(40 - i).padStart(2, "0")}`, custom_title: "", custom_text: "Eintrag " + i }));
  const f = attrappe({ data: { project_match: { ...PM, contact: { full_name: "Jörg Müller", phone_mobile: "0170", email: "j@x.de" }, file_uploads: [{ id: 3, filename: "Dach.jpg", url: "u" }], histories } } });
  const p = await erstelleHero({ key: "k", fetch: f }).projektLaden(7);
  assert.equal(f.aufrufe.length, 1);
  assert.equal(p.logbuch.length, 30);
  assert.deepEqual(p.logbuch[0], { datum: "2026-11-40", text: "Eintrag 0" });
  assert.deepEqual(p.kontakt, { name: "Jörg Müller", telefon: "0170", email: "j@x.de" });
  assert.deepEqual(p.dateien, [{ id: 3, name: "Dach.jpg", url: "u" }]);
});

test("Logbuch-Text aus HERO: <br /> wird zu Zeilenumbruch, andere Tags verschwinden", async () => {
  const f = attrappe({ data: { project_match: { ...PM, contact: {}, file_uploads: [], histories: [{ created: "2026-11-17", custom_title: "", custom_text: "Für die Monteure<br />\n<br />\n• <b>Hund</b> &amp; Katze" }] } } });
  const p = await erstelleHero({ key: "k", fetch: f }).projektLaden(7);
  assert.equal(p.logbuch[0].text, "Für die Monteure\n\n• Hund & Katze");
});

test("Projekte eines Kunden: Kunden-ID als Variable, neueste zuerst", async () => {
  const f = attrappe({ data: { project_matches: [{ ...PM, id: 8, customer: { id: 55, full_name: "Müller" } }, { ...PM, id: 9, customer: { id: 55, full_name: "Müller" } }] } });
  const liste = await erstelleHero({ key: "k", fetch: f }).kundenProjekte(55);
  assert.equal(f.aufrufe[0].body.variables.k, 55);
  assert.ok(f.aufrufe[0].body.query.includes("customer_id"));
  assert.deepEqual(liste.map((x) => [x.id, x.kundeId]), [[8, 55], [9, 55]]);
});

test("Heizlastbericht: neueste PDF mit Heizlast im Namen, gelöschte und andere Dateien zählen nicht", async () => {
  const f = attrappe({ data: { project_match: { file_uploads: [
    { filename: "Muster-Raumweise-Heizlastbericht.pdf", temporary_url: "https://x/alt", created: "2026-09-01T10:00:00Z", is_deleted: false },
    { filename: "Muster-Raumweise-Heizlastbericht (2).pdf", temporary_url: "https://x/neu", created: "2026-10-01T10:00:00Z", is_deleted: false },
    { filename: "Heizlast neu.pdf", temporary_url: "https://x/weg", created: "2026-11-01T10:00:00Z", is_deleted: true },
    { filename: "Muster-Heizungsplanungsbericht.pdf", temporary_url: "https://x/plan", created: "2026-12-01T10:00:00Z", is_deleted: false },
  ] } } });
  const b = await erstelleHero({ key: "k", fetch: f }).heizlastBericht(42);
  assert.deepEqual(b, { name: "Muster-Raumweise-Heizlastbericht (2).pdf", url: "https://x/neu" });
  assert.equal(f.aufrufe[0].body.variables.id, 42);
  const leer = await erstelleHero({ key: "k", fetch: attrappe({ data: { project_match: { file_uploads: [] } } }) }).heizlastBericht(1);
  assert.equal(leer, null);
});

test("hochladen: Datei als multipart an den REST-Endpunkt mit x-auth-token, Antwort ist die UUID", async () => {
  const aufrufe = [];
  const f = async (url, init) => { aufrufe.push({ url, init }); return new Response(JSON.stringify({ status: "success", data: { uuid: "abc123", id: 9 } })); };
  const pfad = (await import("node:path")).join((await import("./hilfe.mjs")).tempDir(), "Zählerschrank 1.jpg");
  (await import("node:fs")).writeFileSync(pfad, "JPEG");
  const uuid = await erstelleHero({ key: "k", fetch: f }).hochladen(pfad, "Zählerschrank 1.jpg", "image/jpeg");
  assert.equal(uuid, "abc123");
  assert.equal(aufrufe[0].url, "https://login.hero-software.de/app/v8/FileUploads/upload");
  assert.equal(aufrufe[0].init.headers["x-auth-token"], "k");
  const datei = aufrufe[0].init.body.get("file");
  assert.equal(datei.name, "Zählerschrank 1.jpg");
  assert.equal(await datei.text(), "JPEG");

  const kaputt = async () => new Response(JSON.stringify({ status: "error" }), { status: 400 });
  await assert.rejects(erstelleHero({ key: "k", fetch: kaputt }).hochladen(pfad, "x.jpg", "image/jpeg"), (e) => e instanceof HeroFehler);
});

test("Gewerk aus HERO gibt die Richtungen PV, Wärmepumpe, Klimaanlage", async () => {
  const mit = (name) => ({ ...PM, measure: { name } });
  const f = attrappe({ data: { project_matches: ["Wärmepumpe und Photovoltaik", "Photovoltaik mit Speicher, Wallbox und Notstromsystem", "Klimaanlagen", "Klima- und Lüftungsanlagen", "Speichererweiterung", "Unbekannt"].map(mit) } });
  const liste = await erstelleHero({ key: "k", fetch: f }).kundenProjekte(55);
  assert.deepEqual(liste.map((p) => p.richtungen), [["PV", "Wärmepumpe"], ["PV"], ["Klimaanlage"], ["Klimaanlage"], ["PV"], []]);
  assert.equal(liste[0].gewerk, "Wärmepumpe und Photovoltaik");
  assert.match(f.aufrufe[0].body.query, /measure { name }/);
});

test("hochladen: ein Aussetzer bei HERO wird einmal wiederholt", async () => {
  let n = 0;
  const f = async () => (++n === 1 ? Promise.reject(new Error("socket hang up")) : Response.json({ status: "success", data: { uuid: "zwei" } }));
  const pfad = (await import("node:path")).join((await import("./hilfe.mjs")).tempDir(), "a.jpg");
  (await import("node:fs")).writeFileSync(pfad, "JPEG");
  assert.equal(await erstelleHero({ key: "k", fetch: f }).hochladen(pfad, "a.jpg", "image/jpeg"), "zwei");
  assert.equal(n, 2);
});
