---
name: qa-pruebas
description: Prueba la web de TEST de Kalian con el workflow de QA, de forma automática (simula la puerta y comprueba caja, cierre y Recibí) o preparando tickets para probar a mano. Úsala cuando pidan "prueba la puerta / la entrada / la contabilidad", "prepárame una prueba", "crea un evento de prueba con reservas", "¿cuadra todo?" o "limpia las pruebas".
---

# QA: preparar pruebas en la web de test

Quien lo pide suele ser el gerente, que no es informático. Habla sin jerga: tickets, pasos y cifras. Nada de rutas ni comandos en la respuesta.

## Reglas

- Solo se escribe en el proyecto de **test**. Nunca en producción; el script aborta si lo detecta.
- No lances `copiar-prod-a-test.yml` por tu cuenta: **vacía test entero**. Si hace falta, explícalo y pide confirmación.
- No crees ramas temporales con workflows para sembrar datos: usa este workflow.
- Todo lo que crea el QA lleva el prefijo `qa-` en el ID y `qa: true`. El escenario `limpiar` lo borra.

## Escenarios disponibles

| Escenario | Qué hace |
|---|---|
| `puerta-auto` | **Por defecto.** Crea el mismo evento que `puerta` y simula la noche entera con la misma lógica que la web (`src/lib/puerta.ts`): entran todas las reservas menos una, un socio con carnet, una entrada en puerta y una invitación. Después calcula el cierre con `src/lib/cierreEvento.ts` y comprueba caja, Kalian, artista, descuadre, avisos del Recibí, no presentados, aforo y estado de las reservas. Si algo falla, la ejecución sale en rojo. No prueba la pantalla ni `firestore.rules` (usa el Admin SDK). |
| `puerta` | Evento del día (19:00–23:59) con precio normal 15 €, socio 10 € y cupón `QAPUERTA` 8 €; aportación Kalian 5/4/3. Cuatro reservas sin validar: invitado + 2 acompañantes, cupón + 1, una para dejar como "no presentado" y un socio real con descuento + 1. Propone además entradas en puerta sin reserva (normal, socio con carnet, invitación). |
| `limpiar` | Borra todos los eventos `qa-*` con sus reservas, asistencias y finanzas. No revierte `caja_eventos` (totales mensuales de la vista rápida de puerta). |

Si piden algo que ningún escenario cubre, ver "Añadir un escenario".

## Cómo lanzarlo

`puerta-auto` ya se ejecuta solo en cada push a `test` (y borra su evento si todo cuadra). Si preguntan "¿cómo fue la última prueba?", busca la última ejecución con `RUN=$(gh run list --workflow=qa-test.yml --branch test -L 1 --json databaseId -q '.[0].databaseId')` y sigue en el paso 4. Lo de abajo es para lanzarla a demanda.

1. Elige escenario y fecha (`YYYY-MM-DD`; vacío = hoy en Madrid). Si piden "probar" sin más, usa `puerta-auto`. Usa `puerta` solo si quieren hacerlo ellos a mano en la pantalla; entonces el evento tiene que ser **hoy**, porque Control de Acceso solo muestra eventos del día o en curso.
2. Lanza el workflow contra `test` (el lanzamiento manual exige que el fichero exista también en `main`; si aún no está, dilo y ofrece ver la última ejecución automática):
   ```bash
   gh workflow run qa-test.yml --ref test -f escenario=puerta-auto -f fecha=
   ```
3. Espera a que termine:
   ```bash
   sleep 5; RUN=$(gh run list --workflow=qa-test.yml -L 1 --json databaseId -q '.[0].databaseId')
   gh run watch "$RUN" --exit-status   # sale con error si alguna comprobación de puerta-auto falla
   ```
4. Lee el resultado. Va en una línea del registro codificada en base64 (GitHub oculta las llaves `{` del JSON en claro). El artefacto `qa-resultado` no se puede descargar desde las sesiones de Claude:
   ```bash
   gh run view "$RUN" --log | grep -o 'QA-RESULTADO-B64 [A-Za-z0-9+/=]*' | tail -1 | cut -d' ' -f2 | base64 -d > /tmp/qa-resultado.json
   ```
   Campos útiles: `ok`, `comprobaciones[]` (`que`, `esperado`, `obtenido`, `ok`), `registro[]`, `reservas[]`, `avisos[]`.
   El mismo resumen legible aparece en la página de la ejecución en GitHub (Summary).

Si `gh` no tiene acceso o el workflow aún no está en `main`, dilo claramente y no improvises otra vía de escritura en la base de datos.

## Qué entregar

**Con `puerta-auto`:** primero el veredicto ("todo cuadra" o "falla X"). Si falla, di qué cifra se esperaba, cuál salió y la causa probable, y propón arreglarlo con un PR a `test`. Después, en una línea, qué se simuló (cuántas entradas, total cobrado). No hace falta dar tickets salvo que los pidan.

**Con `puerta` (a mano):** en lenguaje sencillo, en este orden:

1. Nombre del evento, hora y precios.
2. Tabla de tickets: código, titular, personas, precio de cada entrada y qué hacer con cada uno (p. ej. "este déjalo sin entrar").
3. Entradas en puerta sin reserva que conviene probar.
4. Cifras esperadas: bruto, Kalian y artista, con todas las reservas y sin el no presentado. Recuerda sumar las entradas en puerta que haga.
5. Pasos: validar en Control de Acceso (código o QR `KALIAN-RES-<ticket>`), revisar caja, y al día siguiente PDF de cierre y Recibí del artista (solo salen cuando el evento ya ha pasado).

## Comprobar después

Cuando cuenten qué hicieron y qué ven, compáralo con lo esperado:

- Kalian = `min(aportación de la variante, precio)`, artista = precio − Kalian. Variantes: normal/puerta normal → estándar; socio/puerta socio → descuento; cupón → cupón; precio 0 → nada.
- Cierre: entradas efectivas = las validadas; no presentados = plazas sin validar; descuadre = caja − suma de precios de asistencia (debe ser 0).
- Si algo no cuadra, di qué cifra se esperaba, cuál sale y la causa probable. Si es un fallo de la web, propón arreglarlo con el flujo normal (PR a `test`).

## Añadir un escenario

1. Crea `scripts/qa/escenarios/<id>.cjs` exportando `{ id, descripcion, sembrar(db, { fecha }) }`. Usa las utilidades de `scripts/qa/comun.cjs` (prefijo `qa-`, tickets únicos, socios con descuento, reparto, borrado).
2. Devuelve un resumen con los campos que entiende `scripts/qa/sembrar.cjs` (`evento`, `reservas`, `puertaSinReserva`, `esperado`, `pasos`, `avisos`).
3. Reproduce exactamente lo que escribe la web. Si la lógica vive en un módulo puro de `src/lib` (como `puerta.ts`, `cierreEvento.ts`, `reparto.ts`, `slots.ts`), cárgalo con `import()` como hace `puerta-auto.cjs` (el workflow ejecuta con `tsx`) en vez de copiarla. Si está metida en una pantalla, primero sácala a `src/lib` con sus unit tests (PR aparte) y luego úsala aquí. No inventes campos.
4. Para pruebas automáticas devuelve `ok` y `comprobaciones: [{ que, esperado, obtenido, ok }]`: `sembrar.cjs` las pinta y pone la ejecución en rojo si alguna falla.
5. Añade el `id` a `options` en `.github/workflows/qa-test.yml` y una fila a la tabla de escenarios de esta skill.
6. Va por PR a `test` como cualquier cambio; el workflow solo se puede lanzar con lo que haya en `main`.
