# Private Claude artifact

Run `npm run artifact` after verification. The script builds the production application and inlines its JavaScript and CSS into:

`artifact/NASA-COSMOS-OPUS5-Claude-Artifact.html`

The `artifact/*.html` path is ignored by Git, so the private artifact cannot be included in a normal public commit.

## Artifact constraints

- Live NASA network access still depends on the host’s Content Security Policy and CORS support.
- The artifact disables service-worker registration because it has no companion `sw.js` file.
- A host that blocks WebGL 2 receives the HTML fallback and retains the data interface.
- A host that blocks downloads may preview exports but not save them automatically.

## Integrity check

The generator fails if the HTML still references local build assets. It uses the same tested bundle as GitHub Pages, preventing a separate hand-maintained implementation from drifting.
