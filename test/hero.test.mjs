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
  assert.deepEqual(p, { id: 7, nummer: "UNB-7", titel: "PV Dach", kunde: "Müller & Söhne", adresse: "Hauptstraße 1, 56307 Dernbach", status: "Neu" });
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
  assert.deepEqual(t[0], { id: 1, titel: "Besichtigung Müller", start: "2026-11-18T09:00:00+01:00", ende: "2026-11-18T10:00:00+01:00", projektId: 7, kategorie: "Besichtigung", ganztags: false });
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
