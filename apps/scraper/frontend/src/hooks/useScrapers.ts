import { useState, useEffect, useCallback } from 'react';
import type { ScraperInfo, DataResponse } from '@/types';
import { fetchScrapers, fetchScraperData, runScraper } from '@/lib/api';

export function useScrapers() {
  const [scrapers, setScrapers] = useState<ScraperInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  useEffect(() => {
    refresh();
    // Poll every 2 seconds when any scraper is running
    const interval = setInterval(() => {
      if (scrapers.some(s => s.status === 'running')) {
        refresh();
      }
    }, 2000);
    return () => clearInterval(interval);
  }, [refresh, scrapers]);

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

