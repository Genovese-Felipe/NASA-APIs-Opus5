import type {
  ApiStatus,
  ApiStatusDetail,
  ApodData,
  ArchiveItem,
  DataEnvelope,
  DataMode,
  EarthEvent,
  EpicFrame,
  NeoObject,
  SolarEvent,
} from './types';

const API_ROOT = 'https://api.nasa.gov';
const EONET_ROOT = 'https://eonet.gsfc.nasa.gov/api/v3';
const IMAGES_ROOT = 'https://images-api.nasa.gov';
const CACHE_PREFIX = 'opus5-api-v1:';
const DEFAULT_TIMEOUT = 14_000;

type JsonRecord = Record<string, unknown>;

interface CacheRecord<T> {
  storedAt: number;
  data: T;
}

interface BrokerResult<T> {
  data: T;
  mode: Exclude<DataMode, 'demo'>;
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function text(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function number(value: unknown, fallback = 0): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function array(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

function dateDaysAgo(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
}

function cacheStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

export class RequestBroker {
  private active = 0;
  private readonly queue: Array<() => void> = [];

  constructor(private readonly concurrency = 3) {}

  async get<T>(url: string, cacheKey: string, ttlMs: number, force = false): Promise<BrokerResult<T>> {
    const storage = cacheStorage();
    const key = `${CACHE_PREFIX}${cacheKey}`;
    const cached = this.readCache<T>(storage, key);
    if (!force && cached && Date.now() - cached.storedAt < ttlMs) {
      return { data: cached.data, mode: 'cache' };
    }

    try {
      const data = await this.schedule(async () => {
        const controller = new AbortController();
        const timer = window.setTimeout(() => controller.abort(), DEFAULT_TIMEOUT);
        try {
          const response = await fetch(url, {
            signal: controller.signal,
            headers: { Accept: 'application/json' },
            referrerPolicy: 'strict-origin-when-cross-origin',
          });
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          return (await response.json()) as T;
        } finally {
          window.clearTimeout(timer);
        }
      });
      try {
        storage?.setItem(key, JSON.stringify({ storedAt: Date.now(), data } satisfies CacheRecord<T>));
      } catch {
        // Quota and privacy modes must never block the observatory.
      }
      return { data, mode: 'live' };
    } catch (error) {
      if (cached) return { data: cached.data, mode: 'cache' };
      throw error;
    }
  }

  clear(): void {
    const storage = cacheStorage();
    if (!storage) return;
    for (let index = storage.length - 1; index >= 0; index -= 1) {
      const key = storage.key(index);
      if (key?.startsWith(CACHE_PREFIX)) storage.removeItem(key);
    }
  }

  private readCache<T>(storage: Storage | null, key: string): CacheRecord<T> | null {
    try {
      const raw = storage?.getItem(key);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as CacheRecord<T>;
      if (!parsed || typeof parsed.storedAt !== 'number' || !('data' in parsed)) return null;
      return parsed;
    } catch {
      return null;
    }
  }

  private schedule<T>(task: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      const run = () => {
        this.active += 1;
        task().then(resolve, reject).finally(() => {
          this.active -= 1;
          this.pump();
        });
      };
      this.queue.push(run);
      this.pump();
    });
  }

  private pump(): void {
    while (this.active < this.concurrency && this.queue.length) this.queue.shift()?.();
  }
}

export function normalizeApod(raw: unknown): ApodData {
  if (!isRecord(raw) || !text(raw.title) || !text(raw.date)) throw new Error('Invalid APOD payload');
  const media = text(raw.media_type);
  return {
    title: text(raw.title),
    explanation: text(raw.explanation, 'No explanation supplied.'),
    date: text(raw.date),
    mediaType: media === 'image' || media === 'video' ? media : 'other',
    url: text(raw.url),
    hdUrl: text(raw.hdurl) || undefined,
    thumbnailUrl: text(raw.thumbnail_url) || undefined,
    copyright: text(raw.copyright) || undefined,
  };
}

export function normalizeNeoFeed(raw: unknown): NeoObject[] {
  if (!isRecord(raw) || !isRecord(raw.near_earth_objects)) throw new Error('Invalid NeoWs payload');
  const entries = Object.values(raw.near_earth_objects).flatMap(array);
  return entries.slice(0, 36).map((entry, index) => {
    if (!isRecord(entry)) throw new Error('Invalid NeoWs object');
    const diameter = isRecord(entry.estimated_diameter) && isRecord(entry.estimated_diameter.kilometers)
      ? entry.estimated_diameter.kilometers
      : {};
    const approaches = array(entry.close_approach_data);
    const approach = isRecord(approaches[0]) ? approaches[0] : {};
    const velocity = isRecord(approach.relative_velocity) ? approach.relative_velocity : {};
    const distance = isRecord(approach.miss_distance) ? approach.miss_distance : {};
    const min = number((diameter as JsonRecord).estimated_diameter_min);
    const max = number((diameter as JsonRecord).estimated_diameter_max);
    return {
      id: text(entry.id, `neo-${index}`),
      name: text(entry.name, `Object ${index + 1}`),
      diameterKm: (min + max) / 2,
      velocityKps: number((velocity as JsonRecord).kilometers_per_second),
      missDistanceKm: number((distance as JsonRecord).kilometers),
      hazardous: entry.is_potentially_hazardous_asteroid === true,
      nasaUrl: isRecord(entry.nasa_jpl_url) ? '' : text(entry.nasa_jpl_url),
    };
  });
}

export function normalizeEonet(raw: unknown): EarthEvent[] {
  if (!isRecord(raw) || !Array.isArray(raw.events)) throw new Error('Invalid EONET payload');
  return raw.events.slice(0, 24).flatMap((entry, index) => {
    if (!isRecord(entry)) return [];
    const geometries = array(entry.geometry);
    const geometry = [...geometries].reverse().find((item) => isRecord(item) && isRecord(item.geometry));
    if (!isRecord(geometry) || !isRecord(geometry.geometry)) return [];
    const coordinates = array(geometry.geometry.coordinates);
    if (text(geometry.geometry.type) !== 'Point' || coordinates.length < 2) return [];
    const categories = array(entry.categories);
    const category = isRecord(categories[0]) ? text(categories[0].title, 'Event') : 'Event';
    const sources = array(entry.sources);
    const source = isRecord(sources[0]) ? text(sources[0].url) : '';
    return [{
      id: text(entry.id, `event-${index}`),
      title: text(entry.title, 'Earth event'),
      category,
      longitude: number(coordinates[0]),
      latitude: number(coordinates[1]),
      date: text(geometry.date),
      sourceUrl: source || undefined,
    }];
  });
}

export function normalizeDonki(cmesRaw: unknown, flaresRaw: unknown): SolarEvent[] {
  const events: SolarEvent[] = [];
  for (const [index, entry] of array(cmesRaw).entries()) {
    if (!isRecord(entry)) continue;
    const analyses = array(entry.cmeAnalyses);
    const analysis = isRecord(analyses[0]) ? analyses[0] : {};
    events.push({
      id: text(entry.activityID, `cme-${index}`), type: 'CME', startTime: text(entry.startTime),
      speedKps: number((analysis as JsonRecord).speed) || undefined, sourceUrl: text(entry.link) || undefined,
    });
  }
  for (const [index, entry] of array(flaresRaw).entries()) {
    if (!isRecord(entry)) continue;
    events.push({
      id: text(entry.flrID, `flare-${index}`), type: 'FLR', startTime: text(entry.beginTime),
      classType: text(entry.classType) || undefined, sourceUrl: text(entry.link) || undefined,
    });
  }
  return events.sort((a, b) => b.startTime.localeCompare(a.startTime)).slice(0, 30);
}

export function normalizeEpic(raw: unknown, apiKey: string): EpicFrame[] {
  return array(raw).slice(0, 12).flatMap((entry) => {
    if (!isRecord(entry) || !text(entry.image) || !text(entry.date)) return [];
    const date = text(entry.date);
    const day = date.slice(0, 10).replaceAll('-', '/');
    const centroid = isRecord(entry.centroid_coordinates) ? entry.centroid_coordinates : {};
    return [{
      identifier: text(entry.identifier, text(entry.image)),
      caption: text(entry.caption, 'DSCOVR EPIC Earth observation'),
      date,
      imageUrl: `${API_ROOT}/EPIC/archive/natural/${day}/png/${encodeURIComponent(text(entry.image))}.png?api_key=${encodeURIComponent(apiKey)}`,
      centroid: { lat: number((centroid as JsonRecord).lat), lon: number((centroid as JsonRecord).lon) },
    }];
  });
}

export function normalizeArchive(raw: unknown): ArchiveItem[] {
  if (!isRecord(raw) || !isRecord(raw.collection) || !Array.isArray(raw.collection.items)) throw new Error('Invalid NASA Images payload');
  return raw.collection.items.slice(0, 24).flatMap((entry) => {
    if (!isRecord(entry)) return [];
    const data = array(entry.data);
    const meta = isRecord(data[0]) ? data[0] : {};
    const links = array(entry.links);
    const preview = links.find((item) => isRecord(item) && text(item.rel) === 'preview');
    if (!isRecord(preview) || !text(preview.href)) return [];
    return [{
      nasaId: text(meta.nasa_id), title: text(meta.title, 'Untitled NASA asset'),
      description: text(meta.description_508, text(meta.description)).slice(0, 600),
      date: text(meta.date_created), center: text(meta.center, 'NASA'), previewUrl: text(preview.href),
      mediaType: text(meta.media_type, 'image'),
    }];
  });
}

function envelope<T>(data: T, mode: DataMode, source: string, sourceTimestamp?: string): DataEnvelope<T> {
  return { data, mode, source, fetchedAt: new Date().toISOString(), sourceTimestamp };
}

export const DEMO_DATA = {
  apod: {
    title: 'Live astronomy signal pending',
    explanation: 'A deterministic demonstration scene is active while the live APOD endpoint is unavailable. No current NASA observation is being claimed.',
    date: todayUtc(), mediaType: 'other' as const, url: '',
  },
  neo: Array.from({ length: 14 }, (_, index): NeoObject => ({
    id: `demo-${index}`, name: `Demonstration object ${String.fromCharCode(65 + index)}`,
    diameterKm: 0.08 + ((index * 37) % 80) / 100, velocityKps: 8 + ((index * 19) % 31),
    missDistanceKm: 900_000 + index * 540_000, hazardous: index % 6 === 0, nasaUrl: '',
  })),
  earth: [
    { id: 'demo-wildfire', title: 'Demonstration wildfire signal', category: 'Wildfires', longitude: -54.5, latitude: -12.2, date: todayUtc() },
    { id: 'demo-storm', title: 'Demonstration storm signal', category: 'Severe Storms', longitude: 139.2, latitude: 24.5, date: todayUtc() },
    { id: 'demo-volcano', title: 'Demonstration volcano signal', category: 'Volcanoes', longitude: 110.4, latitude: -7.5, date: todayUtc() },
  ] satisfies EarthEvent[],
  solar: [
    { id: 'demo-flare', type: 'FLR', startTime: new Date().toISOString(), classType: 'DEMO' },
    { id: 'demo-cme', type: 'CME', startTime: new Date(Date.now() - 7_200_000).toISOString(), speedKps: 520 },
  ] satisfies SolarEvent[],
};

export class NasaDataHub extends EventTarget {
  private readonly broker = new RequestBroker(3);
  private apiKey = sessionStorage.getItem('opus5-nasa-key') || 'DEMO_KEY';
  private readonly statuses = new Map<string, ApiStatusDetail>();

