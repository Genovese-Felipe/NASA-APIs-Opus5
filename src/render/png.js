/**
 * A PNG encoder that never touches a canvas.
 *
 * WHY NOT `canvas.toBlob()`?
 *
 * Because it cannot do 8K. Every browser caps the total area of a canvas
 * backing store — Safari most aggressively (around 16.7 megapixels on iOS, and
 * a hard memory ceiling on desktop), Chrome and Firefox somewhat higher. A
 * 7680x4320 image is 33.2 megapixels, so `getContext('2d')` on a canvas that
 * size either returns null or silently gives you a blank bitmap. Exporting 8K
 * through a canvas is simply not possible.
 *
 * Encoding the PNG ourselves sidesteps the problem entirely: the pixels never
 * live in a canvas, only in a typed array we already have from `readPixels`.
 * The compression is done by `CompressionStream('deflate')`, which is exactly
 * the zlib format PNG's IDAT chunk requires (RFC 1950 — note that
 * `'deflate-raw'` is *not* what PNG wants), and it runs off the main thread in
 * the browser's own implementation.
 *
 * @module render/png
 */

/** Precomputed CRC-32 table (IEEE 802.3 polynomial, as PNG specifies). */
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

/**
 * CRC-32 over a byte range.
 * @param {Uint8Array} bytes
 * @param {number} [start=0]
 * @param {number} [end=bytes.length]
 * @returns {number}
 */
