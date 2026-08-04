/**
 * Video capture.
 *
 * TWO MODES, FOR TWO DIFFERENT JOBS
 *
 *  - **Live recording** captures exactly what is on screen, in real time, via
 *    `canvas.captureStream()` and `MediaRecorder`. It is the right tool for
 *    "record what I am doing", and it can include the generative soundscape.
 *
 *  - **Offline rendering** drives the simulation frame by frame at a fixed
 *    timestep, waits for each frame to reach its sample target, and pushes it
 *    into the stream with `requestFrame()`. The result is a perfectly smooth
 *    clip at a chosen frame rate and quality *regardless of how fast the
 *    machine actually renders* — a five-second orbit at 60 fps looks identical
 *    on a laptop and a workstation, the laptop just takes longer to produce it.
 *    This is how the "record a full orbit" button works.
 *
 * THE MP4 QUESTION, ANSWERED HONESTLY
 *
 * `MediaRecorder` cannot produce MP4 everywhere. Support as of 2026:
 *
 *   Safari            MP4 with H.264 — yes, and it is the *only* thing it does
 *   Chrome / Edge     MP4 with H.264 since v130ish; WebM/VP9 and VP8 always
 *   Firefox           WebM only (VP8/VP9 + Opus); no MP4 from MediaRecorder
 *
 * So the recorder probes `MediaRecorder.isTypeSupported` at run time, prefers
 * MP4 when it is genuinely available, and otherwise records WebM — which every
 * modern browser plays, every video editor imports, and `ffmpeg -c copy`
 * remuxes into MP4 without re-encoding. The UI says which one it is using and
 * why, rather than promising MP4 and delivering a file that will not open.
 *
 * @module render/recorder
 */

/**
 * Candidate containers and codecs, best first.
 *
 * H.264 in MP4 leads because it is the format that plays everywhere with no
 * explanation required. AV1 sits above VP9 in the WebM group because when a
 * browser offers it the quality per bit is markedly better.
 * @type {ReadonlyArray<{mime:string, container:'mp4'|'webm', codec:string, label:string}>}
 */
export const CANDIDATES = Object.freeze([
  { mime: 'video/mp4;codecs=avc1.640033', container: 'mp4', codec: 'H.264 High', label: 'MP4 (H.264)' },
  { mime: 'video/mp4;codecs=avc1.42E01E', container: 'mp4', codec: 'H.264 Baseline', label: 'MP4 (H.264)' },
  { mime: 'video/mp4;codecs=av01.0.08M.08', container: 'mp4', codec: 'AV1', label: 'MP4 (AV1)' },
  { mime: 'video/mp4', container: 'mp4', codec: 'default', label: 'MP4' },
  { mime: 'video/webm;codecs=av01.0.08M.08,opus', container: 'webm', codec: 'AV1', label: 'WebM (AV1)' },
  { mime: 'video/webm;codecs=vp9,opus', container: 'webm', codec: 'VP9', label: 'WebM (VP9)' },
  { mime: 'video/webm;codecs=vp8,opus', container: 'webm', codec: 'VP8', label: 'WebM (VP8)' },
  { mime: 'video/webm', container: 'webm', codec: 'default', label: 'WebM' },
]);

/**
 * Everything this browser can actually record.
 * @returns {Array<{mime:string, container:string, codec:string, label:string}>}
 */
export function supportedFormats() {
  if (typeof MediaRecorder === 'undefined') return [];
  return CANDIDATES.filter((c) => {
    try {
      return MediaRecorder.isTypeSupported(c.mime);
    } catch {
      return false;
    }
  });
}

/**
 * The format to use unless the user picks otherwise.
 * @param {'mp4'|'webm'|'auto'} [prefer='auto']
 * @returns {{mime:string, container:string, codec:string, label:string}|null}
 */
export function pickFormat(prefer = 'auto') {
  const available = supportedFormats();
  if (!available.length) return null;
  if (prefer !== 'auto') {
    const match = available.find((f) => f.container === prefer);
    if (match) return match;
  }
  return available[0];
}

/** @returns {boolean} Whether real MP4 output is available here. */
export function canRecordMP4() {
  return supportedFormats().some((f) => f.container === 'mp4');
}

/** Frame-rate presets. */
export const FPS_OPTIONS = Object.freeze([24, 25, 30, 50, 60]);

/**
 * Bitrate presets, in bits per second, for 1080p. Scaled by pixel count.
 */
export const BITRATE_PRESETS = Object.freeze([
  { id: 'draft', label: 'Draft', bps: 6_000_000 },
  { id: 'good', label: 'Good', bps: 16_000_000 },
  { id: 'high', label: 'High', bps: 40_000_000 },
  { id: 'master', label: 'Master', bps: 90_000_000 },
]);

