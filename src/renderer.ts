import { QUALITY_PROFILES, SCENE_ACCENTS } from './catalog';
import { FRAGMENT_SHADER, VERTEX_SHADER } from './shaders';
import type { EarthEvent, QualityId, RenderState, RendererStats, SceneId } from './types';

const SCENE_INDEX: Record<SceneId, number> = { orbit: 0, earth: 1, neo: 2, helio: 3, archive: 4 };

interface Uniforms {
  resolution: WebGLUniformLocation;
  fullResolution: WebGLUniformLocation;
  tileOrigin: WebGLUniformLocation;
  time: WebGLUniformLocation;
  camera: WebGLUniformLocation;
  scene: WebGLUniformLocation;
  starLayers: WebGLUniformLocation;
  bloom: WebGLUniformLocation;
  exposure: WebGLUniformLocation;
  accent: WebGLUniformLocation;
  data: WebGLUniformLocation;
  eventCoords: WebGLUniformLocation;
  eventCount: WebGLUniformLocation;
}

function assertUniform(gl: WebGL2RenderingContext, program: WebGLProgram, name: string): WebGLUniformLocation {
  const location = gl.getUniformLocation(program, name);
  if (location === null) throw new Error(`Shader uniform not found: ${name}`);
  return location;
}

function compileShader(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) throw new Error('Unable to allocate a WebGL shader');
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const message = gl.getShaderInfoLog(shader) || 'Unknown shader compilation error';
    gl.deleteShader(shader);
    throw new Error(message);
  }
  return shader;
}

function createProgram(gl: WebGL2RenderingContext): WebGLProgram {
  const vertex = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
  const fragment = compileShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
  const program = gl.createProgram();
  if (!program) throw new Error('Unable to allocate a WebGL program');
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const message = gl.getProgramInfoLog(program) || 'Unknown shader link error';
    gl.deleteProgram(program);
    throw new Error(message);
  }
  return program;
}

function resolvedAutoProfile(): 'balanced' | 'high' {
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory || 4;
  const cores = navigator.hardwareConcurrency || 4;
  return memory >= 6 && cores >= 8 ? 'high' : 'balanced';
}

export class ComputationalRenderer extends EventTarget {
  readonly canvas: HTMLCanvasElement;
  readonly gl: WebGL2RenderingContext;
  private program: WebGLProgram;
  private uniforms: Uniforms;
  private animationFrame = 0;
  private startTime = performance.now();
  private previousFrame = this.startTime;
  private frameAccumulator = 0;
  private frameCount = 0;
  private measuredFps = 0;
  private exporting = false;
  private reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  private autoScale = 1;
  private eventCoords = new Float32Array(24);
  private eventCount = 0;
  private pointers = new Map<number, PointerEvent>();
  private previousPinchDistance = 0;

  readonly state: RenderState = {
    scene: 'orbit', yaw: 0.48, pitch: 0.18, distance: 4.2, orbitEnabled: true,
    orbitSpeed: 0.22, orbitTilt: 0.18, paused: false, exposure: 1, dataEnergy: 0.36,
    dataRisk: 0.12, dataEvents: 3, quality: 'auto',
  };

  constructor(container: HTMLElement) {
    super();
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'observatory-canvas';
    this.canvas.setAttribute('aria-label', 'Interactive computational space renderer');
    this.canvas.tabIndex = 0;
    container.append(this.canvas);
    const gl = this.canvas.getContext('webgl2', {
      alpha: false, antialias: false, depth: false, stencil: false,
      powerPreference: 'high-performance', preserveDrawingBuffer: true,
    });
    if (!gl) throw new Error('WebGL 2 is not available on this device');
    this.gl = gl;
    this.program = createProgram(gl);
    this.uniforms = this.readUniforms();
    this.createGeometry();
    this.bindEvents();
    this.resize(true);
    this.animationFrame = requestAnimationFrame(this.tick);
  }

