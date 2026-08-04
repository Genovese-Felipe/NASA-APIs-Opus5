import { beforeEach, describe, expect, it, vi } from 'vitest';
import { normalizeApod, normalizeArchive, normalizeDonki, normalizeEonet, normalizeNeoFeed, RequestBroker } from '../src/api';

describe('NASA payload normalization', () => {
  it('normalizes APOD without discarding attribution', () => {
    const result = normalizeApod({ title: 'A Test Nebula', explanation: 'Science text', date: '2026-08-04', media_type: 'image', url: 'https://example.test/a.jpg', hdurl: 'https://example.test/a-hd.jpg', copyright: 'Researcher' });
    expect(result).toMatchObject({ title: 'A Test Nebula', date: '2026-08-04', mediaType: 'image', copyright: 'Researcher' });
  });

  it('rejects malformed APOD data', () => expect(() => normalizeApod({ media_type: 'image' })).toThrow('Invalid APOD'));

  it('normalizes NeoWs close-approach units', () => {
    const result = normalizeNeoFeed({ near_earth_objects: { '2026-08-04': [{
      id: '42', name: '(2026 QA)', is_potentially_hazardous_asteroid: true, nasa_jpl_url: 'https://ssd.jpl.nasa.gov/',
      estimated_diameter: { kilometers: { estimated_diameter_min: 0.1, estimated_diameter_max: 0.3 } },
      close_approach_data: [{ relative_velocity: { kilometers_per_second: '12.5' }, miss_distance: { kilometers: '900000' } }],
    }] } });
    expect(result[0]).toMatchObject({ id: '42', diameterKm: 0.2, velocityKps: 12.5, missDistanceKm: 900000, hazardous: true });
  });

  it('uses the most recent point geometry in EONET', () => {
    const result = normalizeEonet({ events: [{ id: 'E1', title: 'Storm', categories: [{ title: 'Severe Storms' }], sources: [{ url: 'https://example.test' }], geometry: [
      { date: '2026-08-01T00:00:00Z', geometry: { type: 'Point', coordinates: [10, 20] } },
      { date: '2026-08-04T00:00:00Z', geometry: { type: 'Point', coordinates: [12, 22] } },
    ] }] });
    expect(result[0]).toMatchObject({ longitude: 12, latitude: 22, category: 'Severe Storms' });
  });

  it('merges and sorts DONKI CME and flare events', () => {
    const result = normalizeDonki(
      [{ activityID: 'C1', startTime: '2026-08-03T10:00:00Z', cmeAnalyses: [{ speed: 640 }] }],
      [{ flrID: 'F1', beginTime: '2026-08-04T10:00:00Z', classType: 'M1.2' }],
    );
    expect(result.map((event) => event.id)).toEqual(['F1', 'C1']);
    expect(result[1]?.speedKps).toBe(640);
  });

  it('normalizes NASA Library collection+json safely', () => {
    const result = normalizeArchive({ collection: { items: [{ data: [{ nasa_id: 'A1', title: 'Moon', date_created: '1969-07-20T00:00:00Z', center: 'JSC', description: 'Record' }], links: [{ rel: 'preview', href: 'https://images-assets.nasa.gov/a.jpg' }] }] } });
    expect(result[0]).toMatchObject({ nasaId: 'A1', title: 'Moon', center: 'JSC' });
  });
});

describe('RequestBroker', () => {
  beforeEach(() => { localStorage.clear(); vi.restoreAllMocks(); });

  it('deduplicates later requests through the local TTL cache', async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', mockFetch);
    const broker = new RequestBroker(2);
    const first = await broker.get<{ ok: boolean }>('https://example.test/data', 'fixture', 60_000);
    const second = await broker.get<{ ok: boolean }>('https://example.test/data', 'fixture', 60_000);
    expect(first.mode).toBe('live');
    expect(second.mode).toBe('cache');
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('serves stale cache when the network fails', async () => {
    localStorage.setItem('opus5-api-v1:stale', JSON.stringify({ storedAt: 0, data: { value: 7 } }));
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    const result = await new RequestBroker().get<{ value: number }>('https://example.test/data', 'stale', 1);
    expect(result).toEqual({ data: { value: 7 }, mode: 'cache' });
  });
});
