import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import { KalianLogo } from '../public/KalianLogo';

interface KalianHeaderProps {
  showPanelButton?: boolean;
}

const KalianHeader: React.FC<KalianHeaderProps> = ({ showPanelButton = false }) => {
  const [config, setConfig] = useState<any>(null);

  useEffect(() => {
    const fetchConfig = async () => {
      const snap = await getDoc(doc(db, "config", "site"));
      if (snap.exists()) setConfig(snap.data());
    };
    fetchConfig();
  }, []);

  return (
    <div className="p-10 md:p-20 text-center space-y-6 relative overflow-hidden">
      {/* Background Glow */}
      <div className="absolute inset-0 opacity-5 pointer-events-none">
        <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(circle_at_center,_var(--color-kalian-gold)_0%,_transparent_70%)]"></div>
      </div>
      
      {/* Logo Section */}
      <div className="flex justify-center mb-8 relative z-10">
        {config?.logoUrl ? (
          <img src={config.logoUrl} alt="Logo" className="h-32 md:h-48 object-contain drop-shadow-[0_0_25px_rgba(212,175,55,0.2)]" />
        ) : (
          <KalianLogo size="lg" />
        )}
      </div>

      {/* Title & Slogan */}
      <div className="space-y-4 relative z-10">
        <h1 className="text-5xl md:text-8xl kalian-poster-text text-kalian-gold tracking-[-0.05em] uppercase italic leading-none">
          {config?.siteName || "KALIAN HKG"}
        </h1>
        <p className="text-kalian-gold/60 text-xs md:text-sm font-black tracking-[0.6em] uppercase italic">
          {config?.slogan || "KALIAN HIRI KULTUR GUNEA"}
        </p>
      </div>

      {/* Optional Panel Button (Only for Socio) */}
      {showPanelButton && (
        <div className="pt-10 flex justify-center relative z-10">
          <Link 
            to="/perfil" 
            className="bg-kalian-gold text-black px-10 py-4 rounded-2xl kalian-poster-text text-xl tracking-widest hover:bg-white transition-all shadow-2xl shadow-kalian-gold/20"
          >
            IR A MI PANEL →
          </Link>
        </div>
      )}
    </div>
  );
};

export default KalianHeader;
