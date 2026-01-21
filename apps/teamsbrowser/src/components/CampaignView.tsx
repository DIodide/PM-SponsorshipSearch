import { useState } from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import {
  ArrowLeft02Icon,
  ArrowUp01Icon,
  ArrowDown01Icon,
  MoreVerticalIcon,
  UserMultiple02Icon,
  Cancel01Icon,
  ArrowLeft01Icon,
  ArrowRight01Icon,
} from '@hugeicons/core-free-icons';
import type { GeneratedCampaign, SponsorInfo } from '../types';

interface CampaignViewProps {
  campaign: GeneratedCampaign;
  onBack: () => void;
  // Team data for display
  logoUrl?: string | null;
  sponsors?: SponsorInfo[] | null;
  category?: string | null;
}

// Circular progress ring component
function ProgressRing({ percent }: { percent: number }) {
  const size = 90;
  const radius = size / 2;
  const stroke = 8;
  const normalizedRadius = radius - stroke / 2;
  const circumference = normalizedRadius * 2 * Math.PI;
  const strokeDashoffset = circumference - (percent / 100) * circumference;

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg height={size} width={size} className="transform -rotate-90">
        {/* Background circle */}
        <circle
          stroke="#fecaca"
          fill="transparent"
          strokeWidth={stroke}
          r={normalizedRadius}
          cx={radius}
          cy={radius}
        />
        {/* Progress circle */}
        <circle
          stroke="#10b981"
          fill="transparent"
          strokeWidth={stroke}
          strokeDasharray={circumference + ' ' + circumference}
          style={{ strokeDashoffset }}
          strokeLinecap="round"
          r={normalizedRadius}
          cx={radius}
          cy={radius}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-xl font-bold text-emerald-600">{percent}%</span>
      </div>
    </div>
  );
}

// Helper to render simple markdown (bold text)
function renderMarkdown(text: string): React.ReactNode {
  // Split by **bold** pattern
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  
  return parts.map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      // Remove the ** markers and render as bold
      const boldText = part.slice(2, -2);
      return <strong key={index} className="font-semibold text-gray-900">{boldText}</strong>;
    }
    return <span key={index}>{part}</span>;
  });
}

// Collapsible section component
function CollapsibleSection({
  title,
  children,
  defaultOpen = true,
}: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className="mb-6">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center gap-2 text-left mb-3"
      >
        <span className="text-sm font-semibold text-gray-900">{title}</span>
        <HugeiconsIcon
          icon={isOpen ? ArrowUp01Icon : ArrowDown01Icon}
          size={14}
          className="text-gray-400"
        />
      </button>
      {isOpen && <div>{children}</div>}
    </div>
  );
}