  setScene(scene: SceneId): void {
    this.state.scene = scene;
    const distances: Record<SceneId, number> = { orbit: 4.2, earth: 4.0, neo: 4.8, helio: 4.2, archive: 4.0 };
    this.state.distance = distances[scene];
    this.dispatchEvent(new CustomEvent('scenechange', { detail: scene }));
  }

  setQuality(quality: QualityId): void {
    this.state.quality = quality;
    this.autoScale = 1;
    this.resize(true);
  }

  setReducedMotion(value: boolean): void { this.reducedMotion = value; }
  setPaused(value: boolean): void { this.state.paused = value; }
  setOrbit(value: boolean): void { this.state.orbitEnabled = value; }
  setOrbitSpeed(value: number): void { this.state.orbitSpeed = Math.max(0, Math.min(1.2, value)); }
  setOrbitTilt(value: number): void { this.state.orbitTilt = Math.max(-0.9, Math.min(0.9, value)); }
  setExposure(value: number): void { this.state.exposure = Math.max(0.4, Math.min(2.2, value)); }

  setData(energy: number, risk: number, events: number): void {
    this.state.dataEnergy = Math.max(0, Math.min(1, energy));
    this.state.dataRisk = Math.max(0, Math.min(1, risk));
    this.state.dataEvents = Math.max(0, events);
  }

  setEarthEvents(events: EarthEvent[]): void {
    this.eventCoords.fill(0);
    this.eventCount = Math.min(events.length, 12);
    for (let index = 0; index < this.eventCount; index += 1) {
      const event = events[index];
      if (!event) continue;
      this.eventCoords[index * 2] = event.longitude;
      this.eventCoords[index * 2 + 1] = event.latitude;
    }
  }

  getStats(): RendererStats {
    const profile = this.profile();
    return {
      fps: this.measuredFps, frameMs: this.measuredFps ? 1000 / this.measuredFps : 0,
      width: this.canvas.width, height: this.canvas.height,
      pixelRatio: Math.min(devicePixelRatio || 1, profile.maxPixelRatio),
      renderScale: profile.renderScale * this.autoScale,
      maxTextureSize: this.gl.getParameter(this.gl.MAX_TEXTURE_SIZE) as number,
    };
  }

  async renderExport(width: number, height: number, onProgress?: (value: number) => void): Promise<HTMLCanvasElement> {
    if (this.exporting) throw new Error('An export is already running');
    this.exporting = true;
    const output = document.createElement('canvas');
    output.width = width;
    output.height = height;
    if (output.width !== width || output.height !== height) {
      this.exporting = false;
      throw new Error('Requested canvas dimensions are not supported');
    }
    const context = output.getContext('2d', { alpha: false });
    if (!context) {
      this.exporting = false;
      throw new Error('2D export encoder is unavailable');
    }
    const maxBuffer = this.gl.getParameter(this.gl.MAX_RENDERBUFFER_SIZE) as number;
    const tileSize = Math.min(2048, maxBuffer);
    const columns = Math.ceil(width / tileSize);
    const rows = Math.ceil(height / tileSize);
    const total = columns * rows;
    const exportTime = (performance.now() - this.startTime) / 1000;
    let completed = 0;
    try {
      for (let row = 0; row < rows; row += 1) {
        for (let column = 0; column < columns; column += 1) {
          const x = column * tileSize;
          const y = row * tileSize;
          const tileWidth = Math.min(tileSize, width - x);
          const tileHeight = Math.min(tileSize, height - y);
          this.canvas.width = tileWidth;
          this.canvas.height = tileHeight;
          this.render(exportTime, tileWidth, tileHeight, width, height, x, y);
          const pixels = new Uint8Array(tileWidth * tileHeight * 4);
          this.gl.readPixels(0, 0, tileWidth, tileHeight, this.gl.RGBA, this.gl.UNSIGNED_BYTE, pixels);
          const flipped = new Uint8ClampedArray(pixels.length);
          const stride = tileWidth * 4;
          for (let sourceRow = 0; sourceRow < tileHeight; sourceRow += 1) {
            const sourceStart = sourceRow * stride;
            const targetStart = (tileHeight - sourceRow - 1) * stride;
            flipped.set(pixels.subarray(sourceStart, sourceStart + stride), targetStart);
          }
          const image = new ImageData(flipped, tileWidth, tileHeight);
          context.putImageData(image, x, height - y - tileHeight);
          completed += 1;
          onProgress?.(completed / total);
          await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
        }
      }
      return output;
    } finally {
      this.exporting = false;
      this.resize(true);
    }
  }

