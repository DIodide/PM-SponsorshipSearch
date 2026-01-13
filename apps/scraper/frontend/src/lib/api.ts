import type { ScraperInfo, DataResponse, FileInfo, EnricherInfo, EnrichmentResult } from '@/types';

const API_BASE = '/api';

export async function fetchScrapers(): Promise<ScraperInfo[]> {
  const response = await fetch(`${API_BASE}/scrapers`);
  if (!response.ok) throw new Error('Failed to fetch scrapers');
  return response.json();
}

export async function fetchScraper(id: string): Promise<ScraperInfo> {
  const response = await fetch(`${API_BASE}/scrapers/${id}`);
  if (!response.ok) throw new Error('Failed to fetch scraper');
  return response.json();
}

export async function runScraper(id: string): Promise<{ success: boolean; message: string }> {
  const response = await fetch(`${API_BASE}/scrapers/${id}/run`, {
    method: 'POST',
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || 'Failed to run scraper');
  }
  return response.json();
}

export async function fetchScraperData(id: string): Promise<DataResponse> {
  const response = await fetch(`${API_BASE}/scrapers/${id}/data`);
  if (!response.ok) throw new Error('Failed to fetch scraper data');
  return response.json();
}

export async function fetchFiles(): Promise<FileInfo[]> {
  const response = await fetch(`${API_BASE}/files`);
  if (!response.ok) throw new Error('Failed to fetch files');
  return response.json();
}

export function getDownloadUrl(scraperId: string, fileType: 'json' | 'xlsx'): string {
  return `${API_BASE}/scrapers/${scraperId}/download/${fileType}`;
}

export async function updateTeam(
  scraperId: string,
  index: number,
  field: string,
  value: string
): Promise<{ success: boolean; old_value: string; new_value: string }> {
  const response = await fetch(`${API_BASE}/scrapers/${scraperId}/team`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ index, field, value }),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || 'Failed to update team');
  }
  return response.json();
}

export async function cleanRegions(
  scraperId: string
): Promise<{ success: boolean; updated_count: number; message: string }> {
  const response = await fetch(`${API_BASE}/scrapers/${scraperId}/clean-regions`, {
    method: 'POST',
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || 'Failed to clean regions');
  }
  return response.json();
}

// ============ Enrichment API ============

export async function fetchEnrichers(): Promise<EnricherInfo[]> {
  const response = await fetch(`${API_BASE}/enrichers`);
  if (!response.ok) throw new Error('Failed to fetch enrichers');
  return response.json();
}

export async function fetchEnricher(id: string): Promise<EnricherInfo> {
  const response = await fetch(`${API_BASE}/enrichers/${id}`);
  if (!response.ok) throw new Error('Failed to fetch enricher');
  return response.json();
}

export async function runEnrichment(
  scraperId: string,
  enricherIds?: string[]
): Promise<EnrichmentResult[]> {
  const response = await fetch(`${API_BASE}/scrapers/${scraperId}/enrich`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ enricher_ids: enricherIds }),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || 'Failed to run enrichment');
  }
  return response.json();
}

export interface EnrichmentStatus {
  has_data: boolean;
  teams_count: number;
  enrichments: Record<string, number>;
  available_enrichers?: string[];
}

export async function fetchEnrichmentStatus(scraperId: string): Promise<EnrichmentStatus> {
  const response = await fetch(`${API_BASE}/scrapers/${scraperId}/enrichment-status`);
  if (!response.ok) throw new Error('Failed to fetch enrichment status');
  return response.json();
}