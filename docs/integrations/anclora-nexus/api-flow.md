# API Flow

1. Nexus classifies the file and calls the routing policy.
2. If `private-service` is selected, Nexus uploads the file to `/api/v1/uploads`.
3. Nexus creates a job with `/api/v1/jobs`.
4. FileStudio worker or Local Agent processes the conversion.
5. Nexus reads job state, receives webhooks or downloads the result with a short-lived result token.

Idempotency keys are required for retryable job creation. Reusing an idempotency key with a different body returns `IDEMPOTENCY_CONFLICT`.
