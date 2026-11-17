import fs from "node:fs";
import path from "node:path";

export function ladeJson(datei, standard) {
  try { return JSON.parse(fs.readFileSync(datei, "utf8")); } catch (e) { if (e.code === "ENOENT") return standard; throw e; }
}

// Atomar: erst tmp-Datei vollständig schreiben, dann umbenennen.
export function speichereJson(datei, wert) {
  const text = JSON.stringify(wert, null, 1);
  fs.mkdirSync(path.dirname(datei), { recursive: true });
  const tmp = datei + ".tmp";
  fs.writeFileSync(tmp, text);
  fs.renameSync(tmp, datei);
}
