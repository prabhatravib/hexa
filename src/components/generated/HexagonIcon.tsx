import React from 'react';
interface HexagonIconProps {
  size?: number;
  className?: string;
  mpid?: string;
}
export const HexagonIcon: React.FC<HexagonIconProps> = ({
  size = 200,
  className = ''
}) => {
  const hexagonPoints = "100,20 180,60 180,140 100,180 20,140 20,60";
  return <div className={`inline-block ${className}`} style={{
    width: size,
    height: size
  }} data-magicpath-id="0" data-magicpath-path="HexagonIcon.tsx">
      <svg width="100%" height="100%" viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg" className="drop-shadow-2xl" data-magicpath-id="1" data-magicpath-path="HexagonIcon.tsx">
        <defs data-magicpath-id="2" data-magicpath-path="HexagonIcon.tsx">
          {/* Main hexagon gradient - deeper teal with more depth */}
          <linearGradient id="hexagonGradient" x1="0%" y1="0%" x2="100%" y2="100%" data-magicpath-id="3" data-magicpath-path="HexagonIcon.tsx">
            <stop offset="0%" stopColor="#a7f3d0" />
            <stop offset="30%" stopColor="#6ee7b7" />
            <stop offset="70%" stopColor="#34d399" />
            <stop offset="100%" stopColor="#059669" />
          </linearGradient>
          
          {/* Secondary gradient for depth layers */}
          <linearGradient id="depthGradient" x1="0%" y1="0%" x2="100%" y2="100%" data-magicpath-id="4" data-magicpath-path="HexagonIcon.tsx">
            <stop offset="0%" stopColor="#6ee7b7" />
            <stop offset="50%" stopColor="#10b981" />
            <stop offset="100%" stopColor="#047857" />
          </linearGradient>
          
          {/* Darker gradient for inner layers */}
          <linearGradient id="innerGradient" x1="0%" y1="0%" x2="100%" y2="100%" data-magicpath-id="5" data-magicpath-path="HexagonIcon.tsx">
            <stop offset="0%" stopColor="#34d399" />
            <stop offset="100%" stopColor="#047857" />
          </linearGradient>
          
          {/* Radial gradient for center highlight */}
          <radialGradient id="centerHighlight" cx="50%" cy="40%" r="60%" data-magicpath-id="6" data-magicpath-path="HexagonIcon.tsx">
            <stop offset="0%" stopColor="#a7f3d0" stopOpacity="0.8" />
            <stop offset="70%" stopColor="#6ee7b7" stopOpacity="0.4" />
            <stop offset="100%" stopColor="transparent" />
          </radialGradient>
          
          {/* Enhanced shadow filter */}
          <filter id="deepShadow" x="-50%" y="-50%" width="200%" height="200%" data-magicpath-id="7" data-magicpath-path="HexagonIcon.tsx">
            <feDropShadow dx="0" dy="8" stdDeviation="12" floodColor="#047857" floodOpacity="0.3" data-magicpath-id="8" data-magicpath-path="HexagonIcon.tsx" />
            <feDropShadow dx="0" dy="4" stdDeviation="6" floodColor="#059669" floodOpacity="0.4" data-magicpath-id="9" data-magicpath-path="HexagonIcon.tsx" />
            <feDropShadow dx="0" dy="2" stdDeviation="3" floodColor="#0891b2" floodOpacity="0.2" data-magicpath-id="10" data-magicpath-path="HexagonIcon.tsx" />
          </filter>
          
          {/* Inner shadow for depth */}
          <filter id="innerDepth" x="-50%" y="-50%" width="200%" height="200%" data-magicpath-id="11" data-magicpath-path="HexagonIcon.tsx">
            <feOffset in="SourceAlpha" dx="0" dy="3" result="offset" data-magicpath-id="12" data-magicpath-path="HexagonIcon.tsx" />
            <feGaussianBlur in="offset" stdDeviation="4" result="blur" data-magicpath-id="13" data-magicpath-path="HexagonIcon.tsx" />
            <feFlood floodColor="#047857" floodOpacity="0.6" data-magicpath-id="14" data-magicpath-path="HexagonIcon.tsx" />
            <feComposite in2="blur" operator="in" result="innerShadow" data-magicpath-id="15" data-magicpath-path="HexagonIcon.tsx" />
            <feMerge data-magicpath-id="16" data-magicpath-path="HexagonIcon.tsx">
              <feMergeNode in="SourceGraphic" data-magicpath-id="17" data-magicpath-path="HexagonIcon.tsx" />
              <feMergeNode in="innerShadow" data-magicpath-id="18" data-magicpath-path="HexagonIcon.tsx" />
            </feMerge>
          </filter>
        </defs>
        
        {/* Background subtle glow */}
        <circle cx="100" cy="100" r="95" fill="url(#centerHighlight)" opacity="0.3" data-magicpath-id="19" data-magicpath-path="HexagonIcon.tsx" />
        
        {/* Outer hexagon layer for depth */}
        <polygon points="100,15 185,65 185,135 100,185 15,135 15,65" fill="url(#depthGradient)" opacity="0.6" filter="url(#deepShadow)" data-magicpath-id="20" data-magicpath-path="HexagonIcon.tsx" />
        
        {/* Middle hexagon layer */}
        <polygon points="100,18 182,62 182,138 100,182 18,138 18,62" fill="url(#innerGradient)" opacity="0.8" data-magicpath-id="21" data-magicpath-path="HexagonIcon.tsx" />
        
        {/* Main hexagon with enhanced depth */}
        <polygon points={hexagonPoints} fill="url(#hexagonGradient)" stroke="#059669" strokeWidth="1.5" filter="url(#innerDepth)" data-magicpath-id="22" data-magicpath-path="HexagonIcon.tsx" />
        
        {/* Concentric depth rings - more subtle and layered */}
        <circle cx="100" cy="100" r="70" fill="none" stroke="#047857" strokeWidth="0.8" opacity="0.25" data-magicpath-id="23" data-magicpath-path="HexagonIcon.tsx" />
        
        <circle cx="100" cy="100" r="55" fill="none" stroke="#059669" strokeWidth="1" opacity="0.35" data-magicpath-id="24" data-magicpath-path="HexagonIcon.tsx" />
        
        <circle cx="100" cy="100" r="40" fill="none" stroke="#10b981" strokeWidth="1.2" opacity="0.45" data-magicpath-id="25" data-magicpath-path="HexagonIcon.tsx" />
        
        <circle cx="100" cy="100" r="25" fill="none" stroke="#34d399" strokeWidth="1" opacity="0.3" data-magicpath-id="26" data-magicpath-path="HexagonIcon.tsx" />
        
        {/* Center highlight circle */}
        <circle cx="100" cy="100" r="15" fill="url(#centerHighlight)" opacity="0.6" data-magicpath-id="27" data-magicpath-path="HexagonIcon.tsx" />
        
        {/* Eyes with depth */}
        <ellipse cx="85" cy="85" rx="4.5" ry="5" fill="#064e3b" data-magicpath-id="28" data-magicpath-path="HexagonIcon.tsx" />
        
        <ellipse cx="115" cy="85" rx="4.5" ry="5" fill="#064e3b" data-magicpath-id="29" data-magicpath-path="HexagonIcon.tsx" />
        
        {/* Eye highlights */}
        <circle cx="86" cy="83" r="1.5" fill="#a7f3d0" opacity="0.8" data-magicpath-id="30" data-magicpath-path="HexagonIcon.tsx" />
        
        <circle cx="116" cy="83" r="1.5" fill="#a7f3d0" opacity="0.8" data-magicpath-id="31" data-magicpath-path="HexagonIcon.tsx" />
        
        {/* Enhanced smile with depth */}
        <path d="M 82 108 Q 100 128 118 108" stroke="#064e3b" strokeWidth="4" fill="none" strokeLinecap="round" data-magicpath-id="32" data-magicpath-path="HexagonIcon.tsx" />
        
        {/* Smile highlight */}
        <path d="M 84 110 Q 100 126 116 110" stroke="#10b981" strokeWidth="1.5" fill="none" strokeLinecap="round" opacity="0.6" data-magicpath-id="33" data-magicpath-path="HexagonIcon.tsx" />
        
        {/* Top highlight for 3D effect */}
        <polygon points="100,20 180,60 175,55 100,25" fill="url(#centerHighlight)" opacity="0.7" data-magicpath-id="34" data-magicpath-path="HexagonIcon.tsx" />
        
        {/* Side highlight for dimension */}
        <polygon points="180,60 180,140 175,135 175,65" fill="#047857" opacity="0.3" data-magicpath-id="35" data-magicpath-path="HexagonIcon.tsx" />
      </svg>
    </div>;
};