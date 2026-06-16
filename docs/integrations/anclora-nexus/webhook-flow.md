# Webhook Flow

FileStudio emits signed job events to Nexus webhook endpoints registered by service clients. Nexus must verify HMAC signatures, timestamp freshness and idempotency before mutating state.

Webhook URLs must be HTTPS and must not resolve to private, loopback, link-local or metadata ranges.
