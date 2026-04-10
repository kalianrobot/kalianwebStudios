import React from 'react';

interface LegalModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const LegalModal: React.FC<LegalModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-kalian-dark/95 backdrop-blur-md flex items-center justify-center p-4 z-[2000] animate-in fade-in duration-500 overflow-y-auto">
      <div className="w-full max-w-3xl bg-black border border-kalian-gold/20 rounded-[3rem] shadow-2xl p-8 md:p-12 relative my-auto max-h-[90vh] flex flex-col">
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
                <span className="text-[10px] font-black uppercase text-kalian-gold tracking-[0.4em]">BLOQUE 1</span>
                <h2 className="text-4xl kalian-poster-text text-kalian-gold leading-none uppercase italic tracking-tight">Términos y Condiciones de Alta</h2>
              </div>
              
              <div className="grid gap-6">
                <div className="space-y-2">
                  <p className="text-[10px] font-black text-kalian-gold/60 uppercase tracking-widest">Condición de Soci@</p>
                  <p className="text-sm leading-relaxed">La inscripción en cualquier curso o actividad de Kalian implica la solicitud de alta como soci@.</p>
                </div>

                <div className="space-y-2">
                  <p className="text-[10px] font-black text-kalian-gold/60 uppercase tracking-widest">Cuota de Soci@</p>
                  <p className="text-sm leading-relaxed">Aportación mensual obligatoria de 15€ para el sostenimiento de la asociación.</p>
                </div>

                <div className="space-y-2">
                  <p className="text-[10px] font-black text-kalian-gold/60 uppercase tracking-widest">Socio Activo vs. Inactivo</p>
                  <p className="text-sm leading-relaxed">Se considera Soci@ Activo a quien está matriculado en un curso o alquila un local. Solo los soci@s activos disfrutan de descuentos y ventajas. Al finalizar la actividad, se pasará a estado "Inactivo" durante un periodo máximo de 4 meses.</p>
                </div>

                <div className="space-y-2">
                  <p className="text-[10px] font-black text-kalian-gold/60 uppercase tracking-widest">Mantenimiento y Borrado de Datos</p>
                  <p className="text-sm leading-relaxed">Sus datos se mantendrán durante 4 meses tras finalizar su último curso o alquiler para facilitar una nueva incorporación. Transcurrido este plazo de inactividad, el perfil y todos sus datos personales serán eliminados definitivamente de nuestros sistemas.</p>
                </div>

                <div className="space-y-2">
                  <p className="text-[10px] font-black text-kalian-gold/60 uppercase tracking-widest">Espacio Libre de Redes</p>
                  <p className="text-sm leading-relaxed">Prohibida la difusión de imágenes/vídeos internos sin autorización.</p>
                </div>

                <div className="space-y-2">
                  <p className="text-[10px] font-black text-kalian-gold/60 uppercase tracking-widest">Política de Bajas</p>
                  <p className="text-sm leading-relaxed">Comunicar antes del día 25 del mes anterior a info@kalian.es.</p>
                </div>
              </div>
            </section>

            {/* BLOQUE 2 */}
            <section className="space-y-6 pb-8">
              <div className="space-y-2">
                <span className="text-[10px] font-black uppercase text-kalian-gold tracking-[0.4em]">BLOQUE 2</span>
                <h2 className="text-4xl kalian-poster-text text-kalian-gold leading-none uppercase italic tracking-tight">Política de Privacidad (LOPD)</h2>
              </div>
              
              <div className="grid gap-6">
                <div className="space-y-2">
                  <p className="text-[10px] font-black text-kalian-gold/60 uppercase tracking-widest">Responsable</p>
                  <p className="text-sm leading-relaxed">Asociación Kalian.</p>
                </div>

                <div className="space-y-2">
                  <p className="text-[10px] font-black text-kalian-gold/60 uppercase tracking-widest">Finalidad</p>
                  <p className="text-sm leading-relaxed">Gestión de alumnos, socios y cobros.</p>
                </div>

                <div className="space-y-2">
                  <p className="text-[10px] font-black text-kalian-gold/60 uppercase tracking-widest">Legitimación</p>
                  <p className="text-sm leading-relaxed">Consentimiento y ejecución de contrato.</p>
                </div>

                <div className="space-y-2">
                  <p className="text-[10px] font-black text-kalian-gold/60 uppercase tracking-widest">Conservación</p>
                  <p className="text-sm leading-relaxed">Los datos se conservarán durante la vigencia de la actividad y hasta 4 meses después de su finalización, salvo obligación legal.</p>
                </div>

                <div className="space-y-2">
                  <p className="text-[10px] font-black text-kalian-gold/60 uppercase tracking-widest">Derechos</p>
                  <p className="text-sm leading-relaxed">Acceso, rectificación y supresión mediante correo a info@kalian.es.</p>
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
            ENTENDIDO
          </button>
        </div>
      </div>
    </div>
  );
};

export default LegalModal;
