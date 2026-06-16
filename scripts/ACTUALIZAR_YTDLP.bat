@echo off
chcp 65001 >nul 2>&1
setlocal EnableDelayedExpansion

:: ============================================================================
:: ACTUALIZAR_YTDLP.bat
:: Descarga e instala la ultima version estable de yt-dlp.
:: Ejecuta cuando las conversiones empiecen a fallar.
:: ============================================================================

title Anclora FileStudio - Actualizando yt-dlp...

cd /d "%~dp0"
set "BASE_DIR=%~dp0"
if "%BASE_DIR:~-1%"=="\" set "BASE_DIR=%BASE_DIR:~0,-1%"

set "PS_SCRIPT=%BASE_DIR%\internal\update-ytdlp.ps1"

if not exist "%PS_SCRIPT%" (
    echo  [ERROR] No se encuentra el script interno: internal\update-ytdlp.ps1
    pause
    exit /b 1
)

powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass ^
    -File "%PS_SCRIPT%" -BaseDir "%BASE_DIR%"

if errorlevel 1 (
    echo.
    echo  La actualizacion fallo. Revisa la conexion a Internet e intenta de nuevo.
    pause
    exit /b 1
)

echo  Actualizacion completada. Puedes cerrar esta ventana.
timeout /t 3 >nul
endlocal
