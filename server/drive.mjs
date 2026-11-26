import fs from "node:fs";
import os from "node:os";
import { Readable } from "node:stream";
import { ladeSchluessel } from "./konfig.mjs";

// Ablage auf Google Drive über die Apps-Script-Web-App im Service-Konto (drive/Planungstool Drive.gs).
// Die Web-App öffnet den Upload, die Datei selbst geht als Stream direkt an Google.
export function erstelleDrive({ url, token, fetch = globalThis.fetch }) {
  async function webApp(daten) {
    let j;
    try { j = await (await fetch(url, { method: "POST", headers: { "Content-Type": "text/plain" }, body: JSON.stringify({ token, ...daten }) })).json(); }
    catch { throw new Error("Drive-Ablage nicht erreichbar"); }
    if (j.fehler) throw new Error("Drive-Ablage: " + j.fehler);
    return j;
  }
  return {
    name: "Drive",
    // ordner: Liste der Ordnerstufen unter dem Hauptordner, z. B. ["Familie Diwiwi", "PVSN-1303", "Fotos"].
    async hochladen(pfad, name, mime, ordner) {
      const { uploadUrl } = await webApp({ aktion: "start", name, mime, pfad: ordner });
      const groesse = fs.statSync(pfad).size;
      const r = await fetch(uploadUrl, {
        method: "PUT", duplex: "half", body: Readable.toWeb(fs.createReadStream(pfad)),
        headers: { "Content-Length": String(groesse), "Content-Type": mime },
      });
      if (!r.ok) throw new Error("Drive-Upload fehlgeschlagen (" + r.status + ")");
      const { id } = await r.json();
      return (await webApp({ aktion: "fertig", id })).link;
    },
  };
}

// ~/.google/planung-drive.env mit DRIVE_WEBAPP_URL und DRIVE_TOKEN; fehlt sie, gibt es keine Ablage.
export function ladeDrive(homeDir = os.homedir()) {
  const url = ladeSchluessel(".google/planung-drive.env", "DRIVE_WEBAPP_URL", homeDir);
  const token = ladeSchluessel(".google/planung-drive.env", "DRIVE_TOKEN", homeDir);
  return url && token ? erstelleDrive({ url, token }) : null;
}