export function crc32(bytes, start = 0, end = bytes.length) {
  let c = 0xffffffff;
  for (let i = start; i < end; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/**
 * Build one PNG chunk: length, type, data, CRC.
 * @param {string} type Four ASCII characters.
 * @param {Uint8Array} data
 * @returns {Uint8Array}
 * @private
 */
function chunk(type, data) {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  view.setUint32(8 + data.length, crc32(out, 4, 8 + data.length));
  return out;
}

/**
 * Apply PNG filter type 1 ("Sub") to a scanline.
 *
 * PNG allows a per-scanline filter, and choosing a good one is most of what
 * separates a 40 MB export from a 12 MB one. Sub — each byte minus the byte
 * one pixel to the left — is a strong general choice for photographic content
 * with smooth horizontal gradients, which is what a rendered planet is, and it
 * costs one subtraction per byte. Adaptive filtering would compress a little
 * better and cost several passes over 33 megapixels; this is the right trade.
 * @private
 */
function filterSub(src, srcOffset, dst, dstOffset, width, channels) {
  const stride = width * channels;
  // The first pixel has no left neighbour.
  for (let c = 0; c < channels; c++) dst[dstOffset + c] = src[srcOffset + c];
  for (let i = channels; i < stride; i++) {
    dst[dstOffset + i] = (src[srcOffset + i] - src[srcOffset + i - channels]) & 0xff;
  }
}

/**
 * Encode RGBA (or RGB) pixels as a PNG.
 *
 * @param {Uint8Array|Uint8ClampedArray} pixels Tightly packed, row 0 at the top.
 * @param {number} width
 * @param {number} height
 * @param {object} [opts]
 * @param {3|4} [opts.channels=4]
 * @param {boolean} [opts.dropAlpha=false] Write an RGB PNG from RGBA input,
 *   which removes a quarter of the bytes for an image that has no transparency.
 * @param {Record<string,string>} [opts.text] tEXt chunks (metadata).
 * @param {(fraction:number)=>void} [opts.onProgress]
 * @returns {Promise<Blob>}
 */
export async function encodePNG(pixels, width, height, opts = {}) {
  const inChannels = opts.channels ?? 4;
  const outChannels = opts.dropAlpha ? 3 : inChannels;
  const colorType = outChannels === 4 ? 6 : 2; // 6 = RGBA, 2 = RGB

  // Filtered scanlines: one filter byte per row, then the row's bytes.
  const rowBytes = width * outChannels;
  const raw = new Uint8Array((rowBytes + 1) * height);

  if (outChannels === inChannels) {
    for (let y = 0; y < height; y++) {
      const dst = y * (rowBytes + 1);
      raw[dst] = 1; // filter: Sub
      filterSub(pixels, y * rowBytes, raw, dst + 1, width, outChannels);
      if (opts.onProgress && (y & 255) === 0) opts.onProgress((y / height) * 0.4);
    }
  } else {
    // Repack RGBA -> RGB while filtering, to avoid a second full-size buffer.
    const rowIn = new Uint8Array(rowBytes);
    for (let y = 0; y < height; y++) {
      const srcRow = y * width * inChannels;
      for (let x = 0; x < width; x++) {
        rowIn[x * 3] = pixels[srcRow + x * 4];
        rowIn[x * 3 + 1] = pixels[srcRow + x * 4 + 1];
        rowIn[x * 3 + 2] = pixels[srcRow + x * 4 + 2];
      }
      const dst = y * (rowBytes + 1);
      raw[dst] = 1;
      filterSub(rowIn, 0, raw, dst + 1, width, 3);
      if (opts.onProgress && (y & 255) === 0) opts.onProgress((y / height) * 0.4);
    }
  }

  const compressed = await deflate(raw, (f) => opts.onProgress?.(0.4 + f * 0.55));

  const ihdr = new Uint8Array(13);
  const iv = new DataView(ihdr.buffer);
  iv.setUint32(0, width);
  iv.setUint32(4, height);
  ihdr[8] = 8; // bit depth
  ihdr[9] = colorType;
  ihdr[10] = 0; // compression: deflate
  ihdr[11] = 0; // filter method: adaptive
  ihdr[12] = 0; // interlace: none

  /** @type {BlobPart[]} */
  const parts = [
    new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
  ];

  for (const [key, value] of Object.entries(opts.text || {})) {
    parts.push(chunk('tEXt', textChunk(key, value)));
  }

  parts.push(chunk('IDAT', compressed), chunk('IEND', new Uint8Array(0)));
  opts.onProgress?.(1);
  return new Blob(parts, { type: 'image/png' });
}

/**
 * A tEXt chunk: Latin-1 keyword, NUL, Latin-1 text. Characters outside Latin-1
 * are dropped rather than mangled — the alternative (iTXt with UTF-8) is more
 * machinery than metadata warrants here.
 * @private
 */
function textChunk(keyword, text) {
  const latin1 = (s) => {
    const out = [];
    for (const ch of String(s)) {
      const c = ch.codePointAt(0);
      if (c >= 32 && c <= 255 && c !== 127) out.push(c);
    }
    return out;
  };
  const k = latin1(keyword).slice(0, 79);
  const v = latin1(text);
  return new Uint8Array([...k, 0, ...v]);
}

/**
 * zlib-compress with the platform's own implementation.
 * @param {Uint8Array} bytes
 * @param {(fraction:number)=>void} [onProgress]
 * @returns {Promise<Uint8Array>}
 * @private
 */
async function deflate(bytes, onProgress) {
  if (typeof CompressionStream === 'undefined') {
    // Stored (uncompressed) deflate blocks wrapped in a zlib header. Larger,
    // but a valid PNG, and this path only runs on browsers old enough that the
    // user has bigger problems.
    return storedZlib(bytes);
  }
  const cs = new CompressionStream('deflate');
  const writer = cs.writable.getWriter();
  const reader = cs.readable.getReader();

  /** @type {Uint8Array[]} */
  const chunks = [];
  let total = 0;

  const pump = (async () => {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      chunks.push(value);
      total += value.length;
    }
  })();

  // Feed in slices so the browser can interleave compression with the read
  // loop and so progress can be reported on a large image.
  const SLICE = 4 << 20;
  for (let off = 0; off < bytes.length; off += SLICE) {
    await writer.write(bytes.subarray(off, Math.min(off + SLICE, bytes.length)));
    onProgress?.(Math.min(1, (off + SLICE) / bytes.length));
  }
  await writer.close();
  await pump;

  const out = new Uint8Array(total);
  let o = 0;
  for (const c of chunks) {
    out.set(c, o);
    o += c.length;
  }
  return out;
}

/**
 * Adler-32, the checksum zlib appends.
 * @private
 */
function adler32(data) {
  let a = 1;
  let b = 0;
  for (let i = 0; i < data.length; i++) {
    a = (a + data[i]) % 65521;
    b = (b + a) % 65521;
  }
  return ((b << 16) | a) >>> 0;
}

/** @private */
function storedZlib(data) {
  const blocks = Math.ceil(data.length / 65535) || 1;
  const out = new Uint8Array(2 + data.length + blocks * 5 + 4);
  out[0] = 0x78;
  out[1] = 0x01;
  let o = 2;
  let p = 0;
  for (let i = 0; i < blocks; i++) {
    const len = Math.min(65535, data.length - p);
    const last = i === blocks - 1 ? 1 : 0;
    out[o++] = last;
    out[o++] = len & 0xff;
    out[o++] = (len >> 8) & 0xff;
    out[o++] = ~len & 0xff;
    out[o++] = (~len >> 8) & 0xff;
    out.set(data.subarray(p, p + len), o);
    o += len;
    p += len;
  }
  const view = new DataView(out.buffer);
  view.setUint32(o, adler32(data));
  return out.subarray(0, o + 4);
}