/**
 * Scale a 1080p bitrate to the actual frame size and rate.
 * @param {number} baseBps
 * @param {number} width
 * @param {number} height
 * @param {number} fps
 * @returns {number}
 */
export function scaleBitrate(baseBps, width, height, fps) {
  const pixelRatio = (width * height) / (1920 * 1080);
  const fpsRatio = fps / 30;
  // Bitrate requirements grow sub-linearly with resolution: doubling the pixel
  // count needs roughly 1.7x the bits, not 2x, because detail correlates.
  return Math.round(baseBps * Math.pow(pixelRatio, 0.78) * Math.pow(fpsRatio, 0.9));
}

/**
 * @typedef {object} RecorderOptions
 * @property {HTMLCanvasElement} canvas
 * @property {number} [fps=60]
 * @property {'mp4'|'webm'|'auto'} [prefer='auto']
 * @property {number} [bitrate] Bits per second; derived if omitted.
 * @property {MediaStream|AudioNode} [audio] Optional audio to mix in.
 * @property {AudioContext} [audioContext] Needed when `audio` is an AudioNode.
 * @property {(state:object)=>void} [onState]
 */

/**
 * Records the canvas to a video file.
 */
export class Recorder {
  /** @param {RecorderOptions} options */
  constructor(options) {
    this.canvas = options.canvas;
    this.fps = options.fps ?? 60;
    this.format = pickFormat(options.prefer ?? 'auto');
    if (!this.format) throw new Error('This browser cannot record video (MediaRecorder is unavailable).');

    this.bitrate =
      options.bitrate ??
      scaleBitrate(16_000_000, this.canvas.width, this.canvas.height, this.fps);
    this.onState = options.onState || (() => {});

    /** @type {Blob[]} */
    this._chunks = [];
    /** @type {MediaRecorder|null} */
    this._recorder = null;
    /** @type {MediaStream|null} */
    this._stream = null;
    /** @type {CanvasCaptureMediaStreamTrack|null} */
    this._videoTrack = null;
    this._audioSource = options.audio || null;
    this._audioContext = options.audioContext || null;
    this._startedAt = 0;
    this._frames = 0;
    /** @type {'idle'|'recording'|'stopping'} */
    this.state = 'idle';
    this.manual = false;
  }

  /**
   * Begin recording.
   * @param {object} [opts]
   * @param {boolean} [opts.manual=false] When true the stream only advances
   *   when {@link Recorder#pushFrame} is called — the offline path.
   */
  async start(opts = {}) {
    if (this.state !== 'idle') return;
    this.manual = !!opts.manual;
    this._chunks = [];
    this._frames = 0;

    // A manual stream is created at 0 fps so it produces frames only when we
    // ask; otherwise the browser samples the canvas on its own schedule.
    this._stream = this.canvas.captureStream(this.manual ? 0 : this.fps);
    this._videoTrack = this._stream.getVideoTracks()[0];

    if (this._audioSource) {
      try {
        const audioStream =
          this._audioSource instanceof MediaStream
            ? this._audioSource
            : this._audioNodeToStream(this._audioSource);
        for (const track of audioStream.getAudioTracks()) this._stream.addTrack(track);
      } catch {
        // Audio is a bonus; a failure here must not lose the video.
      }
    }

    this._recorder = new MediaRecorder(this._stream, {
      mimeType: this.format.mime,
      videoBitsPerSecond: this.bitrate,
      audioBitsPerSecond: 192_000,
    });
    this._recorder.ondataavailable = (e) => {
      if (e.data && e.data.size) this._chunks.push(e.data);
    };

    this._done = new Promise((resolve) => {
      this._recorder.onstop = () => resolve();
    });

    // A one-second timeslice means a long recording is not held entirely in one
    // Blob, and gives the UI something to report.
    this._recorder.start(1000);
    this._startedAt = performance.now();
    this.state = 'recording';
    this._emit();
  }

  /**
   * Push the current canvas contents as one frame. Only meaningful in manual
   * mode; call it once per rendered frame.
   */
  pushFrame() {
    if (this.state !== 'recording' || !this.manual) return;
    this._videoTrack?.requestFrame?.();
    this._frames++;
    if ((this._frames & 7) === 0) this._emit();
  }

