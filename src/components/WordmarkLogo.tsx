import React, { useLayoutEffect, useRef, useState } from 'react';

interface WordmarkLogoProps {
  width: number;
  height: number;
  onClick?: () => void;
}

export const WordmarkLogo: React.FC<WordmarkLogoProps> = ({ width, height, onClick }) => {
  const measureRef = useRef<HTMLSpanElement | null>(null);
  const [scale, setScale] = useState<{ sx: number; sy: number }>({ sx: 1, sy: 2.8 });

  useLayoutEffect(() => {
    let cancelled = false;

    const updateScale = () => {
      const el = measureRef.current;
      if (!el || cancelled) return;
      const natW = el.offsetWidth;
      const natH = el.offsetHeight;
      if (natW > 0 && natH > 0) {
        setScale({
          sx: width / natW,
          sy: height / natH,
        });
      }
    };

    updateScale();
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(updateScale);
    }

    return () => {
      cancelled = true;
    };
  }, [width, height]);

  const baseFontSize = Math.max(24, width * 0.16);

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="CLOUDGOAT Home"
      style={{ width: `${width}px`, height: `${height}px` }}
      className="group relative flex items-center justify-center overflow-visible focus:outline-none focus-visible:ring-2 focus-visible:ring-white/80 focus-visible:ring-offset-4 focus-visible:ring-offset-[#141414] cursor-pointer"
    >
      <span
        ref={measureRef}
        className="font-mincho inline-block whitespace-nowrap text-white font-normal leading-none tracking-[-0.03em] transition-opacity duration-200 group-hover:opacity-85 select-none"
        style={{
          fontSize: `${baseFontSize}px`,
          transformOrigin: 'center center',
          transform: `scale(${scale.sx}, ${scale.sy})`,
        }}
      >
        CLOUDGOAT
      </span>
    </button>
  );
};
