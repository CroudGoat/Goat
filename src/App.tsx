import React, { useCallback, useEffect, useRef, useState } from 'react';
import { HalftoneDebugger } from './components/HalftoneDebugger';
import { HalftoneGoatCanvas } from './components/HalftoneGoatCanvas';
import { ActiveSection, InPlacePanel } from './components/InPlacePanel';
import { WordmarkLogo } from './components/WordmarkLogo';
import {
  DEFAULT_PHYSICS_PARAMS,
  DEFAULT_VISUAL_PARAMS,
  HalftonePhysicsParams,
  HalftoneVisualParams,
} from './utils/halftoneDots';

interface ViewportDims {
  w: number;
  h: number;
}

const NAV_ITEMS: Array<{
  id: Exclude<ActiveSection, null>;
  label: string;
  refCenterY: number;
  scaleX: number;
  letterSpacing: string;
}> = [
  { id: 'profile', label: 'Profile', refCenterY: 605.5, scaleX: 1.5, letterSpacing: '0.08em' },
  { id: 'works', label: 'Works', refCenterY: 735, scaleX: 1.56, letterSpacing: '0.12em' },
];

const SHOW_HALFTONE_DEBUGGER = false;

export default function App() {
  const [activeSection, setActiveSection] = useState<ActiveSection>(null);
  const [mountedSection, setMountedSection] = useState<Exclude<ActiveSection, null> | null>(null);
  const sectionPanelRef = useRef<HTMLDivElement | null>(null);

  const [visualParams, setVisualParams] = useState<HalftoneVisualParams>(DEFAULT_VISUAL_PARAMS);
  const [physicsParams, setPhysicsParams] = useState<HalftonePhysicsParams>(DEFAULT_PHYSICS_PARAMS);
  const [dotCount, setDotCount] = useState<number>(0);
  const [dims, setDims] = useState<ViewportDims>(() => ({
    w: typeof window !== 'undefined' ? window.innerWidth : 1440,
    h: typeof window !== 'undefined' ? window.innerHeight : 900,
  }));

  useEffect(() => {
    const onResize = () => {
      setDims({ w: window.innerWidth, h: window.innerHeight });
    };
    window.addEventListener('resize', onResize, { passive: true });
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const handleSelectSection = useCallback(
    (next: ActiveSection) => {
      if (next === null || next === activeSection) {
        setActiveSection(null);
        return;
      }
      setMountedSection(next);
      setActiveSection(next);
    },
    [activeSection],
  );

  const handleReverseMorphComplete = useCallback(() => {
    setMountedSection(null);
  }, []);

  const isMobile = dims.w < 768;
  const refAspect = 1920 / 1080;
  const viewAspect = dims.w / Math.max(1, dims.h);

  const scaleX = viewAspect >= refAspect ? dims.h / 1080 : dims.w / 1920;
  const scaleY = dims.h / 1080;
  const uniformScale = Math.min(scaleX, scaleY);

  // Reference geometry on 1920x1080:
  // CLOUDGOAT: x=117..701 (w=585, centerX=409), y=195..523 (h=329, centerY=359)
  // Profile / Works / Social: centered on the exact same vertical axis (centerX=409)
  const colCenterX = isMobile ? Math.round(dims.w * 0.5) : Math.round(409 * scaleX);
  const logoWidth = isMobile
    ? Math.min(340, Math.round(dims.w * 0.84))
    : Math.round(585 * uniformScale);
  const logoHeight = isMobile
    ? Math.round(logoWidth * 0.56)
    : Math.round(329 * uniformScale);
  const logoCenterY = Math.round(359 * scaleY);
  const navFontSize = isMobile ? 22 : Math.max(18, Math.round(42 * uniformScale));

  const panelDesktopLeft = Math.max(
    colCenterX + Math.round(logoWidth * 0.5) + 48,
    Math.round(dims.w * 0.42),
  );

  return (
    <div
      className={`relative min-h-screen w-full bg-[#141414] text-white select-none ${
        isMobile && mountedSection !== null ? 'overflow-x-hidden' : 'overflow-hidden'
      }`}
    >
      {/* Live halftone goat canvas with WebGL2 particle burst & in-place layout reconstitution */}
      <HalftoneGoatCanvas
        morphSection={activeSection}
        sectionPanelRef={sectionPanelRef}
        onReverseMorphComplete={handleReverseMorphComplete}
        visualParams={visualParams}
        physicsParams={physicsParams}
        onDotCountChange={setDotCount}
      />

      {/* Accessible primary heading */}
      <h1 className="sr-only">CLOUDGOAT</h1>

      {isMobile ? (
        <div className="relative z-10 flex flex-col items-center pt-10 px-6">
          <WordmarkLogo
            width={logoWidth}
            height={logoHeight}
            onClick={() => handleSelectSection(null)}
          />

          <nav aria-label="Primary navigation" className="mt-8 flex flex-col items-center gap-3">
            {NAV_ITEMS.map((item) => {
              const isActive = activeSection === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleSelectSection(item.id)}
                  style={{ fontSize: `${navFontSize}px` }}
                  className={`group relative min-h-[44px] px-6 py-2 flex items-center justify-center font-mincho text-white hover:opacity-75 focus:outline-none focus-visible:ring-2 focus-visible:ring-white cursor-pointer transition-opacity whitespace-nowrap ${
                    isActive ? 'underline underline-offset-8' : ''
                  }`}
                >
                  <span
                    className="inline-block"
                    style={{
                      transform: `scaleX(${item.scaleX})`,
                      letterSpacing: item.letterSpacing,
                    }}
                  >
                    {item.label}
                  </span>
                </button>
              );
            })}
          </nav>

          {mountedSection !== null && (
            <InPlacePanel
              section={mountedSection}
              panelRef={sectionPanelRef}
              isMobile={true}
              desktopLeft={0}
              onClose={() => handleSelectSection(null)}
            />
          )}
        </div>
      ) : (
        <div className="relative z-10 w-full h-screen pointer-events-none">
          {/* CLOUDGOAT display title centered on colCenterX */}
          <div
            className="absolute pointer-events-auto"
            style={{
              left: `${colCenterX}px`,
              top: `${logoCenterY}px`,
              transform: 'translate(-50%, -50%)',
            }}
          >
            <WordmarkLogo
              width={logoWidth}
              height={logoHeight}
              onClick={() => handleSelectSection(null)}
            />
          </div>

          {/* Profile, Works, Social centered on the exact same vertical axis (colCenterX) */}
          <nav aria-label="Primary navigation">
            {NAV_ITEMS.map((item) => {
              const isActive = activeSection === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleSelectSection(item.id)}
                  className="group absolute pointer-events-auto min-h-[44px] px-6 py-1 flex items-center justify-center font-mincho text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-white/80 cursor-pointer whitespace-nowrap"
                  style={{
                    left: `${colCenterX}px`,
                    top: `${Math.round(item.refCenterY * scaleY)}px`,
                    transform: 'translate(-50%, -50%)',
                    fontSize: `${navFontSize}px`,
                    lineHeight: 1,
                  }}
                >
                  <span
                    className="inline-block transition-opacity duration-150 group-hover:opacity-75"
                    style={{
                      transform: `scaleX(${item.scaleX})`,
                      letterSpacing: item.letterSpacing,
                      marginRight: `-${item.letterSpacing}`,
                    }}
                  >
                    {item.label}
                  </span>
                  <span
                    aria-hidden="true"
                    className={`pointer-events-none absolute -bottom-1 left-1/2 -translate-x-1/2 h-[1px] bg-white/85 transition-all duration-200 ease-out ${
                      isActive ? 'w-3/4' : 'w-0 group-hover:w-3/4'
                    }`}
                  />
                </button>
              );
            })}
          </nav>

          {mountedSection !== null && (
            <div className="pointer-events-auto">
              <InPlacePanel
                section={mountedSection}
                panelRef={sectionPanelRef}
                isMobile={false}
                desktopLeft={panelDesktopLeft}
                onClose={() => handleSelectSection(null)}
              />
            </div>
          )}
        </div>
      )}

      {SHOW_HALFTONE_DEBUGGER && activeSection === null && (
        <HalftoneDebugger
          visualParams={visualParams}
          physicsParams={physicsParams}
          dotCount={dotCount}
          onVisualChange={setVisualParams}
          onPhysicsChange={setPhysicsParams}
          onReset={() => {
            setVisualParams(DEFAULT_VISUAL_PARAMS);
            setPhysicsParams(DEFAULT_PHYSICS_PARAMS);
          }}
        />
      )}
    </div>
  );
}
