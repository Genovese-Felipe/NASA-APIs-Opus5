import type { ExportRequest } from './types';
import type { ComputationalRenderer } from './renderer';

interface RecorderResult {
  blob: Blob;
  extension: 'mp4' | 'webm';
  mimeType: string;
}

const RECORDING_TYPES = [
  'video/mp4;codecs=avc1.42E01E',
  'video/mp4',
  'video/webm;codecs=vp9',
  'video/webm;codecs=vp8',
  'video/webm',
];

export function chooseRecordingMime(isSupported: (mime: string) => boolean): string {
  return RECORDING_TYPES.find(isSupported) || '';
}

export function safeFilename(name: string): string {
  return name.normalize('NFKD').replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 100) || 'nasa-opus5';
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = 'noopener';
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export async function canvasToBlob(canvas: HTMLCanvasElement, format: ExportRequest['format'], quality: number): Promise<Blob> {
  const requestedMime = `image/${format}`;
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, requestedMime, quality));
  if (!blob) throw new Error(`The browser could not encode ${requestedMime}`);
  return blob;
}

export function canSafelyEncode(width: number, height: number): boolean {
  const pixels = width * height;
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  if (pixels > 33_500_000) return false;
  if (memory && memory <= 2 && pixels > 9_000_000) return false;
  return width > 0 && height > 0;
}

export class StillExporter {
  constructor(private readonly renderer: ComputationalRenderer) {}

  async export(request: ExportRequest, onProgress?: (value: number) => void): Promise<Blob> {
    if (!canSafelyEncode(request.width, request.height)) throw new Error('EXPORT_CAPABILITY');
    const canvas = await this.renderer.renderExport(request.width, request.height, onProgress);
    const blob = await canvasToBlob(canvas, request.format, request.quality);
    downloadBlob(blob, `${safeFilename(request.filename)}.${request.format === 'jpeg' ? 'jpg' : request.format}`);
    canvas.width = 1;
    canvas.height = 1;
    return blob;
  }
}

export class CanvasRecorder extends EventTarget {
  private recorder: MediaRecorder | null = null;
  private chunks: BlobPart[] = [];
  private startedAt = 0;
  private stopTimer = 0;
  private activeMime = '';

  get isRecording(): boolean { return this.recorder?.state === 'recording'; }
  get elapsedSeconds(): number { return this.startedAt ? (performance.now() - this.startedAt) / 1000 : 0; }

  start(canvas: HTMLCanvasElement, audioTrack: MediaStreamTrack | null, fps = 60, maxSeconds = 120): string {
    if (this.isRecording) throw new Error('Recording is already active');
    if (!('MediaRecorder' in window) || !canvas.captureStream) throw new Error('RECORDING_UNSUPPORTED');
    const videoStream = canvas.captureStream(fps);
    const stream = new MediaStream(videoStream.getVideoTracks());
    if (audioTrack) stream.addTrack(audioTrack);
    this.activeMime = chooseRecordingMime((mime) => MediaRecorder.isTypeSupported(mime));
    const options: MediaRecorderOptions = {
      videoBitsPerSecond: Math.max(8_000_000, Math.min(36_000_000, canvas.width * canvas.height * fps * 0.12)),
    };
    if (this.activeMime) options.mimeType = this.activeMime;
    this.chunks = [];
    this.recorder = new MediaRecorder(stream, options);
    this.recorder.addEventListener('dataavailable', (event) => {
      if (event.data.size) this.chunks.push(event.data);
    });
    this.recorder.addEventListener('error', (event) => this.dispatchEvent(new CustomEvent('error', { detail: event })));
    this.recorder.start(1000);
    this.startedAt = performance.now();
    this.stopTimer = window.setTimeout(() => {
      if (this.isRecording) this.dispatchEvent(new Event('limit'));
    }, maxSeconds * 1000);
    return this.activeMime || this.recorder.mimeType || 'video/webm';
  }

  stop(): Promise<RecorderResult> {
    if (!this.recorder || this.recorder.state === 'inactive') return Promise.reject(new Error('No recording is active'));
    window.clearTimeout(this.stopTimer);
    return new Promise((resolve, reject) => {
      const recorder = this.recorder!;
      recorder.addEventListener('stop', () => {
        const mimeType = this.activeMime || recorder.mimeType || 'video/webm';
        const extension = mimeType.startsWith('video/mp4') ? 'mp4' : 'webm';
        const blob = new Blob(this.chunks, { type: mimeType });
        recorder.stream.getTracks().forEach((track) => track.stop());
        this.recorder = null;
        this.startedAt = 0;
        this.chunks = [];
        if (!blob.size) reject(new Error('The recording contains no data'));
        else resolve({ blob, extension, mimeType });
      }, { once: true });
      recorder.stop();
    });
  }
}
