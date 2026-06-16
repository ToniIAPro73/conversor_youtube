# API Authentication

Service clients use asymmetric JWT bearer tokens. Required claims are `client_id`, `sub`, `scopes`, `aud`, `exp` and a key id in the protected header.

Local Agents use pairing-issued access tokens and rotating refresh tokens. Refresh token reuse revokes the device.
