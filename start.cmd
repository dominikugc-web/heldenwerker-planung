@echo off
rem Startet den Planungstool-Server auf diesem PC (nur 127.0.0.1:8790, nach aussen ueber Tailscale Serve).
cd /d "%~dp0"
if not exist node_modules call npm install --omit=dev
node server\main.mjs
