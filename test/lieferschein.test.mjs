import { test } from "node:test";
import assert from "node:assert/strict";
import { antwortenAusLieferscheinen } from "../server/lieferschein.mjs";
import { erstelleHero } from "../server/hero.mjs";
import { testServer } from "./hilfe.mjs";

const p = (name, beschreibung = "", menge = 1) => ({ name, beschreibung, menge });
const PV = { nr: "LS-883", datum: "2026-11-16", produkte: [
  p("Longi EcoLife 475 Watt", "PV Anlage DC Seitig 11,4 kWp 24 x Solarmodule von dem Hersteller LONGI Farbe: Schwarz"),
  p("GoodWe ESA GW12K-ETA-G20 (AFCI)", "Intelligenter und effizienter Betrieb"),
  p("GoodWe ESA Batteriemodul 8.3 kWh - GW8.3-BAT-D-G20", "Lithium-Eisenphosphat-Zellen"),
  p("Notstrom"), p("EcoFlow PowerPulse Wallbox 11KW"), p("Zählerschrank VDE konform für 2 Zähler"), p("Montage & Inbetriebnahme"),
] };
const WP = { nr: "LS-861", datum: "2026-10-23", produkte: [
  p("Bosch Luft-Wasser-Wärmepumpe AW 10-12 KW", "Bosch CS6800i AW inkl. Inneneinheit - Umweltfreundliches Kältemittel R290"),
  p("Bosch Warmwasserspeicher WH 370", "Bosch Warmwasserspeicher 370 Liter"), p("Bosch Pufferspeicher BH 200", "Bosch Pufferspeicher 200 Liter"),
  p("Demontage & Entsorgung der alten Ölheizung"), p("Kaskadenschaltung"),
] };
const werte = (a) => Object.fromEntries(Object.entries(a).map(([k, v]) => [k, v.wert]));

test("PV-Lieferschein füllt Typ, Leistung, Module, Wechselrichter, Speicher, Wallbox, Zählerschrank", () => {
  const a = antwortenAusLieferscheinen([PV]);
  assert.deepEqual(werte(a), { typ: "PV", anlagenleistung: "11,4", anzahl_module: "24", modul: "Longi EcoLife 475 W", wechselrichter: "GoodWe 12,0 kW",
    speicher: "GoodWe ESA Batteriemodul 8.3 kWh - GW8.3-BAT-D-G20", wallbox: "EcoFlow PowerPulse Wallbox 11KW", wallbox_wunsch: "ja", neuer_zs: "ja", neuer_zs_ac: "ja" });
  assert.equal(a.modul.notiz, undefined);
  assert.equal(a.anlagenleistung.quelle, "LS-883");
});

test("Modul nicht in der Liste: Sonstige mit genauer Bezeichnung in der Notiz", () => {
  const a = antwortenAusLieferscheinen([{ nr: "LS-4", produkte: [p("Meyer Burger White 400 Watt", "PV Anlage DC Seitig 8 kWp 20 x Solarmodule")] }]);
  assert.equal(a.modul.wert, "Sonstige (Notiz)");
  assert.equal(a.modul.notiz, "Laut Lieferschein: Meyer Burger White 400 Watt");
});

test("Modul aus der Liste wird erkannt (Hersteller, Serie, Watt)", () => {
  const a = antwortenAusLieferscheinen([{ nr: "LS-1", produkte: [p("AIKO Neostar 2S+ 460 Watt", "PV Anlage DC Seitig 14,72 kWp 32 x Solarmodule")] }]);
  assert.equal(a.modul.wert, "Aiko Neostar 460 W");
  assert.equal(a.anzahl_module.wert, "32");
});

test("Wärmepumpen-Lieferschein: Modell mit Leistungsbereich, Warmwasser, alte Heizung, Kaskade; Puffer ist kein PV-Speicher", () => {
  const a = antwortenAusLieferscheinen([WP]);
  assert.deepEqual(werte(a), { typ: "Wärmepumpe", bosch_modell: "Bosch CS6800i AW, 10-12 kW", warmwasser_wp: "ja", bestandsheizung: "Ölheizung", kaskade: "ja" });
  const b = antwortenAusLieferscheinen([{ nr: "LS-2", produkte: [p("Bosch Luft-Wasser-Wärmepumpe AW 7 KW", "Bosch CS6800i AW inkl. Inneneinheit")] }]);
  assert.equal(b.wp_leistung.wert, "7");
});

