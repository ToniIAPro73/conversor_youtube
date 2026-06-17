# Distribución portable Windows — Anclora FileStudio

## Artefactos

| Artefacto | Descripción |
|---|---|
| `Anclora-FileStudio-Windows-x64-Core.zip` | Núcleo portable con herramientas de licencia permisiva |
| `Anclora-FileStudio-Windows-x64-Full.zip` | Núcleo + todos los packs incluidos |
| `Anclora-FileStudio-Setup-x64.exe` | Instalador NSIS (descarga packs bajo demanda) |
| `packs/Office-Pack.zip` | Pandoc + LibreOffice |
| `packs/OCR-Pack.zip` | Tesseract multi-idioma + Poppler |
| `packs/Ebook-Pack.zip` | Calibre |
| `packs/Vision-Pack.zip` | ONNX Runtime + modelo de eliminación de fondos |

## Requisitos del sistema

- Windows 10 x64 o superior
- Sin dependencias de .NET, Visual C++ Runtime ni ninguna otra
- No requiere permisos de administrador
- No modifica el registro de Windows
- No modifica el PATH global del sistema

## Uso

### Inicio

Doble clic en `INICIAR_ANCLORA_FILESTUDIO.bat`

El script:

1. Selecciona un puerto libre desde `3456`
2. Configura las variables de entorno `ANCLORA_FILESTUDIO_*`
3. Crea el archivo PID para control del proceso
4. Arranca el servidor Node.js
5. Verifica `/api/health` antes de abrir el navegador
6. Abre `http://127.0.0.1:<puerto>` en el navegador predeterminado

El launcher interno usa `WorkingDirectory = app` y pasa `server.js` como
entrypoint relativo a Node.js. Esto evita que Windows PowerShell 5.1 divida
rutas absolutas con espacios al usar `Start-Process -ArgumentList`.

El BAT se puede ejecutar desde carpetas locales con espacios, por ejemplo:

```text
C:\Users\antonio.ballesterosa\Downloads\Prueba Anclora Windows Arranque Final
```

El script PowerShell interno no solicita entrada interactiva. En errores sale
con código distinto de cero; la única pausa de usuario vive en el BAT.

### Detección de herramientas externas

El launcher y el diagnóstico resuelven herramientas en este orden:

1. Ruta incluida en el portable.
2. Variable de entorno `ANCLORA_FILESTUDIO_*` válida.
3. Ruta estándar de Windows en `C:\Program Files`.
4. `Get-Command` / `PATH`.

Las rutas estándar soportadas son:

```text
C:\Program Files\LibreOffice\program\soffice.exe
C:\Program Files\Calibre2\ebook-convert.exe
C:\Program Files\Tesseract-OCR\tesseract.exe
C:\Program Files\Tesseract-OCR\tessdata
```

Si Tesseract se resuelve desde una instalación completa, el launcher configura
también `ANCLORA_FILESTUDIO_TESSDATA_PREFIX` hacia el directorio `tessdata`.

### Parada

Doble clic en `CERRAR_ANCLORA_FILESTUDIO.bat`

El cierre usa el PID registrado en `data/anclora-filestudio.pid` y valida que
corresponde al `runtime\node.exe` incluido en ese portable. No realiza búsquedas
globales ni termina otros procesos Node del usuario.

### Diagnóstico

Doble clic en `DIAGNOSTICO_ANCLORA_FILESTUDIO.bat`

Muestra el estado de todas las herramientas instaladas.

### Actualizar yt-dlp

Doble clic en `ACTUALIZAR_YTDLP.bat`

yt-dlp se actualiza frecuentemente. Actualizar mensualmente o cuando YouTube falle.

## Estructura interna

```text
Anclora-FileStudio/
├── INICIAR_ANCLORA_FILESTUDIO.bat
├── CERRAR_ANCLORA_FILESTUDIO.bat
├── DIAGNOSTICO_ANCLORA_FILESTUDIO.bat
├── ACTUALIZAR_YTDLP.bat
├── LEEME.txt
├── VERSION.txt
├── manifest.json
├── THIRD_PARTY_NOTICES.txt
├── runtime/          # Node.js runtime
├── app/              # Aplicación Next.js compilada
├── tools/            # Herramientas externas (ffmpeg, qpdf, 7z, etc.)
├── models/           # Modelos IA (Vision Pack)
├── licenses/         # Textos de licencia completos
├── data/             # Base de datos SQLite (no borrar al actualizar)
└── logs/             # Logs de ejecución
```

## Seguridad

- El servidor escucha solo en `127.0.0.1` (loopback)
- No acepta conexiones desde otros equipos de la red
- Los archivos procesados se almacenan en `data/`
- Los archivos temporales se limpian automáticamente
- El diagnóstico no envía información a servidores externos

## Actualización

Para actualizar a una nueva versión:

1. Cierra Anclora FileStudio con `CERRAR_ANCLORA_FILESTUDIO.bat`
2. Extrae el nuevo ZIP en una carpeta nueva
3. Copia la carpeta `data/` de la versión anterior a la nueva
4. Inicia la nueva versión con `INICIAR_ANCLORA_FILESTUDIO.bat`

**No borres la carpeta `data/` — contiene tu historial de conversiones.**

## Packs opcionales

Los packs se instalan copiando el ZIP del pack en la carpeta raíz de Anclora FileStudio
y ejecutando el instalador de packs (disponible en la UI bajo Ajustes → Packs).

El instalador:

1. Extrae el pack en la carpeta `tools/`
2. Verifica el hash SHA-256 de cada binario
3. Refresca el diagnóstico de la aplicación
4. Actualiza `manifest.json` con las nuevas capacidades

No anuncia capacidades del pack hasta que esté completamente instalado y verificado.
