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
    subtitle: 'Your Jabodetabek Commute, Protected',
    content: 'DIS-RUPTURE pairs live flood reports with real-time traffic and weather forecasts to keep you moving safely across Jabodetabek',
    target: null,
    icon: Shield,
    accent: 'from-indigo-500 to-purple-600',
  },
  {
    id: 'map',
    title: 'Explore Your Surroundings',
    subtitle: 'Smart Zones & Safety Buffers',
    content: 'Tap any area on the map to see real-time traffic speeds, active flood danger zones, and local rain forecasts.',
    target: '[data-tour="map-container"]',
    icon: MapPin,
    accent: 'from-purple-500 to-pink-600',
  },
  {
    id: 'zonedetails',
    title: 'Zone Details & Live Alerts',
    subtitle: 'Filter Risk & Plan Routes',
    content: 'Use the side panel to filter zones by risk level (Critical, High, Medium), check estimated flood clearance times, search key locations, and plan safe evacuation routes.',
    target: '[data-tour="sidebar-filters"]',
    icon: Layers,
    accent: 'from-blue-500 to-cyan-600',
  },
  {
    id: 'closing',
    title: 'You’re All Set!',
    subtitle: 'Real-Time Intelligence at Your Fingertips',
    content: 'Explore live flood maps, AI-powered recovery forecasts, and automated risk warnings across Jabodetabek.',
    target: null,
    icon: CheckCircle2,
    accent: 'from-emerald-500 to-teal-600',
  },
];

