import { useState, useEffect, useCallback, useRef } from 'react';
import type { ScraperInfo, DataResponse } from '@/types';
import { fetchScrapers, fetchScraperData, runScraper } from '@/lib/api';

export function useScrapers() {
  const [scrapers, setScrapers] = useState<ScraperInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Use ref to track scrapers for polling check without causing effect re-runs
  const scrapersRef = useRef<ScraperInfo[]>([]);
  scrapersRef.current = scrapers;

  const refresh = useCallback(async () => {
    try {
      const data = await fetchScrapers();
      setScrapers(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch scrapers');
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial fetch - only runs once
  useEffect(() => {
    refresh();
  }, [refresh]);

  // Polling interval - separate effect, only runs when a scraper is running
  useEffect(() => {
    const interval = setInterval(() => {
      // Use ref to check status without triggering re-renders
      if (scrapersRef.current.some(s => s.status === 'running')) {
        refresh();
      }
    }, 2000); // Poll every 3 seconds when running
    
    return () => clearInterval(interval);
  }, [refresh]);

  const run = useCallback(async (id: string) => {
    try {
      await runScraper(id);
      // Immediately refresh to show running status
      await refresh();
    } catch (err) {
      throw err;
    }
  }, [refresh]);

  return { scrapers, loading, error, refresh, run };
}

export function useScraperData(scraperId: string | null) {
  const [data, setData] = useState<DataResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!scraperId) {
      setData(null);
      return;
    }

    setLoading(true);
    
    try {
      const result = await fetchScraperData(scraperId);
      setData(result);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch data');
    } finally {
      setLoading(false);
    }
  }, [scraperId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { data, loading, error, refresh };
}

