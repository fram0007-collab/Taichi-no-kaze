import React, { useState, useEffect } from 'react';
import { 
  Shield, 
  ChevronRight, 
  ChevronLeft, 
  X, 
  MapPin, 
  Activity, 
  Layers, 
  CheckCircle2, 
  RefreshCw,
  Sparkles,
  Navigation
} from 'lucide-react';

const TOUR_STEPS = [
  {
    id: 'welcome',
    title: 'Welcome to DIS-RUPTURE',
    subtitle: 'Early Warning Command Center',
    content: 'DIS-RUPTURE combines real-time flood monitoring, TomTom traffic flow analytics, and Open-Meteo forecasts to provide early warning predictions across Jabodetabek.',
    target: null,
    icon: Shield,
    accent: 'from-indigo-500 to-purple-600',
  },
  {
    id: 'helicopter',
    title: 'Helicopter & Active Operations',
    subtitle: 'Live Command Status Bar',
    content: 'The top command bar displays real-time status of critical incidents, active flood alerts, and helicopter deployment readiness.',
    target: '[data-tour="helicopter-banner"]',
    icon: Activity,
    accent: 'from-amber-500 to-red-600',
  },
  {
    id: 'sidebar',
    title: 'Zone Sidebar & Risk Filters',
    subtitle: 'Filter & Search Warning Zones',
    content: 'Use the left sidebar to filter zones by risk tier (Critical, High, Medium), search specific POIs, or set your custom proximity alert radius.',
    target: '[data-tour="sidebar-filters"]',
    icon: Layers,
    accent: 'from-blue-500 to-cyan-600',
  },
  {
    id: 'evacuation',
    title: 'Evacuation & ML Resolution',
    subtitle: 'Machine Learning Guidance',
    content: 'Inspect machine learning resolution time predictions for active disruptions and quickly calculate safe evacuation routes to nearby shelters.',
    target: '[data-tour="evacuation-control"]',
    icon: Navigation,
    accent: 'from-emerald-500 to-teal-600',
  },
  {
    id: 'map',
    title: 'Interactive Map Deck',
    subtitle: 'GeoJSON Geofences & Buffer Overlays',
    content: 'Click any zone on the interactive map to view detailed traffic speed baselines, waterway flood buffers, and historical rain trend predictions.',
    target: '[data-tour="map-container"]',
    icon: MapPin,
    accent: 'from-purple-500 to-pink-600',
  },
];

