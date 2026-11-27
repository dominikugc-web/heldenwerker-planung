import path from "node:path";
import { route, json, leseJson, fehler } from "./router.mjs";
import { ladeJson, speichereJson } from "./speicher.mjs";
import { istAdmin } from "./profile.mjs";

// Montage-Teams (Dominik, 27.11.): Name wie in HERO (z. B. „Dachteam 1“) und wer drin ist, egal ob er die App nutzt.
// Beim Abschlussbericht („Wer war dabei?“) bringt ein gewähltes Team seine Mitglieder mit. Pflegen darf nur der Admin.
const datei = (k) => path.join(k.datenDir, "teams.json");
const sauber = (s) => String(s ?? "").trim().replace(/\s+/g, " ").slice(0, 80);

export function teamsPruefen(teams) {
  if (!Array.isArray(teams) || teams.length > 60) throw fehler(400, "Teams ungültig");
  const namen = new Set();
  return teams.map((t) => {
    const name = sauber(t?.name);
    if (!name) throw fehler(400, "Jedes Team braucht einen Namen");
    if (namen.has(name.toLowerCase())) throw fehler(400, `Team „${name}“ gibt es doppelt`);
    namen.add(name.toLowerCase());
    const mitglieder = [...new Set([].concat(t?.mitglieder || []).map(sauber).filter(Boolean))].slice(0, 60);
    return { name, mitglieder };
  });
}

route("GET", "/api/teams", (req, res, p, k) => json(res, 200, ladeJson(datei(k), [])));
route("PUT", "/api/teams", async (req, res, p, k) => {
  if (!istAdmin(k)) throw fehler(403, "Nur für Admins");
  const teams = teamsPruefen((await leseJson(req)).teams);
  speichereJson(datei(k), teams);
  json(res, 200, teams);
});
