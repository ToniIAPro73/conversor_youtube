# API Idempotency

Retryable creation requests should include `Idempotency-Key`.

The Service stores the request hash and rejects reuse of the same key with a different payload using `IDEMPOTENCY_CONFLICT`.
