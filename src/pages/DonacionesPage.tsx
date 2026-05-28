import React, { useEffect, useState } from 'react';
import { db } from '../firebase';
import { doc, getDoc } from 'firebase/firestore';
import { QRCodeSVG } from 'qrcode.react';
import { useNavigate } from 'react-router-dom';
import { useLanguage } from '../context/LanguageContext';

interface DonacionesConfig {
  donacionesActivo?: boolean;
  donacionesIban?: string;
  donacionesBeneficiario?: string;
  donacionesBic?: string;
  donacionesConcepto?: string;
}

const formatIban = (iban: string) => iban.replace(/\s+/g, '').replace(/(.{4})/g, '$1 ').trim();

const DonacionesPage = () => {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const [config, setConfig] = useState<DonacionesConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    getDoc(doc(db, "config", "site"))
      .then(snap => { if (snap.exists()) setConfig(snap.data() as DonacionesConfig); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const iban = (config?.donacionesIban || '').replace(/\s+/g, '');
  const beneficiario = config?.donacionesBeneficiario || '';
  const bic = (config?.donacionesBic || '').replace(/\s+/g, '');
  const concepto = config?.donacionesConcepto || 'Donación Kalian';

  const activo = !!config?.donacionesActivo && !!iban;

  // EPC069-12 (SEPA Credit Transfer) QR payload. Importe vacío: lo elige el donante.
  const epcPayload = [
    'BCD',
    '002',
    '1',
    'SCT',
    bic,
    beneficiario,
    iban,
    '',
    '',
    concepto,
  ].join('\n');

  const handleCopy = () => {
    navigator.clipboard.writeText(iban).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }).catch(() => {});
  };

  return (
    <div className="min-h-screen bg-kalian-dark text-kalian-cream font-sans pb-24">
      {/* HERO */}
      <div className="relative h-[20vh] min-h-[180px] flex flex-col items-center justify-center overflow-hidden border-b border-kalian-gold/10">
        <div className="absolute inset-0 bg-gradient-to-t from-kalian-dark via-transparent to-kalian-dark/80"></div>
        <button
          onClick={() => navigate(-1)}
          className="absolute top-6 left-6 z-20 flex items-center gap-3 text-kalian-gold font-black uppercase text-[10px] tracking-[0.4em] hover:text-white transition-all group"
        >
          <span className="text-xl group-hover:-translate-x-2 transition-transform">←</span> {t('btn.back')}
        </button>
        <h1 className="relative z-10 text-4xl md:text-6xl kalian-poster-text text-kalian-gold italic uppercase tracking-tighter text-center px-6">
          {t('donations.title')}
        </h1>
        <p className="relative z-10 text-kalian-cream/50 text-[10px] md:text-xs font-black uppercase tracking-[0.4em] mt-3 text-center px-6">
          {t('donations.subtitle')}
        </p>
      </div>

      <div className="max-w-2xl mx-auto px-6 mt-12">
        {loading ? (
          <p className="text-center text-kalian-gold/40 uppercase text-xs tracking-widest">…</p>
        ) : !activo ? (
          <div className="bg-black/40 border border-kalian-gold/10 rounded-[2rem] p-10 text-center">
            <p className="text-kalian-cream/60 italic text-sm">{t('donations.notAvailable')}</p>
          </div>
        ) : (
          <div className="space-y-10">
            <p className="text-kalian-cream/70 leading-relaxed text-center text-sm md:text-base">
              {t('donations.description')}
            </p>

            <div className="bg-black/40 border border-kalian-gold/10 rounded-[2.5rem] p-8 md:p-10 space-y-8">
              {/* IBAN */}
              <div className="space-y-3">
                <p className="text-[10px] font-black text-kalian-gold/40 uppercase tracking-[0.3em]">{t('donations.ibanLabel')}</p>
                <div className="flex flex-col sm:flex-row items-stretch gap-3">
                  <code className="flex-1 p-4 bg-kalian-gold/5 rounded-xl border border-kalian-gold/10 font-mono text-base md:text-lg tracking-wider break-all">
                    {formatIban(iban)}
                  </code>
                  <button
                    onClick={handleCopy}
                    className="px-6 py-4 bg-kalian-gold text-black rounded-xl font-black uppercase text-[10px] tracking-widest hover:bg-white transition-all whitespace-nowrap"
                  >
                    {copied ? t('donations.copied') : t('donations.copy')}
                  </button>
                </div>
              </div>

              {/* Beneficiario / Concepto */}
              <div className="grid sm:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <p className="text-[10px] font-black text-kalian-gold/40 uppercase tracking-[0.3em]">{t('donations.beneficiaryLabel')}</p>
                  <p className="font-bold text-kalian-cream">{beneficiario || '—'}</p>
                </div>
                <div className="space-y-2">
                  <p className="text-[10px] font-black text-kalian-gold/40 uppercase tracking-[0.3em]">{t('donations.conceptLabel')}</p>
                  <p className="font-bold text-kalian-cream">{concepto}</p>
                </div>
                {bic && (
                  <div className="space-y-2">
                    <p className="text-[10px] font-black text-kalian-gold/40 uppercase tracking-[0.3em]">BIC / SWIFT</p>
                    <p className="font-mono text-kalian-cream">{bic}</p>
                  </div>
                )}
              </div>

              {/* QR EPC */}
              <div className="pt-6 border-t border-kalian-gold/10 flex flex-col items-center gap-4">
                <div className="bg-white p-4 rounded-2xl">
                  <QRCodeSVG value={epcPayload} size={220} level="M" />
                </div>
                <p className="text-kalian-cream/50 text-xs text-center max-w-sm italic">
                  {t('donations.scanHint')}
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default DonacionesPage;
