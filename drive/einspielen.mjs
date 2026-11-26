// Spielt drive/Planungstool Drive.gs per clasp ins Service-Konto ein und aktualisiert die bestehende Bereitstellung
// (gleiche Web-App-Adresse). Aufruf: node drive/einspielen.mjs [--probe] [--trotzdem]
//   --probe     nur Online-Stand holen und vergleichen, nichts einspielen
//   --trotzdem  auch einspielen, wenn online jemand anders etwas geändert hat
// Braucht: clasp in ~/.google/clasp (npm install @google/clasp), `clasp login --user service` mit dem Service-Konto,
// und in ~/.google/planung-drive.env: DRIVE_WEBAPP_URL, DRIVE_SKRIPT_ID, DRIVE_ORDNER_ID (optional DRIVE_KOPIE = Einfüge-Kopie).
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const G = path.join(os.homedir(), ".google");
const env = Object.fromEntries(fs.readFileSync(path.join(G, "planung-drive.env"), "utf8").split(/\r?\n/).filter((z) => z.includes("=")).map((z) => [z.slice(0, z.indexOf("=")).trim(), z.slice(z.indexOf("=") + 1).trim()]));
const bereitstellung = (env.DRIVE_WEBAPP_URL || "").match(/\/macros\/s\/([^/]+)\/exec/)?.[1];
// Ohne Bereitstellungs-ID würde clasp eine neue anlegen und die Web-App-Adresse ändern.
if (!bereitstellung || !env.DRIVE_SKRIPT_ID || !env.DRIVE_ORDNER_ID) throw new Error("planung-drive.env unvollständig");

const probe = process.argv.includes("--probe"), trotzdem = process.argv.includes("--trotzdem");
const arbeit = path.join(G, "planung-drive-skript"), online = path.join(arbeit, "online"), zuletzt = path.join(arbeit, "zuletzt");
const clasp = (...a) => execFileSync(process.execPath, [path.join(G, "clasp/node_modules/@google/clasp/build/src/index.js"), "--user", "service", ...a], { cwd: online, encoding: "utf8" });
const code = (ordner) => fs.readdirSync(ordner).find((d) => /\.(gs|js)$/.test(d));
const gleich = (a, b) => a.replace(/\r\n/g, "\n").trim() === b.replace(/\r\n/g, "\n").trim();

// 1. Online-Stand holen und sichern
fs.rmSync(online, { recursive: true, force: true });
fs.mkdirSync(online, { recursive: true });
fs.writeFileSync(path.join(online, ".clasp.json"), JSON.stringify({ scriptId: env.DRIVE_SKRIPT_ID, rootDir: "." }));
clasp("pull");
const datei = code(online);
if (!datei) throw new Error("Kein Code im Online-Projekt gefunden");
const jetzt = fs.readFileSync(path.join(online, datei), "utf8");
const sicherung = path.join(arbeit, "sicherung", new Date().toISOString().replace(/[:.]/g, "-"));
fs.mkdirSync(sicherung, { recursive: true });
fs.copyFileSync(path.join(online, datei), path.join(sicherung, datei));

// 2. Hat online jemand anders geändert, seit wir zuletzt eingespielt haben?
const vorher = fs.existsSync(zuletzt) && code(zuletzt) ? fs.readFileSync(path.join(zuletzt, code(zuletzt)), "utf8") : null;
const fremd = vorher !== null && !gleich(vorher, jetzt);
const neu = fs.readFileSync(fileURLToPath(new URL("Planungstool Drive.gs", import.meta.url)), "utf8")
  .replace('const ORDNER_ID = "HIER_ORDNER_ID_EINTRAGEN";', () => `const ORDNER_ID = "${env.DRIVE_ORDNER_ID}"; // Planungs App Glarie`);
if (!neu.includes(env.DRIVE_ORDNER_ID)) throw new Error("Platzhalter für die Ordner-ID nicht gefunden");
console.log(`Online: ${datei}, ${vorher === null ? "erster Lauf" : fremd ? "WEICHT vom zuletzt eingespielten Stand AB" : "unverändert seit dem letzten Einspielen"}, ${gleich(jetzt, neu) ? "schon aktuell" : "neuer Stand liegt bereit"}. Sicherung: ${sicherung}`);
if (probe) process.exit(0);
if (fremd && !trotzdem) { console.error("Abbruch: online wurde von Hand geändert. Erst klären, dann mit --trotzdem."); process.exit(2); }

// 3. Einspielen, neue Version auf der bestehenden Bereitstellung
fs.writeFileSync(path.join(online, datei), neu);
clasp("push", "--force");
const stand = execFileSync("git", ["rev-parse", "--short", "HEAD"], { cwd: fileURLToPath(new URL("..", import.meta.url)), encoding: "utf8" }).trim();
console.log(clasp("redeploy", bereitstellung, "-d", `Planungstool ${stand}`).trim());
fs.rmSync(zuletzt, { recursive: true, force: true });
fs.cpSync(online, zuletzt, { recursive: true });
if (env.DRIVE_KOPIE) fs.writeFileSync(env.DRIVE_KOPIE, neu);
console.log("Eingespielt.");
