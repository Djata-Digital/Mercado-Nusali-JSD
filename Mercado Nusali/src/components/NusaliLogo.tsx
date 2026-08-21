import React from 'react';

interface NusaliLogoProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl' | number;
  variant?: 'full' | 'horizontal' | 'emblem';
  showSubtitle?: boolean;
  subtitleText?: string;
  animated?: boolean;
  darkBg?: boolean;
}

export const NusaliLogo: React.FC<NusaliLogoProps> = ({
  className = '',
  size = 'md',
  variant = 'horizontal',
  showSubtitle = true,
  subtitleText = 'GLOBAL MARKETPLACE',
  animated = false,
  darkBg = false,
}) => {
  // Determine pixel sizes
  let height = 40;
  if (typeof size === 'number') {
    height = size;
  } else {
    switch (size) {
      case 'sm':
        height = 28;
        break;
      case 'md':
        height = 42;
        break;
      case 'lg':
        height = 56;
        break;
      case 'xl':
        height = 80;
        break;
    }
  }

  // Emblem SVG path dimensions: viewBox="0 0 120 120"
  const Emblem = () => (
    <svg
      viewBox="0 0 120 120"
      className={`shrink-0 overflow-visible ${animated ? 'hover:scale-105 transition-transform duration-300' : ''}`}
      style={{ height: `${height}px`, width: `${height}px` }}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Outer segmented ring (4 color arcs) */}
      {/* Top-Left Arc (Blue) */}
      <path
        d="M 60 8 A 52 52 0 0 0 8 60"
        stroke="#0052FF"
        strokeWidth="7"
        strokeLinecap="round"
      />
      {/* Top-Right Arc (Red) */}
      <path
        d="M 60 8 A 52 52 0 0 1 112 60"
        stroke="#E51B24"
        strokeWidth="7"
        strokeLinecap="round"
      />
      {/* Bottom-Right Arc (Yellow) */}
      <path
        d="M 112 60 A 52 52 0 0 1 60 112"
        stroke="#FFB800"
        strokeWidth="7"
        strokeLinecap="round"
      />
      {/* Bottom-Left Arc (Green) */}
      <path
        d="M 60 112 A 52 52 0 0 1 8 60"
        stroke="#10B981"
        strokeWidth="7"
        strokeLinecap="round"
      />

      {/* Inner Central Double-Stroked "N" */}
      <g transform="translate(32, 28)">
        {/* Left Vertical Bar (Blue) with Serif */}
        <path
          d="M 4 2 L 18 2 M 11 2 L 11 60 M 4 60 L 18 60"
          stroke="#0052FF"
          strokeWidth="3.5"
          strokeLinecap="square"
        />
        <path
          d="M 7 2 L 7 60"
          stroke="#0052FF"
          strokeWidth="1.5"
        />

        {/* Diagonal Bar (Blue) */}
        <path
          d="M 11 2 L 45 60"
          stroke="#0052FF"
          strokeWidth="5"
          strokeLinecap="round"
        />
        <path
          d="M 15 2 L 49 60"
          stroke="#0052FF"
          strokeWidth="1.5"
        />

        {/* Right Vertical Bar (Red) with Serif */}
        <path
          d="M 38 2 L 52 2 M 45 2 L 45 60 M 38 60 L 52 60"
          stroke="#E51B24"
          strokeWidth="3.5"
          strokeLinecap="square"
        />
        <path
          d="M 48 2 L 48 60"
          stroke="#E51B24"
          strokeWidth="1.5"
        />
      </g>
    </svg>
  );

  if (variant === 'emblem') {
    return <Emblem />;
  }

  if (variant === 'full') {
    return (
      <div className={`flex flex-col items-center text-center ${className}`}>
        <Emblem />
        <div className="mt-2 font-serif font-black tracking-tight flex items-center justify-center gap-[1px]" style={{ fontSize: `${height * 0.75}px` }}>
          <span style={{ color: '#0052FF' }}>N</span>
          <span style={{ color: '#E51B24' }}>u</span>
          <span style={{ color: '#FFB800' }}>s</span>
          <span style={{ color: '#10B981' }}>a</span>
          <span style={{ color: '#E51B24' }}>l</span>
          <span style={{ color: '#0052FF' }}>i</span>
        </div>
        {showSubtitle && (
          <span className="text-[10px] font-extrabold tracking-[0.2em] text-gray-700 uppercase mt-0.5">
            {subtitleText}
          </span>
        )}
      </div>
    );
  }

  // Variant: horizontal (Default for Header & Navbar)
  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      <Emblem />
      <div className="flex flex-col text-left leading-none">
        <div className={`flex items-baseline font-black tracking-tight ${darkBg ? 'text-white' : 'text-gray-900'}`} style={{ fontSize: `${Math.max(18, height * 0.58)}px` }}>
          <span className={`font-extrabold ${darkBg ? 'text-white' : 'text-blue-950'}`}>mercado</span>
          <span className="ml-0.5 flex items-center font-serif">
            <span style={{ color: darkBg ? '#60A5FA' : '#0052FF' }}>n</span>
            <span style={{ color: '#F87171' }}>u</span>
            <span style={{ color: '#FBBF24' }}>s</span>
            <span style={{ color: '#34D399' }}>a</span>
            <span style={{ color: '#F87171' }}>l</span>
            <span style={{ color: darkBg ? '#60A5FA' : '#0052FF' }}>i</span>
          </span>
        </div>
        {showSubtitle && (
          <span
            className={`font-extrabold tracking-[0.18em] uppercase mt-1 ${darkBg ? 'text-yellow-300' : 'text-gray-800'}`}
            style={{ fontSize: `${Math.max(8, height * 0.22)}px` }}
          >
            {subtitleText}
          </span>
        )}
      </div>
    </div>
  );
};
