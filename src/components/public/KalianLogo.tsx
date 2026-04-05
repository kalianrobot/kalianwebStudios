import React, { useState } from 'react';

interface KalianLogoProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg';
  showText?: boolean;
}

export const KalianLogo: React.FC<KalianLogoProps> = ({ 
  className = "", 
  size = 'md',
  showText = false 
}) => {
  const [imgError, setImgError] = useState(false);

  const sizes = {
    sm: { circle: 'w-8 h-8', text: 'text-xl', dot: 'w-2 h-2', img: 'w-8' },
    md: { circle: 'w-16 h-16', text: 'text-4xl', dot: 'w-4 h-4', img: 'w-16' },
    lg: { circle: 'w-32 h-32', text: 'text-7xl', dot: 'w-8 h-8', img: 'w-32' }
  };

  const { circle, text, dot, img } = sizes[size];

  return (
    <div className={`flex items-center gap-4 ${className}`}>
      {!imgError ? (
        <img 
          src="/logo.png" 
          alt="Kalian HKG Logo" 
          className={`${img} h-auto drop-shadow-[0_0_15px_rgba(212,175,55,0.3)]`}
          referrerPolicy="no-referrer"
          onError={() => setImgError(true)}
        />
      ) : (
        <div className={`${circle} bg-black rounded-full flex items-center justify-center relative border-2 border-kalian-gold/30 shadow-2xl overflow-visible`}>
          <div className="relative w-full h-full flex items-center justify-center">
            {/* The X */}
            <div className="absolute w-[60%] h-[12%] bg-white -rotate-45 rounded-full"></div>
            <div className="absolute w-[60%] h-[12%] bg-white rotate-45 rounded-full"></div>
            
            {/* The Orange Dot - positioned relative to the X top right */}
            <div className={`absolute ${dot} bg-kalian-orange rounded-full shadow-[0_0_15px_rgba(249,115,22,0.6)] top-[20%] right-[20%] translate-x-1/2 -translate-y-1/2`}></div>
          </div>
        </div>
      )}
      {showText && (
        <span className={`${text} font-display text-kalian-gold tracking-tighter uppercase leading-none`}>
          KALIAN
        </span>
      )}
    </div>
  );
};
