import React, { createContext, useContext, useState, useEffect } from 'react';

type Language = 'es' | 'eu';

interface Translations {
  [key: string]: {
    [key in Language]: string;
  };
}

const translations: Translations = {
  // Navbar & General
  'nav.gallery': { es: 'Galería', eu: 'Galeria' },
  'nav.catalog': { es: 'Catálogo', eu: 'Katalogoa' },
  'nav.panel': { es: 'Mi Panel', eu: 'Nire Panela' },
  'nav.admin': { es: 'Panel Admin', eu: 'Admin Panela' },
  'nav.teacher': { es: 'Panel Profesor', eu: 'Irakasle Panela' },
  'nav.logout': { es: 'Salir', eu: 'Irten' },
  'nav.login': { es: 'Acceso Soci@s', eu: 'Bazkideen Sarbidea' },
  'nav.changeRole': { es: 'Cambiar Rol', eu: 'Rola Aldatu' },

  // Programacion / Home
  'home.title': { es: 'PROGRAMACIÓN', eu: 'EGITARAUA' },
  'home.events': { es: 'PRÓXIMOS EVENTOS', eu: 'HURRENGO EKITALDIAK' },
  'home.courses': { es: 'CURSOS Y TALLERES', eu: 'IKASTAROAK ETA TAILERRAK' },
  'home.academy': { es: 'ACADEMIA KALIAN', eu: 'KALIAN AKADEMIA' },
  'home.gallery': { es: 'KALIAN GALLERY', eu: 'KALIAN GALERIA' },
  'home.hub': { es: 'KALIAN HUB', eu: 'KALIAN HUB' },
  'home.contact': { es: '¿Necesitas Ayuda?', eu: 'Laguntza behar duzu?' },
  'home.viewGallery': { es: 'VER GALERÍA COMPLETA →', eu: 'IKUSI GALERIA OSOA →' },
  'home.reserve': { es: 'Reservar Plaza', eu: 'Lekua Erreserbatu' },
  'home.soon': { es: 'Próximamente', eu: 'Laster' },
  'home.openReservations': { es: 'Apertura reservas', eu: 'Erreserben irekiera' },
  'home.discount': { es: 'Descuento Soci@s', eu: 'Bazkide Deskontua' },
  
  // Buttons
  'btn.back': { es: 'VOLVER', eu: 'BUELTATU' },
  'btn.info': { es: 'Solicitar Info', eu: 'Informazioa Eskatu' },
  'btn.enroll': { es: 'Inscribirse Ahora', eu: 'Izena Eman Orain' },
  'btn.contact': { es: 'CONTACTAR POR EMAIL', eu: 'EMAIL BIDEZ JARRI HARREMANETAN' },
};

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string) => string;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [language, setLanguage] = useState<Language>(() => {
    const saved = localStorage.getItem('kalian_lang');
    return (saved as Language) || 'es';
  });

  useEffect(() => {
    localStorage.setItem('kalian_lang', language);
  }, [language]);

  const t = (key: string) => {
    return translations[key]?.[language] || key;
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = () => {
  const context = useContext(LanguageContext);
  if (!context) throw new Error('useLanguage must be used within LanguageProvider');
  return context;
};
