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
    assert.deepEqual(liste, [{ id: "bosch-wp-aussen", name: "Bosch Außengerät", bereich: "Wärmepumpe", boden: true, text: "Compress CS6800i AW Außeneinheit, 1350 x 1100 x 540 mm" }]);
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

test("Produkte: Bodengeräte markiert (3D-Schatten nur dort), Wandgeräte nicht", () => {
  const boden = PRODUKTE.filter((p) => p.boden).map((p) => p.id).sort();
  assert.deepEqual(boden, ["bosch-klima-aussen", "bosch-pufferspeicher", "bosch-warmwasserspeicher", "bosch-wp-aussen", "ecoflow-ocean-2", "ecoflow-powerocean", "ecoflow-speicher", "fronius-reserva", "goodwe-esa"]);
  assert.ok(!PRODUKTE.find((p) => p.id === "fronius-gen24").boden);
});

test("Produkte: 3D-Modell als GLB, in der Liste markiert, ohne Datei 404", async () => {
  const s = await testServer();
  try {
    const ordner = path.join(s.datenDir, "produkte");
    fs.mkdirSync(ordner, { recursive: true });
    fs.writeFileSync(path.join(ordner, "bosch-klima-aussen.png"), "PNG");
    fs.writeFileSync(path.join(ordner, "bosch-klima-innen.png"), "PNG");
    assert.equal((await fetch(s.url + "/api/produkte/bosch-klima-aussen/3d")).status, 404, "ohne GLB");
    fs.writeFileSync(path.join(ordner, "bosch-klima-aussen.glb"), "GLBDATEN");
    const liste = await (await fetch(s.url + "/api/produkte")).json();
    // modell = Änderungsstempel der GLB, damit Geräte ein neu gebautes Modell sofort holen statt aus dem Cache
    const stempel = liste.find((x) => x.id === "bosch-klima-aussen").modell;
    assert.equal(stempel, Math.round(fs.statSync(path.join(ordner, "bosch-klima-aussen.glb")).mtimeMs));
    assert.equal(liste.find((x) => x.id === "bosch-klima-innen").modell, undefined);
    const r = await fetch(s.url + "/api/produkte/bosch-klima-aussen/3d");
    assert.equal(r.headers.get("content-type"), "model/gltf-binary");
    assert.equal(await r.text(), "GLBDATEN");
    assert.equal((await fetch(s.url + "/api/produkte/gibtsnicht/3d")).status, 404);
  } finally { await s.stop(); }
});
