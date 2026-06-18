# Preview Validation

## Deployment

- URL: `https://anclora-filestudio-o1802vyc1-pmi140979-6354s-projects.vercel.app`
- Deployment ID: `dpl_G2QrBvnKetVzjRZTgiUwrqqgAzc3`
- Inspector: `https://vercel.com/pmi140979-6354s-projects/anclora-filestudio/G2QrBvnKetVzjRZTgiUwrqqgAzc3`

## Result

Preview is protected by Vercel Authentication. Public browser access shows the
Vercel auth interstitial. API validation was completed with authenticated
`vercel curl`, which uses Vercel deployment protection bypass for automation.

## Checks

| Check | Result |
| --- | --- |
| `/api/health` | PASS |
| `/api/capabilities` | PASS |
| `/api/metadata` blocked | PASS, `503 DESKTOP_REQUIRED` |
| `deploymentTarget` | `vercel` |
| `effectivePlatform` | `vercel-web` |
| `serverConversions` | `false` |
| `cloudUploads` | `false` |
| Browser Playwright | BLOCKED by Preview auth protection |

Browser Playwright was executed against the public Production alias after
Preview API validation, because the Production alias is publicly reachable.
