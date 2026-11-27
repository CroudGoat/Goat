import React, { useState } from 'react';
import { Check, Copy, RotateCcw, SlidersHorizontal, X } from 'lucide-react';
import {
  DEFAULT_PHYSICS_PARAMS,
  DEFAULT_VISUAL_PARAMS,
  HalftonePhysicsParams,
  HalftoneVisualParams,
} from '../utils/halftoneDots';

interface HalftoneDebuggerProps {
  visualParams: HalftoneVisualParams;
  physicsParams: HalftonePhysicsParams;
  dotCount: number;
  onVisualChange: (next: HalftoneVisualParams) => void;
  onPhysicsChange: (next: HalftonePhysicsParams) => void;
  onReset: () => void;
}

interface SliderRowProps {
  id: string;
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format?: (v: number) => string;
  onChange: (value: number) => void;
}

const SliderRow: React.FC<SliderRowProps> = ({
  id,
  label,
  value,
  min,
  max,
  step,
  format = (v) => v.toFixed(2),
  onChange,
}) => (
  <div className="space-y-1">
    <div className="flex items-center justify-between gap-2 text-xs">
      <label htmlFor={id} className="text-white/75 tracking-wide">
        {label}
      </label>
      <span className="font-mono-tech text-white text-[11px]">{format(value)}</span>
    </div>
    <input
      id={id}
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(e) => onChange(parseFloat(e.target.value))}
      className="halftone-slider w-full cursor-pointer"
    />
  </div>
);