export default function FirstTimeTour({ isOpen, onClose, dbStatus, isFallback, isMobile = false, theme = 'light' }) {
  const [currentStep, setCurrentStep] = useState(0);
  const [targetRect, setTargetRect] = useState(null);
  const [touchStart, setTouchStart] = useState(null);
  const [touchEnd, setTouchEnd] = useState(null);
  const [slideDirection, setSlideDirection] = useState('left');

  const isLight = theme === 'light' || (typeof document !== 'undefined' && document.documentElement.classList.contains('light-mode'));

  const steps = TOUR_STEPS;
  const step = steps[currentStep] || steps[0];
  const isLastStep = currentStep === steps.length - 1;
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
        // Only set rect if element is actually visible on screen
        if (rect.width > 0 && rect.height > 0) {
          setTargetRect({
            top: rect.top,
            left: rect.left,
            width: rect.width,
            height: rect.height,
          });
          return;
        }
      }
      setTargetRect(null);
    };

    updateRect();
    window.addEventListener('resize', updateRect);
    window.addEventListener('scroll', updateRect, true);
    return () => {
      window.removeEventListener('resize', updateRect);
      window.removeEventListener('scroll', updateRect, true);
    };
  }, [isOpen, currentStep, step.target, isMobile]);

  if (!isOpen) return null;

  const goToStep = (newStep, direction = 'left') => {
    setSlideDirection(direction);
    setCurrentStep(newStep);
  };

  const handleNext = () => {
    if (isLastStep) {
      handleComplete();
    } else {
      goToStep(currentStep + 1, 'left');
    }
  };

  const handlePrev = () => {
    if (currentStep > 0) {
      goToStep(currentStep - 1, 'right');
    }
  };

  const handleDotClick = (idx) => {
    if (idx === currentStep) return;
    goToStep(idx, idx > currentStep ? 'left' : 'right');
  };

  const handleComplete = () => {
    // Session-based, not lifetime — clears when the browser tab/app is
    // fully closed, so the tour naturally reappears on the next visit
    // unless the user has enabled "Always show tour" in Settings.
    sessionStorage.setItem('hasSeenTourThisSession', 'true');
    onClose();
  };

  // Touch Swipe Gesture Handlers for Mobile
  const handleTouchStart = (e) => {
    setTouchEnd(null);
    setTouchStart({
      x: e.targetTouches[0].clientX,
      y: e.targetTouches[0].clientY,
    });
  };

  const handleTouchMove = (e) => {
    setTouchEnd({
      x: e.targetTouches[0].clientX,
      y: e.targetTouches[0].clientY,
    });
  };

  const handleTouchEnd = () => {
    if (!touchStart || !touchEnd) return;
    const distanceX = touchStart.x - touchEnd.x;
    const distanceY = touchStart.y - touchEnd.y;
    const minSwipeDistance = 40;

    // Check if horizontal drag distance exceeds threshold and is greater than vertical drag
    if (Math.abs(distanceX) > Math.abs(distanceY) && Math.abs(distanceX) > minSwipeDistance) {
      if (distanceX > 0) {
        // Swiped Left -> Advance to Next
        handleNext();
      } else {
        // Swiped Right -> Return to Previous
        handlePrev();
      }
    }
    setTouchStart(null);
    setTouchEnd(null);
  };

  // Drag offset for interactive gesture tracking
  const dragOffsetX = touchStart && touchEnd ? (touchEnd.x - touchStart.x) * 0.35 : 0;

  return (
    <div className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center p-3 sm:p-6 pointer-events-auto select-none">
      {/* Semi-transparent Backdrop (keeping map and UI crisp and readable underneath) */}
      <div className={`absolute inset-0 transition-opacity duration-300 ${isLight ? 'bg-slate-900/20' : 'bg-slate-950/40'}`}></div>

      {/* Target Spotlight Highlight Ring with subtle backdrop glow */}
      {targetRect && (
        <div
          className={`absolute rounded-xl border-2 transition-all duration-300 pointer-events-none animate-pulse ${isLight
            ? 'border-indigo-600 shadow-[0_0_20px_rgba(79,70,229,0.4)]'
            : 'border-indigo-400 shadow-[0_0_25px_rgba(99,102,241,0.6)]'
            }`}
          style={{
            top: `${Math.max(6, targetRect.top - 4)}px`,
            left: `${Math.max(6, targetRect.left - 4)}px`,
            width: `${targetRect.width + 8}px`,
            height: `${targetRect.height + 8}px`,
          }}
        />
      )}

      {/* Responsive Tour Card Box with Swipe Gesture Support */}
      <div
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        className={`relative w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden mb-2 sm:mb-0 border touch-pan-y ${isLight
          ? 'bg-white/95 border-slate-200/80 text-slate-800 backdrop-blur-sm'
          : 'bg-slate-900/95 border-slate-800 text-slate-100 backdrop-blur-md'
          }`}
      >

        {/* Top Accent Gradient Header */}
        <div className={`h-2.5 w-full bg-gradient-to-r ${step.accent} transition-all duration-500`} />

        <div className="p-4 sm:p-6 space-y-4 sm:space-y-5">
          {/* Header row: Badge, Steps indicator, & Close */}
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border flex items-center gap-1.5 ${isLight
                ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                : 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30'
                }`}>
                <Sparkles className="w-3 h-3" />
                Guide ({currentStep + 1}/{steps.length})
              </span>

              {/* Live Sync Status Indicator Pill */}
              <div className={`px-2.5 py-1 rounded-full text-[10px] font-semibold uppercase tracking-wider border flex items-center gap-1.5 ${isLight
                ? 'bg-slate-100 border-slate-200/80 text-slate-700'
                : 'bg-slate-800/80 border-slate-700 text-slate-300'
                }`}>
                {isFallback ? (
                  <>
                    <RefreshCw className="w-2.5 h-2.5 text-amber-500 animate-spin" />
                    <span className={isLight ? "text-amber-700 hidden sm:inline" : "text-amber-300 hidden sm:inline"}>Preview Data</span>
                    <span className={isLight ? "text-amber-700 sm:hidden" : "text-amber-300 sm:hidden"}>Preview</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className={`w-2.5 h-2.5 ${isLight ? "text-emerald-600" : "text-emerald-400"}`} />
                    <span className={isLight ? "text-emerald-700 font-bold hidden sm:inline" : "text-emerald-400 hidden sm:inline"}>Live Data Synced</span>
                    <span className={isLight ? "text-emerald-700 font-bold sm:hidden" : "text-emerald-400 sm:hidden"}>Live</span>
                  </>
                )}
              </div>
            </div>

            <button
              onClick={handleComplete}
              className={`p-1.5 rounded-lg transition-colors ${isLight
                ? 'text-slate-400 hover:text-slate-700 hover:bg-slate-100'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                }`}
              title="Skip Tour"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Inner Content Section - Only this text/icon area slides */}
          <div className="overflow-hidden py-1">
            <div
              key={step.id}
              style={{
                transform: touchEnd ? `translateX(${dragOffsetX}px)` : undefined,
                transition: touchEnd ? 'none' : undefined,
              }}
              className={`flex items-start space-x-3.5 ${slideDirection === 'left' ? 'animate-tour-slide-left' : 'animate-tour-slide-right'
                }`}
            >
              <div className={`p-2.5 sm:p-3 rounded-xl bg-gradient-to-br ${step.accent} text-white shadow-lg flex-shrink-0 transition-transform duration-300 hover:scale-105`}>
                <StepIcon className="w-5 h-5 sm:w-6 sm:h-6" />
              </div>

              <div className="space-y-1">
                <h3 className={`text-base sm:text-lg font-bold ${isLight ? 'text-slate-900' : 'text-slate-100'}`}>
                  {step.title}
                </h3>
                <p className={`text-[10px] sm:text-xs font-semibold uppercase tracking-wider ${isLight ? 'text-indigo-600' : 'text-indigo-400'}`}>
                  {step.subtitle}
                </p>
                <p className={`text-xs sm:text-sm leading-relaxed pt-0.5 ${isLight ? 'text-slate-600' : 'text-slate-300'}`}>
                  {step.content}
                </p>
              </div>
            </div>
          </div>

          {/* Progress dots bar & Mobile swipe hint */}
          <div className="space-y-1.5 pt-1">
            <div className="flex items-center justify-center space-x-1.5">
              {steps.map((_, idx) => (
                <button
                  key={idx}
                  onClick={() => handleDotClick(idx)}
                  className={`h-1.5 rounded-full transition-all duration-300 ${idx === currentStep
                    ? isLight ? 'w-6 bg-indigo-600' : 'w-6 bg-indigo-400'
                    : isLight ? 'w-1.5 bg-slate-300 hover:bg-slate-400' : 'w-1.5 bg-slate-700 hover:bg-slate-600'
                    }`}
                />
              ))}
            </div>
            <p className={`text-[10px] text-center sm:hidden font-medium tracking-wide ${isLight ? 'text-slate-400' : 'text-slate-500'}`}>
              Swipe left/right to navigate
            </p>
          </div>


          {/* Footer Controls */}
          <div className={`flex items-center justify-between pt-3 border-t ${isLight ? 'border-slate-200' : 'border-slate-800'}`}>
            <button
              onClick={handleComplete}
              className={`text-xs font-semibold uppercase tracking-wider transition-colors ${isLight ? 'text-slate-500 hover:text-slate-900' : 'text-slate-400 hover:text-slate-200'
                }`}
            >
              Skip Tour
            </button>

            <div className="flex items-center space-x-3">
              {currentStep > 0 && (
                <button
                  onClick={handlePrev}
                  className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition-colors flex items-center space-x-1 border ${isLight
                    ? 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200'
                    : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700'
                    }`}
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
