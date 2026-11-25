import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { testServer } from "./hilfe.mjs";
import { PRODUKTE } from "../server/produkte.mjs";

test("Produkte: Liste nach Bereich, nur mit vorhandenem Bild, Bild als PNG, Fremdes 404", async () => {
  const s = await testServer();
  try {
    assert.deepEqual(await (await fetch(s.url + "/api/produkte")).json(), [], "ohne Bilder leere Liste");
    const ordner = path.join(s.datenDir, "produkte");
    fs.mkdirSync(ordner, { recursive: true });
    fs.writeFileSync(path.join(ordner, "bosch-wp-aussen.png"), "PNGDATEN");
    const liste = await (await fetch(s.url + "/api/produkte")).json();
    assert.deepEqual(liste, [{ id: "bosch-wp-aussen", name: "Bosch Außengerät", bereich: "Wärmepumpe" }]);
    const r = await fetch(s.url + "/api/produkte/bosch-wp-aussen");
    assert.equal(r.headers.get("content-type"), "image/png");
    assert.equal(await r.text(), "PNGDATEN");
    assert.equal((await fetch(s.url + "/api/produkte/..%2Fplanung")).status, 404);
    assert.equal((await fetch(s.url + "/api/produkte/gibtsnicht")).status, 404);
  } finally { await s.stop(); }
});

test("Produkte: alle Bereiche abgedeckt, IDs eindeutig, keine Gedankenstriche", () => {
  const ids = PRODUKTE.map((p) => p.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const b of ["Wärmepumpe", "Klimaanlage", "Wechselrichter", "Speicher", "Wallbox"]) assert.ok(PRODUKTE.some((p) => p.bereich === b), b);
  assert.ok(PRODUKTE.every((p) => !/[–—]/.test(p.name)));
});
