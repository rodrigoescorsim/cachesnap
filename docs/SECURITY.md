# Security

## Current posture

Security headers score: **9/9** (verified via CacheSnap self-monitoring).

Headers managed by Vercel (injected at edge): `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`.

Headers managed by Next.js (`next.config.ts`): `HSTS`, `CSP`, `Permissions-Policy`, `COOP`, `COEP`, `CORP`.

> Note: HSTS is managed by Next.js explicitly because Vercel does not inject it consistently across all probe regions.

---

## What each header does and why it matters

Each header is an instruction the server sends to the visitor's browser. Without them, the browser acts in its most permissive mode — any site can try to abuse that.

**HSTS**
Without it: the browser may try `http://cachesnap.com` before redirecting to HTTPS — an attacker can intercept the connection in that window.
With it: the browser never attempts HTTP, goes straight to HTTPS.

**CSP (Content Security Policy)**
Without it: if someone injects a malicious script into the page (XSS), the browser executes it without question.
With it: the browser only runs scripts and styles that came from our own domain or Google (One Tap). Content injected from anywhere else is blocked.

Current allowlist beyond `'self'`:
- `script-src`: `https://accounts.google.com` (Google One Tap JS)
- `style-src`: `https://accounts.google.com` (Google One Tap CSS, injected by the GSI library)
- `connect-src`, `frame-src`, `form-action`: `https://accounts.google.com`
- `img-src`: `https://www.google.com` (Google profile avatars shown in One Tap prompt)
- `script-src` dev-only: `'unsafe-eval'` (Next.js call-stack reconstruction in development)

**X-Frame-Options**
Without it: any site can embed cachesnap.com inside an invisible `<iframe>` and trick users into clicking buttons without realizing it (clickjacking).
With it: only cachesnap.com itself can frame its own pages.

**X-Content-Type-Options**
Without it: the browser may "guess" a file's type and execute as a script something that shouldn't be a script.
With it: the browser trusts only the type declared by the server.

**Referrer-Policy**
Without it: when a user clicks an external link, the full page URL (including parameters) is sent to the destination site.
With it: only the domain is sent — no paths or parameters leak.

**Permissions-Policy**
Without it: any script on the page could attempt to access the camera, microphone, or geolocation.
With it: the browser refuses those accesses before a script even asks.

**COOP / COEP / CORP** (the three together)
Without them: pages from other sites open in the same browser can attempt to read data from our process memory (Spectre/Meltdown-style attacks via JavaScript).
With them: the browser isolates cachesnap.com in its own memory process — other sites cannot see anything happening inside it.

---

## Known debt

### CSP: `unsafe-inline` in `script-src`

**Status:** Open  
**Priority:** Low (no active threat vector identified)

The current `Content-Security-Policy` includes `'unsafe-inline'` in `script-src`, which allows arbitrary inline scripts to execute. This reduces XSS protection because a successful injection could run inline code without CSP blocking it.

**Root cause:** Next.js App Router injects inline scripts during hydration. Without a per-request nonce, `'unsafe-inline'` is required.

**Recommended fix:** Implement CSP nonces via Next.js Middleware. On each request, Middleware generates a cryptographic nonce, sets it on the `Content-Security-Policy` header, and passes it to the `<Script>` components via headers or a custom context. Replace `'unsafe-inline'` with `'nonce-{value}'` in `script-src`.

Reference: https://nextjs.org/docs/app/guides/content-security-policy

### Google One Tap: FedCM console errors in production

**Status:** Accepted  
**Priority:** Info only (no security impact)

Google One Tap uses FedCM (Federated Credential Management) to silently authenticate users. FedCM fails — and logs `[GSI_LOGGER]: FedCM get() rejects with NetworkError` — whenever the visiting browser has no active Google session. This is expected behavior; the One Tap prompt simply does not appear.

**Impact on Lighthouse Best Practices:** Causes score of 96/100 ("Browser errors were logged to the console"). Not a SEO or security issue.

**Mitigation in place:** `google-one-tap.tsx` guards initialization with `window.location.protocol !== 'https:'` so One Tap never fires on localhost, preventing errors during development.
