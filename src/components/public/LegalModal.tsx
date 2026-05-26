import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useLanguage } from '../../context/LanguageContext';

interface LegalModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const LegalModal: React.FC<LegalModalProps> = ({ isOpen, onClose }) => {
  const { t } = useLanguage();
  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-kalian-dark/95 backdrop-blur-md flex items-center justify-center p-4 z-[2000] overflow-y-auto"
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: 20 }}
            className="w-full max-w-3xl bg-black border border-kalian-gold/20 rounded-[3rem] shadow-2xl p-8 md:p-12 relative my-auto max-h-[90vh] flex flex-col"
          >
        <button
          onClick={onClose}
          className="absolute top-8 right-8 text-kalian-gold/90 font-black text-2xl hover:text-kalian-gold transition-colors z-10"
        >
          ✕
        </button>

        <div className="overflow-y-auto pr-4 custom-scrollbar">
          <div className="space-y-12 text-kalian-cream/80 font-sans">
            {/* BLOQUE 1 */}
            <section className="space-y-6">
              <div className="space-y-2">
                <span className="text-[10px] font-black uppercase text-kalian-gold tracking-[0.4em]">{t('legal.block1')}</span>
                <h2 className="text-4xl kalian-poster-text text-kalian-gold leading-none uppercase italic tracking-tight">{t('legal.termsTitle')}</h2>
              </div>

              <div className="grid gap-6">
                <div className="space-y-2">
                  <p className="text-[10px] font-black text-kalian-gold/60 uppercase tracking-widest">{t('legal.memberStatus')}</p>
                  <p className="text-sm leading-relaxed">{t('legal.memberStatusText')}</p>
                </div>

                <div className="space-y-2">
                  <p className="text-[10px] font-black text-kalian-gold/60 uppercase tracking-widest">{t('legal.fee')}</p>
                  <p className="text-sm leading-relaxed">{t('legal.feeText')}</p>
                </div>

                <div className="space-y-2">
                  <p className="text-[10px] font-black text-kalian-gold/60 uppercase tracking-widest">{t('legal.activeInactive')}</p>
                  <p className="text-sm leading-relaxed">{t('legal.activeInactiveText')}</p>
                </div>

                <div className="space-y-2">
                  <p className="text-[10px] font-black text-kalian-gold/60 uppercase tracking-widest">{t('legal.dataMaintenance')}</p>
                  <p className="text-sm leading-relaxed">{t('legal.dataMaintenanceText')}</p>
                </div>

                <div className="space-y-2">
                  <p className="text-[10px] font-black text-kalian-gold/60 uppercase tracking-widest">{t('legal.networkFree')}</p>
                  <p className="text-sm leading-relaxed">{t('legal.networkFreeText')}</p>
                </div>

                <div className="space-y-2">
                  <p className="text-[10px] font-black text-kalian-gold/60 uppercase tracking-widest">{t('legal.cancellation')}</p>
                  <p className="text-sm leading-relaxed">{t('legal.cancellationText')}</p>
                </div>
              </div>
            </section>

            {/* BLOQUE 2 */}
            <section className="space-y-6 pb-8">
              <div className="space-y-2">
                <span className="text-[10px] font-black uppercase text-kalian-gold tracking-[0.4em]">{t('legal.block2')}</span>
                <h2 className="text-4xl kalian-poster-text text-kalian-gold leading-none uppercase italic tracking-tight">{t('legal.privacyTitle')}</h2>
              </div>

              <div className="grid gap-6">
                <div className="space-y-2">
                  <p className="text-[10px] font-black text-kalian-gold/60 uppercase tracking-widest">{t('legal.responsible')}</p>
                  <p className="text-sm leading-relaxed">{t('legal.responsibleText')}</p>
                </div>

                <div className="space-y-2">
                  <p className="text-[10px] font-black text-kalian-gold/60 uppercase tracking-widest">{t('legal.purpose')}</p>
                  <p className="text-sm leading-relaxed">{t('legal.purposeText')}</p>
                </div>

                <div className="space-y-2">
                  <p className="text-[10px] font-black text-kalian-gold/60 uppercase tracking-widest">{t('legal.legitimation')}</p>
                  <p className="text-sm leading-relaxed">{t('legal.legitimationText')}</p>
                </div>

                <div className="space-y-2">
                  <p className="text-[10px] font-black text-kalian-gold/60 uppercase tracking-widest">{t('legal.retention')}</p>
                  <p className="text-sm leading-relaxed">{t('legal.retentionText')}</p>
                </div>

                <div className="space-y-2">
                  <p className="text-[10px] font-black text-kalian-gold/60 uppercase tracking-widest">{t('legal.rights')}</p>
                  <p className="text-sm leading-relaxed">{t('legal.rightsText')}</p>
                </div>
              </div>
            </section>
          </div>
        </div>

        <div className="pt-8 border-t border-kalian-gold/10 flex justify-center">
          <button
            onClick={onClose}
            className="bg-kalian-gold text-black px-12 py-4 rounded-2xl kalian-poster-text text-xl tracking-widest hover:bg-white transition-all shadow-xl shadow-kalian-gold/20"
          >
            {t('legal.understood')}
          </button>
        </div>
        </motion.div>
      </motion.div>
    )}
  </AnimatePresence>
);
};

export default LegalModal;
