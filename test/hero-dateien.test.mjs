import { test } from "node:test";
import assert from "node:assert/strict";
import { erstelleDateien } from "../server/hero-dateien.mjs";

function schreiberAttrappe() {
  const aufrufe = [];
  return { aufrufe, heroSchreiben: async (m, v, id) => { aufrufe.push({ m, v, id }); return { add_logbook_entry: { id: 9 } }; } };
}

test("logbuchEintrag schreibt Text an das Projekt über den Schreibschutz", async () => {
  const s = schreiberAttrappe();
  await erstelleDateien({ schreiber: s }).logbuchEintrag(11541539, "Für die Monteure:\n• Zählerschrank im Keller");
  assert.equal(s.aufrufe[0].id, 11541539);
  assert.deepEqual(s.aufrufe[0].v.e, { target: "project_match", target_id: 11541539, custom_text: "Für die Monteure:\n• Zählerschrank im Keller" });
});

test("dateiHochladen meldet klar, dass HERO keinen Upload-Weg hat", async () => {
  const d = erstelleDateien({ schreiber: schreiberAttrappe() });
  assert.equal(d.uploadMoeglich, false);
  await assert.rejects(d.dateiHochladen(Buffer.from("x"), "Zählerschrank 1.jpg", "image/jpeg"), (e) => e.status === 501);
});
