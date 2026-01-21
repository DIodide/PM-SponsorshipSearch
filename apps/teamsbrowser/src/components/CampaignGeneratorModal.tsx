import { useState, useCallback, useEffect, useRef } from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import {
  Cancel01Icon,
  CloudUploadIcon,
  SparklesIcon,
  ArrowRight01Icon,
  ArrowLeft02Icon,
  Image01Icon,
  CheckmarkCircle02Icon,
  Loading03Icon,
} from '@hugeicons/core-free-icons';
import { TOUCHPOINTS, MEDIA_STRATEGIES, type GeneratedCampaign } from '../types';
import { uploadCreativeFile, generateCampaign, type GenerateCampaignParams } from '../lib/api';

// Generation step configuration
interface GenerationStep {
  id: string;
  label: string;
  description: string;
  duration: number; // estimated duration in ms
}

const GENERATION_STEPS_WITH_VISUALS: GenerationStep[] = [
  { id: 'prepare', label: 'Preparing', description: 'Setting up campaign parameters', duration: 1000 },
  { id: 'knowledge', label: 'Searching Knowledge', description: 'Querying scraped sponsorship database', duration: 2000 },
  { id: 'strategy', label: 'Crafting Strategy', description: 'Building campaign framework', duration: 4000 },
  { id: 'content', label: 'Writing Content', description: 'Generating tactics & messaging', duration: 5000 },
  { id: 'visuals', label: 'Creating Visuals', description: 'Generating campaign imagery', duration: 20000 },
  { id: 'finalize', label: 'Finalizing', description: 'Polishing your campaign', duration: 2000 },
];

const GENERATION_STEPS_NO_VISUALS: GenerationStep[] = [
  { id: 'prepare', label: 'Preparing', description: 'Setting up campaign parameters', duration: 1000 },
  { id: 'knowledge', label: 'Searching Knowledge', description: 'Querying scraped sponsorship database', duration: 2000 },
  { id: 'strategy', label: 'Crafting Strategy', description: 'Building campaign framework', duration: 3000 },
  { id: 'content', label: 'Writing Content', description: 'Generating tactics & messaging', duration: 4000 },
  { id: 'finalize', label: 'Finalizing', description: 'Polishing your campaign', duration: 1000 },
];

