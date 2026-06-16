# Routing Policy

The reference policy rejects when user consent is absent. Restricted data requires human approval. Confidential data prefers local desktop or Local Agent and is not sent to the private service unless `allowConfidentialPrivateService` is explicitly enabled.

The policy is configurable for:

- large file threshold;
- confidential private-service fallback;
- allowed data residency values;
- restricted data approval behavior.

Nexus must pass classification, operation, size, workspace, client, consent and residency metadata.
