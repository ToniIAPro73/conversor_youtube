@echo off
chcp 65001 >nul 2>&1
setlocal EnableDelayedExpansion

:: ============================================================================
:: INICIAR_LINK2MEDIA.bat
:: Lanzador principal de Link2Media para Windows.
:: Haz doble clic para iniciar la aplicacion.
:: ============================================================================

title Link2Media - Iniciando...

:: - Cambiar al directorio donde esta el .bat -----------------
cd /d "%~dp0"
set "BASE_DIR=%~dp0"
:: Eliminar la barra final si existe
if "%BASE_DIR:~-1%"=="\" set "BASE_DIR=%BASE_DIR:~0,-1%"

echo.
echo  ======================================
echo            Link2Media
echo  ======================================
echo.

:: - Verificar archivos criticos ---------------------------
if not exist "%BASE_DIR%\runtime\node.exe" (
    echo  [ERROR] No se encuentra runtime\node.exe
    echo.
    echo  Extrae primero todo el contenido del ZIP en una carpeta
    echo  local y vuelve a ejecutar INICIAR_LINK2MEDIA.bat
    echo.
    pause
    exit /b 1
)

if not exist "%BASE_DIR%\app\server.js" (
    echo  [ERROR] No se encuentra app\server.js
    echo.
    echo  El paquete puede estar incompleto. Vuelve a descargar y extraer el ZIP.
    echo.
    pause
    exit /b 1
)

:: - Delegar en PowerShell para la logica compleja --------------
set "PS_SCRIPT=%BASE_DIR%\internal\start-link2media.ps1"

if not exist "%PS_SCRIPT%" (
    echo  [ERROR] No se encuentra el script interno: internal\start-link2media.ps1
    echo.
    echo  El paquete puede estar incompleto. Vuelve a descargar y extraer el ZIP.
    echo.
    pause
    exit /b 1
)

powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass ^
    -File "%PS_SCRIPT%" -BaseDir "%BASE_DIR%"

if errorlevel 1 (
    echo.
    echo  La aplicacion no pudo iniciarse.
    echo  Consulta logs\error.log para mas detalles.
    echo  Ejecuta DIAGNOSTICO_LINK2MEDIA.bat para diagnostico completo.
    echo.
    pause
    exit /b 1
)

endlocal
