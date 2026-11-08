# Security

EdgeLab is a research and simulation product. It must be safe to develop, deploy and show to strangers. This document records the controls in place, the review performed, and the checklist to repeat before each release.

## What the product refuses to do

- No wallets, private keys, seed phrases or exchange credentials, anywhere.
- No real-money transactions, order routing or broker integrations.
- No user-authored executable code. Strategies are Zod-validated data, and `eval`, `new Function`, dynamic `import()` of user input and template evaluation are never used.
- No AI-initiated shell, filesystem or network access. The optional AI layer receives a structured summary and returns a schema-validated object.
- No telemetry, analytics or third-party scripts.
- No API keys in the browser. The only `NEXT_PUBLIC_` variables are the optional site origin used for link previews and the optional Supabase URL and anon key, all of which are designed to be public.

## Controls

**Input validation.** Every request body and query string handled by a route handler is parsed with Zod before use (`src/lib/strategies/schema.ts`, `src/app/api/**`). Stored data is validated on read (`src/lib/store/local-store.ts`), so a tampered localStorage entry is dropped, not trusted. Shareable links are base64url with a strict character whitelist, a length cap and schema validation on decode (`src/lib/store/snapshot.ts`).

**Server boundary.** `src/lib/market/provider.ts` imports `server-only`, so a client import fails the build. Outbound fetches are restricted to pinned hosts (`eodhd.com`, `api.exchange.coinbase.com`) and the URL host is re-checked before each request. The EODHD token is read from `EODHD_API_TOKEN` on the server only and sent as a query parameter to that host over HTTPS. It never reaches the browser, the logs or the status API (which reports only whether a provider is configured).

**Provider licensing.** Twelve Data's free tier forbids displaying data to users and its ASX feed is a paid add-on, so it is not used. EODHD terms distinguish personal and commercial plans, so the operator must hold the plan that matches their use. Alpaca does not carry ASX data.

**Rate limiting.** Route handlers apply a best-effort in-memory token bucket keyed by client IP (`src/lib/server/rate-limit.ts`). On serverless this is per instance, which is adequate for abuse damping. A shared store can replace it without changing callers.

**Security headers.** Set in `next.config.ts`: Content-Security-Policy (self-only scripts, no inline event handlers, `frame-ancestors 'none'`), `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` denying camera, microphone, geolocation and payment, `X-Frame-Options: DENY`.

**Dependencies.** Minimal, established packages with a lockfile. `npm audit` is run before each release. Audit findings are recorded below with their disposition. `npm audit fix --force` is never run blindly.

**Secrets.** `.env*` is gitignored. `.env.example` documents every variable, and all of them are optional.

**Determinism as a control.** Because results are reproducible from inputs, a shared link cannot smuggle fabricated performance figures: the recipient's browser recomputes them.

## Dependency audit log

| Date | Finding | Severity | Disposition |
|------|---------|----------|-------------|
| 2026-11-07 | `minimatch` ReDoS (GHSA-g3hv-75wg-m249) via `eslint-config-next` → `typescript-eslint` | moderate (8 paths) | Dev-only lint toolchain, never shipped to users or run on untrusted input. The upstream fix requires a breaking downgrade of `eslint-config-next`. Accepted. Re-check on the next `eslint-config-next` release. |
| 2026-11-08 | `@anthropic-ai/sdk` added for the optional assistant layer | none reported | Official Anthropic package, server-only import, key via env. |

## Development tooling review

- **Impeccable** (design skill): official `pbakaus/impeccable` repository, single maintainer, Apache-2.0. The npm shim has no install scripts. The engine binary is downloaded from GitHub releases and verified against a checksum manifest shipped in the package. Installed as a project skill under `.claude/skills/impeccable`. The hook that runs the engine on every edit was **not** installed. The detector is run manually.
- **Vercel agent skills**: copied as plain Markdown from `vercel-labs/agent-skills` (MIT). No scripts, no network calls at use time beyond a documented fetch of Vercel's own guidelines page in `web-design-guidelines`.
- **ECC (Everything Claude Code)**: reviewed for workflow concepts only. Not installed: it is a large multi-harness plugin ecosystem with hooks and a commercial tier, and the built-in code-review and security-review skills cover the same loop.
- **StoicTradingAI, Zenith**: concepts only. Nothing cloned, installed, run or imported.

## Release checklist

- [ ] `npm run check` passes (typecheck, lint, unit tests) and `npm run test:e2e` passes.
- [ ] `npm audit` reviewed, with new high or critical findings resolved or dispositioned above.
- [ ] No new `NEXT_PUBLIC_` variables carrying secrets, and `.env.example` updated.
- [ ] Every new route handler validates input with Zod and applies the rate limiter.
- [ ] No new `dangerouslySetInnerHTML`, `eval`, `Function`, or dynamic import of user input (grep the diff).
- [ ] Security headers still present (`curl -I` against a preview deployment).
- [ ] Demo data remains labelled wherever it is displayed, and no simulated figure is presented as live.
- [ ] Shared links still validate on decode, and malformed links show the error state.
