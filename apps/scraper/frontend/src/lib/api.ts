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

// ============ Enrichment Tasks API ============

import type { EnrichmentTask, EnrichmentTaskListResponse, EnrichmentDiff } from '@/types';

export async function createEnrichmentTask(
  scraperId: string,
  enricherIds: string[]
): Promise<EnrichmentTask> {
  const response = await fetch(`${API_BASE}/enrichment-tasks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ scraper_id: scraperId, enricher_ids: enricherIds }),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || 'Failed to create enrichment task');
  }
  return response.json();
}

export async function fetchEnrichmentTasks(
  activeOnly: boolean = false
): Promise<EnrichmentTaskListResponse> {
  const url = `${API_BASE}/enrichment-tasks${activeOnly ? '?active_only=true' : ''}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error('Failed to fetch enrichment tasks');
  return response.json();
}

export async function fetchEnrichmentTask(taskId: string): Promise<EnrichmentTask> {
  const response = await fetch(`${API_BASE}/enrichment-tasks/${taskId}`);
  if (!response.ok) throw new Error('Failed to fetch enrichment task');
  return response.json();
}

export async function cancelEnrichmentTask(
  taskId: string
): Promise<{ success: boolean; message: string }> {
  const response = await fetch(`${API_BASE}/enrichment-tasks/${taskId}`, {
    method: 'DELETE',
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || 'Failed to cancel task');
  }
  return response.json();
}

export function subscribeToTaskUpdates(
  taskId: string,
  onUpdate: (task: EnrichmentTask) => void,
  onError?: (error: Error) => void
): () => void {
  const eventSource = new EventSource(`${API_BASE}/enrichment-tasks/${taskId}/stream`);
  
  eventSource.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data) as EnrichmentTask;
      onUpdate(data);
      
      // Auto-close if task is done
      if (['completed', 'failed', 'cancelled'].includes(data.status)) {
        eventSource.close();
      }
    } catch (e) {
      console.error('Failed to parse task update:', e);
    }
  };
  
  eventSource.onerror = () => {
    onError?.(new Error('Connection to task updates lost'));
    eventSource.close();
  };
  
  // Return cleanup function
  return () => eventSource.close();
}

export async function fetchEnrichmentTaskDiff(taskId: string): Promise<EnrichmentDiff> {
  const response = await fetch(`${API_BASE}/enrichment-tasks/${taskId}/diff`);
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || 'Failed to fetch task diff');
  }
  return response.json();
}

// ============ Convex Export API ============

import type { 
  ConvexStatus, 
  ConvexExportPreview, 
  ConvexExportResult, 
  ConvexExportMode,
  ConvexExportAllPreview,
  ConvexExportAllResult,
} from '@/types';

export async function fetchConvexStatus(): Promise<ConvexStatus> {
  const response = await fetch(`${API_BASE}/convex/status`);
  if (!response.ok) throw new Error('Failed to fetch Convex status');
  return response.json();
}

export async function fetchConvexExportPreview(scraperId: string): Promise<ConvexExportPreview> {
  const response = await fetch(`${API_BASE}/convex/preview`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ scraper_id: scraperId }),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || 'Failed to fetch export preview');
  }
  return response.json();
}

export async function exportToConvex(
  scraperId: string,
  mode: ConvexExportMode
): Promise<ConvexExportResult> {
  const response = await fetch(`${API_BASE}/convex/export`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ scraper_id: scraperId, mode }),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || 'Failed to export to Convex');
  }
  return response.json();
}

// ============ Convex Export All API ============

export async function fetchConvexExportAllPreview(): Promise<ConvexExportAllPreview> {
  const response = await fetch(`${API_BASE}/convex/preview-all`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || 'Failed to fetch export all preview');
  }
  return response.json();
}

export async function exportAllToConvex(
  mode: ConvexExportMode
): Promise<ConvexExportAllResult> {
  const response = await fetch(`${API_BASE}/convex/export-all`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mode }),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || 'Failed to export all to Convex');
  }
  return response.json();
}