  get keyIsDemo(): boolean { return this.apiKey === 'DEMO_KEY'; }

  setApiKey(value: string): void {
    const clean = value.trim() || 'DEMO_KEY';
    this.apiKey = clean;
    if (clean === 'DEMO_KEY') sessionStorage.removeItem('opus5-nasa-key');
    else sessionStorage.setItem('opus5-nasa-key', clean);
    this.broker.clear();
  }

  getStatuses(): ApiStatusDetail[] { return [...this.statuses.values()]; }

  async loadApod(force = false): Promise<DataEnvelope<ApodData>> {
    return this.guard('apod', async () => {
      const result = await this.broker.get<unknown>(`${API_ROOT}/planetary/apod?api_key=${encodeURIComponent(this.apiKey)}&thumbs=true`, 'apod', 3_600_000, force);
      const data = normalizeApod(result.data);
      return envelope(data, result.mode, 'NASA APOD', data.date);
    }, () => envelope(DEMO_DATA.apod, 'demo', 'Built-in demonstration'));
  }

  async loadNeo(force = false): Promise<DataEnvelope<NeoObject[]>> {
    return this.guard('neows', async () => {
      const date = todayUtc();
      const url = `${API_ROOT}/neo/rest/v1/feed?start_date=${date}&end_date=${date}&api_key=${encodeURIComponent(this.apiKey)}`;
      const result = await this.broker.get<unknown>(url, `neo-${date}`, 1_800_000, force);
      return envelope(normalizeNeoFeed(result.data), result.mode, 'NASA/JPL NeoWs', date);
    }, () => envelope(DEMO_DATA.neo, 'demo', 'Built-in demonstration'));
  }

