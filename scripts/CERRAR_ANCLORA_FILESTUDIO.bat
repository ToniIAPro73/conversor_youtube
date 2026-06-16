@echo off
chcp 65001 >nul 2>&1
setlocal EnableDelayedExpansion

:: ============================================================================
:: CERRAR_ANCLORA_FILESTUDIO.bat
:: Cierra la aplicacion Anclora FileStudio de forma segura.
:: ============================================================================

title Anclora FileStudio - Cerrando...

cd /d "%~dp0"
set "BASE_DIR=%~dp0"
if "%BASE_DIR:~-1%"=="\" set "BASE_DIR=%BASE_DIR:~0,-1%"

set "PS_SCRIPT=%BASE_DIR%\internal\stop-anclora-filestudio.ps1"

if not exist "%PS_SCRIPT%" (
    echo  [ERROR] No se encuentra el script interno: internal\stop-anclora-filestudio.ps1
    pause
    exit /b 1
)

powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass ^
    -File "%PS_SCRIPT%" -BaseDir "%BASE_DIR%"

timeout /t 2 >nul
endlocal
