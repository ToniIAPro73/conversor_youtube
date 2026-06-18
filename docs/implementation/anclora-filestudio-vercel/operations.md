# Vercel Web Operations

## Environment Variables

Required names:

- `ANCLORA_FILESTUDIO_DEPLOYMENT_TARGET`
- `NEXT_PUBLIC_ANCLORA_FILESTUDIO_MODE`
- `NEXT_PUBLIC_ENABLE_BROWSER_DATA_CONVERSIONS`
- `ANCLORA_FILESTUDIO_ENABLE_SERVER_CONVERSIONS`
- `ANCLORA_FILESTUDIO_ENABLE_CLOUD_UPLOADS`

Optional public URLs:

- `NEXT_PUBLIC_WINDOWS_DOWNLOAD_URL`
- `NEXT_PUBLIC_LINUX_DOWNLOAD_URL`
- `NEXT_PUBLIC_SUPPORT_URL`
- `NEXT_PUBLIC_FILESTUDIO_SERVICE_URL`

## Deploy

Preview:

```bash
pnpm deploy:vercel:preview
```

Production:

```bash
pnpm deploy:vercel:production
```

## Smoke

Validate:

- `/` renders `Modo Web`;
- `/api/health` returns `deploymentTarget=vercel`;
- `/api/capabilities` lists browser formats;
- `/api/metadata` returns `503 DESKTOP_REQUIRED`;
- browser conversion downloads without `/api` upload.

## Rollback

Use the Vercel dashboard or CLI to promote a previous deployment. If Web mode
must be disabled, remove or change `ANCLORA_FILESTUDIO_DEPLOYMENT_TARGET` and
redeploy only after confirming the Desktop/VPS target is intended.
