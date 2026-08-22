import React, { useState } from 'react';
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
  Navigation,
  Bell,
} from 'lucide-react';
import { ILLUSTRATIONS } from './TourIllustrations';

const STARTUP_STEPS = [
  {
    id: 'welcome',
    title: 'Alerts near you',
    subtitle: 'Jabodetabek at a glance',
    content: 'Coloured areas on the map show nearby flood, traffic, weather, crowd, and earthquake alerts. Tap one to see what to do.',
    icon: MapPin,
    accent: 'from-indigo-500 to-purple-600',
  },
  {
    id: 'notifications',
    title: 'Turn on location',
    subtitle: 'So we can show what is near you',
    content: 'Allow location to filter the map to your area. You can enable notifications later in Settings so you are warned even when the app is closed.',
    icon: Bell,
    accent: 'from-amber-500 to-orange-600',
  },
];

const TOUR_STEPS = [
  {
    id: 'welcome',
    title: 'Welcome to DIS-RUPTURE',
    subtitle: 'Your Jabodetabek Commute, Protected',
    content: 'DIS-RUPTURE pairs live flood reports with real-time traffic and weather forecasts to keep you moving safely across Jabodetabek.',
    icon: Shield,
    accent: 'from-indigo-500 to-purple-600',
  },
  {
    id: 'map',
    title: 'Explore Your Surroundings',
    subtitle: 'Smart Zones & Safety Buffers',
    content: 'Tap any area on the map to see real-time traffic speeds, active flood danger zones, crowd levels, and local rain forecasts.',
    icon: MapPin,
    accent: 'from-purple-500 to-pink-600',
  },
  {
    id: 'layers',
    title: 'Customize Your View',
    subtitle: 'Toggle Map Layers',
    content: 'Use Map display to show or hide hospitals, police stations, malls, and other points of interest.',
    icon: Layers,
    accent: 'from-fuchsia-500 to-purple-600',
  },
  {
    id: 'zonedetails',
    title: 'Zone Details & Live Alerts',
    subtitle: 'Filter Risk & Search Locations',
    content: 'Use the Alerts tab (or the side panel on desktop) to see nearby warnings and estimated clearance times.',
    icon: Layers,
    accent: 'from-blue-500 to-cyan-600',
  },
  {
    id: 'evacuation',
    title: 'Get a Safe Route',
    subtitle: 'Step-by-Step Safety Routes',
    content: 'When a threat is active, tap "Safe route" for walking directions away from danger. Medium alerts show lighter "See guidance" tips.',
    icon: Navigation,
    accent: 'from-red-500 to-orange-600',
  },
  {
    id: 'dashboard',
    title: 'Overview Dashboard',
    subtitle: 'See the Bigger Picture',
    content: 'Open Overview from Settings for an overall view of active threats, zone rankings by risk, and a zone’s history and trends.',
    icon: Activity,
    accent: 'from-teal-500 to-cyan-600',
  },
  {
    id: 'notifications',
    title: 'Stay Alerted, Even When You\u2019re Not Looking',
    subtitle: 'Enable Push Notifications',
    content: 'Turn on notifications to get alerted the moment a new disruption is detected \u2014 no need to keep the app open.',
    icon: Bell,
    accent: 'from-amber-500 to-orange-600',
  },
  {
    id: 'closing',
    title: 'You\u2019re All Set!',
    subtitle: 'Real-Time Intelligence at Your Fingertips',
    content: 'Explore live flood maps, AI-powered recovery forecasts, and automated risk warnings across Jabodetabek. You can replay this guide anytime from the Guide button.',
    icon: CheckCircle2,
    accent: 'from-emerald-500 to-teal-600',
  },
];

/**
 * FirstTimeTour
 * ───────────────────────────────────────────────────────────────────────────
 * Two modes, controlled by `isStartupSequence`:
 *
 * 1. STARTUP MODE (isStartupSequence=true) — two short screens on first
 *    launch only (persisted in App). Launch App is disabled until data is
 *    ready. Replay Guide still uses the full TOUR_STEPS list.
 *
 * 2. REPLAY MODE (isStartupSequence=false, default) — the original
 *    "Guide" button behavior for revisiting the tour after the app has
 *    already loaded. Has an X to close, doesn't gate on readiness.
 * ───────────────────────────────────────────────────────────────────────────
 */
