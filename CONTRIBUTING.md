# Contributing

Thank you for considering it. This document covers what you need to know to make
a change that will be merged.

## Getting set up

```bash
git clone https://github.com/Genovese-Felipe/NASA-APIs-Opus5.git
cd NASA-APIs-Opus5
npm install          # only needed for the tests
npm run dev          # http://localhost:8080
```

There is no build step. Edit a file under `src/`, reload the page, see the
change. That is deliberate and worth preserving — see
[`docs/architecture.md`](docs/architecture.md#why-no-build-step).

## Before you open a pull request

```bash
npm run check        # lint, locales, scientific data, unit tests
npm run test:e2e     # browser tests (slower; needs Chromium)
```

`npm run check` is what CI runs first and is usually enough. The end-to-end
suite takes several minutes because it renders real frames on a software
rasteriser.

## The rules that actually get enforced

The linter fails the build on these, so it is worth knowing them up front.

**No root-absolute paths.** The site is served from `/NASA-APIs-Opus5/`, so
`src="/src/main.js"` works locally and 404s in production. Everything is
relative.

**No `innerHTML`.** Use the helpers in `src/ui/dom.js`. API responses are
untrusted text, and the Content Security Policy is strict on purpose.

**No backticks inside GLSL.** The shaders are JavaScript template literals, so a
backtick in a GLSL comment silently terminates the string and produces a
baffling parse error. This has happened; the linter now catches it.

**Every fetched host must be in the CSP.** `index.html` carries a
`connect-src` list, and the linter cross-checks it against `data/registry.js`.
If you add a service, add the host.

**No English left in a non-English catalogue.** Add your string to
`src/ui/locales/en.js` first; `tools/validate-locales.mjs` will then tell every
other locale it is missing.

## Adding a string

1. Add the key to `src/ui/locales/en.js`. Keys are flat and dotted:
   `area.thing.detail`.
2. Run `node tools/validate-locales.mjs`. It will list the nine catalogues that
   now lack it.
3. Add it to each. If you do not speak the language, say so in the pull request
   and leave the English in place with a `TODO` — a visibly untranslated string
   is much better than a missing one, and someone will fix it.

**Plurals** use CLDR categories as key suffixes:

```js
'unit.days.one':   '{n} day',
'unit.days.other': '{n} days',
```

Russian needs `.one`, `.few`, `.many` and `.other`; Arabic needs all six
categories; Chinese, Japanese and Korean need only `.other` but should still
carry `.one` so the key sets match. The validator checks this against
`Intl.PluralRules` for each language, so you do not have to remember.

## Adding a NASA service

1. **Probe it first**, and record what you find:

   ```bash
   curl -sS -o /dev/null -D - -H "Origin: https://x.github.io" "https://…"
   ```

   No `Access-Control-Allow-Origin` means a browser cannot read it, whatever
   `curl` shows you.

2. Add an entry to `src/data/registry.js` with `access: 'browser'` or
   `'snapshot'`, a real `docs` URL, a one-line `blurb`, and — this is the
   valuable part — a `notes` field recording anything that cost you time. The
   registry is the project's institutional memory about these services.

3. If it is `browser`, add the host to the CSP in `index.html`. If it is
   `snapshot`, add a source function to `tools/fetch-snapshots.mjs`.

4. Write an adapter in `src/data/nasa.js` that returns a shape the interface can
   render without knowing the wire format.

5. Add a test to `tests/unit/data.test.js` with a stubbed response.

## Adding scientific data

Every number in `src/astro/` comes from a primary source, and the file header
says which. If you add or change one:

- **Cite it in the module's header comment.** Not "NASA" — the actual table.
- **Do not round for convenience.** Transcribe what is published.
- **Run `node tools/validate-data.mjs`.** It cross-checks new numbers against
  physics: density from mass and radius, orbital periods from Kepler's third
  law, satellites inside the Hill sphere and outside the Roche limit. It has
  already caught two real modelling errors, so if it complains, read it
  carefully before assuming it is wrong.

## Working on the renderer

The shaders live in `src/render/shaders/` as JavaScript template literals. A few
things learned the hard way:

- **`flat` is a reserved word in GLSL ES 3.00** (it is an interpolation
  qualifier). So are `smooth`, `centroid`, `sample` and `patch`. The unit tests
  check for these.
- **Beware `acos` near ±1.** Its derivative is infinite there, so a quantity
  like `N·V` at the centre of a lit disc will produce visible banding. There is
  usually a formulation in terms of the cosines you already have.
- **Never sample a texture you are writing to.** Use the fixed-function blender.
- **Anything that varies per pixel and per frame gets averaged away** by the
  accumulation pass — which makes jittered ray marching essentially free and is
  the right fix for stepping artefacts.
- **Post-processing must be a function of the full image**, not of the render
  target, or high-resolution exports get seams. Vignette and chromatic
  aberration both take a tile offset for this reason.

After a renderer change, regenerate the documentation imagery so the docs stay
honest:

```bash
node tools/capture-screenshots.mjs
```

## Commit messages

```
area: what changed

Why it changed, if that is not obvious. Wrap at 72 columns.
```

Areas in use: `render`, `astro`, `data`, `ui`, `i18n`, `docs`, `tools`, `ci`,
`test`.

## What makes a good pull request

- **One thing.** A renderer fix and a translation update are two pull requests.
- **A test, if the change is testable.** Most are.
- **A screenshot, if the change is visual.** Before and after.
- **An honest description of what you are unsure about.** That is more useful
  than confidence.

## Code of conduct

By participating you agree to the [Code of Conduct](CODE_OF_CONDUCT.md).

## Licence

Contributions are accepted under the [MIT licence](LICENSE).