// Tips that rotate during generation
const GENERATION_TIPS = [
  "AI campaigns work best when you add specific notes about your brand goals",
  "Include your target demographic in the notes for more tailored tactics",
  "Mention seasonal events or holidays to time your campaign perfectly",
  "The more touchpoints you select, the more diverse your activation ideas",
  "Try different media strategies to see how campaigns adapt",
  "Previous sponsorships help AI understand what works for this team",
  "Local teams often have stronger community engagement opportunities",
  "Consider the team's fanbase demographics when reviewing tactics",
];

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
  const [error, setError] = useState<string | null>(null);
  
  // Progress tracking
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [stepProgress, setStepProgress] = useState(0);
  const [elapsedTime, setElapsedTime] = useState(0);
  const startTimeRef = useRef<number>(0);
  const progressIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  
  const generationSteps = generateVisuals && uploadedUrls.length === 0 
    ? GENERATION_STEPS_WITH_VISUALS 
    : GENERATION_STEPS_NO_VISUALS;
  
  const totalDuration = generationSteps.reduce((sum, s) => sum + s.duration, 0);
  
  // Calculate overall progress percentage
  const calculateOverallProgress = (stepIdx: number, stepProg: number) => {
    let completedDuration = 0;
    for (let i = 0; i < stepIdx; i++) {
      completedDuration += generationSteps[i].duration;
    }
    const currentStepDuration = generationSteps[stepIdx]?.duration || 0;
    const currentStepProgress = (stepProg / 100) * currentStepDuration;
    return Math.min(95, ((completedDuration + currentStepProgress) / totalDuration) * 100);
  };
  
  // Tip rotation
  const [currentTipIndex, setCurrentTipIndex] = useState(0);
  
  // Progress simulation effect
  useEffect(() => {
    if (step !== 'generating') {
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
      }
      return;
    }
    
    startTimeRef.current = Date.now();
    // Start with a random tip
    setCurrentTipIndex(Math.floor(Math.random() * GENERATION_TIPS.length));
    
    progressIntervalRef.current = setInterval(() => {
      const elapsed = Date.now() - startTimeRef.current;
      setElapsedTime(elapsed);
      
      // Find which step we should be on based on elapsed time
      let accumulatedTime = 0;
      let targetStepIndex = 0;
      
      for (let i = 0; i < generationSteps.length; i++) {
        if (elapsed < accumulatedTime + generationSteps[i].duration) {
          targetStepIndex = i;
          const stepElapsed = elapsed - accumulatedTime;
          const stepProgress = Math.min(95, (stepElapsed / generationSteps[i].duration) * 100);
          setStepProgress(stepProgress);
          break;
        }
        accumulatedTime += generationSteps[i].duration;
        if (i === generationSteps.length - 1) {
          targetStepIndex = i;
          setStepProgress(95); // Cap at 95% until actually complete
        }
      }
      
      setCurrentStepIndex(targetStepIndex);
    }, 100);
    
    return () => {
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
      }
    };
  }, [step, generationSteps]);
  
  // Rotate tips every 5 seconds
  useEffect(() => {
    if (step !== 'generating') return;
    
    const tipInterval = setInterval(() => {
      setCurrentTipIndex(prev => (prev + 1) % GENERATION_TIPS.length);
    }, 5000);
    
    return () => clearInterval(tipInterval);
  }, [step]);

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
    setCurrentStepIndex(0);
    setStepProgress(0);
    setElapsedTime(0);

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

      const campaign = await generateCampaign(params);

      // Complete all steps
      setCurrentStepIndex(generationSteps.length - 1);
      setStepProgress(100);
      
      // Brief pause to show completion
      await new Promise(resolve => setTimeout(resolve, 500));
      
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
            <div className="py-4">
              {/* Header */}
              <div className="mb-6">
                <h3 className="text-base font-semibold text-gray-900">Creating Your Campaign</h3>
                <p className="text-xs text-gray-400 mt-0.5">
                  {Math.floor(elapsedTime / 1000)}s elapsed
                </p>
              </div>
              
              {/* Overall Progress Bar */}
              <div className="mb-6">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs text-gray-500">Progress</span>
                  <span className="text-xs font-medium text-gray-700">
                    {Math.round(calculateOverallProgress(currentStepIndex, stepProgress))}%
                  </span>
                </div>
                <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-teal-600 rounded-full transition-all duration-300 ease-out"
                    style={{ width: `${calculateOverallProgress(currentStepIndex, stepProgress)}%` }}
                  />
                </div>
              </div>
              
              {/* Steps List */}
              <div className="space-y-2">
                {generationSteps.map((genStep, index) => {
                  const isComplete = index < currentStepIndex;
                  const isCurrent = index === currentStepIndex;
                  
                  return (
                    <div 
                      key={genStep.id}
                      className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-300 ${
                        isCurrent 
                          ? 'bg-slate-50 border border-slate-200' 
                          : isComplete 
                            ? 'bg-gray-50/50' 
                            : ''
                      }`}
                    >
                      {/* Status Icon */}
                      <div className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center ${
                        isComplete 
                          ? 'bg-teal-600' 
                          : isCurrent 
                            ? 'bg-slate-700' 
                            : 'bg-gray-200'
                      }`}>
                        {isComplete ? (
                          <HugeiconsIcon icon={CheckmarkCircle02Icon} size={14} className="text-white" />
                        ) : isCurrent ? (
                          <HugeiconsIcon icon={Loading03Icon} size={14} className="text-white animate-spin" />
                        ) : (
                          <span className="text-[10px] font-medium text-gray-500">{index + 1}</span>
                        )}
                      </div>
                      
                      {/* Step Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <span className={`text-sm ${
                            isComplete 
                              ? 'text-gray-500' 
                              : isCurrent 
                                ? 'text-gray-900 font-medium' 
                                : 'text-gray-400'
                          }`}>
                            {genStep.label}
                          </span>
                          {isCurrent && (
                            <span className="text-xs text-gray-500">
                              {Math.round(stepProgress)}%
                            </span>
                          )}
                          {isComplete && (
                            <HugeiconsIcon icon={CheckmarkCircle02Icon} size={14} className="text-teal-600" />
                          )}
                        </div>
                        {isCurrent && (
                          <p className="text-xs text-gray-500 mt-0.5">
                            {genStep.description}
                          </p>
                        )}
                        
                        {/* Step Progress Bar */}
                        {isCurrent && (
                          <div className="mt-2 h-1 bg-gray-200 rounded-full overflow-hidden">
                            <div 
                              className="h-full bg-slate-600 rounded-full transition-all duration-200"
                              style={{ width: `${stepProgress}%` }}
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
              
              {/* Rotating Tip */}
              <div className="mt-6 p-3 bg-gray-50 border border-gray-100 rounded-lg">
                <p className="text-xs text-gray-500 text-center transition-opacity duration-300">
                  <span className="text-gray-400">Tip:</span> {GENERATION_TIPS[currentTipIndex]}
                </p>
              </div>
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