export default function FirstTimeTour({
  isOpen,
  onClose,
  onComplete,
  onSkipLocation,
  isStartupSequence = false,
  overlayMode = false,
  isReady = true,
  onEnableNotifications,
  onOpenNotificationPreferences,
  dbStatus,
  isFallback,
  isMobile = false,
  theme = 'light',
}) {
  const [currentStep, setCurrentStep] = useState(0);
  const [touchStart, setTouchStart] = useState(null);
  const [touchEnd, setTouchEnd] = useState(null);
  const [slideDirection, setSlideDirection] = useState('left');

  const isLight = theme === 'light' || (typeof document !== 'undefined' && document.documentElement.classList.contains('light-mode'));

  const steps = isStartupSequence ? STARTUP_STEPS : TOUR_STEPS;
  const step = steps[currentStep] || steps[0];
  const isLastStep = currentStep === steps.length - 1;
  const StepIcon = step.icon;
  const Illustration = ILLUSTRATIONS[step.id];

  if (!isOpen) return null;

  const goToStep = (newStep, direction = 'left') => {
    setSlideDirection(direction);
    setCurrentStep(newStep);
  };

  const handleNext = () => {
    if (isLastStep) {
      if (isStartupSequence) {
        onComplete?.();
      } else {
        handleReplayComplete();
      }
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

  const handleReplayComplete = () => {
    onClose?.();
  };

  const handleLaunch = () => {
    onComplete?.();
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

    if (Math.abs(distanceX) > Math.abs(distanceY) && Math.abs(distanceX) > minSwipeDistance) {
      if (distanceX > 0) {
        handleNext();
      } else {
        handlePrev();
      }
    }
    setTouchStart(null);
    setTouchEnd(null);
  };

  const dragOffsetX = touchStart && touchEnd ? (touchEnd.x - touchStart.x) * 0.35 : 0;

  return (
    <div className={`fixed inset-0 z-[9999] flex items-end sm:items-center justify-center p-3 sm:p-6 select-none ${
      isStartupSequence && !overlayMode
        ? (isLight ? 'bg-slate-50 pointer-events-auto' : 'bg-brand-dark pointer-events-auto')
        : 'pointer-events-none'
    }`}>
      {overlayMode && isStartupSequence && (
        <div className="absolute inset-0 bg-black/45 backdrop-blur-[2px] pointer-events-auto" aria-hidden="true" />
      )}
      {/* Backdrop — only semi-transparent in replay mode (so the real app
          shows through slightly); in startup overlayMode the dim layer above
          lets the map show through */}
      {!isStartupSequence && (
        <div className={`absolute inset-0 transition-opacity duration-300 pointer-events-auto ${isLight ? 'bg-slate-900/20' : 'bg-slate-950/40'}`}></div>
      )}

      {/* Responsive Tour Card Box with Swipe Gesture Support */}
      <div
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        className={`relative w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden mb-2 sm:mb-0 border touch-pan-y pointer-events-auto ${isLight
          ? 'bg-white/95 border-slate-200/80 text-slate-800 backdrop-blur-sm'
          : 'bg-slate-900/95 border-slate-800 text-slate-100 backdrop-blur-md'
          }`}
      >

        {/* Top Accent Gradient Header */}
        <div className={`h-2.5 w-full bg-gradient-to-r ${step.accent} transition-all duration-500`} />

        <div className="p-4 sm:p-6 space-y-4 sm:space-y-5">
          {/* Header row: Badge, Steps indicator, & Close (replay mode only) */}
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

            {!isStartupSequence && (
              <button
                onClick={handleReplayComplete}
                className={`p-1.5 rounded-lg transition-colors ${isLight
                  ? 'text-slate-400 hover:text-slate-700 hover:bg-slate-100'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                  }`}
                title="Close"
              >
                <X className="w-5 h-5" />
              </button>
            )}
          </div>

          {/* Illustration */}
          {Illustration && (
            <div className={`rounded-xl overflow-hidden border ${isLight ? 'border-slate-200' : 'border-slate-800'}`} style={{ aspectRatio: '320 / 180' }}>
              <Illustration isLight={isLight} />
            </div>
          )}

          {/* Inner Content Section - text/icon area slides */}
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
                {isStartupSequence && step.id === 'notifications' && (
                  <div className="mt-3 space-y-2">
                    {onEnableNotifications && (
                      <button
                        type="button"
                        onClick={onEnableNotifications}
                        className={`w-full min-h-[44px] rounded-xl text-xs font-bold border transition-colors ${
                          isLight
                            ? 'border-indigo-300 bg-indigo-50 text-indigo-700 hover:bg-indigo-100'
                            : 'border-indigo-500/40 bg-indigo-500/10 text-indigo-300 hover:bg-indigo-500/20'
                        }`}
                      >
                        Enable notifications
                      </button>
                    )}
                    {onOpenNotificationPreferences && (
                      <button
                        type="button"
                        onClick={onOpenNotificationPreferences}
                        className={`w-full min-h-[44px] rounded-xl text-xs font-semibold border transition-colors ${
                          isLight
                            ? 'border-slate-300 text-slate-600 hover:bg-slate-50'
                            : 'border-slate-700 text-slate-400 hover:bg-slate-800'
                        }`}
                      >
                        Notification settings
                      </button>
                    )}
                    <p className={`text-[11px] leading-relaxed ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                      Tip: Add this app to your home screen for quick access when alerts appear.
                    </p>
                    {onSkipLocation && (
                      <button
                        type="button"
                        onClick={() => {
                          onSkipLocation();
                          onComplete?.();
                        }}
                        className={`w-full min-h-[44px] rounded-xl text-xs font-semibold border transition-colors ${
                          isLight
                            ? 'border-slate-300 text-slate-600 hover:bg-slate-50'
                            : 'border-slate-700 text-slate-400 hover:bg-slate-800'
                        }`}
                      >
                        Continue without location
                      </button>
                    )}
                  </div>
                )}
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
          <div className={`flex items-center justify-between pt-3 border-t gap-3 ${isLight ? 'border-slate-200' : 'border-slate-800'}`}>
              {isStartupSequence ? (
                <div className="flex items-center gap-1.5 min-w-0">
                  <CheckCircle2 className={`w-3.5 h-3.5 shrink-0 ${isLight ? 'text-emerald-600' : 'text-emerald-400'}`} />
                  <span className={`text-[10px] font-bold uppercase tracking-wide ${isLight ? 'text-emerald-700' : 'text-emerald-400'}`}>Ready</span>
                </div>
              ) : (
              <button
                onClick={handleReplayComplete}
                className={`text-xs font-semibold uppercase tracking-wider transition-colors ${isLight ? 'text-slate-500 hover:text-slate-900' : 'text-slate-400 hover:text-slate-200'
                  }`}
              >
                Skip Tour
              </button>
            )}

            <div className="flex items-center space-x-3 shrink-0">
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

              {!isLastStep && (
                <button
                  onClick={handleNext}
                  className={`px-4 py-2 rounded-xl text-xs font-bold text-white bg-gradient-to-r ${step.accent} hover:opacity-90 transition-opacity shadow-lg flex items-center space-x-1`}
                >
                  <span>Next</span>
                  <ChevronRight className="w-4 h-4" />
                </button>
              )}

              {/* Launch/Complete button — always visible in startup mode
                  (on every slide, per design), disabled until isReady.
                  In replay mode, only shown as the final "Got it" step. */}
              {isStartupSequence ? (
                <button
                  onClick={handleLaunch}
                  className={`px-4 py-2 rounded-xl text-xs font-bold text-white bg-gradient-to-r ${step.accent} hover:opacity-90 transition-opacity shadow-lg flex items-center space-x-1 cursor-pointer`}
                >
                  <span>Launch App</span>
                  <ChevronRight className="w-4 h-4" />
                </button>
              ) : (
                isLastStep && (
                  <button
                    onClick={handleReplayComplete}
                    className={`px-4 py-2 rounded-xl text-xs font-bold text-white bg-gradient-to-r ${step.accent} hover:opacity-90 transition-opacity shadow-lg flex items-center space-x-1`}
                  >
                    <span>Got It</span>
                  </button>
                )
              )}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
