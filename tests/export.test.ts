import { describe, expect, it } from 'vitest';
import { canSafelyEncode, chooseRecordingMime, safeFilename } from '../src/export';

describe('capture compatibility', () => {
  it('prefers MP4/H.264 when the browser supports it', () => {
    const supported = new Set(['video/mp4;codecs=avc1.42E01E', 'video/webm']);
    expect(chooseRecordingMime((mime) => supported.has(mime))).toBe('video/mp4;codecs=avc1.42E01E');
  });

  it('falls back to widely supported WebM', () => {
    expect(chooseRecordingMime((mime) => mime === 'video/webm;codecs=vp8')).toBe('video/webm;codecs=vp8');
  });

  it('sanitizes export names', () => expect(safeFilename('NASA COSMOS / OPUS 5: Earth')).toBe('NASA-COSMOS-OPUS-5-Earth'));

  it('allows standard 8K but rejects larger unsafe frames', () => {
    expect(canSafelyEncode(7680, 4320)).toBe(true);
    expect(canSafelyEncode(10_000, 10_000)).toBe(false);
  });
});
