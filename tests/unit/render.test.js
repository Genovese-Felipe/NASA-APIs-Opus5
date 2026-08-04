/**
 * Renderer tests that do not need a GPU.
 *
 * Everything here is pure maths or pure JavaScript: the camera, the projection,
 * the low-discrepancy sequence, the quality controller, the PNG encoder, and
 * the shader *source* (which can be checked for structural mistakes without
 * ever compiling it). The parts that genuinely need WebGL are covered by the
 * Playwright suite in tests/e2e.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { Camera, damp, multiply4, project } from '../../src/render/camera.js';
import { halton, MAX_BODIES, MAX_RINGS } from '../../src/render/raytracer.js';
import { QUALITY_PRESETS, QUALITY_BY_ID, AdaptiveScaler } from '../../src/render/quality.js';
import { crc32, encodePNG } from '../../src/render/png.js';
import { EXPORT_SIZES, EXPORT_FORMATS, formatBytes } from '../../src/render/export.js';
import { CANDIDATES, scaleBitrate, FPS_OPTIONS, BITRATE_PRESETS } from '../../src/render/recorder.js';
import { buildRaytraceShader } from '../../src/render/shaders/raytrace.glsl.js';
import { MATH, NOISE, COLOR, INTERSECT, SOFT_SHADOW } from '../../src/render/shaders/common.glsl.js';
import { ACCUMULATE_FS, BLOOM_DOWN_FS, BLOOM_UP_FS, COMPOSITE_FS, LINE_VS, LINE_FS, STAR_VS, STAR_FS } from '../../src/render/shaders/post.glsl.js';
import { buildScene } from '../../src/astro/ephemeris.js';
import { AU_KM } from '../../src/astro/constants.js';

describe('camera', () => {
  const scene = buildScene(2461256.5);

  test('sits at the requested distance from its focus', () => {
    const cam = new Camera();
    cam.focus = 'earth';
    cam.distanceRadii = 8;
    cam._distance = 8;
    cam.update(0, scene, null, 0);
    const earth = scene.byId.get('earth');
    const d = Math.hypot(
      cam.position[0] - earth.pos[0],
      cam.position[1] - earth.pos[1],
      cam.position[2] - earth.pos[2]
    );
    assert.ok(Math.abs(d / 6378.1366 - 8) < 0.01, `${(d / 6378.1366).toFixed(3)} radii`);
  });

  test('always looks at its focus', () => {
    const cam = new Camera();
    for (const id of ['sun', 'mars', 'saturn', 'triton']) {
      cam.focus = id;
      cam.yaw = 1.1;
      cam.pitch = 0.4;
      cam._yaw = 1.1;
      cam._pitch = 0.4;
      cam.update(0, scene, null, 0);
      const body = scene.byId.get(id);
      const toBody = [
        body.pos[0] - cam.position[0],
        body.pos[1] - cam.position[1],
        body.pos[2] - cam.position[2],
      ];
      const len = Math.hypot(...toBody);
      const dot = (toBody[0] * cam.forward[0] + toBody[1] * cam.forward[1] + toBody[2] * cam.forward[2]) / len;
      assert.ok(dot > 0.9999, `${id}: forward . toBody = ${dot}`);
    }
  });

  test('basis vectors are orthonormal', () => {
    const cam = new Camera();
    for (const pitch of [-1.5, -0.7, 0, 0.7, 1.5]) {
      cam.pitch = cam._pitch = pitch;
      cam.update(0, scene, null, 0);
      const { right: r, up: u, forward: f } = cam;
      for (const v of [r, u, f]) {
        assert.ok(Math.abs(Math.hypot(...v) - 1) < 1e-9, `not unit at pitch ${pitch}`);
      }
      assert.ok(Math.abs(dot3(r, u)) < 1e-9, 'right . up');
      assert.ok(Math.abs(dot3(r, f)) < 1e-9, 'right . forward');
      assert.ok(Math.abs(dot3(u, f)) < 1e-9, 'up . forward');
    }
  });

  test('roll rotates right and up without disturbing forward', () => {
    const cam = new Camera();
    cam.update(0, scene, null, 0);
    const forwardBefore = [...cam.forward];
    cam.roll = cam._roll = 0.6;
    cam.update(0, scene, null, 0);
    assert.ok(Math.abs(dot3(forwardBefore, cam.forward) - 1) < 1e-9, 'forward moved');
    assert.ok(Math.abs(dot3(cam.right, cam.up)) < 1e-9, 'basis no longer orthogonal');
  });

  test('zoom is multiplicative and clamped', () => {
    const cam = new Camera();
    cam.distanceRadii = 10;
    cam.zoom(100);
    assert.ok(cam.distanceRadii > 10, 'positive delta should move out');
    cam.zoom(-100);
    assert.ok(Math.abs(cam.distanceRadii - 10) < 0.01, 'should be reversible');
    for (let i = 0; i < 400; i++) cam.zoom(-1000);
    assert.ok(cam.distanceRadii >= 1.02, 'must not enter the body');
    for (let i = 0; i < 400; i++) cam.zoom(1000);
    assert.ok(cam.distanceRadii <= 4.0e7, 'must not run away');
  });

  test('pitch is clamped away from the poles', () => {
    const cam = new Camera();
    for (let i = 0; i < 200; i++) cam.drag(0, 100, 800);
    assert.ok(cam.pitch < Math.PI / 2, `pitch=${cam.pitch}`);
    for (let i = 0; i < 400; i++) cam.drag(0, -100, 800);
    assert.ok(cam.pitch > -Math.PI / 2, `pitch=${cam.pitch}`);
  });

  test('field of view is clamped to something usable', () => {
    const cam = new Camera();
    cam.setFov(0.001);
    assert.ok(cam.fov >= (3 * Math.PI) / 180);
    cam.setFov(500);
    assert.ok(cam.fov <= (110 * Math.PI) / 180);
  });

  test('camera-relative positions are in megametres', () => {
    const cam = new Camera();
    cam.focus = 'earth';
    cam.update(0, scene, null, 0);
    const earth = scene.byId.get('earth');
    const rel = cam.relative(earth.pos);
    const km = Math.hypot(
      earth.pos[0] - cam.position[0],
      earth.pos[1] - cam.position[1],
      earth.pos[2] - cam.position[2]
    );
    assert.ok(Math.abs(Math.hypot(...rel) - km / 1000) < 1e-3);
  });

  test('serialises and restores a view', () => {
    const cam = new Camera();
    cam.focus = 'titan';
    cam.distanceRadii = 12.5;
    cam.yaw = 1.2345;
    cam.pitch = -0.4;
    cam.setFov(33);
    const json = cam.toJSON();
    const restored = new Camera();
    restored.fromJSON(json);
    assert.equal(restored.focus, 'titan');
    assert.ok(Math.abs(restored.distanceRadii - 12.5) < 1e-3);
    assert.ok(Math.abs(restored.yaw - 1.2345) < 1e-4);
    assert.ok(Math.abs((restored.fov * 180) / Math.PI - 33) < 0.05);
  });

  test('fromJSON ignores rubbish', () => {
    const cam = new Camera();
    const before = cam.focus;
    cam.fromJSON(null);
    cam.fromJSON({ d: NaN, y: 'x', f: undefined });
    assert.equal(cam.focus, before);
    assert.ok(Number.isFinite(cam.distanceRadii));
  });

  test('damping approaches the target and never overshoots', () => {
    let v = 0;
    for (let i = 0; i < 200; i++) v = damp(v, 10, 1 / 60, 0.1);
    assert.ok(Math.abs(v - 10) < 1e-6, `${v}`);
    assert.equal(damp(3, 7, 0.016, 0), 7, 'zero half-life should snap');
    // Monotone approach, no overshoot.
    let prev = 0;
    let x = 0;
    for (let i = 0; i < 50; i++) {
      x = damp(x, 1, 1 / 60, 0.2);
      assert.ok(x >= prev && x <= 1, `overshoot at ${i}: ${x}`);
      prev = x;
    }
  });

  test('focusOn starts a transition that completes', () => {
    const cam = new Camera();
    cam.focus = 'earth';
    cam.update(0, scene, null, 0);
    cam.focusOn('mars', { duration: 1 });
    assert.equal(cam.focus, 'mars');
    for (let i = 0; i < 120; i++) cam.update(1 / 60, scene, null, 0);
    const mars = scene.byId.get('mars');
    const d = Math.hypot(
      cam.position[0] - mars.pos[0], cam.position[1] - mars.pos[1], cam.position[2] - mars.pos[2]
    );
    assert.ok(d / mars.radiusKm < 20, `ended ${(d / mars.radiusKm).toFixed(1)} radii away`);
  });
});

describe('projection', () => {
  test('matrix multiplication matches a hand-computed product', () => {
    const identity = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
    const m = new Float32Array([2, 0, 0, 0, 0, 3, 0, 0, 0, 0, 4, 0, 5, 6, 7, 1]);
    assert.deepEqual([...multiply4(identity, m)], [...m]);
    assert.deepEqual([...multiply4(m, identity)], [...m]);
  });

  test('projects the view axis to the centre of the frame', () => {
    const cam = new Camera();
    const scene = buildScene(2461256.5);
    cam.focus = 'earth';
    cam.update(0, scene, null, 0);
    const vp = cam.viewProjection(16 / 9);
    // A point straight ahead must land at the centre.
    const ahead = [cam.forward[0] * 100, cam.forward[1] * 100, cam.forward[2] * 100];
    const p = project(ahead, vp);
    assert.ok(p, 'should be in front of the camera');
    assert.ok(Math.abs(p.x) < 1e-5 && Math.abs(p.y) < 1e-5, `${p.x}, ${p.y}`);
  });

  test('returns null for a point behind the camera', () => {
    const cam = new Camera();
    const scene = buildScene(2461256.5);
    cam.update(0, scene, null, 0);
    const vp = cam.viewProjection(1);
    const behind = [-cam.forward[0] * 100, -cam.forward[1] * 100, -cam.forward[2] * 100];
    assert.equal(project(behind, vp), null);
  });

  test('respects the aspect ratio', () => {
    const cam = new Camera();
    const scene = buildScene(2461256.5);
    cam.update(0, scene, null, 0);
    const offset = (v, r, k) => [v[0] + r[0] * k, v[1] + r[1] * k, v[2] + r[2] * k];
    const base = [cam.forward[0] * 100, cam.forward[1] * 100, cam.forward[2] * 100];
    const wide = project(offset(base, cam.right, 10), cam.viewProjection(2));
    const square = project(offset(base, cam.right, 10), cam.viewProjection(1));
    assert.ok(Math.abs(wide.x) < Math.abs(square.x), 'a wider frame should place it nearer the centre');
  });
});

describe('sampling', () => {
  test('Halton stays in [0,1) and is well distributed', () => {
    for (const base of [2, 3, 5]) {
      const buckets = new Array(10).fill(0);
      for (let i = 1; i <= 1000; i++) {
        const v = halton(i, base);
        assert.ok(v >= 0 && v < 1, `base ${base} index ${i}: ${v}`);
        buckets[Math.floor(v * 10)]++;
      }
      // A low-discrepancy sequence should fill every decile almost evenly.
      for (const count of buckets) {
        assert.ok(count > 80 && count < 120, `base ${base} uneven: ${buckets.join(',')}`);
      }
    }
  });

  test('Halton produces the classic first values', () => {
    assert.ok(Math.abs(halton(1, 2) - 0.5) < 1e-12);
    assert.ok(Math.abs(halton(2, 2) - 0.25) < 1e-12);
    assert.ok(Math.abs(halton(3, 2) - 0.75) < 1e-12);
    assert.ok(Math.abs(halton(1, 3) - 1 / 3) < 1e-12);
  });
});

describe('quality tiers', () => {
  test('presets increase monotonically in cost', () => {
    for (let i = 1; i < QUALITY_PRESETS.length; i++) {
      const a = QUALITY_PRESETS[i - 1];
      const b = QUALITY_PRESETS[i];
      assert.ok(b.scatterSteps >= a.scatterSteps, `${b.id} scatter`);
      assert.ok(b.lightSteps >= a.lightSteps, `${b.id} light`);
      assert.ok(b.shadowBodies >= a.shadowBodies, `${b.id} shadows`);
      assert.ok(b.accumTarget >= a.accumTarget, `${b.id} accumulation`);
      assert.ok(b.resolutionScale >= a.resolutionScale, `${b.id} resolution`);
    }
  });

  test('presets stay inside the shader loop bounds', () => {
    for (const q of QUALITY_PRESETS) {
      assert.ok(q.scatterSteps <= 64, `${q.id} exceeds the scatter loop cap`);
      assert.ok(q.lightSteps <= 16, `${q.id} exceeds the light loop cap`);
      assert.ok(q.shadowBodies <= MAX_BODIES, `${q.id} exceeds MAX_BODIES`);
      assert.ok(QUALITY_BY_ID.get(q.id) === q);
      assert.ok(q.labelKey.startsWith('quality.'));
    }
  });

  test('adaptive scaler reduces resolution under load and recovers', () => {
    const s = new AdaptiveScaler({ targetFps: 60 });
    for (let i = 0; i < 40; i++) s.update(40, 0.04); // 25 fps
    assert.ok(s.scale < 1, `scale=${s.scale}`);
    const low = s.scale;
    s._cooldown = 0;
    for (let i = 0; i < 60; i++) s.update(5, 0.016); // 200 fps
    assert.ok(s.scale > low, 'should climb back');
    assert.ok(s.scale <= 1);
  });

  test('adaptive scaler ignores a single hitch', () => {
    const s = new AdaptiveScaler({ targetFps: 60 });
    for (let i = 0; i < 29; i++) s.update(12, 0.016);
    s.update(400, 0.016); // one very slow frame
    assert.equal(s.scale, 1, 'a single spike must not collapse the resolution');
  });

  test('scaler can be disabled and reset', () => {
    const s = new AdaptiveScaler();
    s.enabled = false;
    for (let i = 0; i < 40; i++) s.update(100, 0.1);
    assert.equal(s.scale, 1);
    s.enabled = true;
    for (let i = 0; i < 40; i++) s.update(100, 0.1);
    assert.ok(s.scale < 1);
    s.reset();
    assert.equal(s.scale, 1);
  });
});

describe('PNG encoder', () => {
  test('CRC-32 matches the reference value for "123456789"', () => {
    const bytes = new TextEncoder().encode('123456789');
    assert.equal(crc32(bytes), 0xcbf43926);
  });

  test('produces a structurally valid PNG', async () => {
    const w = 17;
    const h = 9;
    const px = new Uint8Array(w * h * 4);
    for (let i = 0; i < w * h; i++) {
      px[i * 4] = i % 256;
      px[i * 4 + 1] = (i * 7) % 256;
      px[i * 4 + 2] = (i * 13) % 256;
      px[i * 4 + 3] = 255;
    }
    const blob = await encodePNG(px, w, h, { dropAlpha: false });
    const buf = new Uint8Array(await blob.arrayBuffer());

    assert.deepEqual([...buf.slice(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const view = new DataView(buf.buffer);
    assert.equal(view.getUint32(0 + 8), 13, 'IHDR length');
    assert.equal(String.fromCharCode(...buf.slice(12, 16)), 'IHDR');
    assert.equal(view.getUint32(16), w);
    assert.equal(view.getUint32(20), h);
    assert.equal(buf[24], 8, 'bit depth');
    assert.equal(buf[25], 6, 'colour type RGBA');

    // Walk the chunk list and verify every CRC.
    let offset = 8;
    const types = [];
    while (offset < buf.length) {
      const length = view.getUint32(offset);
      const type = String.fromCharCode(...buf.slice(offset + 4, offset + 8));
      types.push(type);
      const expected = view.getUint32(offset + 8 + length);
      const actual = crc32(buf, offset + 4, offset + 8 + length);
      assert.equal(actual, expected, `${type} CRC`);
      offset += 12 + length;
    }
    assert.equal(offset, buf.length, 'chunks must exactly cover the file');
    assert.equal(types[0], 'IHDR');
    assert.equal(types[types.length - 1], 'IEND');
    assert.ok(types.includes('IDAT'));
  });

  test('dropAlpha writes an RGB PNG and is smaller', async () => {
    const w = 64;
    const h = 64;
    const px = new Uint8Array(w * h * 4).fill(200);
    const rgba = await encodePNG(px, w, h, { dropAlpha: false });
    const rgb = await encodePNG(px, w, h, { dropAlpha: true });
    const buf = new Uint8Array(await rgb.arrayBuffer());
    assert.equal(buf[25], 2, 'colour type RGB');
    assert.ok(rgb.size <= rgba.size, `${rgb.size} vs ${rgba.size}`);
  });

  test('writes tEXt metadata', async () => {
    const px = new Uint8Array(4 * 4 * 4).fill(128);
    const blob = await encodePNG(px, 4, 4, { text: { Software: 'ORRERY' } });
    const text = new TextDecoder('latin1').decode(new Uint8Array(await blob.arrayBuffer()));
    assert.ok(text.includes('tEXt'));
    assert.ok(text.includes('ORRERY'));
  });

  test('reports progress from 0 to 1', async () => {
    const px = new Uint8Array(32 * 32 * 4).fill(10);
    const seen = [];
    await encodePNG(px, 32, 32, { onProgress: (f) => seen.push(f) });
    assert.ok(seen.length > 0);
    assert.equal(seen[seen.length - 1], 1);
    assert.ok(seen.every((f) => f >= 0 && f <= 1));
  });
});

describe('export presets', () => {
  test('sizes are sane and include 4K and 8K', () => {
    const ids = EXPORT_SIZES.map((s) => s.id);
    assert.ok(ids.includes('4k'));
    assert.ok(ids.includes('8k'));
    const uhd = EXPORT_SIZES.find((s) => s.id === '4k');
    assert.equal(uhd.width, 3840);
    assert.equal(uhd.height, 2160);
    const uhd2 = EXPORT_SIZES.find((s) => s.id === '8k');
    assert.equal(uhd2.width, 7680);
    assert.equal(uhd2.height, 4320);
    for (const s of EXPORT_SIZES) {
      assert.ok(s.width >= 0 && s.height >= 0, s.id);
      assert.ok(s.label.length > 0, s.id);
    }
  });

  test('only PNG claims to work at any size', () => {
    for (const f of EXPORT_FORMATS) {
      assert.equal(f.anySize, f.id === 'png', `${f.id}`);
      assert.ok(f.mime.startsWith('image/'));
    }
  });

  test('formats bytes readably', () => {
    assert.equal(formatBytes(512), '512 B');
    assert.ok(formatBytes(2048).startsWith('2.0 KB'));
    assert.ok(formatBytes(5 * 1048576).startsWith('5.0 MB'));
    assert.ok(formatBytes(3 * 1073741824).startsWith('3.00 GB'));
  });
});

describe('video recording', () => {
  test('MP4 candidates are listed before WebM', () => {
    const firstWebm = CANDIDATES.findIndex((c) => c.container === 'webm');
    const lastMp4 = CANDIDATES.map((c) => c.container).lastIndexOf('mp4');
    assert.ok(lastMp4 < firstWebm, 'MP4 should be preferred where available');
  });

  test('every candidate has a well-formed mime type', () => {
    for (const c of CANDIDATES) {
      assert.ok(c.mime.startsWith('video/'), c.mime);
      assert.ok(['mp4', 'webm'].includes(c.container), c.container);
      assert.ok(c.label.length > 0);
    }
  });

  test('bitrate scales sub-linearly with pixel count', () => {
    const base = 16_000_000;
    const hd = scaleBitrate(base, 1920, 1080, 30);
    const uhd = scaleBitrate(base, 3840, 2160, 30);
    assert.ok(Math.abs(hd - base) / base < 0.02, `1080p should be the reference: ${hd}`);
    assert.ok(uhd > hd, '4K needs more');
    assert.ok(uhd < hd * 4, 'but not four times more');
    assert.ok(scaleBitrate(base, 1920, 1080, 60) > hd, 'higher frame rate needs more');
  });

  test('presets are ordered and plausible', () => {
    for (let i = 1; i < BITRATE_PRESETS.length; i++) {
      assert.ok(BITRATE_PRESETS[i].bps > BITRATE_PRESETS[i - 1].bps);
    }
    assert.ok(FPS_OPTIONS.includes(24) && FPS_OPTIONS.includes(60));
  });
});

describe('shader source', () => {
  const source = buildRaytraceShader({ maxBodies: MAX_BODIES, maxRings: MAX_RINGS });

  test('declares the right version and precision', () => {
    assert.ok(source.startsWith('#version 300 es'), 'must be GLSL ES 3.00');
    assert.ok(source.includes('precision highp float;'));
    assert.ok(source.includes('precision highp sampler2DArray;'));
  });

  test('injects the compile-time limits', () => {
    assert.ok(source.includes(`#define MAX_BODIES ${MAX_BODIES}`));
    assert.ok(source.includes(`#define MAX_RINGS  ${MAX_RINGS}`));
  });

  test('includes every shared chunk exactly once', () => {
    for (const [name, chunk] of Object.entries({ MATH, NOISE, COLOR, INTERSECT, SOFT_SHADOW })) {
      const marker = chunk.trim().split('\n').find((l) => l.includes('float ') || l.includes('const '));
      assert.ok(source.includes(marker), `${name} chunk missing`);
    }
    // A double include would be a link error; check one distinctive symbol.
    assert.equal(occurrences(source, 'float saturate(float x)'), 1);
    assert.equal(occurrences(source, 'uvec3 pcg3d('), 1);
  });

  test('uses no GLSL reserved words as identifiers', () => {
    // These bit us: `flat` is an interpolation qualifier, not a variable name.
    const reserved = ['flat', 'smooth', 'centroid', 'invariant', 'layout', 'sample', 'patch'];
    for (const word of reserved) {
      const declared = new RegExp(`\\b(float|int|vec[234]|mat[234]|bool)\\s+${word}\\b`);
      assert.ok(!declared.test(source), `"${word}" is used as an identifier`);
    }
  });

  test('has balanced braces and parentheses', () => {
    for (const [open, close] of [['{', '}'], ['(', ')'], ['[', ']']]) {
      assert.equal(
        occurrences(source, open), occurrences(source, close),
        `unbalanced ${open}${close}`
      );
    }
  });

  test('every loop is statically bounded', () => {
    // WebGL1 required this; WebGL2 does not, but an unbounded loop over a
    // uniform is still the fastest way to hang a driver. Every `for` here must
    // compare against a literal or a #define.
    const loops = [...source.matchAll(/for\s*\(([^)]*)\)/g)].map((m) => m[1]);
    assert.ok(loops.length > 5, 'expected several loops');
    for (const head of loops) {
      assert.ok(
        /<\s*(\d+|MAX_BODIES|MAX_RINGS)/.test(head) || /<=\s*\d+/.test(head),
        `unbounded loop: for(${head})`
      );
    }
  });

  test('declares every uniform the renderer sets', () => {
    const expected = [
      'uBodies', 'uSky', 'uRingLUT', 'uSurfaces', 'uBodyCount', 'uResolution',
      'uTileOrigin', 'uTileSize', 'uCamRight', 'uCamUp', 'uCamFwd', 'uTanHalfFov',
      'uJitter', 'uFrame', 'uTime', 'uSunPos', 'uSunRadius', 'uSunColor',
      'uRingRadii', 'uRingCount', 'uScatterSteps', 'uLightSteps', 'uShadowBodies',
      'uSurfaceDetail', 'uAmbient', 'uAuMm', 'uSunRadiance', 'uPointGain',
      'uBeaconGain', 'uPixelAngle', 'uShowRings', 'uShowAtmosphere', 'uShowStars',
      'uSkyGain', 'uRealisticBrightness',
    ];
    for (const name of expected) {
      assert.ok(new RegExp(`uniform\\s+\\w+\\s+${name}\\b`).test(source), `missing uniform ${name}`);
    }
  });

  test('clamps its output so the half-float target cannot overflow', () => {
    assert.ok(source.includes('clamp(color'), 'output must be clamped');
    assert.ok(source.includes('isnan(color)'), 'NaNs must be caught');
  });

  test('writes scene coverage to alpha for the star pass to blend against', () => {
    // The star pass occludes through the fixed-function blender, so a constant
    // alpha of 1.0 here would hide every star in the sky and a constant 0.0
    // would draw them through the planets.
    assert.ok(source.includes('saturate(cover)'), 'alpha must carry coverage');
    assert.ok(!/fragColor = vec4\(color, 1\.0\)/.test(source), 'alpha must not be constant');
    assert.ok(source.includes('cover = mix(cover, 1.0'), 'rings must contribute coverage');
    assert.ok(source.includes('cover = 1.0 - (1.0 - cover) * tr'), 'atmospheres must too');
  });

  test('sub-pixel bodies are hidden behind nearer geometry', () => {
    // Without this, a moon on the far side of its planet shines through it.
    assert.ok(source.includes('if (dist - R > bgT) continue;'));
  });

  test('the beacon boost is gated to genuinely unresolved bodies', () => {
    // The beacon is calibrated in stellar units. Applied to a body that is
    // about to become resolvable it is several hundred times too bright, and
    // bloom turns it into a searchlight the size of the planet it orbits.
    assert.ok(source.includes('pointLike'), 'gate is missing');
    assert.ok(source.includes('beacon * pointLike'), 'gate is not applied');
  });

  test('ringshine is weighted by what the rings actually reflect', () => {
    // rr.w is the system's area-weighted mean opacity. Without it, Jupiter's
    // gossamer rings — optical depth of order 1e-6, and invisible — threw a
    // bright band across the equator of the planet they orbit.
    assert.ok(source.includes('solid * rr.w'), 'ringshine ignores ring opacity');
    // And the falloff must be planet-radius over ring-radius, not the inverse:
    // rings further out subtend less sky from the surface, not more.
    assert.ok(source.includes('sq(b.radius / ringMid)'), 'ringshine falloff is inverted');
  });

  test('the star pass projects without a view-projection matrix', () => {
    // Stars are at infinity: the translation column is meaningless, and pushing
    // a unit vector out to a large radius only to divide it out again throws
    // away mantissa.
    assert.ok(!STAR_VS.includes('uViewProj'));
    assert.ok(STAR_VS.includes('uCamFwd') && STAR_VS.includes('uTanHalfFov'));
  });

  test('the star pass culls what is behind the camera', () => {
    // Dividing by a non-positive z projects a star behind you onto the screen.
    assert.ok(/z <= 1e-5/.test(STAR_VS), 'no guard on the forward component');
  });

  test('star sprite size does not follow the exposure gain', () => {
    // uGain carries a 1/exposure factor that swings four orders of magnitude.
    // Sizing from it inflates every star into a disc whenever exposure closes,
    // which is exactly when you least want it — approaching the Sun.
    const sizeLine = STAR_VS.split('\n').find((l) => l.includes('gl_PointSize = clamp'));
    assert.ok(sizeLine, 'point size is not computed');
    assert.ok(!sizeLine.includes('uGain'), 'point size depends on the exposure gain');
    assert.ok(sizeLine.includes('aTint.a'), 'point size should follow the star flux');
  });

  test('star sprites leave the coverage mask alone', () => {
    // Several stars can land on one pixel. If each wrote alpha, the second
    // would be occluded by the first.
    assert.ok(/fragColor = vec4\(vColor \* g, 0\.0\)/.test(STAR_FS));
  });

  test('post-processing shaders are all valid GLSL ES 3.00 headers', () => {
    for (const [name, src] of Object.entries({
      ACCUMULATE_FS, BLOOM_DOWN_FS, BLOOM_UP_FS, COMPOSITE_FS, LINE_VS, LINE_FS, STAR_VS, STAR_FS,
    })) {
      assert.ok(src.startsWith('#version 300 es'), `${name} version`);
      assert.ok(src.includes('precision'), `${name} precision`);
      for (const [open, close] of [['{', '}'], ['(', ')']]) {
        assert.equal(occurrences(src, open), occurrences(src, close), `${name} unbalanced ${open}`);
      }
    }
  });

  test('the bloom upsample relies on blending, not on reading its target', () => {
    // Sampling and writing the same texture in one draw is undefined; the
    // upsample must therefore not declare a uTarget sampler.
    assert.ok(!BLOOM_UP_FS.includes('uTarget'), 'upsample must not read its destination');
  });

  test('no template literal is accidentally terminated', () => {
    // Backticks inside a GLSL comment end the JavaScript template string, which
    // is a syntax error that only shows up at import time.
    for (const src of [source, ACCUMULATE_FS, BLOOM_DOWN_FS, BLOOM_UP_FS, COMPOSITE_FS, LINE_VS, LINE_FS, STAR_VS, STAR_FS]) {
      assert.ok(!src.includes('`'), 'shader source contains a backtick');
    }
  });
});

/** @param {string} haystack @param {string} needle */
function occurrences(haystack, needle) {
  let count = 0;
  let i = 0;
  for (;;) {
    i = haystack.indexOf(needle, i);
    if (i === -1) break;
    count++;
    i += needle.length;
  }
  return count;
}

/** @param {ArrayLike<number>} a @param {ArrayLike<number>} b */
function dot3(a, b) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}
