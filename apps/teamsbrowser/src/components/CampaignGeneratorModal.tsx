import { useState, useCallback } from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import {
  Cancel01Icon,
  CloudUploadIcon,
  SparklesIcon,
  ArrowRight01Icon,
  ArrowLeft02Icon,
  Image01Icon,
} from '@hugeicons/core-free-icons';
import { TOUCHPOINTS, MEDIA_STRATEGIES, type GeneratedCampaign } from '../types';
import { uploadCreativeFile, generateCampaign, type GenerateCampaignParams } from '../lib/api';

interface CampaignGeneratorModalProps {
  teamId: string;
  teamName: string;
  teamLeague: string;
  teamRegion: string;
  onClose: () => void;
  onCampaignGenerated: (campaign: GeneratedCampaign) => void;
}

type Step = 'strategy' | 'visuals' | 'generating' | 'complete';

export function CampaignGeneratorModal({
  teamId,
  teamName,
  teamLeague,
  teamRegion,
  onClose,
  onCampaignGenerated,
}: CampaignGeneratorModalProps) {
  const [step, setStep] = useState<Step>('strategy');
  const [mediaStrategy, setMediaStrategy] = useState('earned');
  const [selectedTouchpoints, setSelectedTouchpoints] = useState<string[]>(['media', 'social']);
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  const [uploadedUrls, setUploadedUrls] = useState<string[]>([]);
  const [notes, setNotes] = useState('');
  const [generateVisuals, setGenerateVisuals] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [generationProgress, setGenerationProgress] = useState('');
  const [error, setError] = useState<string | null>(null);

  const toggleTouchpoint = (value: string) => {
    setSelectedTouchpoints((prev) =>
      prev.includes(value)
        ? prev.filter((v) => v !== value)
        : [...prev, value]
    );
  };

  const handleFileSelect = useCallback(async (files: FileList | null) => {
    if (!files) return;

    const imageFiles = Array.from(files).filter((f) =>
      f.type.startsWith('image/')
    );
    if (imageFiles.length === 0) return;

    setIsUploading(true);
    setError(null);

    try {
      const newUrls: string[] = [];
      for (const file of imageFiles) {
        const url = await uploadCreativeFile(file);
        newUrls.push(url);
      }
      setUploadedFiles((prev) => [...prev, ...imageFiles]);
      setUploadedUrls((prev) => [...prev, ...newUrls]);
    } catch (err) {
      console.error('Upload failed:', err);
      setError('Failed to upload files. Please try again.');
    } finally {
      setIsUploading(false);
    }
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      handleFileSelect(e.dataTransfer.files);
    },
    [handleFileSelect]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
  }, []);

  const removeFile = (index: number) => {
    setUploadedFiles((prev) => prev.filter((_, i) => i !== index));
    setUploadedUrls((prev) => prev.filter((_, i) => i !== index));
  };

  const handleGenerate = async () => {
    setStep('generating');
    setError(null);
    setGenerationProgress('Preparing campaign parameters...');

    try {
      const params: GenerateCampaignParams = {
        teamId,
        teamName,
        teamLeague,
        teamRegion,
        mediaStrategy,
        touchpoints: selectedTouchpoints,
        notes: notes || undefined,
        uploadedImageUrls: uploadedUrls.length > 0 ? uploadedUrls : undefined,
        generateVisuals: generateVisuals && uploadedUrls.length === 0,
      };

      setGenerationProgress('Generating campaign with AI...');
      
      if (params.generateVisuals) {
        setGenerationProgress('Generating campaign details and visuals (this may take 30-60 seconds)...');
      }

      const campaign = await generateCampaign(params);

      setGenerationProgress('Campaign generated successfully!');
      setStep('complete');
      onCampaignGenerated(campaign);
    } catch (err) {
      console.error('Generation failed:', err);
      setError('Failed to generate campaign. Please try again.');
      setStep('visuals');
    }
  };

  const canProceedToVisuals = selectedTouchpoints.length > 0;
  const canGenerate = selectedTouchpoints.length > 0;

  return (
    <div 
      className="w-[480px] flex-shrink-0 bg-white border-l border-gray-200 shadow-xl flex flex-col h-screen sticky top-0"
      style={{ animation: 'slideInRight 0.3s ease-out' }}
    >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Generate AI Campaign</h2>
            <p className="text-sm text-gray-500 mt-0.5">
              {step === 'strategy' &&
                'Based on your previous answers, we took a stab at some top level details. Adjust as needed to better fit your needs.'}
              {step === 'visuals' &&
                'Add any extra thoughts you have on this campaign before we go into full generation-mode. Drop proposed creatives and add any notes you have that could help the algorithm.'}
              {step === 'generating' && 'Creating your campaign...'}
              {step === 'complete' && 'Your campaign is ready!'}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <HugeiconsIcon icon={Cancel01Icon} size={20} className="text-gray-500" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* Step 1: Strategy Selection */}
          {step === 'strategy' && (
            <div className="space-y-6">
              {/* Media Strategy */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-3">
                  Media Strategy
                </label>
                <div className="space-y-2">
                  {MEDIA_STRATEGIES.map((strategy) => (
                    <label
                      key={strategy.value}
                      className="flex items-center gap-3 cursor-pointer"
                    >
                      <input
                        type="radio"
                        name="mediaStrategy"
                        value={strategy.value}
                        checked={mediaStrategy === strategy.value}
                        onChange={(e) => setMediaStrategy(e.target.value)}
                        className="w-4 h-4 text-slate-800 border-gray-300 focus:ring-slate-500"
                      />
                      <span className="text-sm text-gray-700">{strategy.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Touchpoints */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-3">
                  Touchpoints
                </label>
                <div className="flex flex-wrap gap-2">
                  {TOUCHPOINTS.map((touchpoint) => {
                    const isSelected = selectedTouchpoints.includes(touchpoint.value);
                    return (
                      <button
                        key={touchpoint.value}
                        type="button"
                        onClick={() => toggleTouchpoint(touchpoint.value)}
                        className={`px-4 py-2 text-sm font-medium rounded-full border transition-all ${
                          isSelected
                            ? 'bg-slate-800 text-white border-slate-800'
                            : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
                        }`}
                      >
                        {touchpoint.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* Step 2: Visuals & Notes */}
          {step === 'visuals' && (
            <div className="space-y-6">
              {/* Key Visuals Upload */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-3">
                  Key Visuals
                </label>
                <div
                  onDrop={handleDrop}
                  onDragOver={handleDragOver}
                  className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center hover:border-gray-400 transition-colors"
                >
                  <div className="flex flex-col items-center">
                    <HugeiconsIcon
                      icon={CloudUploadIcon}
                      size={32}
                      className="text-gray-400 mb-3"
                    />
                    <p className="text-sm font-medium text-gray-700 mb-1">
                      Drag and drop your file here
                    </p>
                    <p className="text-xs text-gray-500 mb-3">or click to select a file</p>
                    <input
                      type="file"
                      multiple
                      accept="image/*"
                      onChange={(e) => handleFileSelect(e.target.files)}
                      className="hidden"
                      id="file-upload"
                    />
                    <label
                      htmlFor="file-upload"
                      className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 cursor-pointer transition-colors"
                    >
                      Select Files
                    </label>
                  </div>
                </div>

                {/* Uploaded Files Preview */}
                {uploadedFiles.length > 0 && (
                  <div className="mt-4 flex flex-wrap gap-3">
                    {uploadedFiles.map((file, index) => (
                      <div
                        key={index}
                        className="relative w-20 h-20 rounded-lg overflow-hidden bg-gray-100"
                      >
                        <img
                          src={URL.createObjectURL(file)}
                          alt={file.name}
                          className="w-full h-full object-cover"
                        />
                        <button
                          onClick={() => removeFile(index)}
                          className="absolute top-1 right-1 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center text-xs hover:bg-red-600"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {isUploading && (
                  <div className="mt-3 text-sm text-gray-500">Uploading files...</div>
                )}
              </div>

              {/* AI Visual Generation Toggle */}
              {uploadedUrls.length === 0 && (
                <div className="flex items-center gap-3 p-4 bg-gradient-to-r from-violet-50 to-purple-50 rounded-xl border border-violet-100">
                  <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center">
                    <HugeiconsIcon icon={Image01Icon} size={20} className="text-white" />
                  </div>
                  <div className="flex-1">
                    <div className="text-sm font-medium text-gray-900">
                      Generate AI Visuals
                    </div>
                    <p className="text-xs text-gray-500">
                      Let AI create activation visuals based on your campaign
                    </p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={generateVisuals}
                      onChange={(e) => setGenerateVisuals(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-violet-600"></div>
                  </label>
                </div>
              )}

              {/* Notes */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Notes
                </label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="E.g. This campaign should be social first and influencer heavy. We really want to include the Laker's girls as well."
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 resize-none"
                  rows={4}
                />
              </div>
            </div>
          )}

          {/* Step 3: Generating */}
          {step === 'generating' && (
            <div className="flex flex-col items-center justify-center py-12">
              <div className="w-16 h-16 border-4 border-teal-200 border-t-teal-600 rounded-full animate-spin mb-6" />
              <p className="text-gray-700 font-medium mb-2">Generating Your Campaign</p>
              <p className="text-sm text-gray-500 text-center max-w-md">
                {generationProgress}
              </p>
              {generateVisuals && uploadedUrls.length === 0 && (
                <p className="text-xs text-gray-400 mt-4">
                  AI image generation may take 30-60 seconds
                </p>
              )}
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        {step !== 'generating' && step !== 'complete' && (
          <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between">
            {step === 'visuals' ? (
              <button
                onClick={() => setStep('strategy')}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors"
              >
                <HugeiconsIcon icon={ArrowLeft02Icon} size={16} />
                Back
              </button>
            ) : (
              <div />
            )}

            {step === 'strategy' && (
              <button
                onClick={() => setStep('visuals')}
                disabled={!canProceedToVisuals}
                className="flex items-center gap-2 px-5 py-2 text-sm font-medium text-white bg-slate-800 rounded-lg hover:bg-slate-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Continue
                <HugeiconsIcon icon={ArrowRight01Icon} size={16} />
              </button>
            )}

            {step === 'visuals' && (
              <button
                onClick={handleGenerate}
                disabled={!canGenerate || isUploading}
                className="flex items-center gap-2 px-5 py-2 text-sm font-medium text-white bg-teal-600 rounded-lg hover:bg-teal-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <HugeiconsIcon icon={SparklesIcon} size={16} />
                Generate Campaign
              </button>
            )}
          </div>
        )}
    </div>
  );
}
