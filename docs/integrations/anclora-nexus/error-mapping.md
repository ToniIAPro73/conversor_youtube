# Error Mapping

| FileStudio code | Nexus action |
|---|---|
| `AUTH_INVALID_TOKEN` | Refresh service token or fail request |
| `AUTH_EXPIRED_TOKEN` | Refresh token and retry once |
| `AUTH_INSUFFICIENT_SCOPE` | Surface integration configuration error |
| `PAIRING_CODE_INVALID` | Ask admin to re-enter code |
| `PAIRING_TOO_MANY_ATTEMPTS` | Restart pairing |
| `AGENT_DEVICE_REVOKED` | Mark device disconnected |
| `OPERATION_UNAVAILABLE` | Re-run routing policy |
| `UPLOAD_TOO_LARGE` | Reject or route locally |
| `OUTPUT_HASH_MISMATCH` | Treat result as failed and alert |
| `IDEMPOTENCY_CONFLICT` | Stop retry and inspect caller bug |
