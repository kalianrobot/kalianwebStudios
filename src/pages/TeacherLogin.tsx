import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate, Link } from 'react-router-dom';
import { useLanguage } from '../context/LanguageContext';

const TeacherLogin = () => {
  const [email, setEmail] = useState('');
  const [pass, setPass] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [info, setInfo] = useState('');
  const { loginTeacher, resetPassword } = useAuth();
  const navigate = useNavigate();
  const { t } = useLanguage();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setInfo('');
    try {
      await loginTeacher(email, pass);
      navigate('/profesor');
    } catch (err: any) {
      setError(err.message || t('auth.loginError'));
    } finally {
      setLoading(false);
    }
  };

  const handleReset = async () => {
    if (!email) {
      setError(t('auth.provideEmailForReset'));
      return;
    }
    setResetting(true);
    setError('');
    setInfo('');
    try {
      await resetPassword(email);
      setInfo(t('auth.resetEmailSent'));
    } catch (err: any) {
      setError(err.message || t('auth.sendEmailError'));
    } finally {
      setResetting(false);
    }
  };

  const busy = loading || resetting;

  return (
    <div className="min-h-screen bg-kalian-dark flex items-center justify-center p-6 font-sans">
      <div className="max-w-md w-full bg-black/40 p-12 rounded-[3rem] border border-kalian-gold/20 shadow-2xl">
        <h1 className="text-5xl kalian-poster-text text-kalian-gold text-center mb-8 uppercase italic leading-none">{t('auth.teacherAccessTitle').split(' ')[0]} <span className="text-kalian-cream">{t('auth.teacherAccessTitle').split(' ').slice(1).join(' ')}</span></h1>

        <div className="mb-8 text-center">
          <Link to="/" className="text-kalian-gold/70 font-black text-[10px] uppercase tracking-[0.3em] hover:text-kalian-gold transition-colors">{t('auth.backToHome')}</Link>
        </div>

        <form onSubmit={handleLogin} className="space-y-6">
          <div className="space-y-2">
            <label className="text-[10px] font-black uppercase text-kalian-gold/70 ml-4 tracking-widest">{t('auth.teacherEmail')}</label>
            <input 
              type="email" 
              placeholder="profesor@kalian.es" 
              className="w-full p-5 bg-kalian-gold/5 rounded-2xl outline-none border border-kalian-gold/10 focus:border-kalian-gold transition-all text-kalian-gold text-center text-xl"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
            />
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-black uppercase text-kalian-gold/70 ml-4 tracking-widest">{t('auth.password')}</label>
            <input 
              type="password" 
              placeholder="••••••••" 
              className="w-full p-5 bg-kalian-gold/5 rounded-2xl outline-none border border-kalian-gold/10 focus:border-kalian-gold transition-all text-kalian-gold text-center text-2xl"
              value={pass}
              onChange={e => setPass(e.target.value)}
              required
            />
          </div>

          {error && <p className="text-red-500 text-center font-bold text-[10px] uppercase tracking-widest animate-pulse">{error}</p>}
          {info && <p className="text-kalian-gold text-center font-bold text-xs leading-relaxed px-2">{info}</p>}

          <button
            disabled={busy}
            aria-busy={loading}
            className={`w-full p-6 rounded-2xl kalian-poster-text text-xl tracking-widest transition-all shadow-2xl shadow-kalian-gold/20 uppercase flex items-center justify-center gap-4 ${
              loading
                ? 'bg-kalian-gold/60 text-black/70 cursor-wait scale-[0.98]'
                : 'bg-kalian-gold text-black hover:bg-white active:scale-95 disabled:opacity-50'
            }`}
          >
            {loading && (
              <span className="w-6 h-6 rounded-full border-[3px] border-black/20 border-t-black animate-spin shrink-0" />
            )}
            {loading ? t('auth.enteringPanel') : t('auth.enterPanel')}
          </button>
        </form>

        <div className="mt-8 text-center">
          <button
            type="button"
            onClick={handleReset}
            disabled={busy}
            aria-busy={resetting}
            className="inline-flex items-center gap-3 text-kalian-gold/70 font-black text-[9px] uppercase tracking-[0.3em] hover:text-kalian-gold transition-colors border-b border-transparent hover:border-kalian-gold/40 pb-1 disabled:opacity-50 disabled:cursor-wait"
          >
            {resetting && (
              <span className="w-3 h-3 rounded-full border-2 border-kalian-gold/30 border-t-kalian-gold animate-spin shrink-0" />
            )}
            {resetting ? t('auth.sendingResetEmail') : t('auth.forgotPassword')}
          </button>
        </div>
      </div>
    </div>
  );
};

export default TeacherLogin;
