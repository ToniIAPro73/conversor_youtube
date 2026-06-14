# Link2Media - Conversor de YouTube a MP3/MP4

Link2Media es una aplicación web moderna y segura que permite convertir vídeos de YouTube a formatos MP3 (audio) y MP4 (vídeo) de forma rápida y sencilla.

## 🚀 Funcionalidades

- **Análisis de Enlaces:** Validación y extracción de metadatos de vídeos de YouTube.
- **Conversión a MP3:** Diferentes bitrates disponibles (128kbps a 320kbps).
- **Conversión a MP4:** Selección de resolución (360p a 1080p).
- **Seguimiento en Tiempo Real:** Barra de progreso y estados detallados de la conversión.
- **Descarga Segura:** Enlaces de descarga temporales protegidos por tokens.
- **Diseño Responsivo:** Interfaz optimizada para escritorio y móviles.

## ⚖️ Uso Autorizado y Limitaciones Legales

Esta herramienta está diseñada únicamente para contenido:
- Propiedad del usuario.
- Publicado con permiso de descarga.
- De dominio público o con licencia compatible.

El usuario es el único responsable de respetar los derechos de autor, las licencias y las condiciones de uso de la plataforma original.

## 📋 Requisitos

- **Node.js:** v20+ (Recomendado v22+)
- **pnpm:** Gestor de paquetes.
- **yt-dlp:** Instalado en el sistema.
- **FFmpeg & FFprobe:** Instalados en el sistema.

## 🛠️ Instalación en Ubuntu/WSL (Sin Docker)

1. **Instalar dependencias del sistema:**
   ```bash
   sudo apt update
   sudo apt install -y ffmpeg python3-pip
   pip install yt-dlp
   ```

2. **Instalar dependencias del proyecto:**
   ```bash
   pnpm install
   ```

3. **Configurar variables de entorno:**
   ```bash
   cp .env.example .env.local
   ```

4. **Verificar dependencias:**
   ```bash
   pnpm check:deps
   ```

5. **Arrancar en modo desarrollo:**
   ```bash
   pnpm dev
   ```

## ⚙️ Variables de Entorno

Configurables en `.env.local`:
- `MEDIA_TEMP_DIR`: Directorio para archivos temporales.
- `MAX_VIDEO_DURATION_SECONDS`: Límite de duración del vídeo (def: 2h).
- `MAX_CONCURRENT_JOBS`: Límite de procesos simultáneos.
- `JOB_TTL_MINUTES`: Tiempo de vida de los archivos generados.

## 🌍 Despliegue y Compatibilidad

### ⚠️ Limitación en Vercel
Este proyecto **no es compatible con el despliegue estándar en Vercel** por los siguientes motivos:
1.  **Binarios del Sistema:** Vercel utiliza funciones Serverless que no incluyen `ffmpeg`, `ffprobe` ni `yt-dlp`.
2.  **Tiempo de Ejecución:** Las conversiones de vídeo pueden exceder los límites de tiempo (timeout) de las funciones serverless de Vercel.
3.  **Sistema de Archivos:** El proyecto requiere acceso de escritura temporal para procesar los archivos multimedia.

### ✅ Plataformas Recomendadas
Para que la aplicación sea 100% funcional, se recomienda desplegar en plataformas que soporten servidores Node.js persistentes:

-   **Render.com:** (Recomendado) Permite crear un "Web Service" de Node.js. Se puede configurar para instalar `ffmpeg` mediante un script de build.
-   **Railway.app:** Muy sencillo de configurar usando Nixpacks (detecta y puede instalar paquetes de sistema).
-   **DigitalOcean App Platform:** Seleccionando el tipo de componente "Web Service".
-   **VPS (Ubuntu):** La opción más robusta. Sigue los pasos de la sección "Instalación en Ubuntu/WSL".

## 🏗️ Arquitectura y Seguridad

- **Stack:** Next.js (App Router), TypeScript, Tailwind CSS, shadcn/ui.
- **Procesamiento:** Ejecución segura mediante `child_process.spawn` (sin shell).
- **Seguridad de Rutas:** Validación estricta de rutas y saneamiento de nombres de archivos.
- **Tokens:** Tokens aleatorios de un solo uso para descargas.
- **Limpieza Automática:** Los archivos temporales se eliminan automáticamente tras su caducidad.

## 🧪 Pruebas

```bash
pnpm lint      # Comprobar estilo y errores de código
pnpm typecheck # Comprobar tipos de TypeScript
pnpm build     # Verificar que el proyecto compila correctamente
```

## 📜 Licencia

Este proyecto es un MVP (Mínimo Producto Viable) distribuido bajo la licencia MIT.
