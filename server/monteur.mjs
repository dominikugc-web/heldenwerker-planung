import { fehler } from "./router.mjs";

// Rolle Monteur (Spec Baustellenabschluss): sieht nur eigene Montage-Termine und Abschlussberichte der Projekte,
// auf deren Montage-Termin er in HERO eingeteilt ist (60 Tage zurück bis 14 voraus). Alles andere ist gesperrt.
export const MONTAGE = ["Umsetzung", "DC Montage", "WP Montage", "Zählertausch"];
const ERLAUBT = new Set([
  "GET /api/gesund", "GET /api/ich", "GET /api/mitarbeiter", "GET /api/teams", "GET /api/fragen", "GET /api/termine", "GET /api/termin-kategorien",
  "GET /api/produkte", "GET /api/produkte/:id", "GET /api/produkte/:id/3d", "GET /api/projekte/:id",
  "GET /api/planungen", "POST /api/planungen", "GET /api/planungen/:id", "PUT /api/planungen/:id/antworten/:frage",
  "PUT /api/planungen/:id/dateien/:dateiId", "GET /api/planungen/:id/planungsbilder", "GET /api/planungen/:id/planungsbilder/:bildId", "GET /api/planungen/:id/dateien/:dateiId", "GET /api/planungen/:id/protokoll.pdf",
  "POST /api/planungen/:id/abschliessen", "POST /api/planungen/:id/neustart", "POST /api/fehlerbericht", "POST /api/feedback",
]);

export const istMonteur = (k) => k.profil?.rolle === "monteur";
// Eingeteilt über die zugeordnete HERO-Person oder dieselbe E-Mail-Adresse wie in HERO (wie „meins“ bei den Terminen).
export const eingeteilt = (k, personen = []) => {
  const ich = k.profil?.heroPerson?.id, login = String(k.person || "").toLowerCase();
  return personen.some((x) => (ich && x.id === ich) || (!!x.email && x.email.toLowerCase() === login));
};
export const istMontage = (t) => !!t.projektId && MONTAGE.includes(t.kategorie);

// Je Login 5 Minuten zwischengespeichert, damit nicht jede Antwort HERO fragt.
export async function erlaubteProjekte(k) {
  const c = k.monteurCache.get(k.person);
  if (c && Date.now() - c.zeit < 5 * 60_000) return c.ids;
  const tag = 864e5, jetzt = Date.now();
  const termine = await k.hero().termineLaden(new Date(jetzt - 60 * tag).toISOString(), new Date(jetzt + 14 * tag).toISOString());
  const ids = new Set(termine.filter((t) => istMontage(t) && eingeteilt(k, t.personen)).map((t) => Number(t.projektId)));
  k.monteurCache.set(k.person, { zeit: Date.now(), ids });
  return ids;
}
export const darfPlanung = async (k, pl) => pl.art === "abschluss" && (pl.person === k.person || (await erlaubteProjekte(k)).has(pl.projektId));
const verboten = () => fehler(403, "Für Monteure nicht freigegeben");

// Läuft vor jedem Aufruf eines Monteurs (main.mjs). Was eine Route selbst noch filtern muss (Listen, Anlegen), steht dort.
export async function monteurPruefen(k, methode, muster, params) {
  if (!ERLAUBT.has(methode + " " + muster)) throw verboten();
  if (muster === "/api/projekte/:id" && !(await erlaubteProjekte(k)).has(Number(params.id))) throw verboten();
  if (muster.startsWith("/api/planungen/:id") && !(await darfPlanung(k, k.planungen.laden(params.id)))) throw verboten();
}
