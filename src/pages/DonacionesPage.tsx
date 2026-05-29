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
  donacionesBtcActivo?: boolean;
  donacionesBtcAddress?: string;
  donacionesLnActivo?: boolean;
  donacionesLnAddress?: string;
  donacionesUsdcActivo?: boolean;
  donacionesUsdcAddress?: string;
  donacionesUsdcRed?: string;
}

type Method = 'iban' | 'btc' | 'ln' | 'usdc';

const formatIban = (iban: string) => iban.replace(/\s+/g, '').replace(/(.{4})/g, '$1 ').trim();

const CopyField = ({ label, value, display, accent }: { label: string; value: string; display?: string; accent: string }) => {
  const { t } = useLanguage();
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }).catch(() => {});
  };
  return (
    <div className="space-y-3">
      <p className="text-[10px] font-black text-kalian-gold/40 uppercase tracking-[0.3em]">{label}</p>
      <div className="flex flex-col sm:flex-row items-stretch gap-3">
        <code className="flex-1 p-4 bg-kalian-gold/5 rounded-xl border border-kalian-gold/10 font-mono text-sm md:text-base tracking-wider break-all">
          {display || value}
        </code>
        <button
          onClick={handleCopy}
          className={`px-6 py-4 ${accent} rounded-xl font-black uppercase text-[10px] tracking-widest hover:bg-white transition-all whitespace-nowrap`}
        >
          {copied ? t('donations.copied') : t('donations.copy')}
        </button>
      </div>
    </div>
  );
};

const DonacionesPage = () => {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const [config, setConfig] = useState<DonacionesConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<Method>('iban');

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
  const btcAddress = (config?.donacionesBtcAddress || '').trim();
  const lnAddress = (config?.donacionesLnAddress || '').trim();
  const usdcAddress = (config?.donacionesUsdcAddress || '').trim();
  const usdcRed = config?.donacionesUsdcRed || 'Polygon';

  const ibanActivo = !!config?.donacionesActivo && !!iban;
  const btcActivo = !!config?.donacionesBtcActivo && !!btcAddress;
  const lnActivo = !!config?.donacionesLnActivo && !!lnAddress;
  const usdcActivo = !!config?.donacionesUsdcActivo && !!usdcAddress;

  const methods: Method[] = [
    ...(ibanActivo ? ['iban' as Method] : []),
    ...(btcActivo ? ['btc' as Method] : []),
    ...(lnActivo ? ['ln' as Method] : []),
    ...(usdcActivo ? ['usdc' as Method] : []),
  ];

  const anyActive = methods.length > 0;

  // Si el tab activo no está disponible, usar el primer método disponible.
  const currentTab = methods.includes(activeTab) ? activeTab : methods[0];

  const epcPayload = ['BCD', '002', '1', 'SCT', bic, beneficiario, iban, '', '', concepto].join('\n');

  const tabLabel = (m: Method) => {
    if (m === 'iban') return t('donations.tabIban');
    if (m === 'btc') return t('donations.tabBtc');
    if (m === 'ln') return t('donations.tabLn');
    return t('donations.tabUsdc');
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
        ) : !anyActive ? (
          <div className="bg-black/40 border border-kalian-gold/10 rounded-[2rem] p-10 text-center">
            <p className="text-kalian-cream/60 italic text-sm">{t('donations.notAvailable')}</p>
          </div>
        ) : (
          <div className="space-y-10">
            <p className="text-kalian-cream/70 leading-relaxed text-center text-sm md:text-base">
              {t('donations.description')}
            </p>

            {/* Tabs (solo si hay más de un método) */}
            {methods.length > 1 && (
              <div className="flex justify-center gap-2 flex-wrap">
                {methods.map(m => (
                  <button
                    key={m}
                    onClick={() => setActiveTab(m)}
                    className={`px-6 py-3 rounded-full font-black uppercase text-[10px] tracking-widest transition-all border ${
                      currentTab === m
                        ? 'bg-kalian-gold text-black border-kalian-gold'
                        : 'bg-transparent text-kalian-cream/60 border-kalian-gold/20 hover:border-kalian-gold/50'
                    }`}
                  >
                    {tabLabel(m)}
                  </button>
                ))}
              </div>
            )}

            <div className="bg-black/40 border border-kalian-gold/10 rounded-[2.5rem] p-8 md:p-10 space-y-8">
              {/* IBAN */}
              {currentTab === 'iban' && (
                <>
                  <CopyField label={t('donations.ibanLabel')} value={iban} display={formatIban(iban)} accent="bg-kalian-gold text-black" />
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
                  <div className="pt-6 border-t border-kalian-gold/10 flex flex-col items-center gap-4">
                    <div className="bg-white p-4 rounded-2xl">
                      <QRCodeSVG value={epcPayload} size={220} level="M" />
                    </div>
                    <p className="text-kalian-cream/50 text-xs text-center max-w-sm italic">{t('donations.scanHint')}</p>
                  </div>
                </>
              )}

              {/* BTC */}
              {currentTab === 'btc' && (
                <>
                  <CopyField label={t('donations.btcAddressLabel')} value={btcAddress} accent="bg-orange-500 text-black" />
                  <div className="pt-6 border-t border-kalian-gold/10 flex flex-col items-center gap-4">
                    <div className="bg-white p-4 rounded-2xl">
                      <QRCodeSVG value={`bitcoin:${btcAddress}`} size={220} level="M" />
                    </div>
                    <p className="text-kalian-cream/50 text-xs text-center max-w-sm italic">{t('donations.btcScanHint')}</p>
                  </div>
                  <p className="text-amber-300/80 text-xs text-center bg-amber-500/10 border border-amber-500/20 rounded-xl p-4">
                    {t('donations.btcWarning')}
                  </p>
                </>
              )}

              {/* LIGHTNING */}
              {currentTab === 'ln' && (
                <>
                  <CopyField label={t('donations.lnAddressLabel')} value={lnAddress} accent="bg-yellow-400 text-black" />
                  <div className="pt-6 border-t border-kalian-gold/10 flex flex-col items-center gap-4">
                    <div className="bg-white p-4 rounded-2xl">
                      <QRCodeSVG value={`lightning:${lnAddress}`} size={220} level="M" />
                    </div>
                    <p className="text-kalian-cream/50 text-xs text-center max-w-sm italic">{t('donations.lnScanHint')}</p>
                  </div>
                  <p className="text-yellow-300/80 text-xs text-center bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-4">
                    {t('donations.lnNote')}
                  </p>
                </>
              )}

              {/* USDC */}
              {currentTab === 'usdc' && (
                <>
                  <div className="flex justify-center">
                    <span className="px-4 py-2 rounded-full bg-blue-500/20 border border-blue-500/40 text-blue-300 font-black uppercase text-[10px] tracking-widest">
                      {t('donations.usdcNetworkLabel')}: {usdcRed}
                    </span>
                  </div>
                  <CopyField label={t('donations.usdcAddressLabel')} value={usdcAddress} accent="bg-blue-500 text-black" />
                  <div className="pt-6 border-t border-kalian-gold/10 flex flex-col items-center gap-4">
                    <div className="bg-white p-4 rounded-2xl">
                      <QRCodeSVG value={usdcAddress} size={220} level="M" />
                    </div>
                    <p className="text-kalian-cream/50 text-xs text-center max-w-sm italic">{t('donations.usdcScanHint')}</p>
                  </div>
                  <p className="text-red-300/90 text-xs text-center bg-red-500/10 border border-red-500/20 rounded-xl p-4">
                    {t('donations.usdcWarning').replace('{red}', usdcRed)}
                  </p>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default DonacionesPage;