  async loadEarth(force = false): Promise<{ events: DataEnvelope<EarthEvent[]>; epic: DataEnvelope<EpicFrame[]> }> {
    const [events, epic] = await Promise.all([
      this.guard('eonet', async () => {
        const result = await this.broker.get<unknown>(`${EONET_ROOT}/events?status=open&limit=24&days=60`, 'eonet-open', 1_800_000, force);
        return envelope(normalizeEonet(result.data), result.mode, 'NASA EONET v3');
      }, () => envelope(DEMO_DATA.earth, 'demo', 'Built-in demonstration')),
      this.guard('epic', async () => {
        const result = await this.broker.get<unknown>(`${API_ROOT}/EPIC/api/natural?api_key=${encodeURIComponent(this.apiKey)}`, 'epic-natural', 3_600_000, force);
        const data = normalizeEpic(result.data, this.apiKey);
        if (!data.length) throw new Error('EPIC returned no frames');
        return envelope(data, result.mode, 'NASA DSCOVR EPIC', data[0]?.date);
      }, () => envelope([] as EpicFrame[], 'demo', 'Built-in demonstration')),
    ]);
    return { events, epic };
  }

  async loadSolar(force = false): Promise<DataEnvelope<SolarEvent[]>> {
    return this.guard('donki', async () => {
      const start = dateDaysAgo(30);
      const end = todayUtc();
      const cmeUrl = `${API_ROOT}/DONKI/CME?startDate=${start}&endDate=${end}&api_key=${encodeURIComponent(this.apiKey)}`;
      const flareUrl = `${API_ROOT}/DONKI/FLR?startDate=${start}&endDate=${end}&api_key=${encodeURIComponent(this.apiKey)}`;
      const cmes = await this.broker.get<unknown>(cmeUrl, `donki-cme-${end}`, 1_800_000, force);
      const flares = await this.broker.get<unknown>(flareUrl, `donki-flr-${end}`, 1_800_000, force);
      const mode: DataMode = cmes.mode === 'live' || flares.mode === 'live' ? 'live' : 'cache';
      return envelope(normalizeDonki(cmes.data, flares.data), mode, 'NASA DONKI', `${start} / ${end}`);
    }, () => envelope(DEMO_DATA.solar, 'demo', 'Built-in demonstration'));
  }

