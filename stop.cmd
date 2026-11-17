@echo off
rem Beendet den Planungstool-Server (den Prozess auf Port 8790), egal ob im Fenster oder im Hintergrund gestartet.
powershell -NoProfile -Command "$p = Get-NetTCPConnection -LocalPort 8790 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1; if ($p) { Stop-Process -Id $p.OwningProcess -Force; 'Planungstool-Server beendet.' } else { 'Es lief kein Planungstool-Server.' }"
timeout /t 3 >nul