  destroy(): void {
    cancelAnimationFrame(this.animationFrame);
    this.gl.deleteProgram(this.program);
  }

  private profile() {
    const id = this.state.quality === 'auto' ? resolvedAutoProfile() : this.state.quality;
    return QUALITY_PROFILES[id] ?? QUALITY_PROFILES.balanced!;
  }

  private readUniforms(): Uniforms {
    const gl = this.gl;
    return {
      resolution: assertUniform(gl, this.program, 'u_resolution'),
      fullResolution: assertUniform(gl, this.program, 'u_fullResolution'),
      tileOrigin: assertUniform(gl, this.program, 'u_tileOrigin'),
      time: assertUniform(gl, this.program, 'u_time'),
      camera: assertUniform(gl, this.program, 'u_camera'),
      scene: assertUniform(gl, this.program, 'u_scene'),
      starLayers: assertUniform(gl, this.program, 'u_starLayers'),
      bloom: assertUniform(gl, this.program, 'u_bloom'),
      exposure: assertUniform(gl, this.program, 'u_exposure'),
      accent: assertUniform(gl, this.program, 'u_accent'),
      data: assertUniform(gl, this.program, 'u_data'),
      eventCoords: assertUniform(gl, this.program, 'u_eventCoords[0]'),
      eventCount: assertUniform(gl, this.program, 'u_eventCount'),
    };
  }

  private createGeometry(): void {
    const gl = this.gl;
    const vao = gl.createVertexArray();
    const buffer = gl.createBuffer();
    if (!vao || !buffer) throw new Error('Unable to allocate WebGL geometry');
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,3,-1,-1,3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  }

  private bindEvents(): void {
    const canvas = this.canvas;
    canvas.addEventListener('contextmenu', (event) => event.preventDefault());
    canvas.addEventListener('pointerdown', (event) => {
      canvas.setPointerCapture(event.pointerId);
      this.pointers.set(event.pointerId, event);
      canvas.focus({ preventScroll: true });
    });
    canvas.addEventListener('pointermove', (event) => {
      const previous = this.pointers.get(event.pointerId);
      if (!previous) return;
      this.pointers.set(event.pointerId, event);
      if (this.pointers.size === 1) {
        this.state.yaw -= (event.clientX - previous.clientX) * 0.006;
        this.state.pitch = Math.max(-1.2, Math.min(1.2, this.state.pitch + (event.clientY - previous.clientY) * 0.005));
        this.state.orbitEnabled = false;
      } else if (this.pointers.size === 2) {
        const points = [...this.pointers.values()];
        const first = points[0], second = points[1];
        if (!first || !second) return;
        const distance = Math.hypot(first.clientX-second.clientX, first.clientY-second.clientY);
        if (this.previousPinchDistance) this.state.distance = Math.max(2.2, Math.min(9, this.state.distance * (this.previousPinchDistance / distance)));
        this.previousPinchDistance = distance;
      }
    });
    const release = (event: PointerEvent) => {
      this.pointers.delete(event.pointerId);
      if (this.pointers.size < 2) this.previousPinchDistance = 0;
    };
    canvas.addEventListener('pointerup', release);
    canvas.addEventListener('pointercancel', release);
    canvas.addEventListener('wheel', (event) => {
      event.preventDefault();
      this.state.distance = Math.max(2.2, Math.min(9, this.state.distance * Math.exp(event.deltaY*0.0012)));
    }, { passive: false });
    window.addEventListener('resize', () => this.resize());
    canvas.addEventListener('webglcontextlost', (event) => {
      event.preventDefault();
      cancelAnimationFrame(this.animationFrame);
      this.dispatchEvent(new CustomEvent('contextlost'));
    });
    canvas.addEventListener('webglcontextrestored', () => {
      this.program = createProgram(this.gl);
      this.uniforms = this.readUniforms();
      this.createGeometry();
      this.resize(true);
      this.animationFrame = requestAnimationFrame(this.tick);
      this.dispatchEvent(new CustomEvent('contextrestored'));
    });
  }

