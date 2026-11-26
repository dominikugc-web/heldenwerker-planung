/**
 * Heldenwerker Planungstool: Ablage auf Google Drive.
 *
 * Läuft als Web-App unter dem Konto service.heldenwerker@gmail.com, dem der Ordner
 * „Planungs App Glarie“ gehört. Der Planungstool-Server auf Dominiks PC ruft es auf:
 *   1. aktion "start":  legt bei Bedarf die Ordner Kunde / Projektnummer / Dateiart an
 *                       (z. B. Familie Diwiwi / PVSN-1303 / Fotos) und öffnet einen Upload
 *                       bei Google. Antwort: { uploadUrl }.
 *      Der Server schickt die Datei danach direkt an diese Adresse (auch große Videos).
 *   2. aktion "fertig": setzt die Freigabe „Jeder mit dem Link: Betrachter“ und
 *                       liefert den Link. Antwort: { id, link }.
 *   3. aktion "einsortieren": räumt alte Ordner „PVSN-1303 Familie Diwiwi“ in die neue
 *                       Ordnung um. Antwort: { ordner, dateien }.
 *
 * Einrichtung: siehe docs/drive-einrichten.md im Repo.
 * Schutz: Jede Anfrage braucht das geheime Kennwort aus den Skript-Eigenschaften (TOKEN).
 */

// Die ID steht nur in der Kopie im Service-Konto, nie im öffentlichen Repo (siehe Anleitung im Vault).
const ORDNER_ID = "HIER_ORDNER_ID_EINTRAGEN";

function doPost(e) {
  try {
    const b = JSON.parse(e.postData.contents);
    const token = PropertiesService.getScriptProperties().getProperty("TOKEN");
    if (!token || b.token !== token) return antwort({ fehler: "Kein Zugriff" });
    if (b.aktion === "start") return antwort(start_(b));
    if (b.aktion === "fertig") return antwort(fertig_(b));
    if (b.aktion === "einsortieren") return antwort(einsortieren());
    return antwort({ fehler: "Unbekannte Aktion" });
  } catch (err) {
    return antwort({ fehler: String(err && err.message || err) });
  }
}

// Öffnet einen „resumable upload“ bei Google. Die zurückgegebene Adresse ist selbst die
// Berechtigung, der Server braucht dafür kein Google-Konto.
function start_(b) {
  if (!b.name || !b.mime) throw new Error("name und mime fehlen");
  // pfad: Ordnerstufen seit 26.11.; ordner: alter Server mit einem Ordner je Projekt
  const stufen = Array.isArray(b.pfad) && b.pfad.length ? b.pfad : [String(b.ordner || "Ohne Projekt")];
  const ordner = stufen.reduce(unterordner_, DriveApp.getFolderById(ORDNER_ID));
  const r = UrlFetchApp.fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&supportsAllDrives=true", {
    method: "post",
    contentType: "application/json; charset=UTF-8",
    headers: { Authorization: "Bearer " + ScriptApp.getOAuthToken(), "X-Upload-Content-Type": b.mime },
    payload: JSON.stringify({ name: String(b.name), parents: [ordner.getId()] }),
    muteHttpExceptions: true,
  });
  if (r.getResponseCode() !== 200) throw new Error("Google: " + r.getResponseCode() + " " + r.getContentText().slice(0, 200));
  const kopf = r.getAllHeaders();
  return { uploadUrl: kopf.Location || kopf.location };
}

function fertig_(b) {
  const datei = DriveApp.getFileById(String(b.id));
  datei.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return { id: datei.getId(), link: datei.getUrl() };
}

// Unterordner mit diesem Namen; wird nur einmal angelegt.
function unterordner_(eltern, name) {
  const sauber = String(name).replace(/[\/\\]/g, "-").trim().slice(0, 120) || "Ohne Namen";
  const treffer = eltern.getFoldersByName(sauber);
  return treffer.hasNext() ? treffer.next() : eltern.createFolder(sauber);
}

// Wie der Server die Dateiarten ablegt; das Protokoll bleibt direkt im Projektordner.
function artOrdner_(projekt, datei) {
  if (/^Besichtigungsprotokoll/.test(datei.getName())) return projekt;
  const mime = datei.getMimeType();
  const art = /^image\//.test(mime) ? "Fotos" : /^video\//.test(mime) ? "Videos" : /^audio\//.test(mime) ? "Sprachnachrichten" : mime === "application/pdf" ? "Dokumente" : "";
  return art ? unterordner_(projekt, art) : projekt;
}

// Alte Ordner „PVSN-1303 Familie Diwiwi“ (auch mehrere Nummern vor dem Namen) direkt im Hauptordner
// werden zu Familie Diwiwi / PVSN-1303 / Fotos usw. Dateien werden nur verschoben, alle Links bleiben gültig.
// Kann gefahrlos mehrfach laufen; Ordner ohne Projektnummer vorne bleiben, wie sie sind.
function einsortieren() {
  const haupt = DriveApp.getFolderById(ORDNER_ID);
  const alte = [];
  for (const it = haupt.getFolders(); it.hasNext();) alte.push(it.next());
  const ergebnis = { ordner: 0, dateien: 0 };
  for (const alt of alte) {
    const m = alt.getName().match(/^((?:[A-Za-z]+-\d+ )+)(.+)$/);
    if (!m) continue;
    const kunde = unterordner_(haupt, m[2]), nummern = m[1].trim();
    const da = kunde.getFoldersByName(nummern);
    // Gibt es den Projektordner beim Kunden schon, wandern die Dateien hinein, sonst zieht der Ordner selbst um.
    const projekt = da.hasNext() ? da.next() : alt.moveTo(kunde).setName(nummern);
    const dateien = [];
    for (const it = alt.getFiles(); it.hasNext();) dateien.push(it.next());
    for (const d of dateien) { d.moveTo(artOrdner_(projekt, d)); ergebnis.dateien++; }
    // Nur der leere Rest nach dem Zusammenführen kommt in den Papierkorb.
    if (projekt.getId() !== alt.getId() && !alt.getFiles().hasNext() && !alt.getFolders().hasNext()) alt.setTrashed(true);
    ergebnis.ordner++;
  }
  Logger.log("Einsortiert: " + JSON.stringify(ergebnis));
  return ergebnis;
}

function antwort(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// Einmal im Editor ausführen: legt das Kennwort an und zeigt es im Protokoll (Ausführungsprotokoll).
function kennwortAnlegen() {
  const token = Utilities.getUuid().replace(/-/g, "") + Utilities.getUuid().replace(/-/g, "");
  PropertiesService.getScriptProperties().setProperty("TOKEN", token);
  DriveApp.getFolderById(ORDNER_ID); // fragt die Drive-Berechtigung beim ersten Ausführen ab
  Logger.log("Kennwort für ~/.google/planung-drive.env: DRIVE_TOKEN=" + token);
}
