import { test } from "node:test";
import assert from "node:assert/strict";
import { sichtbar, KATALOG, frageNach, istAbschluss, berichtVon } from "../server/fragen.mjs";
import { BERICHTE, ABSCHLUSS_KATALOG } from "../server/abschluss-fragen.mjs";

const ids = (liste) => liste.map((f) => f.id);

test("Abschluss DC: nur Abschlussfragen, Strings nach Anzahl, Unterschrift am Ende", () => {
  const s = ids(sichtbar({ bericht: { wert: "Elektrik DC" }, ab_dc_strings: { wert: "2" } }));
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
