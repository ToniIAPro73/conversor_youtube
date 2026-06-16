# Authentication

Service requests from Nexus use JWT bearer tokens with scoped claims.

Local Agent pairing starts unauthenticated only for `POST /api/v1/agent-pairing-requests`; administrative approval requires `filestudio:admin`. Agent job polling then uses short-lived agent access tokens and rotating refresh tokens.

Required Nexus scopes:

- `filestudio:uploads:create`
- `filestudio:jobs:create`
- `filestudio:jobs:read`
- `filestudio:jobs:cancel`
- `filestudio:results:read`
- `filestudio:webhooks:manage`
- `filestudio:admin` for pairing approval/rejection

Tokens, refresh tokens and private keys must never be logged or sent in query strings.
