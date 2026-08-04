# Quality plan and evidence

## Automated gates

`npm test` covers:

- APOD validation and attribution preservation;
- NeoWs numeric-unit normalization;
- EONET geometry selection;
- DONKI event merge and time ordering;
- NASA Library Collection+JSON parsing;
- TTL caching and stale-on-error recovery;
- structural completeness of all nine languages;
- MP4 preference and WebM fallback;
- safe filenames and output-size guardrails.

`npm run build` adds:

- strict TypeScript checking;
- optimized production bundling;
- relative-path validation for GitHub Pages;
- required shell-asset checks;
- bundle-size sanity checks;
- API-key leakage checks.

## Manual release checklist

### Rendering

- [ ] WebGL 2 initializes without a shader compile/link error.
- [ ] All five scenes are visually distinct.
- [ ] Drag, wheel, touch drag, and pinch adjust the camera.
- [ ] Orbit mode, speed, inclination, and pause affect motion.
- [ ] Context loss results in recovery or an honest fallback.

### Data

- [ ] Each API can fail independently without a blank screen.
- [ ] Live/cache/demo badges match the envelope.
- [ ] EONET coordinates create surface beacons.
- [ ] Archive text is inserted with `textContent`, not HTML.
- [ ] JPL SSD sources remain deep links only.

### Capture

- [ ] PNG, JPEG, and WebP downloads have correct MIME bytes and extension.
- [ ] 4K output reports 3840 × 2160.
- [ ] 8K output reports 7680 × 4320 on a capable device.
- [ ] Tiled output has no projection seams.
- [ ] Recording uses MP4 only when genuinely supported; otherwise WebM.
- [ ] Sonification can be included without stopping the main audio graph.

### UX and accessibility

- [ ] Keyboard reaches every control and dialog.
- [ ] Focus is visible.
- [ ] Reduced motion disables automated camera movement.
- [ ] Mobile controls remain at least 42 × 42 CSS pixels.
- [ ] Arabic switches the document to RTL.
- [ ] Live status changes are announced without flooding assistive technology.

## Known environment-sensitive tests

Native 8K encoding and MP4 recording depend on browser, GPU, available memory, and operating-system codecs. The application capability-detects these paths at runtime; CI cannot guarantee device codec availability.

## Performance budget

| Asset | Budget |
| --- | ---: |
| First-party JavaScript, gzip | 50 KB |
| First-party CSS, gzip | 10 KB |
| Bundled raster imagery | 0 KB |
| Third-party runtime libraries | 0 |

Remote NASA imagery is loaded only inside data cards and archive results.
