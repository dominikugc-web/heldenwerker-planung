# Drive-Ablage einrichten

Fotos, Videos und das Protokoll-PDF gehen auf Google Drive in den Ordner des Service-Kontos. Der Planungstool-Server spricht dafür mit einer kleinen Apps-Script-Web-App (`drive/Planungstool Drive.gs`).

1. Im Service-Konto den Ordner auf **„Jeder mit dem Link: Betrachter“** stellen (nicht Bearbeiter).
2. https://script.google.com im Service-Konto öffnen, **Neues Projekt**, Name „Planungstool Drive“. Den Inhalt von `Planungstool Drive.gs` einfügen und `ORDNER_ID` auf die ID des Ordners setzen.
3. Oben die Funktion **`kennwortAnlegen`** auswählen und **Ausführen**. Berechtigungen erlauben. Im Ausführungsprotokoll steht `DRIVE_TOKEN=…`.
4. **Bereitstellen → Neue Bereitstellung → Web-App**. Ausführen als: **Ich**. Zugriff: **Jeder**. Die Web-App-URL kopieren.
5. Auf dem PC die Datei `~/.google/planung-drive.env` füllen:

       DRIVE_WEBAPP_URL=https://script.google.com/macros/s/…/exec
       DRIVE_TOKEN=…

Der Server erkennt die Datei ohne Neustart. Ab dann landen beim „In HERO speichern“ alle Dateien geordnet nach Kunde / Projektnummer / Fotos, Videos, Sprachnachrichten, Dokumente (Protokoll direkt im Projektordner), und die Links stehen im HERO-Logbuch. Planungen, die schon gesendet wurden, holen die Dateien beim nächsten „Erneut senden“ nach.

## Skript aktualisieren

Automatisch: `node drive/einspielen.mjs` holt den Online-Stand per clasp, sichert ihn, bricht ab, wenn dort von Hand geändert wurde, spielt `drive/Planungstool Drive.gs` ein und hängt eine neue Version an die bestehende Bereitstellung. Einmalig nötig: Apps Script API unter script.google.com/home/usersettings einschalten, clasp nach `~/.google/clasp` installieren, `clasp login --user service` mit dem Service-Konto, dazu `DRIVE_SKRIPT_ID` und `DRIVE_ORDNER_ID` in `~/.google/planung-drive.env`. `--probe` vergleicht nur.

Von Hand: neuen Inhalt einfügen und speichern, dann **Bereitstellen → Bereitstellungen verwalten → Stift → Version: Neue Version → Bereitstellen**. So bleibt die Web-App-URL gleich. Eine neue Bereitstellung würde eine neue URL erzeugen.

Alte Ordner aus der Zeit vor dem 26.11. („PVSN-1303 Familie Diwiwi“) räumt die Aktion `einsortieren` in die neue Ordnung um. Sie läuft auch im Editor über die Funktion `einsortieren`. Dateien werden nur verschoben, alle Links bleiben gültig.
