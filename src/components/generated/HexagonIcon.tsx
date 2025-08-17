import React from 'react';
interface HexagonIconProps {
  size?: number;
  className?: string;
}
export const HexagonIcon: React.FC<HexagonIconProps> = ({
  size = 200,
  className = ''
}) => {
  const hexagonPoints = "100,20 180,60 180,140 100,180 20,140 20,60";
  return <div className={`inline-block ${className}`} style={{
    width: size,
    height: size
  }}>
      <svg width="100%" height="100%" viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg" className="drop-shadow-2xl">
        <defs>
          {/* Main hexagon gradient - deeper teal with more depth */}
          <linearGradient id="hexagonGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#a7f3d0" />
            <stop offset="30%" stopColor="#6ee7b7" />
            <stop offset="70%" stopColor="#34d399" />
            <stop offset="100%" stopColor="#059669" />
          </linearGradient>
          
          {/* Secondary gradient for depth layers */}
          <linearGradient id="depthGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#6ee7b7" />
            <stop offset="50%" stopColor="#10b981" />
            <stop offset="100%" stopColor="#047857" />
          </linearGradient>
          
          {/* Darker gradient for inner layers */}
          <linearGradient id="innerGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#34d399" />
            <stop offset="100%" stopColor="#047857" />
          </linearGradient>
          
          {/* Radial gradient for center highlight */}
          <radialGradient id="centerHighlight" cx="50%" cy="40%" r="60%">
            <stop offset="0%" stopColor="#a7f3d0" stopOpacity="0.8" />
            <stop offset="70%" stopColor="#6ee7b7" stopOpacity="0.4" />
            <stop offset="100%" stopColor="transparent" />
          </radialGradient>
          
          {/* Enhanced shadow filter */}
          <filter id="deepShadow" x="-50%" y="-50%" width="200%" height="200%">
            <feDropShadow dx="0" dy="8" stdDeviation="12" floodColor="#047857" floodOpacity="0.3" />
            <feDropShadow dx="0" dy="4" stdDeviation="6" floodColor="#059669" floodOpacity="0.4" />
            <feDropShadow dx="0" dy="2" stdDeviation="3" floodColor="#0891b2" floodOpacity="0.2" />
          </filter>
          
          {/* Inner shadow for depth */}
          <filter id="innerDepth" x="-50%" y="-50%" width="200%" height="200%">
            <feOffset in="SourceAlpha" dx="0" dy="3" result="offset" />
            <feGaussianBlur in="offset" stdDeviation="4" result="blur" />
            <feFlood floodColor="#047857" floodOpacity="0.6" />
            <feComposite in2="blur" operator="in" result="innerShadow" />
            <feMerge>
              <feMergeNode in="SourceGraphic" />
              <feMergeNode in="innerShadow" />
            </feMerge>
          </filter>
        </defs>
        
        {/* Background subtle glow */}
        <circle cx="100" cy="100" r="95" fill="url(#centerHighlight)" opacity="0.3" />
        
        {/* Outer hexagon layer for depth */}
        <polygon points="100,15 185,65 185,135 100,185 15,135 15,65" fill="url(#depthGradient)" opacity="0.6" filter="url(#deepShadow)" />
        
        {/* Middle hexagon layer */}
        <polygon points="100,18 182,62 182,138 100,182 18,138 18,62" fill="url(#innerGradient)" opacity="0.8" />
        
        {/* Main hexagon with enhanced depth */}
        <polygon points={hexagonPoints} fill="url(#hexagonGradient)" stroke="#059669" strokeWidth="1.5" filter="url(#innerDepth)" />
        
        {/* Concentric depth rings - more subtle and layered */}
        <circle cx="100" cy="100" r="70" fill="none" stroke="#047857" strokeWidth="0.8" opacity="0.25" />
        
        <circle cx="100" cy="100" r="55" fill="none" stroke="#059669" strokeWidth="1" opacity="0.35" />
        
        <circle cx="100" cy="100" r="40" fill="none" stroke="#10b981" strokeWidth="1.2" opacity="0.45" />
        
        <circle cx="100" cy="100" r="25" fill="none" stroke="#34d399" strokeWidth="1" opacity="0.3" />
        
        {/* Center highlight circle */}
        <circle cx="100" cy="100" r="15" fill="url(#centerHighlight)" opacity="0.6" />
        
        {/* Eyes with depth */}
        <ellipse cx="85" cy="85" rx="4.5" ry="5" fill="#064e3b" />
        
        <ellipse cx="115" cy="85" rx="4.5" ry="5" fill="#064e3b" />
        
        {/* Eye highlights */}
        <circle cx="86" cy="83" r="1.5" fill="#a7f3d0" opacity="0.8" />
        
        <circle cx="116" cy="83" r="1.5" fill="#a7f3d0" opacity="0.8" />
        
        {/* Enhanced smile with depth */}
        <path d="M 82 108 Q 100 128 118 108" stroke="#064e3b" strokeWidth="4" fill="none" strokeLinecap="round" />
        
        {/* Smile highlight */}
        <path d="M 84 110 Q 100 126 116 110" stroke="#10b981" strokeWidth="1.5" fill="none" strokeLinecap="round" opacity="0.6" />
        
        {/* Top highlight for 3D effect */}
        <polygon points="100,20 180,60 175,55 100,25" fill="url(#centerHighlight)" opacity="0.7" />
        
        {/* Side highlight for dimension */}
        <polygon points="180,60 180,140 175,135 175,65" fill="#047857" opacity="0.3" />
      </svg>
    </div>;
};