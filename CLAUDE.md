# Family Office — guía para trabajar en este repositorio

Este archivo lo leen las sesiones de Claude de cualquier colaborador, y sirve también como mapa para
personas. Mantenlo corto y verdadero: si algo de aquí deja de ser cierto, corrígelo en el mismo PR.

## Qué hay aquí

Dos aplicaciones sobre los mismos datos del grupo familiar:

| Carpeta | Qué es | Estado |
| --- | --- | --- |
| `fo-os/` | **Family Office OS**: Next.js 16 + TypeScript + Tailwind + Recharts. Es el producto principal. | Se publica en Vercel (Root Directory = `fo-os`). |
| raíz (`app.py`, `pages/`, `src/`) | Dashboard Streamlit original, lee el Excel con LibreOffice. | Sigue publicado en Streamlit Cloud (archivo principal `app.py`, clave en `st.secrets`). |

Los datos vienen del Excel maestro (`data/FO_Master_Consolidado.xlsx`) o, en el OS, de una planilla de
Google Sheets (ver `fo-os/integrations/google-sheets/LEEME.md`).

## Comandos (desde `fo-os/`)

```bash
npm ci                    # instalar
npm run dev               # http://localhost:3000
npm run typecheck && npm run lint
npm run check-appsscript  # lógica del Apps Script con servicios simulados (no necesita datos)
npm run build             # ejecuta antes el sincronizador de Sheets; sin variables, no hace nada
npm run reconcile         # cifras maestras y conciliación en consola
```

Pruebas del lector de Sheets (necesitan el archivo simulado, que contiene datos reales y **no se
versiona**: `python3 scripts/export_sheet_fixture.py`): `check-parity`, `check-sheets`, `check-sync`.

Python (raíz): `pip install -r requirements.txt` y LibreOffice con Calc (`apt-get install libreoffice-calc`).
`python3 scripts/export_real_dataset.py` regenera `fo-os/data/real/dataset.json` desde el Excel.

## Principios que no se negocian

1. **Ausencia no es cero.** Si la fuente no trae un dato (NOI, costo de adquisición, tasa de una
   deuda…), el campo es opcional, vale `null`/`undefined` y la UI muestra `s/d` (`formatOr`). Nunca se
   rellena con `0`, con una fecha inventada ni con un promedio. Un cap rate de 0% por falta de NOI es
   una cifra falsa. Lo que falta se declara en `dataCoverage.gaps`.
2. **Una sola fuente de verdad.** Las páginas no definen cifras: todo sale de `fo-os/data` a través de
   `fo-os/lib/calculos`. Se cumple siempre `ACTIVOS − PASIVOS = PATRIMONIO NETO`
   (`validatePortfolioConsistency`). La participación look-through se calcula, nunca se almacena.
3. **Semáforos de tres estados**: en regla, en alerta, *sin dato*. Verde afirma "evaluado y bien".
4. **Cuánto confiar en cada número**: cada activo declara su `valuationQuality` (tasado, contable,
   saldo, proxy, sin dato) y el Resumen la muestra.
5. **Nada se publica sin validar.** El sincronizador de Sheets valida antes de escribir el dataset; si
   falla, el build falla y Vercel deja la versión anterior. No debilites esa validación para "hacer
   pasar" un build.
6. **Todo en español** (formato chileno: `$18.500 MM`). Términos financieros estándar (IRR, DSCR, LTV…)
   en inglés con tooltip en español.
7. **Diseño institucional claro**: sin neón, degradados exagerados, glassmorphism ni emojis.

## Datos reales: reglas

- `data/FO_Master_Consolidado.xlsx` y `fo-os/data/real/dataset.json` contienen patrimonio, RUTs y
  direcciones reales. **No copies cifras ni RUTs reales** en issues, descripciones de PR, mensajes de
  commit, capturas ni conversaciones compartidas. Para probar o mostrar, usa la base demo
  (`NEXT_PUBLIC_DATASET=demo`).
- Nunca versiones: `.env*`, tokens (`SHEETS_TOKEN`, el Deploy Hook de Vercel), `fo-os/.sheets-fixture/`,
  `.streamlit/secrets.toml`.
- El token del Apps Script y las variables de Vercel viven en Vercel/Google, no en el repo.

## Dónde está cada cosa (`fo-os/`)

- `app/` rutas (Server Components por defecto). `components/` UI. `types/index.ts` el modelo de datos.
- `lib/calculos/` motor financiero: funciones puras, fuera de React.
- `lib/sheets/` lector de Google Sheets (`source.ts` lee por encabezado, `transform.ts` arma el
  `Database`, `validate.ts` decide si se publica). Su equivalente en Python es
  `scripts/export_real_dataset.py` + `src/data_loader.py`; **ambos deben dar el mismo resultado**
  (`check-parity`). Si cambias uno, cambia el otro.
- `data/*.ts` base demo ficticia. `data/real/` base real y `rent_mapping.json`.
- `integrations/google-sheets/` Apps Script y su guía de instalación.

## Trampas conocidas

- **Next.js 16 no es el que conoces**: `fo-os/AGENTS.md` pide leer `node_modules/next/dist/docs/` antes
  de escribir código (por ejemplo `middleware` ahora es `proxy`, y `params` es una Promesa).
- `PageProps`/`LayoutProps` no existen hasta que Next genera tipos: si `typecheck` los echa de menos,
  corre `npx next typegen` o `npm run build`.
- Un Server Component solo puede pasar **props serializables** a un Client Component (por eso
  `DataTable` recibe celdas ya renderizadas y `values` aparte).
- Los formateadores de Recharts v3 tienen tipos sueltos: usa los adaptadores de
  `components/graficos/chart-theme.ts`.
- Streamlit renderiza `$…$` como LaTeX: usa `esc_dollar()` de `src/theme.py` al mostrar montos.
- Las celdas vacías llegan como `NaN` desde pandas: `str(NaN)` es `"nan"`. Usa `clean()`.
- En una planilla viva las filas nuevas van **arriba de la fila `TOTAL`**; lo que queda debajo no se
  lee (se avisa como brecha, pero no se incluye).

## Flujo de trabajo

Lee `CONTRIBUTING.md`. En corto: una rama por tema, cambios chicos, PR con la plantilla, los checks de
CI en verde, y la otra persona revisa antes de fusionar. Los commits explican el **por qué**, en español.
