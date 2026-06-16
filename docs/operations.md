# Operations

Operational checks:

- `GET /api/v1/health` confirms process liveness.
- `GET /api/v1/ready` checks configured dependencies.
- `GET /api/v1/metrics` exposes Prometheus metrics.
- Worker emits heartbeat logs and handles `SIGTERM`.
- Backup and restore scripts parse required `.env` keys instead of sourcing secrets as shell.

Docker is only for Service/VPS/CI. Desktop and Local Agent remain Docker-free.
