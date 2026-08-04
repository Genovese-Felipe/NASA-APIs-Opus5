import type { ApiSource, QualityProfile } from './types';

export const QUALITY_PROFILES: Record<string, QualityProfile> = {
  low: { id: 'low', renderScale: 0.58, maxPixelRatio: 1, starLayers: 1, bloom: 0.25, targetFps: 60 },
  balanced: { id: 'balanced', renderScale: 0.82, maxPixelRatio: 1.5, starLayers: 2, bloom: 0.45, targetFps: 60 },
  high: { id: 'high', renderScale: 1, maxPixelRatio: 2, starLayers: 3, bloom: 0.72, targetFps: 90 },
  ultra: { id: 'ultra', renderScale: 1.18, maxPixelRatio: 2.5, starLayers: 4, bloom: 0.95, targetFps: 120 },
};

export const API_CATALOG: ApiSource[] = [
  {
    id: 'apod', name: 'Astronomy Picture of the Day', agency: 'NASA', module: 'orbit', status: 'live', browserPolicy: 'keyed-cors',
    description: 'Daily astronomy media and an expert-written explanation.', docs: 'https://api.nasa.gov/',
  },
  {
    id: 'neows', name: 'Asteroids NeoWs', agency: 'NASA/JPL', module: 'neo', status: 'live', browserPolicy: 'keyed-cors',
    description: 'Near-Earth object discovery, close-approach, velocity, size, and hazard metadata.', docs: 'https://api.nasa.gov/',
  },
  {
    id: 'donki', name: 'DONKI Space Weather', agency: 'NASA/GSFC', module: 'helio', status: 'live', browserPolicy: 'keyed-cors',
    description: 'Coronal mass ejections, solar flares, and linked space-weather analyses.', docs: 'https://api.nasa.gov/',
  },
  {
    id: 'epic', name: 'DSCOVR EPIC', agency: 'NASA/NOAA', module: 'earth', status: 'live', browserPolicy: 'keyed-cors',
    description: 'Full-disc Earth imagery and observation geometry from the L1 point.', docs: 'https://epic.gsfc.nasa.gov/about/api',
  },
  {
    id: 'eonet', name: 'EONET v3', agency: 'NASA/GSFC', module: 'earth', status: 'live', browserPolicy: 'cors',
    description: 'Curated natural-event metadata with categories, sources, time, and GeoJSON geometry.', docs: 'https://eonet.gsfc.nasa.gov/docs/v3',
  },
  {
    id: 'images', name: 'NASA Image and Video Library', agency: 'NASA', module: 'archive', status: 'live', browserPolicy: 'cors',
    description: 'Searchable image, video, and audio records with source metadata and asset manifests.', docs: 'https://images.nasa.gov/docs/images.nasa.gov_api_docs.pdf',
  },
  {
    id: 'gibs', name: 'Global Imagery Browse Services', agency: 'NASA EOSDIS', module: 'earth', status: 'live', browserPolicy: 'cors',
    description: 'Standards-based global satellite imagery layers for Earth science.', docs: 'https://nasa-gibs.github.io/gibs-api-docs/',
  },
  {
    id: 'exoplanet', name: 'NASA Exoplanet Archive TAP', agency: 'NASA/IPAC', module: 'catalog', status: 'live', browserPolicy: 'deep-link-only',
    description: 'Confirmed planets, host stars, candidates, and derived planetary-system parameters.', docs: 'https://exoplanetarchive.ipac.caltech.edu/docs/TAP/usingTAP.html',
  },
  {
    id: 'techtransfer', name: 'NASA Technology Transfer', agency: 'NASA', module: 'catalog', status: 'live', browserPolicy: 'keyed-cors',
    description: 'Patents, software, and technologies available for licensing.', docs: 'https://api.nasa.gov/',
  },
  {
    id: 'tle', name: 'NASA Two-Line Elements', agency: 'NASA', module: 'orbit', status: 'live', browserPolicy: 'keyed-cors',
    description: 'Orbital element sets for tracked spacecraft and objects.', docs: 'https://api.nasa.gov/',
  },
  {
    id: 'jpl-ssd', name: 'JPL SSD/CNEOS API Service', agency: 'NASA/JPL', module: 'catalog', status: 'reference-only', browserPolicy: 'deep-link-only',
    description: 'Horizons, SBDB, Sentry, Scout, fireballs, close approaches, and other specialist services. Official policy prohibits embedding these endpoints in a website.', docs: 'https://ssd-api.jpl.nasa.gov/',
  },
  {
    id: 'mars-rover', name: 'Mars Rover Photos', agency: 'NASA/JPL', module: 'archive', status: 'archived', browserPolicy: 'deep-link-only',
    description: 'Legacy Mars rover photo endpoint; the NASA API portal marks it archived.', docs: 'https://api.nasa.gov/',
  },
  {
    id: 'insight', name: 'InSight Mars Weather', agency: 'NASA/JPL', module: 'archive', status: 'archived', browserPolicy: 'deep-link-only',
    description: 'Historical weather observations from the completed InSight mission.', docs: 'https://api.nasa.gov/',
  },
];

export const SCENE_ACCENTS = {
  orbit: [0.15, 0.78, 1] as const,
  earth: [0.1, 0.88, 0.72] as const,
  neo: [1, 0.42, 0.16] as const,
  helio: [1, 0.16, 0.42] as const,
  archive: [0.67, 0.36, 1] as const,
};
