import { useState, useEffect } from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import {
  Cancel01Icon,
  CloudUploadIcon,
  DatabaseIcon,
  CheckmarkCircle02Icon,
  AlertCircleIcon,
  ArrowRight01Icon,
  InformationCircleIcon,
  Loading03Icon,
  Delete02Icon,
  Add01Icon,
} from '@hugeicons/core-free-icons';
import type { 
  ConvexExportPreview, 
  ConvexExportResult, 
  ConvexExportMode,
  ConvexTeamPreview,
} from '@/types';
import { 
  fetchConvexExportPreview, 
  exportToConvex, 
  fetchConvexStatus 
} from '@/lib/api';

interface ConvexExportModalProps {
  scraperId: string;
  scraperName: string;
  isOpen: boolean;
  onClose: () => void;
  onExportComplete?: () => void;
}

type ModalStep = 'preview' | 'confirm' | 'exporting' | 'result';

export function ConvexExportModal({
  scraperId,
  scraperName,
  isOpen,
  onClose,
  onExportComplete,
}: ConvexExportModalProps) {
  const [step, setStep] = useState<ModalStep>('preview');
  const [preview, setPreview] = useState<ConvexExportPreview | null>(null);
  const [result, setResult] = useState<ConvexExportResult | null>(null);
  const [selectedMode, setSelectedMode] = useState<ConvexExportMode>('overwrite');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [convexTeamCount, setConvexTeamCount] = useState<number>(0);

  // Load preview when modal opens
  useEffect(() => {
    if (isOpen && scraperId) {
      loadPreview();
    } else {
      // Reset state when closed
      setStep('preview');
      setPreview(null);
      setResult(null);
      setError(null);
    }
  }, [isOpen, scraperId]);

  const loadPreview = async () => {
    setLoading(true);
    setError(null);
    try {
      const [previewData, status] = await Promise.all([
        fetchConvexExportPreview(scraperId),
        fetchConvexStatus(),
      ]);
      setPreview(previewData);
      setConvexTeamCount(status.teams_count);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load preview');
    } finally {
      setLoading(false);
    }
  };

  const handleConfirm = () => {
    setStep('confirm');
  };

  const handleExport = async () => {
    setStep('exporting');
    setError(null);
    try {
      const exportResult = await exportToConvex(scraperId, selectedMode);
      setResult(exportResult);
      setStep('result');
      if (exportResult.success) {
        onExportComplete?.();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Export failed');
      setStep('confirm');
    }
  };

  const handleClose = () => {
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={handleClose}
      />
      
      {/* Modal */}
      <div className="relative z-10 w-full max-w-2xl mx-4 bg-card border rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b bg-muted/30">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center">
              <HugeiconsIcon icon={CloudUploadIcon} size={20} className="text-white" />
            </div>
            <div>
              <h2 className="text-lg font-semibold">Export to Convex</h2>
              <p className="text-sm text-muted-foreground">{scraperName}</p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="p-2 hover:bg-muted rounded-lg transition-colors"
          >
            <HugeiconsIcon icon={Cancel01Icon} size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {/* Loading State */}
          {loading && (
            <div className="flex flex-col items-center justify-center py-12">
              <HugeiconsIcon 
                icon={Loading03Icon} 
                size={40} 
                className="text-amber-500 animate-spin" 
              />
              <p className="mt-4 text-muted-foreground">Loading export preview...</p>
            </div>
          )}

          {/* Error State */}
          {error && !loading && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-700">
              <div className="flex items-center gap-2">
                <HugeiconsIcon icon={AlertCircleIcon} size={20} />
                <span className="font-medium">Error</span>
              </div>
              <p className="mt-1 text-sm">{error}</p>
              <button
                onClick={loadPreview}
                className="mt-3 px-4 py-2 text-sm bg-red-100 hover:bg-red-200 rounded-lg transition-colors"
              >
                Retry
              </button>
            </div>
          )}

          {/* Preview Step */}
          {step === 'preview' && preview && !loading && !error && (
            <div className="space-y-6">
              {/* Summary Stats */}
              <div className="grid grid-cols-3 gap-4">
                <div className="bg-muted/50 rounded-xl p-4 text-center">
                  <div className="text-2xl font-bold text-amber-600">
                    {preview.teams_to_export}
                  </div>
                  <div className="text-sm text-muted-foreground">Teams to Export</div>
                </div>
                <div className="bg-muted/50 rounded-xl p-4 text-center">
                  <div className="text-2xl font-bold text-blue-600">
                    {convexTeamCount}
                  </div>
                  <div className="text-sm text-muted-foreground">In Convex Now</div>
                </div>
                <div className="bg-muted/50 rounded-xl p-4 text-center">
                  <div className="text-2xl font-bold text-emerald-600">
                    {Object.keys(preview.leagues_breakdown).length}
                  </div>
                  <div className="text-sm text-muted-foreground">Leagues</div>
                </div>
              </div>

              {/* Leagues Breakdown */}
              <div>
                <h3 className="text-sm font-medium mb-3 text-muted-foreground">Leagues Breakdown</h3>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(preview.leagues_breakdown).map(([league, count]) => (
                    <span 
                      key={league}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-muted rounded-full text-sm"
                    >
                      <span className="font-medium">{league}</span>
                      <span className="text-muted-foreground">({count})</span>
                    </span>
                  ))}
                </div>
              </div>

              {/* Data Quality */}
              <div>
                <h3 className="text-sm font-medium mb-3 text-muted-foreground">Data Quality</h3>
                <div className="grid grid-cols-2 gap-3">
                  <DataQualityBar 
                    label="Geographic Data" 
                    value={preview.data_quality.has_geo_data} 
                    total={preview.teams_to_export}
                  />
                  <DataQualityBar 
                    label="Social Data" 
                    value={preview.data_quality.has_social_data} 
                    total={preview.teams_to_export}
                  />
                  <DataQualityBar 
                    label="Valuation Data" 
                    value={preview.data_quality.has_valuation_data} 
                    total={preview.teams_to_export}
                  />
                  <DataQualityBar 
                    label="Enriched" 
                    value={preview.data_quality.has_enrichments} 
                    total={preview.teams_to_export}
                  />
                </div>
              </div>

              {/* Sample Teams */}
              <div>
                <h3 className="text-sm font-medium mb-3 text-muted-foreground">Sample Teams</h3>
                <div className="border rounded-xl overflow-hidden">
                  <div className="max-h-48 overflow-y-auto">
                    {preview.sample_teams.map((team, idx) => (
                      <SampleTeamRow key={idx} team={team} />
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Confirm Step */}
          {step === 'confirm' && preview && (
            <div className="space-y-6">
              {/* Mode Selection */}
              <div>
                <h3 className="text-sm font-medium mb-3">Export Mode</h3>
                <div className="grid grid-cols-2 gap-4">
                  <button
                    onClick={() => setSelectedMode('overwrite')}
                    className={`p-4 border-2 rounded-xl text-left transition-all ${
                      selectedMode === 'overwrite'
                        ? 'border-amber-500 bg-amber-50/50'
                        : 'border-muted hover:border-muted-foreground/30'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <HugeiconsIcon 
                        icon={Delete02Icon} 
                        size={20} 
                        className={selectedMode === 'overwrite' ? 'text-amber-600' : 'text-muted-foreground'} 
                      />
                      <span className="font-medium">Overwrite</span>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Delete existing {convexTeamCount} teams and replace with {preview.teams_to_export} new teams
                    </p>
                  </button>
                  <button
                    onClick={() => setSelectedMode('append')}
                    className={`p-4 border-2 rounded-xl text-left transition-all ${
                      selectedMode === 'append'
                        ? 'border-emerald-500 bg-emerald-50/50'
                        : 'border-muted hover:border-muted-foreground/30'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <HugeiconsIcon 
                        icon={Add01Icon} 
                        size={20} 
                        className={selectedMode === 'append' ? 'text-emerald-600' : 'text-muted-foreground'} 
                      />
                      <span className="font-medium">Append</span>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Keep existing teams and add {preview.teams_to_export} new teams
                    </p>
                  </button>
                </div>
              </div>

              {/* Warning */}
              {selectedMode === 'overwrite' && convexTeamCount > 0 && (
                <div className="flex items-start gap-3 p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-800">
                  <HugeiconsIcon icon={AlertCircleIcon} size={20} className="shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium">This will delete all existing data</p>
                    <p className="text-sm mt-1">
                      {convexTeamCount} teams in the All_Teams table will be permanently deleted 
                      and replaced with the {preview.teams_to_export} teams from this scraper.
                    </p>
                  </div>
                </div>
              )}

              {/* Summary */}
              <div className="flex items-center justify-center gap-4 py-4">
                <div className="text-center">
                  <div className="text-lg font-bold">{convexTeamCount}</div>
                  <div className="text-xs text-muted-foreground">Current</div>
                </div>
                <HugeiconsIcon 
                  icon={ArrowRight01Icon} 
                  size={24} 
                  className="text-muted-foreground" 
                />
                <div className="text-center">
                  <div className="text-lg font-bold text-amber-600">
                    {selectedMode === 'overwrite' 
                      ? preview.teams_to_export 
                      : convexTeamCount + preview.teams_to_export
                    }
                  </div>
                  <div className="text-xs text-muted-foreground">After Export</div>
                </div>
              </div>
            </div>
          )}

          {/* Exporting Step */}
          {step === 'exporting' && (
            <div className="flex flex-col items-center justify-center py-12">
              <HugeiconsIcon 
                icon={Loading03Icon} 
                size={48} 
                className="text-amber-500 animate-spin" 
              />
              <p className="mt-4 text-lg font-medium">Exporting to Convex...</p>
              <p className="text-sm text-muted-foreground">
                {preview?.teams_to_export} teams being uploaded
              </p>
            </div>
          )}

          {/* Result Step */}
          {step === 'result' && result && (
            <div className="space-y-6">
              {result.success ? (
                <div className="text-center py-6">
                  <div className="w-16 h-16 mx-auto rounded-full bg-emerald-100 flex items-center justify-center mb-4">
                    <HugeiconsIcon 
                      icon={CheckmarkCircle02Icon} 
                      size={32} 
                      className="text-emerald-600" 
                    />
                  </div>
                  <h3 className="text-xl font-semibold text-emerald-600">Export Successful!</h3>
                  <p className="text-muted-foreground mt-2">
                    {result.teams_exported} teams exported to Convex
                  </p>
                </div>
              ) : (
                <div className="text-center py-6">
                  <div className="w-16 h-16 mx-auto rounded-full bg-red-100 flex items-center justify-center mb-4">
                    <HugeiconsIcon 
                      icon={AlertCircleIcon} 
                      size={32} 
                      className="text-red-600" 
                    />
                  </div>
                  <h3 className="text-xl font-semibold text-red-600">Export Failed</h3>
                  <p className="text-muted-foreground mt-2">{result.error}</p>
                </div>
              )}

              {/* Result Details */}
              <div className="grid grid-cols-3 gap-4">
                <div className="bg-muted/50 rounded-xl p-4 text-center">
                  <div className="text-xl font-bold">{result.teams_exported}</div>
                  <div className="text-sm text-muted-foreground">Exported</div>
                </div>
                <div className="bg-muted/50 rounded-xl p-4 text-center">
                  <div className="text-xl font-bold">{result.teams_deleted}</div>
                  <div className="text-sm text-muted-foreground">Deleted</div>
                </div>
                <div className="bg-muted/50 rounded-xl p-4 text-center">
                  <div className="text-xl font-bold">{(result.duration_ms / 1000).toFixed(1)}s</div>
                  <div className="text-sm text-muted-foreground">Duration</div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t bg-muted/20">
          {step === 'preview' && (
            <>
              <button
                onClick={handleClose}
                className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirm}
                disabled={!preview || loading}
                className="inline-flex items-center gap-2 px-6 py-2.5 bg-gradient-to-r from-amber-500 to-orange-600 text-white rounded-lg font-medium hover:from-amber-600 hover:to-orange-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Continue
                <HugeiconsIcon icon={ArrowRight01Icon} size={16} />
              </button>
            </>
          )}

          {step === 'confirm' && (
            <>
              <button
                onClick={() => setStep('preview')}
                className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
              >
                Back
              </button>
              <button
                onClick={handleExport}
                className={`inline-flex items-center gap-2 px-6 py-2.5 rounded-lg font-medium transition-all ${
                  selectedMode === 'overwrite'
                    ? 'bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700'
                    : 'bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700'
                } text-white`}
              >
                <HugeiconsIcon icon={CloudUploadIcon} size={16} />
                {selectedMode === 'overwrite' ? 'Overwrite & Export' : 'Append & Export'}
              </button>
            </>
          )}

          {step === 'exporting' && (
            <div className="w-full text-center text-sm text-muted-foreground">
              Please wait...
            </div>
          )}

          {step === 'result' && (
            <button
              onClick={handleClose}
              className="w-full px-6 py-2.5 bg-muted hover:bg-muted/80 rounded-lg font-medium transition-colors"
            >
              Close
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// Helper Components

function DataQualityBar({ 
  label, 
  value, 
  total 
}: { 
  label: string; 
  value: number; 
  total: number;
}) {
  const percentage = total > 0 ? (value / total) * 100 : 0;
  
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-sm">
        <span>{label}</span>
        <span className="text-muted-foreground">{value}/{total}</span>
      </div>
      <div className="h-2 bg-muted rounded-full overflow-hidden">
        <div 
          className={`h-full rounded-full transition-all ${
            percentage >= 75 ? 'bg-emerald-500' :
            percentage >= 50 ? 'bg-amber-500' :
            percentage >= 25 ? 'bg-orange-500' :
            'bg-red-500'
          }`}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}

function SampleTeamRow({ team }: { team: ConvexTeamPreview }) {
  return (
    <div className="flex items-center justify-between px-4 py-2.5 border-b last:border-b-0 hover:bg-muted/30">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center">
          <HugeiconsIcon icon={DatabaseIcon} size={14} className="text-muted-foreground" />
        </div>
        <div>
          <div className="font-medium text-sm">{team.name}</div>
          <div className="text-xs text-muted-foreground">
            {team.league || 'Unknown'} • {team.region || 'Unknown'}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-1.5">
        {team.has_geo_data && (
          <span className="px-1.5 py-0.5 text-xs bg-blue-100 text-blue-700 rounded">Geo</span>
        )}
        {team.has_social_data && (
          <span className="px-1.5 py-0.5 text-xs bg-purple-100 text-purple-700 rounded">Social</span>
        )}
        {team.has_valuation_data && (
          <span className="px-1.5 py-0.5 text-xs bg-emerald-100 text-emerald-700 rounded">Value</span>
        )}
        {team.enrichments_count > 0 && (
          <span className="px-1.5 py-0.5 text-xs bg-amber-100 text-amber-700 rounded">
            +{team.enrichments_count}
          </span>
        )}
      </div>
    </div>
  );
}
