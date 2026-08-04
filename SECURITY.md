# Security

## Reporting a vulnerability

Please report security issues **privately**, through
[GitHub's private vulnerability reporting](https://github.com/Genovese-Felipe/NASA-APIs-Opus5/security/advisories/new),
rather than in a public issue.

You can expect an acknowledgement within a few days and an assessment shortly
after.

## What this application is, from a security point of view

ORRERY is a **static site**. There is no server, no database, no authentication,
no user accounts and no persistent state outside your own browser. That removes
most of the attack surface a web application usually has, but not all of it.

### Your NASA API key

If you enter a personal `api.nasa.gov` key it is stored in `localStorage` in your
browser. Specifically:

- it is **never sent anywhere except `api.nasa.gov`**;
- it is **redacted from every error message and log line** the application can
  produce (see `redact()` in `src/data/client.js`);
- it is **never committed** — the repository contains no key, and none is needed
  to run or deploy the site.

A NASA API key is a rate-limit token, not a credential: it grants access to
public data and nothing else. Leaking one costs you your quota, which resets
hourly. It is not a secret worth much, but it is treated carefully anyway.

To remove it, use **Use DEMO_KEY** in the Data Health panel, or clear site data.

### Content Security Policy

The page ships a restrictive CSP as a `<meta>` tag, since GitHub Pages cannot set
headers:

- `default-src 'none'` — nothing is allowed by default.
- `script-src 'self'` — no inline scripts, no CDNs, no `eval`.
- `connect-src` — an explicit allowlist of exactly the NASA hosts the app
  contacts, cross-checked against `src/data/registry.js` by the linter.
- `object-src 'none'`, `base-uri 'none'`, `form-action 'none'`.

`style-src` permits `'unsafe-inline'`, which is needed to position 3D labels
over the canvas every frame. That is the one relaxation, and it is a positioning
transform rather than author-controlled content.

### Untrusted input

Every string that arrives from a NASA service is inserted as **text**, never as
markup. `innerHTML` is banned outside one documented helper, and the linter
fails the build if it reappears. Translation catalogues likewise cannot
introduce elements: there is no markup-bearing message variant.

### Dependencies

The application has **no runtime dependencies at all** — no framework, no
libraries, no CDN. The only dependency in `package.json` is Playwright, used for
testing, and it never ships.

That is the strongest supply-chain position available to a web application, and
it is a deliberate choice rather than an accident.

## Out of scope

- Vulnerabilities in NASA's services. Report those to NASA.
- Issues requiring physical access to a user's device.
- Rate-limit exhaustion of the shared `DEMO_KEY`; that is a documented property
  of NASA's free tier, not a defect.
