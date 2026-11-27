import { route, json, leseJson, fehler } from "./router.mjs";
import { istAdmin } from "./profile.mjs";
import { termineBuendeln } from "./hero.mjs";
import { istMonteur, istMontage, eingeteilt } from "./monteur.mjs";

route("GET", "/api/projekte", async (req, res, p, k) =>
  json(res, 200, await k.hero().projekteSuchen(k.query.get("suche") || "", { offset: Number(k.query.get("offset") || 0) })));
route("GET", "/api/projekte/:id", async (req, res, p, k) => json(res, 200, await k.hero().projektLaden(p.id)));
route("GET", "/api/kunden/:id/projekte", async (req, res, p, k) => json(res, 200, await k.hero().kundenProjekte(p.id)));

// meins: Ich bin eingeteilt, über die im Team zugeordnete HERO-Person oder dieselbe E-Mail-Adresse wie in HERO.
route("GET", "/api/termine", async (req, res, p, k) => {
  const von = k.query.get("von"), bis = k.query.get("bis");
  if (!von || !bis) return json(res, 400, { fehler: "von und bis fehlen" });
  const ich = k.profil?.heroPerson?.id, login = String(k.person || "").toLowerCase();
  const monteur = istMonteur(k);
  json(res, 200, termineBuendeln((await k.hero().termineLaden(von, bis)).filter((t) => !monteur || (istMontage(t) && eingeteilt(k, t.personen))).map(({ personen, ...t }) => ({
    ...t, personen: personen.map((x) => x.name), meins: personen.some((x) => x.id === ich || (!!x.email && x.email.toLowerCase() === login)),
  }))));
});
route("GET", "/api/termin-kategorien", async (req, res, p, k) => json(res, 200, await k.hero().terminKategorien()));
route("GET", "/api/hero-personen", async (req, res, p, k) => {
  if (!istAdmin(k)) throw fehler(403, "Nur für Admins");
  json(res, 200, await k.hero().personen());
});

route("POST", "/api/projekte", async (req, res, p, k) => {
  const neu = await k.schreiber().projektAnlegen(await leseJson(req));
  json(res, 201, await k.hero().projektLaden(neu.id).catch(() => ({ id: neu.id, nummer: neu.nummer })));
});
