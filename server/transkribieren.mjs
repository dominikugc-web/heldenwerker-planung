import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";

// Sprachnachrichten in Text: faster-whisper aus der Klartext-Installation auf Dominiks PC (CPU, Modell medium).
// shortcut: Python-Umgebung und Modelle von Klartext mitbenutzt; bei einem eigenen Server per Umgebungsvariablen umstellen.
const KLARTEXT = "C:/Users/Dominik/Documents/Codex/2026-09-10/ich/outputs/Klartext";
const SKRIPT = fileURLToPath(new URL("./whisper.py", import.meta.url));

export function erstelleTranskription({
  python = process.env.PLANUNG_WHISPER_PYTHON || KLARTEXT + "/.venv/Scripts/python.exe",
  modelle = process.env.PLANUNG_WHISPER_MODELLE || KLARTEXT + "/data/models",
} = {}) {
  return (pfad) => new Promise((ok, fehler) => {
    execFile(python, [SKRIPT, pfad, modelle], { timeout: 180_000, windowsHide: true }, (err, stdout) => {
      if (err) return fehler(err);
      try { ok(JSON.parse(stdout.trim().split("\n").pop()).text); } catch (e) { fehler(e); }
    });
  });
}

export function audioMime(name) {
  const endung = String(name).toLowerCase().split(".").pop();
  return { m4a: "audio/mp4", mp4: "audio/mp4", webm: "audio/webm", ogg: "audio/ogg", wav: "audio/wav" }[endung] || "audio/mpeg";
}
