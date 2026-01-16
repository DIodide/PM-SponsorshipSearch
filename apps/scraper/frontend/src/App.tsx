import { useState, useCallback } from 'react';
import { useScrapers, useScraperData } from '@/hooks/useScrapers';
import { ScraperCard } from '@/components/ScraperCard';
import { DataViewer } from '@/components/DataViewer';
import { EnrichmentTasksPanel } from '@/components/EnrichmentTasksPanel';
import { ConvexExportAllModal } from '@/components/ConvexExportAllModal';
import { HugeiconsIcon } from '@hugeicons/react';
import {
  Database01Icon,
  RefreshIcon,
  GridIcon,
  SparklesIcon,
  Layers01Icon,
  CloudUploadIcon,
} from '@hugeicons/core-free-icons';

type ViewMode = 'scrapers' | 'enrichment';

function App() {
  const { scrapers, loading, error, refresh, run } = useScrapers();
  const [selectedScraperId, setSelectedScraperId] = useState<string | null>(null);
  const { data: scraperData, loading: dataLoading, refresh: refreshData } = useScraperData(selectedScraperId);
  const [viewMode, setViewMode] = useState<ViewMode>('scrapers');
  const [showExportAllModal, setShowExportAllModal] = useState(false);

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

  const handleTaskComplete = useCallback(() => {
    // Refresh scraper data when enrichment completes
    refreshData();
    refresh();
  }, [refreshData, refresh]);

  // Count active enrichment tasks from scrapers
  const totalTeams = scrapers.reduce((sum, s) => sum + s.last_teams_count, 0);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b bg-card/80 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-600 to-indigo-600 flex items-center justify-center shadow-lg shadow-violet-500/20">
                <HugeiconsIcon icon={GridIcon} size={20} className="text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold tracking-tight">PlayMaker Scraper</h1>
                <p className="text-sm text-muted-foreground">Sports Team Data Pipeline</p>
              </div>
            </div>
            
            {/* View Mode Tabs */}
            <div className="flex items-center gap-1 p-1 bg-muted rounded-lg">
              <button
                onClick={() => setViewMode('scrapers')}
                className={`inline-flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all ${
                  viewMode === 'scrapers'
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <HugeiconsIcon icon={Database01Icon} size={16} />
                Scrapers
              </button>
              <button
                onClick={() => setViewMode('enrichment')}
                className={`inline-flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all ${
                  viewMode === 'enrichment'
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <HugeiconsIcon icon={SparklesIcon} size={16} />
                Enrichment
              </button>
            </div>
            
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowExportAllModal(true)}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white hover:from-violet-700 hover:to-fuchsia-700 transition-all text-sm font-medium shadow-lg shadow-violet-500/20"
              >
                <HugeiconsIcon icon={CloudUploadIcon} size={16} />
                Export All to Convex
              </button>
              <button
                onClick={() => refresh()}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border hover:bg-muted transition-colors text-sm font-medium"
              >
                <HugeiconsIcon icon={RefreshIcon} size={16} />
                Refresh
              </button>
            </div>
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

        {/* Content based on view mode */}
        {!loading && !error && (
          <>
            {viewMode === 'scrapers' && (
              <>
                {/* Stats Bar */}
                <div className="grid grid-cols-4 gap-4 mb-8">
                  <div className="bg-card border rounded-xl p-4">
                    <div className="text-2xl font-bold">{scrapers.length}</div>
                    <div className="text-sm text-muted-foreground">Data Sources</div>
                  </div>
                  <div className="bg-card border rounded-xl p-4">
                    <div className="text-2xl font-bold">{totalTeams.toLocaleString()}</div>
                    <div className="text-sm text-muted-foreground">Total Teams</div>
                  </div>
                  <div className="bg-card border rounded-xl p-4">
                    <div className="text-2xl font-bold">
                      {scrapers.filter(s => s.status === 'running').length}
                    </div>
                    <div className="text-sm text-muted-foreground">Running</div>
                  </div>
                  <div className="bg-card border rounded-xl p-4">
                    <div className="text-2xl font-bold text-green-600">
                      {scrapers.filter(s => s.status === 'success').length}
                    </div>
                    <div className="text-sm text-muted-foreground">Ready</div>
                  </div>
                </div>

                {/* Scrapers Grid */}
                <section className="mb-8">
                  <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-2">
                      <HugeiconsIcon icon={Database01Icon} size={24} className="text-muted-foreground" />
                      <h2 className="text-2xl font-bold">Data Scrapers</h2>
                    </div>
                    <button
                      onClick={() => setViewMode('enrichment')}
                      className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white hover:from-violet-700 hover:to-fuchsia-700 transition-all font-medium shadow-lg shadow-violet-500/20"
                    >
                      <HugeiconsIcon icon={SparklesIcon} size={16} />
                      Enrich Data
                    </button>
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

            {viewMode === 'enrichment' && (
              <section>
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-2">
                    <HugeiconsIcon icon={Layers01Icon} size={24} className="text-muted-foreground" />
                    <h2 className="text-2xl font-bold">Data Enrichment</h2>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Run multiple enrichment tasks concurrently across different datasets
                  </p>
                </div>
                
                <EnrichmentTasksPanel 
                  scrapers={scrapers}
                  onTaskComplete={handleTaskComplete}
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

      {/* Export All Modal */}
      {showExportAllModal && (
        <ConvexExportAllModal onClose={() => setShowExportAllModal(false)} />
      )}
    </div>
  );
}

export default App;

