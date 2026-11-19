# Payments

## Requirements

- Every charge is sent through the internal HTTP client (`src/lib/http.ts`), which adds retries, timeouts and audit logging.
- A failed charge returns `402 Payment Required` and is never retried automatically.

## Rules

```specguardian
id: payment-no-axios
type: forbid-import
paths: ["src/core/payment/**"]
modules: ["axios", "node-fetch", "got"]
message: Payments must use the internal HTTP client in src/lib/http.ts.
```
