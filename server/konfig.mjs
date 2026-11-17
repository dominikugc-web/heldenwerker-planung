import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export const GITHUB_ORIGIN = "https://dominikugc-web.github.io";
export const EURO_JE_DOLLAR = 0.92;

// Liest NAME=wert aus einer env-Datei im Home-Ordner (z. B. ".hero/graphql.env").
export function ladeSchluessel(datei, name, homeDir = os.homedir()) {
  try {
    const text = fs.readFileSync(path.join(homeDir, datei), "utf8");
    const m = text.match(new RegExp("^" + name + "=(.+)$", "m"));
    return m && m[1].trim() ? m[1].trim() : null;
  } catch { return null; }
}

export const SCHLUESSEL = {
  hero: [".hero/graphql.env", "HERO_GRAPHQL_KEY"],
  claude: [".anthropic/planung.env", "ANTHROPIC_API_KEY"],
};

// Eigener Schlüssel fürs Planungstool (planung.env) vor dem allgemeinen (graphql.env).
export function heroSchluessel(homeDir = os.homedir()) {
  return ladeSchluessel(".hero/planung.env", "HERO_GRAPHQL_KEY", homeDir) ?? ladeSchluessel(...SCHLUESSEL.hero, homeDir);
}
