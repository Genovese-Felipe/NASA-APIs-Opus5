# Accessibility

## Supported interaction modes

- Mouse: buttons, drag rotation, wheel zoom.
- Touch: 42–53 px primary controls, drag rotation, two-pointer pinch zoom.
- Keyboard: standard tab order plus arrow navigation and documented shortcuts.
- Reduced motion: operating-system preference is detected; a persistent local override is available.
- Screen readers: landmarks, descriptive button names, dialog headings, form labels, live status regions, and source-image alternative text.

## Visual considerations

- The product uses true near-black backgrounds without relying on black-on-black distinctions.
- Core text meets a high-contrast target; muted metadata is not used for required actions.
- Live/cache/demo state is conveyed by both text and color.
- Focus has a two-pixel cyan outline with offset.
- The WebGL canvas has an accessible description and all functionality has HTML controls.

## Localization

Nine interface dictionaries share one TypeScript key contract and one automated completeness test. NASA source titles and explanations are preserved as issued rather than machine-translated without attribution. Arabic sets `dir="rtl"`; the layout mirrors primary panels.

## Limits

The computational canvas is visually dense. The adjacent data panel provides a text equivalent for the active data scene, but it is not a pixel-by-pixel description of the procedural rendering.
