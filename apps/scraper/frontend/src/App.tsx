import { useState } from 'react';
import { useScrapers, useScraperData } from '@/hooks/useScrapers';
import { ScraperCard } from '@/components/ScraperCard';
import { DataViewer } from '@/components/DataViewer';
import { HugeiconsIcon } from '@hugeicons/react';
import {
  Database01Icon,
  RefreshIcon,
  GridIcon,
} from '@hugeicons/core-free-icons';

function App() {
  const { scrapers, loading, error, refresh, run } = useScrapers();
  const [selectedScraperId, setSelectedScraperId] = useState<string | null>(null);
  const { data: scraperData, loading: dataLoading, refresh: refreshData } = useScraperData(selectedScraperId);

  const handleViewData = (id: string) => {
    if (selectedScraperId === id) {
      setSelectedScraperId(null);
    } else {
      setSelectedScraperId(id);
    }
  };

  const handleRun = async (id: string) => {
    await run(id);
    // Refresh data view if this scraper is selected
    if (selectedScraperId === id) {
      setTimeout(() => refreshData(), 2000);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b bg-card/80 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center">
                <HugeiconsIcon icon={GridIcon} size={20} className="text-primary-foreground" />
              </div>
              <div>
                <h1 className="text-xl font-bold tracking-tight">PlayMaker Scraper</h1>
                <p className="text-sm text-muted-foreground">Sports Team Data Pipeline</p>
              </div>
            </div>
            
            <button
              onClick={() => refresh()}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border hover:bg-muted transition-colors text-sm font-medium"
            >
              <HugeiconsIcon icon={RefreshIcon} size={16} />
              Refresh
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-6 py-8">
        {/* Loading State */}
        {loading && (
          <div className="flex items-center justify-center py-16">
            <div className="flex items-center gap-3 text-muted-foreground">
              <div className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin" />
              Loading scrapers...
            </div>
          </div>
        )}

        {/* Error State */}
        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-red-700 mb-8">
            <p className="font-medium">Failed to load scrapers</p>
            <p className="text-sm mt-1">{error}</p>
            <button
              onClick={() => refresh()}
              className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-red-100 hover:bg-red-200 transition-colors text-sm font-medium"
            >
              <HugeiconsIcon icon={RefreshIcon} size={16} />
              Retry
            </button>
          </div>
        )}

        {/* Scrapers Grid */}
        {!loading && !error && (
          <>
            <section className="mb-8">
              <div className="flex items-center gap-2 mb-6">
                <HugeiconsIcon icon={Database01Icon} size={24} className="text-muted-foreground" />
                <h2 className="text-2xl font-bold">Data Scrapers</h2>
              </div>
              
              <div className="grid gap-6 md:grid-cols-2">
                {scrapers.map(scraper => (
                  <ScraperCard
                    key={scraper.id}
                    scraper={scraper}
                    onRun={handleRun}
                    onViewData={handleViewData}
                    isSelected={selectedScraperId === scraper.id}
                  />
                ))}
              </div>
            </section>

            {/* Data Viewer */}
            {selectedScraperId && (
              <section className="mt-8">
                <DataViewer
                  data={scraperData}
                  loading={dataLoading}
                  onClose={() => setSelectedScraperId(null)}
                  onDataChange={refreshData}
                />
              </section>
            )}
          </>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t mt-auto">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <p className="text-center text-sm text-muted-foreground">
            PlayMaker Scraper Dashboard • Built for sports sponsorship data collection
          </p>
        </div>
      </footer>
    </div>
  );
}

export default App;