export const HalftoneDebugger: React.FC<HalftoneDebuggerProps> = ({
  visualParams,
  physicsParams,
  dotCount,
  onVisualChange,
  onPhysicsChange,
  onReset,
}) => {
  const [isOpen, setIsOpen] = useState(true);
  const [copied, setCopied] = useState(false);

  const handleCopyJson = async () => {
    const payload = JSON.stringify({ visualParams, physicsParams }, null, 2);
    try {
      await navigator.clipboard.writeText(payload);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  };

  const setVisual = (key: keyof HalftoneVisualParams, val: number) => {
    const next = { ...visualParams, [key]: val };
    if (key === 'blackPoint' && next.blackPoint >= next.whitePoint - 0.05) {
      next.whitePoint = Math.min(1, Number((next.blackPoint + 0.05).toFixed(3)));
    } else if (key === 'whitePoint' && next.whitePoint <= next.blackPoint + 0.05) {
      next.blackPoint = Math.max(0, Number((next.whitePoint - 0.05).toFixed(3)));
    } else if (key === 'shadeBlack' && next.shadeBlack >= next.shadeWhite - 0.05) {
      next.shadeWhite = Math.min(1, Number((next.shadeBlack + 0.05).toFixed(2)));
    } else if (key === 'shadeWhite' && next.shadeWhite <= next.shadeBlack + 0.05) {
      next.shadeBlack = Math.max(0, Number((next.shadeWhite - 0.05).toFixed(2)));
    }
    onVisualChange(next);
  };

  const setPhysics = (key: keyof HalftonePhysicsParams, val: number) => {
    onPhysicsChange({ ...physicsParams, [key]: val });
  };

  const isDefault =
    visualParams.pitch === DEFAULT_VISUAL_PARAMS.pitch &&
    visualParams.blackPoint === DEFAULT_VISUAL_PARAMS.blackPoint &&
    visualParams.whitePoint === DEFAULT_VISUAL_PARAMS.whitePoint &&
    visualParams.sCurve === DEFAULT_VISUAL_PARAMS.sCurve &&
    visualParams.gamma === DEFAULT_VISUAL_PARAMS.gamma &&
    visualParams.maxDotFactor === DEFAULT_VISUAL_PARAMS.maxDotFactor &&
    visualParams.shadeMix === DEFAULT_VISUAL_PARAMS.shadeMix &&
    visualParams.shadeBlack === DEFAULT_VISUAL_PARAMS.shadeBlack &&
    visualParams.shadeWhite === DEFAULT_VISUAL_PARAMS.shadeWhite &&
    visualParams.shadeGamma === DEFAULT_VISUAL_PARAMS.shadeGamma &&
    physicsParams.hoverRadius === DEFAULT_PHYSICS_PARAMS.hoverRadius &&
    physicsParams.repelStrength === DEFAULT_PHYSICS_PARAMS.repelStrength &&
    physicsParams.scaleBoost === DEFAULT_PHYSICS_PARAMS.scaleBoost;

  if (!isOpen) {
    return (
      <div
        data-debugger-widget="true"
        className="fixed bottom-4 right-4 z-20 select-none"
      >
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          className="min-h-[40px] px-3.5 py-2 flex items-center gap-2 bg-[#141414]/90 backdrop-blur-md border border-white/20 text-xs font-mono-tech text-white hover:border-white/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-white cursor-pointer transition-colors"
        >
          <SlidersHorizontal className="w-3.5 h-3.5" aria-hidden="true" />
          <span>Debugger</span>
        </button>
      </div>
    );
  }

  return (
    <aside
      data-debugger-widget="true"
      aria-label="Halftone parameter debugger"
      className="fixed bottom-4 right-4 z-20 w-[300px] max-w-[calc(100vw-2rem)] max-h-[82vh] flex flex-col bg-[#141414]/90 backdrop-blur-md border border-white/20 text-white shadow-2xl select-none"
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-2 px-3.5 py-2.5 border-b border-white/15">
        <div className="min-w-0">
          <div className="text-xs font-medium tracking-wider uppercase text-white">
            Halftone Debugger
          </div>
          <div className="font-mono-tech text-[11px] text-white/60">
            {dotCount.toLocaleString()} dots
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={handleCopyJson}
            title="Copy JSON parameters"
            aria-label="Copy JSON parameters"
            className="min-h-[40px] min-w-[40px] flex items-center justify-center text-white/70 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-white cursor-pointer transition-colors"
          >
            {copied ? (
              <Check className="w-3.5 h-3.5 text-white" aria-hidden="true" />
            ) : (
              <Copy className="w-3.5 h-3.5" aria-hidden="true" />
            )}
          </button>
          <button
            type="button"
            onClick={onReset}
            disabled={isDefault}
            title="Reset parameters"
            aria-label="Reset parameters"
            className="min-h-[40px] min-w-[40px] flex items-center justify-center text-white/70 hover:text-white disabled:opacity-30 disabled:cursor-default focus:outline-none focus-visible:ring-2 focus-visible:ring-white cursor-pointer transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => setIsOpen(false)}
            title="Collapse debugger"
            aria-label="Collapse debugger"
            className="min-h-[40px] min-w-[40px] flex items-center justify-center text-white/70 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-white cursor-pointer transition-colors"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>
      </div>

      {/* Scrollable slider body */}
      <div className="overflow-y-auto px-3.5 py-3 space-y-4">
        <div className="space-y-3">
          <div className="text-[11px] font-mono-tech uppercase tracking-wider text-white/60">
            Tone & Grid
          </div>
          <SliderRow
            id="dbg-pitch"
            label="Pitch (粒度)"
            value={visualParams.pitch}
            min={3.5}
            max={12}
            step={0.5}
            format={(v) => `${v.toFixed(1)}px`}
            onChange={(v) => setVisual('pitch', v)}
          />
          <SliderRow
            id="dbg-black-point"
            label="Black Point (黒つぶれ)"
            value={visualParams.blackPoint}
            min={0}
            max={0.45}
            step={0.005}
            format={(v) => v.toFixed(3)}
            onChange={(v) => setVisual('blackPoint', v)}
          />
          <SliderRow
            id="dbg-white-point"
            label="White Point (白飛び)"
            value={visualParams.whitePoint}
            min={0.4}
            max={1}
            step={0.01}
            onChange={(v) => setVisual('whitePoint', v)}
          />
          <SliderRow
            id="dbg-scurve"
            label="S-Curve (コントラスト)"
            value={visualParams.sCurve}
            min={0}
            max={1}
            step={0.05}
            onChange={(v) => setVisual('sCurve', v)}
          />
          <SliderRow
            id="dbg-gamma"
            label="Gamma (中間調)"
            value={visualParams.gamma}
            min={0.5}
            max={2.5}
            step={0.05}
            onChange={(v) => setVisual('gamma', v)}
          />
          <SliderRow
            id="dbg-max-dot"
            label="Max Dot Size (最大半径)"
            value={visualParams.maxDotFactor}
            min={0.4}
            max={0.85}
            step={0.01}
            onChange={(v) => setVisual('maxDotFactor', v)}
          />
        </div>

        <div className="pt-3 border-t border-white/15 space-y-3">
          <div className="text-[11px] font-mono-tech uppercase tracking-wider text-white/60">
            Photo Shade (白〜黒)
          </div>
          <SliderRow
            id="dbg-shade-mix"
            label="Shade Mix (濃淡反映)"
            value={visualParams.shadeMix}
            min={0}
            max={1}
            step={0.05}
            onChange={(v) => setVisual('shadeMix', v)}
          />
          <SliderRow
            id="dbg-shade-black"
            label="Shade Black (黒点)"
            value={visualParams.shadeBlack}
            min={0}
            max={0.75}
            step={0.01}
            onChange={(v) => setVisual('shadeBlack', v)}
          />
          <SliderRow
            id="dbg-shade-white"
            label="Shade White (白点)"
            value={visualParams.shadeWhite}
            min={0.5}
            max={1}
            step={0.01}
            onChange={(v) => setVisual('shadeWhite', v)}
          />
          <SliderRow
            id="dbg-shade-gamma"
            label="Shade Gamma (階調)"
            value={visualParams.shadeGamma}
            min={0.4}
            max={2.5}
            step={0.05}
            onChange={(v) => setVisual('shadeGamma', v)}
          />
        </div>

        <div className="pt-3 border-t border-white/15 space-y-3">
          <div className="text-[11px] font-mono-tech uppercase tracking-wider text-white/60">
            Hover Physics
          </div>
          <SliderRow
            id="dbg-hover-radius"
            label="Hover Radius (反応範囲)"
            value={physicsParams.hoverRadius}
            min={40}
            max={240}
            step={5}
            format={(v) => `${Math.round(v)}px`}
            onChange={(v) => setPhysics('hoverRadius', v)}
          />
          <SliderRow
            id="dbg-repel-strength"
            label="Repel Force (反発力)"
            value={physicsParams.repelStrength}
            min={0}
            max={6}
            step={0.1}
            onChange={(v) => setPhysics('repelStrength', v)}
          />
          <SliderRow
            id="dbg-scale-boost"
            label="Scale Boost (拡大率)"
            value={physicsParams.scaleBoost}
            min={0}
            max={1}
            step={0.05}
            onChange={(v) => setPhysics('scaleBoost', v)}
          />
        </div>
      </div>
    </aside>
  );
};
