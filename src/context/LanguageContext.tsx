import React, { createContext, useContext, useState, useEffect } from 'react';
import { DocumentData } from 'firebase/firestore';
import es from '../i18n/es';
import eu from '../i18n/eu';

type Language = 'es' | 'eu';

type Dictionary = Record<string, string>;

const dictionaries: Record<Language, Dictionary> = { es, eu };

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string, params?: Record<string, string | number>) => string;
  tField: (doc: DocumentData | undefined | null, field: string) => string;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

const interpolate = (str: string, params?: Record<string, string | number>): string => {
  if (!params) return str;
  return str.replace(/\{(\w+)\}/g, (_, k) => (k in params ? String(params[k]) : `{${k}}`));
};

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [language, setLanguage] = useState<Language>(() => {
    const saved = localStorage.getItem('kalian_lang');
    return (saved as Language) || 'es';
  });

  useEffect(() => {
    localStorage.setItem('kalian_lang', language);
  }, [language]);

  const t = (key: string, params?: Record<string, string | number>) => {
    const raw = dictionaries[language][key] ?? dictionaries.es[key] ?? key;
    return interpolate(raw, params);
  };

  const tField = (doc: DocumentData | undefined | null, field: string): string => {
    if (!doc) return '';
    if (language === 'eu') {
      const euField = doc[`${field}_eu`];
      if (typeof euField === 'string' && euField.trim().length > 0) return euField;
    }
    return doc[field] ?? '';
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t, tField }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = () => {
  const context = useContext(LanguageContext);
  if (!context) throw new Error('useLanguage must be used within LanguageProvider');
  return context;
};
