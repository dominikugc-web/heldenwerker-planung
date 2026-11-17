import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { ladeJson, speichereJson } from "../server/speicher.mjs";
import { tempDir } from "./hilfe.mjs";

test("ladeJson liefert den Standard, wenn die Datei fehlt", () => {
  assert.deepEqual(ladeJson(path.join(tempDir(), "x.json"), []), []);
});

test("speichereJson schreibt über eine tmp-Datei, die alte bleibt bei Fehler ganz", () => {
  const d = path.join(tempDir(), "a.json");
  speichereJson(d, { v: 1 });
  const zirkulaer = {}; zirkulaer.selbst = zirkulaer;
  assert.throws(() => speichereJson(d, zirkulaer));
  assert.deepEqual(ladeJson(d, null), { v: 1 });
  assert.deepEqual(fs.readdirSync(path.dirname(d)), ["a.json"]);
});
