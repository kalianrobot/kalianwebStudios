## ¿Por qué?

Los cursos se clasifican por academia (`cursos.categoria` = nombre de la academia: "Music is Cool", "SBK CLUB", "Club Flamenco"…) y al aprobar una inscripción la membresía del socio se guarda con esa clave (`socios.membresias["Music is Cool"]`). En cambio, el descuento de socio en eventos solo busca las claves `musica`, `danza` y `local`. En producción hay 28 socios con curso en vigor que nunca reciben el descuento: ni al reservar, ni con el carnet en puerta, ni al verificarlos en puerta (caso real: concierto del 31/10/2026, socio de Music is Cool cobrado a 10 € en mano y registrado a 15 €).

El gerente fija la regla: los alumnos de Music is Cool tienen descuento en eventos de música y los de SBK CLUB en eventos de danza. A partir de enero, posiblemente, los del Club Flamenco en los conciertos del propio club. La regla tiene que poder ajustarse evento a evento sin tocar código.

## ¿Qué cambia?

- Cada evento guarda qué academias dan descuento (`academias_descuento: string[]`, nombres de academia, más `local` para socios con local de ensayo).
- En el formulario del evento, el desplegable "Descuento Soci@s Music Is Cool / Club de Baile / Ninguno" se sustituye por casillas con las academias existentes y "Local de ensayo".
- Un socio tiene descuento en un evento si alguna de sus membresías en vigor (fecha ≥ hoy) corresponde a una academia marcada en ese evento (comparación sin distinguir mayúsculas ni espacios sobrantes).
- Socios de local: el gerente decide en cada evento si tienen descuento (casilla "Local de ensayo"); por defecto sí lo tienen, al mismo precio de socio.
- Eventos ya creados sin el campo nuevo: `categoria == 'musica'` equivale a Music is Cool + local; `categoria == 'danza'` equivale a SBK CLUB (o Club de Baile) + local; `ninguno` no da descuento. Las claves antiguas `musica` y `danza` de las fichas de socio equivalen a Music is Cool y SBK CLUB.
- La misma regla se aplica en todos los puntos: precio al reservar (cliente y Cloud Function `calcularPrecioReserva`), carnet de socio en puerta, verificación de socio en una reserva y entrada de socio sin reserva.

No cambia: el precio de socio de cada evento, la regla de que socio y cupón no se acumulan, ni la cuota mensual (que sigue sin influir en el descuento, como ha confirmado el gerente).

## Impacto

- **Colecciones/reglas afectadas**: `eventos` (campo nuevo opcional `academias_descuento`). `firestore.rules → isValidEvento` valida que, si viene, sea una lista de como máximo 20 textos.
- **Cloud Functions afectadas**: `calcularPrecioReserva` / `calcularPrecioInterno`.
- **UI afectada**: `AdminEventos` (formulario), `ReservaForm`, `ControlAcceso`, `AuthContext`.
- **Riesgos**:
  - Si una academia cambia de nombre, las membresías antiguas guardadas con el nombre anterior dejan de coincidir.
  - La equivalencia de eventos antiguos usa los nombres "Music is Cool" y "SBK CLUB" fijos; si en producción se llamaran distinto, esos eventos no darían descuento hasta editarlos y marcar las casillas.
  - Los eventos futuros ya publicados empiezan a dar descuento a los 28 socios afectados en cuanto se despliegue (es el comportamiento correcto, pero cambia precios ya visibles).

## Impacto en docs

- `SPEC.md`: §5, modelo de `eventos` (campo `academias_descuento`) y regla de descuento compartida cliente/Function.
- `DOCUMENTATION.md`: §2.4bis y manual de staff (cómo marcar academias con descuento en un evento) y manual de portero.
- `SECURITY_SPEC.md`: añadir a las invariantes la validación de `academias_descuento` en `isValidEvento`.
- `README.md`: no impacta.
