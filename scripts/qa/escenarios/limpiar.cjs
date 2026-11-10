/**
 * Escenario "limpiar": borra todos los eventos de QA (ID con prefijo 'qa-')
 * y sus reservas, asistencias y movimientos de finanzas.
 * No revierte los agregados mensuales de `caja_eventos` (vista rápida de puerta).
 */
const { FieldPath } = require('firebase-admin/firestore');
const { PREFIJO, borrarEvento } = require('../comun.cjs');

module.exports = {
  id: 'limpiar',
  descripcion: 'Borra todos los eventos de QA y lo ligado a ellos',

  async sembrar(db) {
    // Rango de IDs [ 'qa-', 'qa.' ): '.' es el carácter siguiente a '-'.
    const fin = PREFIJO.slice(0, -1) + String.fromCharCode(PREFIJO.charCodeAt(PREFIJO.length - 1) + 1);
    const snap = await db.collection('eventos')
      .where(FieldPath.documentId(), '>=', PREFIJO)
      .where(FieldPath.documentId(), '<', fin)
      .get();
    const eventos = [];
    for (const d of snap.docs) {
      eventos.push({ eventoId: d.id, titulo: d.data().titulo, borrados: await borrarEvento(db, d.id) });
    }
    return {
      escenario: 'limpiar',
      eventos,
      avisos: ['Los totales mensuales de caja_eventos (vista rápida de puerta) no se revierten.'],
    };
  },
};
