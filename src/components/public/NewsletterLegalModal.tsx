import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useLanguage } from '../../context/LanguageContext';

interface NewsletterLegalModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const NewsletterLegalModal: React.FC<NewsletterLegalModalProps> = ({ isOpen, onClose }) => {
  const { t } = useLanguage();
  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-slate-950/95 backdrop-blur-md flex items-center justify-center p-4 z-[2000] overflow-y-auto"
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: 20 }}
            className="w-full max-w-3xl bg-slate-900 border border-indigo-500/20 rounded-[3rem] shadow-2xl p-8 md:p-12 relative my-auto max-h-[90vh] flex flex-col"
          >
            <button
              onClick={onClose}
              className="absolute top-8 right-8 text-indigo-400 font-black text-2xl hover:text-white transition-colors z-10"
            >
              ✕
            </button>

            <div className="overflow-y-auto pr-4 custom-scrollbar">
              <div className="space-y-8 text-slate-300 font-sans">
                <div className="space-y-2">
                  <span className="text-[10px] font-black uppercase text-indigo-400 tracking-[0.4em]">{t('nlLegal.eyebrow')}</span>
                  <h2 className="text-4xl font-black uppercase italic leading-none text-white tracking-tight">{t('nlLegal.title')}</h2>
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 pt-2">{t('nlLegal.version')}</p>
                </div>

                <div className="grid gap-6">
                  <div className="space-y-2">
                    <p className="text-[10px] font-black text-indigo-400/80 uppercase tracking-widest">{t('nlLegal.responsible')}</p>
                    <p className="text-sm leading-relaxed">{t('nlLegal.responsibleText')}</p>
                  </div>

                  <div className="space-y-2">
                    <p className="text-[10px] font-black text-indigo-400/80 uppercase tracking-widest">{t('nlLegal.purpose')}</p>
                    <p className="text-sm leading-relaxed">{t('nlLegal.purposeText')}</p>
                  </div>

                  <div className="space-y-2">
                    <p className="text-[10px] font-black text-indigo-400/80 uppercase tracking-widest">{t('nlLegal.legitimation')}</p>
                    <p className="text-sm leading-relaxed">{t('nlLegal.legitimationText')}</p>
                  </div>

                  <div className="space-y-2">
                    <p className="text-[10px] font-black text-indigo-400/80 uppercase tracking-widest">{t('nlLegal.recipients')}</p>
                    <p className="text-sm leading-relaxed">{t('nlLegal.recipientsText')}</p>
                  </div>

                  <div className="space-y-2">
                    <p className="text-[10px] font-black text-indigo-400/80 uppercase tracking-widest">{t('nlLegal.retention')}</p>
                    <p className="text-sm leading-relaxed">{t('nlLegal.retentionText')}</p>
                  </div>

                  <div className="space-y-2">
                    <p className="text-[10px] font-black text-indigo-400/80 uppercase tracking-widest">{t('nlLegal.rights')}</p>
                    <p className="text-sm leading-relaxed">{t('nlLegal.rightsText')}</p>
                  </div>

                  <div className="space-y-2">
                    <p className="text-[10px] font-black text-indigo-400/80 uppercase tracking-widest">{t('nlLegal.proof')}</p>
                    <p className="text-sm leading-relaxed">{t('nlLegal.proofText')}</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="pt-8 border-t border-indigo-500/10 flex justify-center">
              <button
                onClick={onClose}
                className="bg-indigo-600 text-white px-12 py-4 rounded-2xl font-black uppercase tracking-widest text-sm hover:bg-indigo-500 transition-all shadow-xl shadow-indigo-500/20"
              >
                {t('nlLegal.understood')}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default NewsletterLegalModal;
