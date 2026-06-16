# Troubleshooting

## Local Agent cannot pair

Check server URL, clock skew, admin approval and that the pairing code has not expired.

## Local Agent requests re-pairing

The refresh token expired, was reused or the device was revoked.

## Service is healthy but not ready

Inspect PostgreSQL, Redis, storage root, JWT key volume and migrations.