export default function FirstTimeTour({ isOpen, onClose, dbStatus, isFallback }) {
  const [currentStep, setCurrentStep] = useState(0);
  const [targetRect, setTargetRect] = useState(null);

  const step = TOUR_STEPS[currentStep];
  const isLastStep = currentStep === TOUR_STEPS.length - 1;
  const StepIcon = step.icon;

  // Track position of highlighted target element
  useEffect(() => {
    if (!isOpen || !step.target) {
      setTargetRect(null);
      return;
    }

    const updateRect = () => {
      const el = document.querySelector(step.target);
      if (el) {
        const rect = el.getBoundingClientRect();
        setTargetRect({
          top: rect.top,
          left: rect.left,
          width: rect.width,
          height: rect.height,
        });
      } else {
        setTargetRect(null);
      }
    };

    updateRect();
    window.addEventListener('resize', updateRect);
    window.addEventListener('scroll', updateRect, true);
    return () => {
      window.removeEventListener('resize', updateRect);
      window.removeEventListener('scroll', updateRect, true);
    };
  }, [isOpen, currentStep, step.target]);

  if (!isOpen) return null;

  const handleNext = () => {
    if (isLastStep) {
      handleComplete();
    } else {
      setCurrentStep(prev => prev + 1);
    }
  };

  const handlePrev = () => {
    setCurrentStep(prev => Math.max(0, prev - 1));
  };

  const handleComplete = () => {
    localStorage.setItem('hasSeenTour', 'true');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 pointer-events-auto select-none">
      {/* Dark overlay backdrop */}
      <div className="absolute inset-0 bg-slate-950/75 backdrop-blur-md transition-opacity duration-300"></div>

      {/* Target Spotlight Highlight Ring */}
      {targetRect && (
        <div
          className="absolute rounded-xl border-2 border-indigo-400 shadow-[0_0_30px_rgba(99,102,241,0.5)] transition-all duration-300 pointer-events-none animate-pulse"
          style={{
            top: `${Math.max(8, targetRect.top - 6)}px`,
            left: `${Math.max(8, targetRect.left - 6)}px`,
            width: `${targetRect.width + 12}px`,
            height: `${targetRect.height + 12}px`,
          }}
        />
      )}

      {/* Tour Card Box */}
      <div className="relative w-full max-w-lg bg-slate-900/95 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden backdrop-blur-xl transition-all duration-300">
        
        {/* Top Accent Gradient Header */}
        <div className={`h-2.5 w-full bg-gradient-to-r ${step.accent}`} />

        <div className="p-6 space-y-5">
          {/* Header row: Badge, Steps indicator, & Close */}
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <span className="px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 flex items-center gap-1.5">
                <Sparkles className="w-3 h-3" />
                First Time Guide ({currentStep + 1}/{TOUR_STEPS.length})
              </span>

              {/* Live Sync Status Indicator Pill */}
              <div className="px-2.5 py-1 rounded-full text-[10px] font-semibold uppercase tracking-wider bg-slate-800/80 border border-slate-700 text-slate-300 flex items-center gap-1.5">
                {isFallback ? (
                  <>
                    <RefreshCw className="w-2.5 h-2.5 text-amber-400 animate-spin" />
                    <span className="text-amber-300">Preview Data</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-2.5 h-2.5 text-emerald-400" />
                    <span className="text-emerald-400">Live Data Synced</span>
                  </>
                )}
              </div>
            </div>

            <button
              onClick={handleComplete}
              className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition-colors"
              title="Skip Tour"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Main Content Info Card */}
          <div className="flex items-start space-x-4">
            <div className={`p-3 rounded-xl bg-gradient-to-br ${step.accent} text-white shadow-lg flex-shrink-0`}>
              <StepIcon className="w-6 h-6" />
            </div>

            <div className="space-y-1">
              <h3 className="text-lg font-bold text-slate-100">{step.title}</h3>
              <p className="text-xs font-semibold text-indigo-400 uppercase tracking-wider">{step.subtitle}</p>
              <p className="text-sm text-slate-300 leading-relaxed pt-1">{step.content}</p>
            </div>
          </div>

          {/* Progress dots bar */}
          <div className="flex items-center justify-center space-x-1.5 pt-2">
            {TOUR_STEPS.map((_, idx) => (
              <button
                key={idx}
                onClick={() => setCurrentStep(idx)}
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  idx === currentStep
                    ? 'w-6 bg-indigo-400'
                    : 'w-1.5 bg-slate-700 hover:bg-slate-600'
                }`}
              />
            ))}
          </div>

          {/* Footer Controls */}
          <div className="flex items-center justify-between pt-3 border-t border-slate-800">
            <button
              onClick={handleComplete}
              className="text-xs font-semibold text-slate-400 hover:text-slate-200 transition-colors uppercase tracking-wider"
            >
              Skip Tour
            </button>

            <div className="flex items-center space-x-3">
              {currentStep > 0 && (
                <button
                  onClick={handlePrev}
                  className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors flex items-center space-x-1"
                >
                  <ChevronLeft className="w-4 h-4" />
                  <span>Back</span>
                </button>
              )}

              <button
                onClick={handleNext}
                className={`px-4 py-2 rounded-xl text-xs font-bold text-white bg-gradient-to-r ${step.accent} hover:opacity-90 transition-opacity shadow-lg flex items-center space-x-1`}
              >
                <span>{isLastStep ? 'Start Exploring' : 'Next'}</span>
                {!isLastStep && <ChevronRight className="w-4 h-4" />}
              </button>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
