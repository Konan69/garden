# Auth & Access

## Active gaps

| Issue                | Gap                                                                                                                                                                    | Evidence                                                                                      | Priority |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | -------- |
| Security remediation | Every permission change must be checked on the server. This closes when tests prove unauthorized roles are rejected and authorized roles still work.                   | Security review and permission-route integration tests; exploit details follow `SECURITY.md`. | Critical |
| FLO-30               | Garden checks workspace access in application code, but it still needs one complete test suite proving one workspace cannot reach another through any product surface. | `resolveWorkspaceId()` and workspace-scoped service queries; `docs/core/technical.md` sec. 11 | High     |

## Done

| Item                                                  | Evidence                                                                                                                                                                                                                                                                     |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Better Auth origin and CSRF checks explicitly enabled | `apps/web/src/lib/auth/instance.ts` sets `disableCSRFCheck: false` and `disableOriginCheck: false`; focused tests cover trusted, foreign, missing, and `null` origins. Garden-owned APIs retain their existing cookie policy; no custom global origin middleware is planned. |
| Workspace membership validation                       | `resolveWorkspaceId()` validates membership through workspace-scoped queries in `apps/web/src/lib/server/control-plane.ts`.                                                                                                                                                  |

## Deferred

| Feature                        | Target |
| ------------------------------ | ------ |
| Enterprise SSO (SAML/Okta)     | v2+    |
| RBAC beyond owner/admin/member | v2+    |