  async searchArchive(query: string, force = false): Promise<DataEnvelope<ArchiveItem[]>> {
    const clean = query.trim().slice(0, 120) || 'James Webb Space Telescope';
    return this.guard('images', async () => {
      const url = `${IMAGES_ROOT}/search?q=${encodeURIComponent(clean)}&media_type=image&page_size=24`;
      const result = await this.broker.get<unknown>(url, `images-${clean.toLowerCase()}`, 86_400_000, force);
      return envelope(normalizeArchive(result.data), result.mode, 'NASA Image and Video Library');
    }, () => envelope([] as ArchiveItem[], 'demo', 'Built-in demonstration'));
  }

  private async guard<T>(id: string, live: () => Promise<DataEnvelope<T>>, fallback: () => DataEnvelope<T>): Promise<DataEnvelope<T>> {
    this.setStatus(id, 'loading');
    try {
      const result = await live();
      this.setStatus(id, result.mode);
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.setStatus(id, 'demo', message);
      return fallback();
    }
  }

  private setStatus(id: string, status: ApiStatus, message?: string): void {
    const detail = { id, status, message, updatedAt: new Date().toISOString() } satisfies ApiStatusDetail;
    this.statuses.set(id, detail);
    this.dispatchEvent(new CustomEvent<ApiStatusDetail>('status', { detail }));
  }
}