test("PV und Wärmepumpe zusammen ergibt Beides; der neueste Lieferschein gewinnt", () => {
  const alt = { nr: "LS-100", datum: "2026-01-01", produkte: [p("Longi EcoLife 475 Watt", "PV Anlage DC Seitig 9,5 kWp 20 x Solarmodule")] };
  const a = antwortenAusLieferscheinen([PV, WP, alt]);
  assert.equal(a.typ.wert, "Beides");
  assert.equal(a.anlagenleistung.wert, "11,4");
});

test("ohne passende Positionen: keine Antworten", () => {
  assert.deepEqual(antwortenAusLieferscheinen([{ nr: "LS-3", produkte: [p("Montage Klimaanlage")] }]), {});
  assert.deepEqual(antwortenAusLieferscheinen([]), {});
});

const HERO_DOKS = { data: { project_match: { customer_documents: [
  { nr: "AB-1", type: "confirmation", date: "2026-11-01", published_customer_document_draft: { data: { items: [] } } },
  { nr: "LS-883", type: "delivery_note", date: "2026-11-16", published_customer_document_draft: { data: { items: [{ type: "text", title: "Einleitung" }, { children: [
    { type: "product", name: "Longi EcoLife 475 Watt", quantity: 1, description: "<div>PV Anlage DC Seitig 11,4 kWp</div><div>24 x Solarmodule</div>" },
    { type: "product", name: "GoodWe ESA GW12K-ETA-G20 (AFCI)", quantity: 1, description: "" }] }] } } },
] } } };

test("HERO: Lieferscheine eines Projekts mit Produkten, Beschreibung als Text", async () => {
  const f = async () => new Response(JSON.stringify(HERO_DOKS));
  const [ls, ...rest] = await erstelleHero({ key: "k", fetch: f }).lieferscheine(11541539);
  assert.equal(rest.length, 0);
  assert.equal(ls.nr, "LS-883");
  assert.deepEqual(ls.produkte.map((x) => x.name), ["Longi EcoLife 475 Watt", "GoodWe ESA GW12K-ETA-G20 (AFCI)"]);
  assert.match(ls.produkte[0].beschreibung, /11,4 kWp\s+24 x Solarmodule/);
});

test("neue Planung: Antworten aus dem Lieferschein sind vorausgefüllt, Kundendaten bleiben; ohne HERO trotzdem angelegt", async () => {
  const s = await testServer({ heroKey: "k", heroFetch: async () => new Response(JSON.stringify(HERO_DOKS)) });
  try {
    const pl = await (await fetch(s.url + "/api/planungen", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ projektId: 11541539, projektTitel: "X", kunde: "Jörg" }) })).json();
    assert.equal(pl.antworten.anzahl_module.wert, "24");
    assert.equal(pl.antworten.anzahl_module.quelle, "LS-883");
    assert.equal(pl.antworten.kunde.wert, "Jörg");
  } finally { await s.stop(); }
  const t = await testServer({ heroKey: "k", heroFetch: async () => { throw new Error("weg"); } });
  try {
    const r = await fetch(t.url + "/api/planungen", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ projektId: 11541539, projektTitel: "X" }) });
    assert.equal(r.status, 201);
  } finally { await t.stop(); }
});

test("Server: geänderte Antwort verliert den Lieferschein-Hinweis", async () => {
  const s = await testServer({ heroKey: "k", heroFetch: async () => new Response(JSON.stringify(HERO_DOKS)) });
  try {
    const pl = await (await fetch(s.url + "/api/planungen", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ projektId: 11541539, projektTitel: "X" }) })).json();
    const put = (body) => fetch(s.url + `/api/planungen/${pl.id}/antworten/anzahl_module`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then((r) => r.json());
    assert.equal((await put({ notiz: "zwei Dachflächen" })).antworten.anzahl_module.quelle, "LS-883");
    assert.equal((await put({ wert: "26" })).antworten.anzahl_module.quelle, undefined);
  } finally { await s.stop(); }
});
