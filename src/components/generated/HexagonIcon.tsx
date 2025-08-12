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
      <svg width="100%" height="100%" viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg" className="drop-shadow-lg" data-magicpath-id="1" data-magicpath-path="HexagonIcon.tsx">
        <defs data-magicpath-id="2" data-magicpath-path="HexagonIcon.tsx">
          {/* Main hexagon gradient */}
          <linearGradient id="hexagonGradient" x1="0%" y1="0%" x2="100%" y2="100%" data-magicpath-id="3" data-magicpath-path="HexagonIcon.tsx">
            <stop offset="0%" stopColor="#7dd3fc" />
            <stop offset="50%" stopColor="#67e8f9" />
            <stop offset="100%" stopColor="#0891b2" />
          </linearGradient>
          
          {/* Inner shadow filter */}
          <filter id="innerShadow" x="-50%" y="-50%" width="200%" height="200%" data-magicpath-id="4" data-magicpath-path="HexagonIcon.tsx">
            <feGaussianBlur in="SourceGraphic" stdDeviation="3" data-magicpath-id="5" data-magicpath-path="HexagonIcon.tsx" />
            <feOffset dx="2" dy="2" result="offset" data-magicpath-id="6" data-magicpath-path="HexagonIcon.tsx" />
            <feFlood floodColor="#0891b2" floodOpacity="0.3" data-magicpath-id="7" data-magicpath-path="HexagonIcon.tsx" />
            <feComposite in2="offset" operator="in" data-magicpath-id="8" data-magicpath-path="HexagonIcon.tsx" />
            <feMerge data-magicpath-id="9" data-magicpath-path="HexagonIcon.tsx">
              <feMergeNode data-magicpath-id="10" data-magicpath-path="HexagonIcon.tsx" />
              <feMergeNode in="SourceGraphic" data-magicpath-id="11" data-magicpath-path="HexagonIcon.tsx" />
            </feMerge>
          </filter>
          
          {/* Outer glow */}
          <filter id="outerGlow" x="-20%" y="-20%" width="140%" height="140%" data-magicpath-id="12" data-magicpath-path="HexagonIcon.tsx">
            <feGaussianBlur stdDeviation="4" result="coloredBlur" data-magicpath-id="13" data-magicpath-path="HexagonIcon.tsx" />
            <feMerge data-magicpath-id="14" data-magicpath-path="HexagonIcon.tsx">
              <feMergeNode in="coloredBlur" data-magicpath-id="15" data-magicpath-path="HexagonIcon.tsx" />
              <feMergeNode in="SourceGraphic" data-magicpath-id="16" data-magicpath-path="HexagonIcon.tsx" />
            </feMerge>
          </filter>
        </defs>
        
        {/* Main hexagon */}
        <polygon points={hexagonPoints} fill="url(#hexagonGradient)" stroke="#0891b2" strokeWidth="2" filter="url(#outerGlow)" data-magicpath-id="17" data-magicpath-path="HexagonIcon.tsx" />
        
        {/* Concentric circles */}
        <circle cx="100" cy="100" r="65" fill="none" stroke="#0891b2" strokeWidth="1.5" opacity="0.4" data-magicpath-id="18" data-magicpath-path="HexagonIcon.tsx" />
        
        <circle cx="100" cy="100" r="50" fill="none" stroke="#0891b2" strokeWidth="1.5" opacity="0.5" data-magicpath-id="19" data-magicpath-path="HexagonIcon.tsx" />
        
        <circle cx="100" cy="100" r="35" fill="none" stroke="#0891b2" strokeWidth="1.5" opacity="0.6" data-magicpath-id="20" data-magicpath-path="HexagonIcon.tsx" />
        
        {/* Eyes */}
        <circle cx="85" cy="85" r="4" fill="#0f172a" data-magicpath-id="21" data-magicpath-path="HexagonIcon.tsx" />
        
        <circle cx="115" cy="85" r="4" fill="#0f172a" data-magicpath-id="22" data-magicpath-path="HexagonIcon.tsx" />
        
        {/* Smile */}
        <path d="M 85 110 Q 100 125 115 110" stroke="#0f172a" strokeWidth="3" fill="none" strokeLinecap="round" data-magicpath-id="23" data-magicpath-path="HexagonIcon.tsx" />
      </svg>
    </div>;
};