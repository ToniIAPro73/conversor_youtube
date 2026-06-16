# Local Agent Flow

1. Local Agent generates an Ed25519 key pair locally.
2. Agent requests a one-use pairing code.
3. Nexus admin approves or rejects the pairing request.
4. Service issues short-lived access token plus rotating refresh token.
5. Agent stores credentials encrypted in its configured credential store.
6. Agent publishes capabilities and heartbeats over outbound HTTPS.
7. Agent polls `/api/v1/agent/jobs/available`.
8. Agent validates operation, consent, input size, MIME and hash.
9. Agent executes a local operation, uploads the result with `X-Content-Sha256`, confirms hash and cleans temporary files.
10. Admin or user can unpair/revoke the device.

The Local Agent opens no inbound ports and does not accept arbitrary commands, paths or binary names from the server.
