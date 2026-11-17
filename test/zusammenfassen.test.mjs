import { test } from "node:test";
import assert from "node:assert/strict";
import { testServer } from "./hilfe.mjs";

const J = { "Content-Type": "application/json" };
const MONTEURE = { wasWirdGemacht: ["PV 9,9 kWp auf Süddach"], woKommtWasHin: ["WR im Keller"], achtung: ["Freileitung am Giebel"], material: [], offen: [] };
function client() {
  const anfragen = [];
  return { anfragen, beta: { messages: { create: async (p) => { anfragen.push(p); return { stop_reason: "end_turn", content: [{ type: "text", text: JSON.stringify({ monteure: MONTEURE }) }], usage: { input_tokens: 10, output_tokens: 10 } }; } } } };
}
async function planungMitAntworten(s) {
  const p = await (await fetch(s.url + "/api/planungen", { method: "POST", headers: J, body: JSON.stringify({ projektId: 11541539, projektTitel: "UNB-1149, Müller", kunde: "Jörg Müller" }) })).json();
  const put = (id, body) => fetch(s.url + `/api/planungen/${p.id}/antworten/${id}`, { method: "PUT", headers: J, body: JSON.stringify(body) });
  await put("typ", { wert: "PV" });
  await put("dachbelag", { wert: "Pfanne", notiz: "Ziegel brüchig" });
  return p;
}

test("zusammenfassen: Claude bekommt die Antworten als Text, Ergebnis mit fehlenden Pflichtfotos", async () => {
  const c = client();
  const s = await testServer({ claudeClient: c });
  try {
    const p = await planungMitAntworten(s);
    const r = await fetch(s.url + `/api/planungen/${p.id}/zusammenfassen`, { method: "POST", headers: J, body: "{}" });
    assert.equal(r.status, 200);
    const e = await r.json();
    assert.deepEqual(e.monteure, MONTEURE);
    assert.equal(e.fehlt.length, 10);
    assert.match(c.anfragen[0].messages[0].content, /Dachbelag: Pfanne \(Notiz: Ziegel brüchig\)/);
    const pl = await (await fetch(s.url + `/api/planungen/${p.id}`)).json();
    assert.equal(pl.status, "zusammengefasst");
    assert.ok(pl.kostenCent > 0);
  } finally { await s.stop(); }
});

test("Monteur-Text bearbeiten: nur Listen aus Text, sonst 400", async () => {
  const s = await testServer({ claudeClient: client() });
  try {
    const p = await planungMitAntworten(s);
    await fetch(s.url + `/api/planungen/${p.id}/zusammenfassen`, { method: "POST", headers: J, body: "{}" });
    const put = (body) => fetch(s.url + `/api/planungen/${p.id}/ergebnis`, { method: "PUT", headers: J, body: JSON.stringify(body) });
    assert.equal((await put({ monteure: { wasWirdGemacht: "kein Array" } })).status, 400);
    const r = await put({ monteure: { ...MONTEURE, offen: ["Zählernummer"] } });
    assert.equal(r.status, 200);
    assert.deepEqual((await r.json()).monteure.offen, ["Zählernummer"]);
  } finally { await s.stop(); }
});

test("Protokoll-PDF geht auch vor dem Zusammenfassen", async () => {
  const s = await testServer();
  try {
    const p = await planungMitAntworten(s);
    const r = await fetch(s.url + `/api/planungen/${p.id}/protokoll.pdf`);
    assert.equal(r.status, 200);
    assert.equal(r.headers.get("content-type"), "application/pdf");
    assert.equal(Buffer.from(await r.arrayBuffer()).subarray(0, 4).toString(), "%PDF");
  } finally { await s.stop(); }
});
