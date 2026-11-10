---
name: qa-pruebas
description: Prepara datos de prueba en la web de TEST de Kalian (eventos, reservas, tickets) con el workflow de QA y devuelve los tickets, los pasos y las cifras esperadas de caja, cierre y Recibí. Úsala cuando pidan "prepárame una prueba", "crea un evento de prueba con reservas", "quiero probar la puerta / la entrada / la contabilidad en test" o "limpia las pruebas".
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
| `puerta` | Evento del día (19:00–23:59) con precio normal 15 €, socio 10 € y cupón `QAPUERTA` 8 €; aportación Kalian 5/4/3. Cuatro reservas sin validar: invitado + 2 acompañantes, cupón + 1, una para dejar como "no presentado" y un socio real con descuento + 1. Propone además entradas en puerta sin reserva (normal, socio con carnet, invitación). |
| `limpiar` | Borra todos los eventos `qa-*` con sus reservas, asistencias y finanzas. No revierte `caja_eventos` (totales mensuales de la vista rápida de puerta). |

Si piden algo que ningún escenario cubre, ver "Añadir un escenario".

## Cómo lanzarlo

1. Elige escenario y fecha (`YYYY-MM-DD`; vacío = hoy en Madrid). Para probar la puerta el evento tiene que ser **hoy**: Control de Acceso solo muestra eventos del día o en curso.
2. Lanza el workflow (debe existir en `main`; usa `--ref main` salvo que pidan probar la versión de `test`):
   ```bash
   gh workflow run qa-test.yml --ref main -f escenario=puerta -f fecha=
   ```
3. Espera a que termine:
   ```bash
   sleep 5; RUN=$(gh run list --workflow=qa-test.yml -L 1 --json databaseId -q '.[0].databaseId')
   gh run watch "$RUN" --exit-status
   ```
4. Lee el resultado (JSON entre marcas) o descarga el artefacto:
   ```bash
   gh run view "$RUN" --log | sed -n '/--- QA-RESULTADO-JSON ---/,/--- FIN ---/p' | sed '1d;$d' | sed 's/^.*Z //'
   # alternativa: gh run download "$RUN" -n qa-resultado
   ```
   El mismo resumen legible aparece en la página de la ejecución en GitHub (Summary).

Si `gh` no tiene acceso o el workflow aún no está en `main`, dilo claramente y no improvises otra vía de escritura en la base de datos.

## Qué entregar

En lenguaje sencillo, en este orden:

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
3. Reproduce exactamente lo que escribe la web (mira `ReservaForm.tsx` y `ControlAcceso.tsx`), no inventes campos.
4. Añade el `id` a `options` en `.github/workflows/qa-test.yml` y una fila a la tabla de escenarios de esta skill.
5. Va por PR a `test` como cualquier cambio; el workflow solo se puede lanzar con lo que haya en `main`.
