import type { ScraperInfo, DataResponse, FileInfo } from '@/types';

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

