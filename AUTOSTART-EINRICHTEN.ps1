# Richtet den Start des Planungstool-Servers beim Hochfahren ein, auch ohne Windows-Anmeldung.
# Einmal mit Rechtsklick "Mit PowerShell ausführen" starten und die Windows-Rückfrage mit Ja bestätigen.
# Tailscale muss dafür im Modus "Run unattended" laufen (sonst ist der PC ohne Anmeldung nicht erreichbar).
if (-not ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  Start-Process powershell.exe -Verb RunAs -ArgumentList "-NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`""
  exit
}
$d = $PSScriptRoot
$log = Join-Path $d "daten\autostart-einrichten.log"
New-Item -ItemType Directory -Force (Join-Path $d "daten") | Out-Null
try {
  $node = (Get-Command node -ErrorAction Stop).Source
  $a = New-ScheduledTaskAction -Execute "cmd.exe" -Argument "/c `"`"$node`" server\main.mjs >> daten\server.log 2>&1`"" -WorkingDirectory $d
  $t = New-ScheduledTaskTrigger -AtStartup; $t.Delay = "PT30S" # kurz warten, bis Netz und Tailscale da sind
  $p = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType S4U -RunLevel Limited
  # Kein Zeitlimit (Standard wären 72 Stunden), bei Absturz bis zu dreimal neu starten.
  $s = New-ScheduledTaskSettingsSet -ExecutionTimeLimit ([TimeSpan]::Zero) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) -MultipleInstances IgnoreNew
  Register-ScheduledTask -TaskName "Heldenwerker Planung Server" -Description "Startet den Planungstool-Server beim Hochfahren, auch ohne Windows-Anmeldung." -Action $a -Trigger $t -Principal $p -Settings $s -Force -ErrorAction Stop | Out-Null
  "$(Get-Date -Format s) OK: Aufgabe eingerichtet" | Out-File $log -Encoding utf8
  Write-Host "Fertig. Der Server startet jetzt auch ohne Anmeldung." -ForegroundColor Green
} catch {
  "$(Get-Date -Format s) FEHLER: $($_.Exception.Message)" | Out-File $log -Encoding utf8
  Write-Host "Fehler: $($_.Exception.Message)" -ForegroundColor Red
}
Start-Sleep 4