  /**
   * Stop and produce the file.
   * @returns {Promise<{blob:Blob, mime:string, container:string, label:string,
   *   durationMs:number, frames:number, filename:string}>}
   */
  async stop() {
    if (this.state !== 'recording') throw new Error('Not recording.');
    this.state = 'stopping';
    this._emit();

    this._recorder.stop();
    await this._done;
    this._stream?.getTracks().forEach((t) => t.stop());

    const durationMs = performance.now() - this._startedAt;
    const blob = new Blob(this._chunks, { type: this.format.mime });
    this.state = 'idle';
    this._emit();

    return {
      blob,
      mime: this.format.mime,
      container: this.format.container,
      label: this.format.label,
      durationMs,
      frames: this._frames,
      filename: `orrery-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.${this.format.container}`,
    };
  }

  /** Seconds elapsed. @returns {number} */
  get elapsed() {
    return this.state === 'recording' ? (performance.now() - this._startedAt) / 1000 : 0;
  }

  /** Bytes captured so far. @returns {number} */
  get size() {
    return this._chunks.reduce((n, c) => n + c.size, 0);
  }

  /** @private */
  _emit() {
    this.onState({
      state: this.state,
      elapsed: this.elapsed,
      frames: this._frames,
      size: this.size,
      format: this.format,
      manual: this.manual,
    });
  }

  /** @private */
  _audioNodeToStream(node) {
    const ctx = this._audioContext || node.context;
    const dest = ctx.createMediaStreamDestination();
    node.connect(dest);
    return dest.stream;
  }
}

/**
 * Render a fixed-length clip offline, one frame at a time.
 *
 * Each frame is accumulated to `samplesPerFrame` before being pushed, so the
 * output has the same clean, converged look as a still export. Wall-clock time
 * is irrelevant to the result — only to how long you wait.
 *
 * @param {object} params
 * @param {import('./raytracer.js').Renderer} params.renderer
 * @param {import('./camera.js').Camera} params.camera
 * @param {(t:number)=>import('../astro/ephemeris.js').SceneState} params.sceneAt
 *   Returns the scene for a normalised time in [0, 1].
 * @param {(t:number, camera:import('./camera.js').Camera)=>void} params.animate
 *   Positions the camera for a normalised time in [0, 1].
 * @param {number} params.seconds Clip length.
 * @param {number} [params.fps=60]
 * @param {number} [params.samplesPerFrame=24]
 * @param {'mp4'|'webm'|'auto'} [params.prefer]
 * @param {number} [params.bitrate]
 * @param {MediaStream|AudioNode} [params.audio]
 * @param {(p:{frame:number, frames:number, fraction:number})=>void} [params.onProgress]
 * @param {AbortSignal} [params.signal]
 * @returns {Promise<object>} The same shape as {@link Recorder#stop}.
 */
export async function renderClip(params) {
  const {
    renderer, camera, sceneAt, animate, seconds,
    fps = 60, samplesPerFrame = 24, onProgress, signal,
  } = params;

  const frames = Math.max(1, Math.round(seconds * fps));
  const recorder = new Recorder({
    canvas: renderer.canvas,
    fps,
    prefer: params.prefer,
    bitrate: params.bitrate,
    audio: params.audio,
  });

  const savedAuto = renderer.settings.autoExposure;
  const savedScaler = renderer.scaler.enabled;
  renderer.scaler.enabled = false;

  await recorder.start({ manual: true });
  try {
    for (let f = 0; f < frames; f++) {
      if (signal?.aborted) throw new DOMException('Recording cancelled', 'AbortError');
      const t = f / frames;
      const scene = sceneAt(t);
      animate(t, camera);
      // Smoothing off: the camera must land exactly on the authored path, not
      // ease towards it, or the motion will lag the intended timing.
      camera.update(1 / fps, scene, null, 0);
      renderer.snapExposure(renderer.targetExposure(scene, camera));
      renderer.settings.autoExposure = false;

      renderer.resetAccumulation();
      for (let s = 0; s < samplesPerFrame; s++) {
        renderer.render(scene, camera, { dt: 1 / fps, forceAccumulate: true });
      }
      recorder.pushFrame();

      onProgress?.({ frame: f + 1, frames, fraction: (f + 1) / frames });
      // Yield to the event loop so the page stays alive and cancellable.
      await new Promise((r) => requestAnimationFrame(() => r()));
    }
  } finally {
    renderer.settings.autoExposure = savedAuto;
    renderer.scaler.enabled = savedScaler;
  }

  return recorder.stop();
}

/**
 * A short, human-readable explanation of what the browser will actually
 * produce — shown next to the record button so nobody is surprised by the file
 * they get.
 * @param {(key:string, params?:object)=>string} t
 * @returns {{mp4:boolean, label:string, note:string}}
 */
export function describeSupport(t) {
  const mp4 = canRecordMP4();
  const format = pickFormat('auto');
  return {
    mp4,
    label: format ? format.label : '—',
    note: mp4 ? t('capture.mp4Available') : t('capture.mp4Unavailable'),
  };
}
