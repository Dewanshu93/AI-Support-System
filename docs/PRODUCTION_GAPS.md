# Production gaps

What the prototype mocks or skips, compared with a production deployment. Filled in as tasks land
(playbook section 9 lists the production requirement for each security area).

| Area                  | Prototype                                                                                                                                                                                                                                                                       | Production requirement                                                                                                                | Added in |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| Dependency advisories | `@qdrant/js-client-rest` 1.19.0 pins `undici` 7.29.0, which has 10 advisories (fixed in 7.29.1). The client only uses plain HTTP to our own Qdrant, so exposure needs a hostile Qdrant server. An npm `overrides` entry was not applied by npm 11.5.2 in this workspace layout. | Upgrade the Qdrant client once it ships `undici` ≥ 7.29.1 (re-check `npm audit` in W4-07), or use a private network or mTLS to Qdrant | W1-04    |
| Database access       | LAN MongoDB (192.168.29.3) has no authentication and is shared with other projects; LAN Qdrant has no API key                                                                                                                                                                   | Dedicated, authenticated MongoDB (Atlas or managed) and Qdrant with API key and TLS, in a private network                             | W1-04    |

**Deferred by the owner (2026-10-05):** the `undici` advisory and LAN database authentication
(MongoDB without auth, Qdrant without API key) are accepted for now and revisited only if needed.
Docker Compose is not used for the time being; the app runs locally.

- **Turn lock (W2-08, ADR-010):** the one-turn-per-conversation lock is in process memory. Running
  several API instances needs a shared lock (MongoDB lease with expiry).
- **Rate limiting (W4-07):** in-memory limits per API process (login per IP, chat turns and
  uploads per user). Several instances, or a restart, reset them; production needs a shared limiter
  (Redis or a gateway) and per-tenant quotas.
- **CSRF (W4-07):** the `X-Requested-With: sd-web` header check plus SameSite=Lax cookies and a
  single allowed CORS origin. If the web app and API ever live on different sites, add CSRF tokens.
- **Uploads (W4-04, W4-07):** type, size, MIME, PDF magic bytes and UTF-8 checks; files parsed in
  memory and kept on the API host's disk (`data/uploads/`). Production needs malware scanning,
  sandboxed parsing and object storage.
- **Dependency audit (W4-07, 2026-10-14):** `multer` upgraded to 2.4.0 (fixes three advisories);
  the `undici` advisory above is unchanged (`npm audit fix --force` would downgrade the Qdrant
  client, a breaking change) and stays deferred.
- **Eval runs (W4-05):** the eval runner is a child process of one API instance; production would
  run evals as a separate job with its own credentials.