  private resize(force = false): void {
    if (this.exporting) return;
    const profile = this.profile();
    const pixelRatio = Math.min(devicePixelRatio || 1, profile.maxPixelRatio);
    const scale = profile.renderScale * this.autoScale;
    const width = Math.max(2, Math.floor(this.canvas.clientWidth * pixelRatio * scale));
    const height = Math.max(2, Math.floor(this.canvas.clientHeight * pixelRatio * scale));
    if (force || this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
  }

  private tick = (now: number): void => {
    this.animationFrame = requestAnimationFrame(this.tick);
    if (this.exporting) return;
    const delta = Math.min((now - this.previousFrame) / 1000, 0.1);
    this.previousFrame = now;
    if (!this.state.paused && this.state.orbitEnabled && !this.reducedMotion) {
      this.state.yaw += delta * this.state.orbitSpeed;
      this.state.pitch += (this.state.orbitTilt - this.state.pitch) * Math.min(1, delta * 0.7);
    }
    this.resize();
    this.render((now - this.startTime) / 1000, this.canvas.width, this.canvas.height, this.canvas.width, this.canvas.height, 0, 0);
    this.frameAccumulator += now - (this.previousFrame - delta * 1000);
    this.frameCount += 1;
    if (this.frameCount >= 45) {
      this.measuredFps = this.frameAccumulator > 0 ? (this.frameCount * 1000) / this.frameAccumulator : 0;
      this.frameAccumulator = 0;
      this.frameCount = 0;
      if (this.state.quality === 'auto' && !this.reducedMotion) {
        if (this.measuredFps < 48) this.autoScale = Math.max(0.58, this.autoScale - 0.08);
        else if (this.measuredFps > 78) this.autoScale = Math.min(1.08, this.autoScale + 0.035);
      }
      this.dispatchEvent(new CustomEvent<RendererStats>('stats', { detail: this.getStats() }));
    }
  };

  private render(time: number, width: number, height: number, fullWidth: number, fullHeight: number, tileX: number, tileY: number): void {
    const gl = this.gl;
    const profile = this.profile();
    const accent = SCENE_ACCENTS[this.state.scene];
    gl.viewport(0, 0, width, height);
    gl.useProgram(this.program);
    gl.uniform2f(this.uniforms.resolution, width, height);
    gl.uniform2f(this.uniforms.fullResolution, fullWidth, fullHeight);
    gl.uniform2f(this.uniforms.tileOrigin, tileX, tileY);
    gl.uniform1f(this.uniforms.time, this.state.paused ? 0 : time);
    gl.uniform3f(this.uniforms.camera, this.state.yaw, this.state.pitch, this.state.distance);
    gl.uniform1i(this.uniforms.scene, SCENE_INDEX[this.state.scene]);
    gl.uniform1i(this.uniforms.starLayers, profile.starLayers);
    gl.uniform1f(this.uniforms.bloom, profile.bloom);
    gl.uniform1f(this.uniforms.exposure, this.state.exposure);
    gl.uniform3f(this.uniforms.accent, accent[0], accent[1], accent[2]);
    gl.uniform3f(this.uniforms.data, this.state.dataEnergy, this.state.dataRisk, this.state.dataEvents);
    gl.uniform2fv(this.uniforms.eventCoords, this.eventCoords);
    gl.uniform1i(this.uniforms.eventCount, this.eventCount);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
}
