import fs from "node:fs";
import { istAdmin } from "./profile.mjs";
import { route, json, leseJson, fehler } from "./router.mjs";
import { kostenSchaetzen } from "./claude.mjs";
import { ladeFelder, ergebnisPruefen, fehltBerechnen, protokollPdf, PFLICHTFOTOS, BEREICHE } from "./protokoll.mjs";

route("GET", "/api/planungen", (req, res, p, k) => json(res, 200, k.planungen.liste()));
route("GET", "/api/planungen/:id", (req, res, p, k) => json(res, 200, k.planungen.laden(p.id)));

route("POST", "/api/planungen", async (req, res, p, k) => {
  const b = await leseJson(req);
  if (!Number(b.projektId)) throw fehler(400, "Projekt fehlt");
  json(res, 201, k.planungen.neu({ projektId: b.projektId, projektTitel: b.projektTitel, person: k.person }));
});

route("PUT", "/api/planungen/:id/dateien/:dateiId", async (req, res, p, k) => {
  const q = k.query;
  const d = await k.planungen.dateiEmpfangen(req, p.id, p.dateiId, { name: q.get("name"), art: q.get("art"), klein: q.get("klein") === "1" });
  json(res, 201, d);
});

// Antwort kommt als text/plain-Stream; danach liegen beide Nachrichten im Verlauf.
route("POST", "/api/planungen/:id/nachricht", async (req, res, p, k) => {
  const pl = k.planungen.laden(p.id);
  const b = await leseJson(req);
  const claude = k.claude();
  if (!claude) throw fehler(503, "Claude-Schlüssel fehlt");
  const dateien = k.planungen.dateienPruefen(pl, b.dateien);
  if (!String(b.text || "").trim() && !dateien.length) throw fehler(400, "Nachricht ist leer");
  k.planungen.pruefeGrenzen(pl, dateien);
  await k.planungen.pruefePdfs(pl, dateien);

  pl.verlauf.push({ rolle: "planer", text: String(b.text || ""), dateien, zeit: new Date().toISOString() });
  k.planungen.speichern(pl);

  res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-cache" });
  const r = await claude.chat(k.planungen.alsNachrichten(pl), (t) => res.write(t));
  pl.verlauf.push({ rolle: "claude", text: r.text, dateien: [], zeit: new Date().toISOString() });
  pl.kostenCent = Math.round(((pl.kostenCent || 0) + kostenSchaetzen(r.usage)) * 100) / 100;
  k.planungen.speichern(pl);
  res.end();
});

const mitFehlt = (e) => ({ ...e, fehlt: fehltBerechnen(e.fotos) });
const fotoIds = (pl) => pl.verlauf.flatMap((n) => n.dateien).filter((d) => d.art === "bild").map((d) => d.id);

route("POST", "/api/planungen/:id/zusammenfassen", async (req, res, p, k) => {
  const pl = k.planungen.laden(p.id);
  const claude = k.claude();
  if (!claude) throw fehler(503, "Claude-Schlüssel fehlt");
  const felder = await ladeFelder();
  const { ergebnis, usage } = await claude.zusammenfassen(k.planungen.alsNachrichten(pl), felder, fotoIds(pl));
  ergebnisPruefen(ergebnis, felder);
  const ids = new Set(fotoIds(pl));
  ergebnis.fotos = ergebnis.fotos.filter((f) => ids.has(f.dateiId));
  const neu = k.planungen.laden(p.id); // frisch laden: der Aufruf dauert, in der Zeit kann eine Nachricht dazugekommen sein
  neu.ergebnis = mitFehlt(ergebnis);
  neu.status = "zusammengefasst";
  neu.kostenCent = Math.round(((neu.kostenCent || 0) + kostenSchaetzen(usage)) * 100) / 100;
  k.planungen.speichern(neu);
  json(res, 200, neu.ergebnis);
});

route("PUT", "/api/planungen/:id/ergebnis", async (req, res, p, k) => {
  const pl = k.planungen.laden(p.id);
  const e = ergebnisPruefen(await leseJson(req), await ladeFelder());
  const ids = new Set(fotoIds(pl));
  if (e.fotos.some((f) => !ids.has(f.dateiId))) throw fehler(400, "Unbekanntes Foto");
  pl.ergebnis = mitFehlt({ monteure: e.monteure, felder: e.felder, fotos: e.fotos });
  k.planungen.speichern(pl);
  json(res, 200, pl.ergebnis);
});

route("GET", "/api/planungen/:id/protokoll.pdf", async (req, res, p, k) => {
  const pl = k.planungen.laden(p.id);
  if (!pl.ergebnis) throw fehler(409, "Erst zusammenfassen");
  const pdf = await protokollPdf(pl.ergebnis, await ladeFelder());
  res.writeHead(200, { "Content-Type": "application/pdf", "Content-Length": pdf.length });
  res.end(pdf);
});

route("POST", "/api/planungen/:id/abschliessen", async (req, res, p, k) => json(res, 200, await k.abschluss.abschliessen(p.id)));

const TYP = { bild: "image/jpeg", pdf: "application/pdf", video: "video/mp4" };
// Für Vorschaubilder im Chat: klein=1 liefert die verkleinerte Fassung, wenn es sie gibt.
route("GET", "/api/planungen/:id/dateien/:dateiId", (req, res, p, k) => {
  k.planungen.laden(p.id);
  let meta;
  try { [meta] = k.planungen.dateienPruefen({ id: p.id }, [{ id: p.dateiId }]); } catch { throw fehler(404, "Datei nicht gefunden"); }
  const datei = k.query.get("klein") === "1" && meta.klein ? k.planungen.dateiPfad(p.id, p.dateiId, true) : k.planungen.dateiPfad(p.id, p.dateiId);
  res.writeHead(200, { "Content-Type": TYP[meta.art] || "application/octet-stream", "Cache-Control": "private, max-age=3600" });
  fs.createReadStream(datei).pipe(res);
});

route("GET", "/api/ich", (req, res, p, k) => json(res, 200, {
  login: k.person,
  name: k.profil.name,
  rolle: k.profil.rolle,
  inhaber: istAdmin(k),
}));

route("GET", "/api/protokoll-felder", async (req, res, p, k) => json(res, 200, { felder: await ladeFelder(), pflichtfotos: PFLICHTFOTOS, bereiche: BEREICHE }));