// Image Lightbox component
function ImageLightbox({
  images,
  currentIndex,
  onClose,
  onNext,
  onPrev,
}: {
  images: string[];
  currentIndex: number;
  onClose: () => void;
  onNext: () => void;
  onPrev: () => void;
}) {
  return (
    <div 
      className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center"
      onClick={onClose}
    >
      {/* Close button */}
      <button
        onClick={onClose}
        className="absolute top-4 right-4 p-2 text-white/70 hover:text-white transition-colors"
      >
        <HugeiconsIcon icon={Cancel01Icon} size={24} />
      </button>
      
      {/* Image counter */}
      <div className="absolute top-4 left-4 text-white/70 text-sm">
        {currentIndex + 1} / {images.length}
      </div>

      {/* Previous button */}
      {images.length > 1 && (
        <button
          onClick={(e) => { e.stopPropagation(); onPrev(); }}
          className="absolute left-4 top-1/2 -translate-y-1/2 p-3 text-white/70 hover:text-white bg-white/10 hover:bg-white/20 rounded-full transition-all"
        >
          <HugeiconsIcon icon={ArrowLeft01Icon} size={24} />
        </button>
      )}

      {/* Image */}
      <div 
        className="max-w-[90vw] max-h-[90vh] flex items-center justify-center"
        onClick={(e) => e.stopPropagation()}
      >
        <img
          src={images[currentIndex]}
          alt={`Visual ${currentIndex + 1}`}
          className="max-w-full max-h-[90vh] object-contain rounded-lg shadow-2xl"
          style={{ animation: 'fadeInScale 0.2s ease-out' }}
        />
      </div>

      {/* Next button */}
      {images.length > 1 && (
        <button
          onClick={(e) => { e.stopPropagation(); onNext(); }}
          className="absolute right-4 top-1/2 -translate-y-1/2 p-3 text-white/70 hover:text-white bg-white/10 hover:bg-white/20 rounded-full transition-all"
        >
          <HugeiconsIcon icon={ArrowRight01Icon} size={24} />
        </button>
      )}

      {/* Thumbnail strip */}
      {images.length > 1 && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex gap-2">
          {images.map((url, i) => (
            <button
              key={i}
              onClick={(e) => { 
                e.stopPropagation(); 
                // Navigate to this image
                const diff = i - currentIndex;
                if (diff > 0) for (let j = 0; j < diff; j++) onNext();
                else if (diff < 0) for (let j = 0; j < -diff; j++) onPrev();
              }}
              className={`w-12 h-12 rounded-lg overflow-hidden border-2 transition-all ${
                i === currentIndex 
                  ? 'border-white scale-110' 
                  : 'border-transparent opacity-60 hover:opacity-100'
              }`}
            >
              <img src={url} alt="" className="w-full h-full object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function CampaignView({ campaign, onBack, logoUrl, sponsors, category }: CampaignViewProps) {
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);

  // Calculate stats
  const daysUntilLive = 21;
  const totalAssets = campaign.imageUrls.length + campaign.tactics.length;
  const overdueAssets = Math.floor(totalAssets * 0.2);
  const completionPercent = 80;

  const openLightbox = (index: number) => {
    setLightboxIndex(index);
    setLightboxOpen(true);
  };

  const nextImage = () => {
    setLightboxIndex((prev) => (prev + 1) % campaign.imageUrls.length);
  };

  const prevImage = () => {
    setLightboxIndex((prev) => (prev - 1 + campaign.imageUrls.length) % campaign.imageUrls.length);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top Navigation Bar */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm">
            <a href="#" className="text-teal-600 hover:underline">Partnerships</a>
            <span className="text-gray-400">›</span>
            <span className="text-gray-500">{campaign.teamName} Campaigns</span>
            <span className="text-gray-400">›</span>
            <span className="text-gray-900">Kick Off Campaign</span>
          </div>
          <div className="text-sm text-gray-500">
            {campaign.teamName} Partnership
          </div>
        </div>
      </div>

      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button
                onClick={onBack}
                className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 transition-colors"
              >
                <HugeiconsIcon icon={ArrowLeft02Icon} size={18} />
              </button>
              {/* Team Logo */}
              <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center overflow-hidden flex-shrink-0">
                {logoUrl ? (
                  <img 
                    src={logoUrl} 
                    alt={`${campaign.teamName} logo`}
                    className="w-full h-full object-contain"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = 'none';
                      (e.target as HTMLImageElement).parentElement!.innerHTML = `<span class="text-lg font-bold text-gray-500">${campaign.teamName.charAt(0)}</span>`;
                    }}
                  />
                ) : (
                  <span className="text-lg font-bold text-gray-500">
                    {campaign.teamName.charAt(0)}
                  </span>
                )}
              </div>
              <h1 className="text-lg font-semibold text-gray-900">{campaign.teamName}</h1>
              {/* Category Badge */}
              {category && (
                <span className="px-2.5 py-1 text-xs font-medium text-violet-700 bg-violet-50 border border-violet-200 rounded-full">
                  {category}
                </span>
              )}
              <span className="px-2.5 py-1 text-xs font-medium text-gray-600 bg-gray-100 rounded-full">
                Campaigns <span className="ml-1 text-gray-400">6</span>
              </span>
              <div className="flex items-center gap-2 px-3 py-1.5 border border-gray-200 rounded-lg text-sm text-gray-700">
                Kickoff Campaign
                <HugeiconsIcon icon={ArrowDown01Icon} size={14} className="text-gray-400" />
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">
                <HugeiconsIcon icon={UserMultiple02Icon} size={16} />
                View Account
              </button>
              <button className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
                <HugeiconsIcon icon={MoreVerticalIcon} size={18} className="text-gray-500" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="flex gap-8">
          {/* Left Column - Main Content */}
          <div className="flex-1">
            {/* Campaign Card */}
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              {/* Card Header */}
              <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-sm text-gray-500">Kickoff Campaign</span>
                  <button className="p-1 hover:bg-gray-100 rounded transition-colors">
                    <HugeiconsIcon icon={ArrowUp01Icon} size={14} className="text-gray-400" />
                  </button>
                  <span className="px-3 py-1 text-xs font-medium text-gray-600 border border-gray-300 rounded-full">
                    Draft
                  </span>
                  <button className="p-1 hover:bg-gray-100 rounded transition-colors">
                    <HugeiconsIcon icon={MoreVerticalIcon} size={14} className="text-gray-400" />
                  </button>
                </div>
              </div>

              {/* Card Body */}
              <div className="p-6">
                {/* Title and Description */}
                <h2 className="text-2xl font-bold text-gray-900 mb-2">{campaign.title}</h2>
                <p className="text-gray-600 mb-8">{renderMarkdown(campaign.description)}</p>

                {/* Tactics Section */}
                <CollapsibleSection title="Tactics">
                  <ul className="space-y-3">
                    {campaign.tactics.map((tactic, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-gray-700 leading-relaxed">
                        <span className="text-gray-400 mt-0.5 flex-shrink-0">•</span>
                        <span>{renderMarkdown(tactic)}</span>
                      </li>
                    ))}
                  </ul>
                </CollapsibleSection>

                {/* Why It Works Section */}
                <CollapsibleSection title="Why it Works">
                  <p className="text-sm text-gray-700 leading-relaxed">{renderMarkdown(campaign.whyItWorks)}</p>
                </CollapsibleSection>

                {/* Attachments Section */}
                {campaign.imageUrls.length > 0 && (
                  <CollapsibleSection title="Attachments">
                    <div className="grid grid-cols-4 gap-4">
                      {campaign.imageUrls.map((url, i) => (
                        <button
                          key={i}
                          onClick={() => openLightbox(i)}
                          className="aspect-[4/3] rounded-lg overflow-hidden bg-gray-100 cursor-pointer hover:scale-[1.02] hover:shadow-lg transition-all group relative"
                        >
                          <img
                            src={url}
                            alt={`Campaign visual ${i + 1}`}
                            className="w-full h-full object-cover"
                          />
                          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors flex items-center justify-center">
                            <span className="opacity-0 group-hover:opacity-100 text-white text-xs font-medium bg-black/50 px-2 py-1 rounded transition-opacity">
                              Click to expand
                            </span>
                          </div>
                        </button>
                      ))}
                    </div>
                    <button 
                      onClick={() => openLightbox(0)}
                      className="mt-3 text-xs text-teal-600 hover:text-teal-700 hover:underline font-medium"
                    >
                      View all in full screen →
                    </button>
                  </CollapsibleSection>
                )}
              </div>
            </div>
          </div>

          {/* Right Column - Stats Sidebar */}
          <div className="w-80">
            <div className="bg-white rounded-xl border border-gray-200 p-6 sticky top-8">
              {/* Stats Grid with Progress Ring */}
              <div className="flex gap-6 mb-6">
                {/* Left side: 2x2 stats grid with proper column sizing */}
                <div className="grid grid-cols-[1fr_auto] gap-x-6 gap-y-5">
                  <div>
                    <div className="text-xs text-gray-500 mb-1">Days Until Live</div>
                    <div className="text-2xl font-bold text-gray-900">{daysUntilLive}</div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500 mb-1">Total Assets</div>
                    <div className="text-2xl font-bold text-gray-900">{totalAssets}</div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500 mb-1">Cost</div>
                    <div className="text-xl font-bold text-gray-900">
                      ${campaign.estimatedCost.toLocaleString()}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500 mb-1">Overdue Assets</div>
                    <div className="text-2xl font-bold text-gray-900">{overdueAssets}</div>
                  </div>
                </div>
                {/* Right side: Progress Ring - centered vertically */}
                <div className="flex items-center justify-center flex-shrink-0">
                  <ProgressRing percent={completionPercent} />
                </div>
              </div>

              {/* Divider */}
              <div className="border-t border-gray-100 my-6" />

              {/* Meta Info */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-500">Dates</span>
                  <div className="text-right">
                    <div className="text-sm font-medium text-gray-900">
                      {campaign.suggestedDates.start} - {campaign.suggestedDates.end}
                    </div>
                    <div className="text-xs text-gray-500 italic">Including: Season opener</div>
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-500">Properties</span>
                  <span className="text-sm font-medium text-gray-900">
                    {campaign.teamName}
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-500">Owner</span>
                  <div className="w-8 h-8 rounded-full bg-teal-700 flex items-center justify-center text-xs font-medium text-white">
                    PT
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-500">Channels</span>
                  <div className="text-right">
                    <div className="text-sm text-gray-900">
                      Primary: {campaign.channels.primary}
                    </div>
                    <div className="text-xs text-gray-500">
                      Secondary: {campaign.channels.secondary}
                    </div>
                  </div>
                </div>

                <div className="flex items-start justify-between">
                  <span className="text-sm text-gray-500">Goals</span>
                  <div className="text-right">
                    {campaign.goals.slice(0, 3).map((goal, i) => (
                      <div key={i} className="text-sm text-gray-900">
                        {goal}
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Previous Sponsorships Section */}
              <div className="border-t border-gray-100 my-6" />
              <div>
                <h4 className="text-sm font-semibold text-gray-900 mb-3">Previous Sponsorships</h4>
                {sponsors && sponsors.length > 0 ? (
                  <ul className="space-y-2">
                    {sponsors.slice(0, 5).map((sponsor, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm">
                        <span className="text-gray-400 mt-0.5">•</span>
                        <div>
                          <span className="text-gray-900 font-medium">
                            {typeof sponsor === 'string' ? sponsor : sponsor.name}
                          </span>
                          {typeof sponsor !== 'string' && (sponsor.category || sponsor.asset_type) && (
                            <span className="text-gray-500 text-xs ml-1">
                              – {sponsor.asset_type || sponsor.category}
                            </span>
                          )}
                        </div>
                      </li>
                    ))}
                    {sponsors.length > 5 && (
                      <li className="text-xs text-gray-500 italic pl-4">
                        +{sponsors.length - 5} more partners
                      </li>
                    )}
                  </ul>
                ) : (
                  <p className="text-sm text-gray-500 italic">
                    No sponsorship data available
                  </p>
                )}
              </div>

              {/* Action Buttons */}
              <div className="mt-8 space-y-3">
                <button className="w-full px-4 py-2.5 text-sm font-medium text-white bg-teal-600 rounded-lg hover:bg-teal-700 transition-colors">
                  Save Campaign
                </button>
                <button
                  onClick={onBack}
                  className="w-full px-4 py-2.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Back to Team
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Image Lightbox */}
      {lightboxOpen && campaign.imageUrls.length > 0 && (
        <ImageLightbox
          images={campaign.imageUrls}
          currentIndex={lightboxIndex}
          onClose={() => setLightboxOpen(false)}
          onNext={nextImage}
          onPrev={prevImage}
        />
      )}
    </div>
  );
}
