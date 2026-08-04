export type SceneId = 'orbit' | 'earth' | 'neo' | 'helio' | 'archive';
export type QualityId = 'auto' | 'low' | 'balanced' | 'high' | 'ultra';
export type DataMode = 'live' | 'cache' | 'demo';
export type ApiStatus = 'idle' | 'loading' | 'live' | 'cache' | 'demo' | 'error' | 'policy';

export interface QualityProfile {
  id: QualityId;
  renderScale: number;
  maxPixelRatio: number;
  starLayers: number;
  bloom: number;
  targetFps: number;
}

export interface ApiSource {
  id: string;
  name: string;
  agency: string;
  description: string;
  docs: string;
  status: 'live' | 'archived' | 'reference-only';
  browserPolicy: 'cors' | 'keyed-cors' | 'deep-link-only';
  module: SceneId | 'catalog';
}

export interface DataEnvelope<T> {
  data: T;
  mode: DataMode;
  source: string;
  fetchedAt: string;
  sourceTimestamp?: string;
}

export interface ApodData {
  title: string;
  explanation: string;
  date: string;
  mediaType: 'image' | 'video' | 'other';
  url: string;
  hdUrl?: string;
  thumbnailUrl?: string;
  copyright?: string;
}

export interface NeoObject {
  id: string;
  name: string;
  diameterKm: number;
  velocityKps: number;
  missDistanceKm: number;
  hazardous: boolean;
  nasaUrl: string;
}

export interface EarthEvent {
  id: string;
  title: string;
  category: string;
  longitude: number;
  latitude: number;
  date: string;
  sourceUrl?: string;
}

export interface SolarEvent {
  id: string;
  type: 'CME' | 'FLR';
  startTime: string;
  classType?: string;
  speedKps?: number;
  sourceUrl?: string;
}

export interface EpicFrame {
  identifier: string;
  caption: string;
  date: string;
  imageUrl: string;
  centroid: { lat: number; lon: number };
}

export interface ArchiveItem {
  nasaId: string;
  title: string;
  description: string;
  date: string;
  center: string;
  previewUrl: string;
  mediaType: string;
}

export interface ApiStatusDetail {
  id: string;
  status: ApiStatus;
  message?: string;
  updatedAt: string;
}

export interface RenderState {
  scene: SceneId;
  yaw: number;
  pitch: number;
  distance: number;
  orbitEnabled: boolean;
  orbitSpeed: number;
  orbitTilt: number;
  paused: boolean;
  exposure: number;
  dataEnergy: number;
  dataRisk: number;
  dataEvents: number;
  quality: QualityId;
}

export interface RendererStats {
  fps: number;
  frameMs: number;
  width: number;
  height: number;
  pixelRatio: number;
  renderScale: number;
  maxTextureSize: number;
}

export interface ExportRequest {
  width: number;
  height: number;
  format: 'png' | 'jpeg' | 'webp';
  quality: number;
  filename: string;
}
