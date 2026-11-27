import React, { useEffect } from 'react';
import { ArrowUpRight, X } from 'lucide-react';

export type ActiveSection = 'profile' | 'works' | null;

const PROFILE_META = [
  { label: 'Interests', value: 'Model Merge' },
  { label: 'Location', value: 'Niigata, Japan' },
];

interface InPlacePanelProps {
  section: Exclude<ActiveSection, null>;
  panelRef: React.RefObject<HTMLDivElement | null>;
  isMobile: boolean;
  desktopLeft: number;
  onClose: () => void;
}

export const InPlacePanel: React.FC<InPlacePanelProps> = ({
  section,
  panelRef,
  isMobile,
  desktopLeft,
  onClose,
}) => {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const headerKicker =
    section === 'profile' ? 'Profile' : 'Model Merge · Open Source · Weights';

  return (
    <section
      ref={panelRef}
      aria-label={section}
      style={{
        opacity: 0,
        pointerEvents: 'none',
        ...(isMobile
          ? {}
          : {
              left: `${desktopLeft}px`,
              right: 'clamp(28px, 4.5vw, 88px)',
            }),
      }}
      className={
        isMobile
          ? 'relative z-20 mt-6 mx-auto w-full max-w-xl px-2 pb-12 select-text'
          : 'fixed top-1/2 -translate-y-1/2 z-20 max-w-[680px] max-h-[88vh] overflow-y-auto select-text'
      }
    >
      <div className="space-y-6">
        {/* Top bar with hairline */}
        <div>
          <div className="flex items-center justify-between gap-4 pb-3">
            <p data-morph-text="true" className="font-mono-tech text-xs text-white/60">
              {headerKicker}
            </p>
            <button
              type="button"
              onClick={onClose}
              aria-label={`Close ${section}`}
              data-morph-box="true"
              className="min-h-[40px] min-w-[40px] inline-flex items-center justify-center border border-white/20 text-white hover:bg-white hover:text-[#141414] transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>
          <div data-morph-line="true" className="h-[1px] w-full bg-white/20" />
        </div>

        {section === 'profile' && (
          <div className="space-y-8">
            <h2
              data-morph-text="true"
              className="font-mincho text-3xl md:text-5xl font-normal tracking-tight text-white"
            >
              CloudGoat
            </h2>

            <div>
              <div data-morph-line="true" className="h-[1px] w-full bg-white/20" />
              <dl>
                {PROFILE_META.map((item) => (
                  <div key={item.label}>
                    <div className="py-4 flex flex-col sm:flex-row sm:items-baseline gap-1 sm:gap-8 text-sm">
                      <dt
                        data-morph-text="true"
                        className="w-28 shrink-0 font-mono-tech text-xs text-white/60"
                      >
                        {item.label}
                      </dt>
                      <dd data-morph-text="true" className="text-white/90">
                        {item.value}
                      </dd>
                    </div>
                    <div data-morph-line="true" className="h-[1px] w-full bg-white/15" />
                  </div>
                ))}
                <div className="py-4 flex flex-col sm:flex-row sm:items-baseline gap-1 sm:gap-8 text-sm">
                  <dt
                    data-morph-text="true"
                    className="w-28 shrink-0 font-mono-tech text-xs text-white/60"
                  >
                    Links
                  </dt>
                  <dd className="flex flex-wrap items-center gap-3">
                    <a
                      href="https://x.com/croudgoat"
                      target="_blank"
                      rel="noreferrer"
                      className="text-white hover:underline underline-offset-4 inline-flex items-center gap-1"
                    >
                      <span data-morph-text="true">X</span>
                      <ArrowUpRight className="w-3.5 h-3.5 text-white/60" aria-hidden="true" />
                    </a>
                    <span aria-hidden="true" className="text-white/40">
                      ·
                    </span>
                    <a
                      href="https://huggingface.co/CloudGoat"
                      target="_blank"
                      rel="noreferrer"
                      className="text-white hover:underline underline-offset-4 inline-flex items-center gap-1"
                    >
                      <span data-morph-text="true">Hugging Face</span>
                      <ArrowUpRight className="w-3.5 h-3.5 text-white/60" aria-hidden="true" />
                    </a>
                    <span aria-hidden="true" className="text-white/40">
                      ·
                    </span>
                    <a
                      href="https://github.com/CroudGoat"
                      target="_blank"
                      rel="noreferrer"
                      className="text-white hover:underline underline-offset-4 inline-flex items-center gap-1"
                    >
                      <span data-morph-text="true">GitHub</span>
                      <ArrowUpRight className="w-3.5 h-3.5 text-white/60" aria-hidden="true" />
                    </a>
                  </dd>
                </div>
              </dl>
              <div data-morph-line="true" className="h-[1px] w-full bg-white/20" />
            </div>
          </div>
        )}

        {section === 'works' && (
          <div className="space-y-6">
            <h2
              data-morph-text="true"
              className="font-mincho text-3xl md:text-5xl font-normal tracking-tight text-white"
            >
              Works
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* 01: GoatMerge */}
              <a
                href="https://github.com/CroudGoat/GoatMerge"
                target="_blank"
                rel="noreferrer"
                data-morph-box="true"
                className="group border border-white/20 bg-[#181818]/90 p-5 hover:border-white/60 transition-colors flex flex-col justify-between gap-4"
              >
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between text-[11px] font-mono-tech text-white/60">
                    <span data-morph-text="true">01</span>
                    <span data-morph-text="true">GitHub</span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <h3
                      data-morph-text="true"
                      className="text-base font-medium text-white group-hover:underline underline-offset-4"
                    >
                      GoatMerge
                    </h3>
                    <ArrowUpRight
                      className="w-4 h-4 text-white/60 group-hover:text-white shrink-0 transition-colors"
                      aria-hidden="true"
                    />
                  </div>
                  <p data-morph-text="true" className="text-xs text-white/75 leading-relaxed">
                    Streaming task-arithmetic merge engine。省メモリでモデルマージするエンジン。
                  </p>
                </div>
              </a>

              {/* 02: Baphomet Models (1.0 & 1.1) */}
              <div
                data-morph-box="true"
                className="border border-white/20 bg-[#181818]/90 p-5 flex flex-col justify-between gap-4"
              >
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between text-[11px] font-mono-tech text-white/60">
                    <span data-morph-text="true">02</span>
                    <span data-morph-text="true">Hugging Face</span>
                  </div>
                  <h3 data-morph-text="true" className="text-base font-medium text-white">
                    Baphomet Models
                  </h3>
                  <p data-morph-text="true" className="text-xs text-white/75 leading-relaxed">
                    Qwenベースのtask-arithmetic線形マージ視覚言語モデルシリーズ。GoatMerge製。
                  </p>
                </div>

                <div className="space-y-3">
                  <div data-morph-line="true" className="h-[1px] w-full bg-white/15" />
                  <div className="flex flex-wrap items-center gap-4 text-xs font-mono-tech">
                    <a
                      href="https://huggingface.co/CloudGoat/Baphomet-1.0-4B"
                      target="_blank"
                      rel="noreferrer"
                      className="text-white/85 hover:text-white hover:underline underline-offset-4 inline-flex items-center gap-1"
                    >
                      <span data-morph-text="true">1.0-4B</span>
                      <ArrowUpRight className="w-3.5 h-3.5 text-white/60" aria-hidden="true" />
                    </a>
                    <span aria-hidden="true" className="text-white/30">
                      ·
                    </span>
                    <a
                      href="https://huggingface.co/CloudGoat/Baphomet-1.1-4B"
                      target="_blank"
                      rel="noreferrer"
                      className="text-white/85 hover:text-white hover:underline underline-offset-4 inline-flex items-center gap-1"
                    >
                      <span data-morph-text="true">1.1-4B</span>
                      <ArrowUpRight className="w-3.5 h-3.5 text-white/60" aria-hidden="true" />
                    </a>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
};
