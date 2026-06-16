# Portables — Test Matrix

## Linux

| Test | Script | Status | Notes |
|------|--------|--------|-------|
| Structural verify (43 checks) | `verify-linux-portable.sh` | ✅ PASS | 43/43 |
| Smoke (no false positive) | `smoke-linux-portable.sh` | ✅ PASS | 9/9 |
| Runtime smoke (health endpoint) | manual | NOT EXECUTED | Requires target system |
| Conversion round-trip | manual | NOT EXECUTED | Requires target system |

## Windows

| Test | Script | Status | Notes |
|------|--------|--------|-------|
| Structural smoke | `smoke-windows-portable.sh` | NOT EXECUTED | No artifact yet |
| Runtime smoke | manual | NOT EXECUTED | Requires Windows |

## CI gate requirement

Before merging to `main`:
- [ ] Linux structural verify passes (exit 0)
- [ ] Linux smoke passes (exit 0)
- [ ] Windows structural smoke passes when artifact exists
- [ ] Neither smoke gives false positive when artifact is absent (exit 1)

## Smoke test false-positive fix

Both smoke scripts previously had `exit 0` when the package was not found:
```bash
# BEFORE (false positive)
[[ -f "$TAR" ]] || { echo "SKIP: Package not found."; exit 0; }

# AFTER (correct)
if [[ ! -f "$TAR" ]]; then
  echo "[FAIL] Package not found: $TAR"
  exit 1
fi
```

This ensures CI fails when a build step is missing rather than silently passing.
