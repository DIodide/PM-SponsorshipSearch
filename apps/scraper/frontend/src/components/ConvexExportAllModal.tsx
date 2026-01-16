import { useState, useEffect } from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import {
  Cancel01Icon,
  CloudUploadIcon,
  DatabaseIcon,
  CheckmarkCircle02Icon,
  AlertCircleIcon,
  InformationCircleIcon,
  ArrowRight02Icon,
} from '@hugeicons/core-free-icons';
import { fetchConvexExportAllPreview, exportAllToConvex } from '@/lib/api';
import type { ConvexExportAllPreview, ConvexExportAllResult, ConvexExportMode } from '@/types';

interface ConvexExportAllModalProps {
  onClose: () => void;
}

export function ConvexExportAllModal({ onClose }: ConvexExportAllModalProps) {
  const [step, setStep] = useState<'preview' | 'confirm' | 'result'>('preview');
  const [preview, setPreview] = useState<ConvexExportAllPreview | null>(null);
  const [result, setResult] = useState<ConvexExportAllResult | null>(null);
  const [exportMode, setExportMode] = useState<ConvexExportMode>('overwrite');
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchPreview();
  }, []);

  async function fetchPreview() {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchConvexExportAllPreview();
      setPreview(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load preview');
    } finally {
      setLoading(false);
    }
  }

  async function handleExport() {
    setExporting(true);
    setError(null);
    try {
      const data = await exportAllToConvex(exportMode);
      setResult(data);
      setStep('result');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Export failed');
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-card border rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b bg-gradient-to-r from-violet-500/10 to-fuchsia-500/10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-600 to-fuchsia-600 flex items-center justify-center">
              <HugeiconsIcon icon={CloudUploadIcon} size={20} className="text-white" />
            </div>
            <div>
              <h2 className="text-lg font-semibold">Export All to Convex</h2>
              <p className="text-sm text-muted-foreground">
                Export data from all scrapers to Convex database
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-muted transition-colors"
          >
            <HugeiconsIcon icon={Cancel01Icon} size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading && (
            <div className="flex flex-col items-center justify-center py-12 gap-4">
              <div className="w-8 h-8 border-2 border-violet-600 border-t-transparent rounded-full animate-spin" />
              <p className="text-muted-foreground">Loading export preview...</p>
            </div>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3">
              <HugeiconsIcon icon={AlertCircleIcon} size={20} className="text-red-600 mt-0.5" />
              <div>
                <p className="font-medium text-red-900">Error</p>
                <p className="text-sm text-red-700">{error}</p>
              </div>
            </div>
          )}

          {!loading && !error && step === 'preview' && preview && (
            <div className="space-y-6">
              {/* Summary Stats */}
              <div className="grid grid-cols-3 gap-4">
                <div className="bg-muted/50 rounded-xl p-4 text-center">
                  <div className="text-3xl font-bold text-violet-600">
                    {preview.total_teams.toLocaleString()}
                  </div>
                  <div className="text-sm text-muted-foreground">Total Teams</div>
                </div>
                <div className="bg-muted/50 rounded-xl p-4 text-center">
                  <div className="text-3xl font-bold text-fuchsia-600">
                    {preview.scrapers_with_data}
                  </div>
                  <div className="text-sm text-muted-foreground">Scrapers with Data</div>
                </div>
                <div className="bg-muted/50 rounded-xl p-4 text-center">
                  <div className="text-3xl font-bold text-amber-600">
                    {preview.existing_teams_in_convex.toLocaleString()}
                  </div>
                  <div className="text-sm text-muted-foreground">In Convex Now</div>
                </div>
              </div>

              {/* Scrapers Breakdown */}
              <div>
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                  Scrapers
                </h3>
                <div className="space-y-2">
                  {preview.scrapers.map((scraper) => (
                    <div
                      key={scraper.scraper_id}
                      className={`flex items-center justify-between p-3 rounded-lg border ${
                        scraper.has_data ? 'bg-green-50/50 border-green-200' : 'bg-muted/30'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        {scraper.has_data ? (
                          <HugeiconsIcon icon={CheckmarkCircle02Icon} size={16} className="text-green-600" />
                        ) : (
                          <HugeiconsIcon icon={InformationCircleIcon} size={16} className="text-muted-foreground" />
                        )}
                        <span className="font-medium">{scraper.scraper_name}</span>
                      </div>
                      <span className={`text-sm ${scraper.has_data ? 'text-green-700' : 'text-muted-foreground'}`}>
                        {scraper.teams_count.toLocaleString()} teams
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Leagues Breakdown */}
              {Object.keys(preview.leagues_breakdown).length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                    Leagues
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(preview.leagues_breakdown)
                      .sort((a, b) => b[1] - a[1])
                      .map(([league, count]) => (
                        <span
                          key={league}
                          className="px-3 py-1 bg-violet-100 text-violet-800 rounded-full text-sm"
                        >
                          {league}: {count}
                        </span>
                      ))}
                  </div>
                </div>
              )}

              {/* Data Quality */}
              <div>
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                  Data Quality
                </h3>
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                    <span className="text-sm">Has Geographic Data</span>
                    <span className="font-semibold">{preview.data_quality.has_geo_data}</span>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                    <span className="text-sm">Has Social Data</span>
                    <span className="font-semibold">{preview.data_quality.has_social_data}</span>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                    <span className="text-sm">Has Valuation Data</span>
                    <span className="font-semibold">{preview.data_quality.has_valuation_data}</span>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                    <span className="text-sm">Has Enrichments</span>
                    <span className="font-semibold">{preview.data_quality.has_enrichments}</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {!loading && !error && step === 'confirm' && preview && (
            <div className="space-y-6">
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
                <HugeiconsIcon icon={AlertCircleIcon} size={20} className="text-amber-600 mt-0.5" />
                <div>
                  <p className="font-medium text-amber-900">Confirm Export</p>
                  <p className="text-sm text-amber-700">
                    You are about to export {preview.total_teams.toLocaleString()} teams to Convex.
                  </p>
                </div>
              </div>

              <div>
                <h3 className="text-sm font-semibold mb-3">Export Mode</h3>
                <div className="space-y-2">
                  <label className={`flex items-start gap-3 p-4 rounded-xl border cursor-pointer transition-all ${
                    exportMode === 'overwrite' ? 'border-violet-500 bg-violet-50' : 'hover:bg-muted/50'
                  }`}>
                    <input
                      type="radio"
                      name="exportMode"
                      value="overwrite"
                      checked={exportMode === 'overwrite'}
                      onChange={() => setExportMode('overwrite')}
                      className="mt-1"
                    />
                    <div>
                      <div className="font-medium">Overwrite</div>
                      <div className="text-sm text-muted-foreground">
                        Delete all existing teams ({preview.existing_teams_in_convex}) and replace with new data
                      </div>
                    </div>
                  </label>

                  <label className={`flex items-start gap-3 p-4 rounded-xl border cursor-pointer transition-all ${
                    exportMode === 'append' ? 'border-violet-500 bg-violet-50' : 'hover:bg-muted/50'
                  }`}>
                    <input
                      type="radio"
                      name="exportMode"
                      value="append"
                      checked={exportMode === 'append'}
                      onChange={() => setExportMode('append')}
                      className="mt-1"
                    />
                    <div>
                      <div className="font-medium">Append</div>
                      <div className="text-sm text-muted-foreground">
                        Add new teams while keeping existing data (may create duplicates)
                      </div>
                    </div>
                  </label>
                </div>
              </div>
            </div>
          )}

          {step === 'result' && result && (
            <div className="space-y-6">
              {result.success ? (
                <div className="bg-green-50 border border-green-200 rounded-xl p-6 text-center">
                  <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
                    <HugeiconsIcon icon={CheckmarkCircle02Icon} size={32} className="text-green-600" />
                  </div>
                  <h3 className="text-xl font-semibold text-green-900 mb-2">Export Successful!</h3>
                  <p className="text-green-700">
                    {result.total_teams_exported.toLocaleString()} teams exported to Convex
                  </p>
                  {result.teams_deleted > 0 && (
                    <p className="text-sm text-green-600 mt-1">
                      ({result.teams_deleted} previous teams deleted)
                    </p>
                  )}
                </div>
              ) : (
                <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
                  <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4">
                    <HugeiconsIcon icon={AlertCircleIcon} size={32} className="text-red-600" />
                  </div>
                  <h3 className="text-xl font-semibold text-red-900 mb-2">Export Failed</h3>
                  <p className="text-red-700">{result.error || 'An error occurred during export'}</p>
                </div>
              )}

              {/* Scraper Results */}
              <div>
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                  Export Details
                </h3>
                <div className="space-y-2">
                  {result.scraper_results.map((scraperResult) => (
                    <div
                      key={scraperResult.scraper_id}
                      className={`flex items-center justify-between p-3 rounded-lg border ${
                        scraperResult.success && scraperResult.teams_exported > 0
                          ? 'bg-green-50/50 border-green-200'
                          : scraperResult.error
                          ? 'bg-red-50/50 border-red-200'
                          : 'bg-muted/30'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        {scraperResult.success && scraperResult.teams_exported > 0 ? (
                          <HugeiconsIcon icon={CheckmarkCircle02Icon} size={16} className="text-green-600" />
                        ) : scraperResult.error ? (
                          <HugeiconsIcon icon={AlertCircleIcon} size={16} className="text-red-600" />
                        ) : (
                          <HugeiconsIcon icon={InformationCircleIcon} size={16} className="text-muted-foreground" />
                        )}
                        <span className="font-medium">{scraperResult.scraper_name}</span>
                      </div>
                      <span className={`text-sm ${
                        scraperResult.error ? 'text-red-600' : 'text-muted-foreground'
                      }`}>
                        {scraperResult.error || `${scraperResult.teams_exported} teams`}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="text-center text-sm text-muted-foreground">
                Duration: {(result.duration_ms / 1000).toFixed(2)}s
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t p-6 bg-muted/30">
          <div className="flex justify-between">
            {step === 'preview' && (
              <>
                <button
                  onClick={onClose}
                  className="px-4 py-2 rounded-lg border hover:bg-muted transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => setStep('confirm')}
                  disabled={!preview || preview.total_teams === 0}
                  className="inline-flex items-center gap-2 px-6 py-2 rounded-lg bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white hover:from-violet-700 hover:to-fuchsia-700 transition-all font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Continue
                  <HugeiconsIcon icon={ArrowRight02Icon} size={16} />
                </button>
              </>
            )}

            {step === 'confirm' && (
              <>
                <button
                  onClick={() => setStep('preview')}
                  className="px-4 py-2 rounded-lg border hover:bg-muted transition-colors"
                >
                  Back
                </button>
                <button
                  onClick={handleExport}
                  disabled={exporting}
                  className="inline-flex items-center gap-2 px-6 py-2 rounded-lg bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white hover:from-violet-700 hover:to-fuchsia-700 transition-all font-medium disabled:opacity-50"
                >
                  {exporting ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Exporting...
                    </>
                  ) : (
                    <>
                      <HugeiconsIcon icon={CloudUploadIcon} size={16} />
                      {exportMode === 'overwrite' ? 'Overwrite & Export' : 'Append & Export'}
                    </>
                  )}
                </button>
              </>
            )}

            {step === 'result' && (
              <button
                onClick={onClose}
                className="w-full px-6 py-2 rounded-lg bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white hover:from-violet-700 hover:to-fuchsia-700 transition-all font-medium"
              >
                Done
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
