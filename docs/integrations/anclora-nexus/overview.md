# Anclora Nexus Integration

Anclora Nexus integrates with Anclora FileStudio through a private Service API and an optional Local Agent route. Nexus remains responsible for identity, user consent, routing decisions and final user-facing workflow state.

FileStudio provides:

- private Service API for uploads, jobs, results and webhooks;
- Local Agent pairing and outbound polling;
- contract fixtures and mock server for Nexus tests;
- routing policy reference implementation.

Nexus must implement its own branch for production UI/admin flows that approve or reject pairing requests and present routing decisions to users.
