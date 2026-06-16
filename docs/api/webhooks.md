# API Webhooks

Webhook deliveries are signed with HMAC-SHA256 and protected against SSRF by DNS resolution and private range blocking.

Nexus must verify signature, timestamp freshness and event idempotency.
