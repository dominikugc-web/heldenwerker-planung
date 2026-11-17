' Startet den Planungstool-Server unsichtbar im Hintergrund (kein Fenster).
' Ausgaben landen in daten\server.log. Beenden mit stop.cmd.
' Läuft schon ein Server auf Port 8790, beendet sich der zweite sofort wieder (steht dann im Log).
Set sh = CreateObject("WScript.Shell")
ordner = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName)
sh.CurrentDirectory = ordner
' Klammern nötig: ohne sie gehört "& node ..." zur if-Bedingung und wird übersprungen, wenn daten existiert.
sh.Run "cmd /c (if not exist daten mkdir daten) & node server\main.mjs >> daten\server.log 2>&1", 0, False
