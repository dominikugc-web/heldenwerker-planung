import { route, json, leseJson } from "./router.mjs";

route("GET", "/api/projekte", async (req, res, p, k) =>
  json(res, 200, await k.hero().projekteSuchen(k.query.get("suche") || "", { offset: Number(k.query.get("offset") || 0) })));
route("GET", "/api/projekte/:id", async (req, res, p, k) => json(res, 200, await k.hero().projektLaden(p.id)));
route("GET", "/api/termine", async (req, res, p, k) => {
  const von = k.query.get("von"), bis = k.query.get("bis");
  if (!von || !bis) return json(res, 400, { fehler: "von und bis fehlen" });
  json(res, 200, await k.hero().termineLaden(von, bis));
});
route("GET", "/api/termin-kategorien", async (req, res, p, k) => json(res, 200, await k.hero().terminKategorien()));

route("POST", "/api/projekte", async (req, res, p, k) => {
  const neu = await k.schreiber().projektAnlegen(await leseJson(req));
  json(res, 201, await k.hero().projektLaden(neu.id).catch(() => ({ id: neu.id, nummer: neu.nummer })));
});
