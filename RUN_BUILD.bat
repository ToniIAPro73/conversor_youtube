@echo off
chcp 65001 > nul
title Anclora FileStudio — Windows Portable Build

echo.
echo  =============================================================
echo    Anclora FileStudio — Windows Portable Build
echo  =============================================================
echo.
echo  Iniciando en WSL...
echo.

wsl bash -l -c "cd \"$(wsl wslpath -u '%~dp0')\"; bash scripts/build-portables.sh --windows"

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
