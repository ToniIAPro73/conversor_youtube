@echo off
chcp 65001 >nul 2>&1
setlocal EnableDelayedExpansion

:: ============================================================================
:: DIAGNOSTICO_ANCLORA_FILESTUDIO.bat
:: Ejecuta un diagnostico completo de la instalacion de Anclora FileStudio.
:: ============================================================================

title Anclora FileStudio - Diagnostico...

cd /d "%~dp0"
set "BASE_DIR=%~dp0"
if "%BASE_DIR:~-1%"=="\" set "BASE_DIR=%BASE_DIR:~0,-1%"

set "PS_SCRIPT=%BASE_DIR%\internal\diagnose-anclora-filestudio.ps1"

if not exist "%PS_SCRIPT%" (
    echo  [ERROR] No se encuentra el script interno: internal\diagnose-anclora-filestudio.ps1
    echo  El paquete puede estar incompleto.
    pause
    exit /b 1
)

powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass ^
    -File "%PS_SCRIPT%" -BaseDir "%BASE_DIR%"

pause
endlocal
