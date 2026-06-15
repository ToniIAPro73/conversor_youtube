@echo off
chcp 65001 >nul 2>&1
setlocal EnableDelayedExpansion

:: ============================================================================
:: DIAGNOSTICO_LINK2MEDIA.bat
:: Ejecuta un diagnostico completo de la instalacion de Link2Media.
:: ============================================================================

title Link2Media - Diagnostico...

cd /d "%~dp0"
set "BASE_DIR=%~dp0"
if "%BASE_DIR:~-1%"=="\" set "BASE_DIR=%BASE_DIR:~0,-1%"

set "PS_SCRIPT=%BASE_DIR%\internal\diagnose-link2media.ps1"

if not exist "%PS_SCRIPT%" (
    echo  [ERROR] No se encuentra el script interno: internal\diagnose-link2media.ps1
    echo  El paquete puede estar incompleto.
    pause
    exit /b 1
)

powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass ^
    -File "%PS_SCRIPT%" -BaseDir "%BASE_DIR%"

pause
endlocal
