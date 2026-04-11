import React from 'react';

interface SectionTitleProps {
  title: string;
  subtitle?: string;
  className?: string;
  color?: string;
}

const SectionTitle: React.FC<SectionTitleProps> = ({ title, subtitle, className = "", color }) => {
  return (
    <div className={`flex items-center gap-6 ${className}`}>
      <h2 
        className="text-4xl md:text-5xl kalian-poster-text uppercase italic"
        style={{ color: color || 'var(--color-kalian-gold)' }}
      >
        {title} {subtitle && <span className="text-kalian-cream">{subtitle}</span>}
      </h2>
      <div className="h-[1px] flex-1 bg-kalian-gold/20"></div>
    </div>
  );
};

export default SectionTitle;
