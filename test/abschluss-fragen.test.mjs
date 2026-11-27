import { test } from "node:test";
import assert from "node:assert/strict";
import { sichtbar, KATALOG, frageNach, istAbschluss, berichtVon } from "../server/fragen.mjs";
import { BERICHTE, ABSCHLUSS_KATALOG } from "../server/abschluss-fragen.mjs";

const ids = (liste) => liste.map((f) => f.id);

test("Abschluss DC: nur Abschlussfragen, Strings nach Anzahl, Unterschrift am Ende", () => {
  const s = ids(sichtbar({ bericht: { wert: "Dachmontage DC" }, ab_dc_strings: { wert: "2" } }));
  assert.ok(s.includes("ab_dc_s2_spannung"));
  assert.ok(!s.includes("ab_dc_s3_spannung"));
  assert.ok(s.every((id) => id === "bericht" || id.startsWith("ab_")), "keine Besichtigungsfrage");
  assert.equal(s.at(-1), "ab_unterschrift");
  assert.ok(!s.includes("ab_ac_wr"), "nichts aus anderen Berichten");
});

test("Besichtigung sieht keine Abschlussfragen, Startfrage bleibt typ", () => {
  assert.equal(KATALOG[0].id, "typ");
  const s = ids(sichtbar({ typ: { wert: "PV, Wärmepumpe, Klimaanlage" } }));
  assert.ok(!s.some((id) => id.startsWith("ab_") || id === "bericht"));
});

test("IDs eindeutig und sauber, jeder Bericht hat Pflichtfotos", () => {
  const alle = ids(KATALOG);
  assert.equal(new Set(alle).size, alle.length);
  for (const f of ABSCHLUSS_KATALOG) assert.match(f.id, /^(ab_[a-z0-9_]+|bericht)$/);
  for (const [key, name] of Object.entries(BERICHTE)) {
    const s = sichtbar({ bericht: { wert: name } });
    assert.ok(s.some((f) => f.pflicht), key + " ohne Pflichtfoto");
    assert.ok(s.some((f) => f.id === "ab_unterschrift"), key + " ohne Unterschrift");
  }
  assert.equal(frageNach("ab_unterschrift").art, "unterschrift");
});

test("istAbschluss und berichtVon", () => {
  assert.equal(istAbschluss({ typ: { wert: "PV" } }), false);
  assert.equal(istAbschluss({ bericht: { wert: "Klima" } }), true);
  assert.equal(berichtVon({ bericht: { wert: "Wärmepumpe" } }), "wp");
});

test("WP-Bericht: Typenschild Warmwasser- und Pufferspeicher nur, wenn verbaut", () => {
  const ids = (a) => sichtbar({ bericht: { wert: "Wärmepumpe" }, ...a }).map((f) => f.id);
  assert.ok(!ids({}).includes("ab_wp_foto_typenschild_warmwasserspeicher"));
  const mit = ids({ ab_wp_ww_da: { wert: "ja" }, ab_wp_puffer_da: { wert: "ja" } });
  assert.ok(mit.includes("ab_wp_foto_typenschild_warmwasserspeicher") && mit.includes("ab_wp_foto_typenschild_pufferspeicher"));
  assert.ok(frageNach("ab_wp_foto_typenschild_pufferspeicher").pflicht);
});

test("Dachmontage und DC sind ein Bericht; alte Namen zählen weiter", () => {
  assert.deepEqual(Object.values(BERICHTE), ["Dachmontage DC", "Elektrik AC", "Wärmepumpe", "Klima"]);
  const s = sichtbar({ bericht: { wert: "Dachmontage DC" }, ab_dc_strings: { wert: "1" } }).map((f) => f.id);
  assert.ok(s.includes("ab_dach_module") && s.includes("ab_dach_foto_typenschild_modul") && s.includes("ab_dc_s1_spannung"));
  assert.equal(berichtVon({ bericht: { wert: "Dachmontage PV" } }), "dc");
  assert.equal(berichtVon({ bericht: { wert: "Elektrik DC" } }), "dc");
});

test("Unterkonstruktion: Auswahl der K2-Systeme für Schräg- und Flachdach", () => {
  const f = frageNach("ab_dach_uk");
  assert.equal(f.art, "liste");
  for (const n of ["K2 SingleRail", "K2 MiniRail / MiniFive", "K2 Dome 6", "K2 GreenRoof 2.0 / GreenRoof Vento", "Metalldachziegel mit FlexAdapter"]) assert.ok(f.optionen.includes(n), n);
  assert.equal(f.optionen.length, 16);
});
