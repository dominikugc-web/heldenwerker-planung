import path from "node:path";
import { ladeJson, speichereJson } from "./speicher.mjs";
import { route, json, leseJson, fehler } from "./router.mjs";

const ROLLEN = ["admin", "planer"];
const FUENF_MINUTEN = 5 * 60_000;

// Profile aus dem Tailscale-Login. Der Inhaber (PLANUNG_INHABER) wird beim ersten Besuch Admin.
// shortcut: Rechte kennen nur admin/planer; feinere Rechte pro Rolle, wenn Dominik sie braucht.
export function erstelleProfile({ datenDir, inhaber, uhr = Date.now }) {
  const datei = path.join(datenDir, "profile.json");
  const laden = () => ladeJson(datei, {});
  const jetzt = () => new Date(uhr()).toISOString();

  return {
    fuer(login, name) {
      const alle = laden();
      const sauber = String(name || "").trim();
      let p = alle[login];
      if (!p) p = alle[login] = { login, name: sauber || login, rolle: login === inhaber ? "admin" : "planer", erstellt: jetzt(), zuletzt: jetzt() };
      else if ((p.name === p.login && sauber) || uhr() - Date.parse(p.zuletzt) >= FUENF_MINUTEN) {
        if (p.name === p.login && sauber) p.name = sauber;
        p.zuletzt = jetzt();
      } else return p; // nichts geändert, Datei nicht anfassen
      speichereJson(datei, alle);
      return p;
    },
    alle: () => Object.values(laden()).sort((a, b) => a.name.localeCompare(b.name, "de")),
    nameVon: (login) => laden()[login]?.name || login,
    aendern(login, { name, rolle }) {
      const alle = laden();
      const p = alle[login];
      if (!p) throw fehler(404, "Profil nicht gefunden");
      if (rolle !== undefined && !ROLLEN.includes(rolle)) throw fehler(400, "Unbekannte Rolle");
      if (rolle === "planer" && p.rolle === "admin" && Object.values(alle).filter((x) => x.rolle === "admin").length === 1) throw fehler(400, "Mindestens ein Admin muss bleiben");
      if (typeof name === "string" && name.trim()) p.name = name.trim().slice(0, 80);
      if (rolle) p.rolle = rolle;
      speichereJson(datei, alle);
      return p;
    },
  };
}

export const istAdmin = (k) => k.profil?.rolle === "admin";
const nurAdmin = (k) => { if (!istAdmin(k)) throw fehler(403, "Nur für Admins"); };

route("GET", "/api/team", (req, res, p, k) => { nurAdmin(k); json(res, 200, k.profile.alle()); });
route("PUT", "/api/team/:login", async (req, res, p, k) => { nurAdmin(k); json(res, 200, k.profile.aendern(p.login, await leseJson(req))); });
