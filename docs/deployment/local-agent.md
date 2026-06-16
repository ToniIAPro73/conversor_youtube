# Local Agent Deployment

The Local Agent is distributed without Docker for Windows and Linux.

Build:

```bash
pnpm build:local-agent
```

Outputs are generated under `dist/local-agent/linux-x64` and `dist/local-agent/windows-x64`; `dist/` is intentionally ignored by Git.

Required configuration:

```bash
ANCLORA_AGENT_SERVER_URL=https://filestudio.example.com
ANCLORA_AGENT_POLICY=ask-always
ANCLORA_AGENT_STORE_KEY=
```

The portable fallback credential store uses AES-256-GCM and file mode `0600`. Native OS keychain
adapters remain the recommended production hardening step, but plaintext storage is not supported.
