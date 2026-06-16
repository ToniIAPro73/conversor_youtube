@echo off
chcp 65001 > nul
title Anclora FileStudio — Windows Portable Build Pipeline

echo.
echo  =============================================================
echo    Anclora FileStudio — Windows Portable Build Pipeline
echo  =============================================================
echo.
echo  Iniciando en WSL Ubuntu...
echo.

wsl bash -l -c "bash /home/toni/projects/convertidor_youtube_mp3/run_portable_only.sh"

set EXIT_CODE=%errorlevel%

echo.
if %EXIT_CODE% equ 0 (
    echo  =============================================================
    echo    BUILD COMPLETADO EXITOSAMENTE
    echo  =============================================================
) else (
    echo  =============================================================
    echo    BUILD FALLIDO - codigo de salida: %EXIT_CODE%
    echo  =============================================================
)
echo.
pause
