@echo off
REM Servidor estático para el visor histórico
cd /d "%~dp0"
python -m http.server 8000
