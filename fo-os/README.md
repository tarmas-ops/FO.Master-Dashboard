# Family Office OS

Sistema operativo de family office: patrimonio, liquidez, riesgo, deuda, rendimiento y
oportunidades en una sola base coherente. Next.js + TypeScript estricto + Tailwind +
Recharts, sobre los datos reales del archivo maestro.

```bash
npm install
npm run dev          # http://localhost:3000 (datos reales; NEXT_PUBLIC_DATASET=demo para la base ficticia)
npm run reconcile    # imprime las cifras maestras y verifica la conciliación
npm run typecheck
npm run lint
npm run build
```

`APP_PASSWORD=... npm run dev` activa el portón de contraseña también en local.

## Principio de arquitectura

La aplicación no es una colección de dashboards. Se construye sobre una sola cadena:

```
FAMILY OFFICE → ENTIDADES → ACTIVOS → FLUJOS DE CAJA → RETORNOS → DECISIONES
```

Las páginas son distintas vistas sobre esa misma base. Ninguna página define cifras
propias: todo deriva de `/data` a través de `/lib/calculos`.

## Fuente única de verdad

Se cumple siempre `ACTIVOS − PASIVOS = PATRIMONIO NETO`, y para cada activo
`valor − deuda asociada = equity`, `equity × participación económica = equity atribuible`.

`validatePortfolioConsistency()` verifica en cada corrida que las cifras concilien entre
módulos (asignación que suma 100%, participaciones ≤ 100%, deuda ≤ valor del activo,
inmobiliario que calza con la exposición, NAV que calza con el valor del fondo). La página
de Configuración muestra el resultado, y `npm run reconcile` falla con código 1 si aparece
cualquier inconsistencia.

## Participación económica look-through

La participación económica **nunca se almacena**. `calculateLookThroughOwnership()` recorre
recursivamente las participaciones directas y multiplica la cadena completa, soportando
múltiples niveles y participaciones indirectas paralelas, con protección contra ciclos:

```
Family Office 100% → Andes Holding 100% → Cordillera Investments 85% → Pacific Real Estate
⇒ participación económica sobre los activos de la SPV = 85%
```

Esa base alimenta asignación, patrimonio neto, exposición por sector, moneda, geografía y
entidad legal, evitando el doble conteo entre sociedades.

## Estructura

```
app/                    Rutas (Server Components por defecto)
components/
  dashboard/            MetricCard, Capacidad de Inversión, Alertas, Compromisos, Liquidez
  graficos/             Recharts con tema compartido y formatters tipados
  tablas/               DataTable ordenable, filtrable y buscable
  navegacion/           Sidebar, PageHeader, AI Command Bar (⌘K)
  entidades/            Árbol de participaciones con drawer de detalle
  inversiones/          Tesis, Real vs Plan, Score, Kanban de pipeline, Documentos
lib/
  calculos/             Motor financiero (funciones puras, fuera de React)
  formatters.ts         Formato chileno: $18.500 MM · UF 125.400 · US$ 4,2M · 8,4% · 1,72x
  asistente.ts          Respuestas del command bar, derivadas de la base real
data/                   Base mock tipada (la única fuente de verdad)
types/                  Modelo de datos
prisma/schema.prisma    Esquema PostgreSQL equivalente
scripts/reconcile.ts    Conciliación por consola
```

### Server Components y la tabla

`DataTable` es un Client Component y solo recibe props serializables: las celdas llegan ya
renderizadas desde el servidor y `values` (alineado con las columnas) es lo que se usa para
ordenar y buscar. Así el motor financiero y los datos se quedan en el servidor, y el cliente
solo maneja la interacción.

## Motor financiero

`calculateNetWorth`, `calculateAssetEquity`, `calculateLookThroughOwnership`,
`calculateEconomicExposure`, `calculateWeightedLTV`, `calculatePortfolioNOI`,
`calculatePortfolioCapRate`, `calculateIRR` (XIRR por bisección), `calculateMOIC`,
`calculateDPI`, `calculateTVPI`, `calculateLiquidityCoverage`,
`calculateInvestmentFirepower`, `calculatePortfolioAllocation`,
`calculateInvestmentPerformanceVsPlan`, `calculatePortfolioAlerts`,
`validatePortfolioConsistency`.

Ninguna vive dentro de un componente React.

## Datos

Hay dos bases, y `NEXT_PUBLIC_DATASET` elige cuál se usa:

| Valor | Base | Contenido |
| --- | --- | --- |
| `real` (por defecto) | `data/real/dataset.json` | Exportado desde `FO_Master_Consolidado.xlsx` |
| `demo` | `data/*.ts` | Ficticia y completa, para mostrar el producto entero |

### Base real

`scripts/export_real_dataset.py` (en la raíz del repo) recalcula el Excel con LibreOffice
headless, lo parsea con `src/data_loader.py` y emite `data/real/dataset.json` con la forma de
`Database`. Se regenera con:

```bash
python3 scripts/export_real_dataset.py   # desde la raíz del repo
```

Trae 46 entidades, 112 activos, 5 pasivos y 2.635 movimientos proyectados. **Solo se carga lo
que el archivo contiene.** Los campos que el Excel no registra —NOI, arriendos, ocupación,
WALE, costo de adquisición, EEFF de las sociedades, fondos privados, tasas de la deuda— son
opcionales en el modelo y se muestran como `s/d`, nunca como cero: un inmueble sin NOI
informado no es un inmueble con NOI cero, y un cap rate de 0% sería una cifra inventada.
Cada ausencia queda declarada en `dataCoverage.gaps` y se ve en **Configuración → Brechas de
Datos**, junto a una conciliación línea por línea contra el balance del propio Excel.

Los módulos sin fuente (mercados privados, pipeline, documentos, histórico de flujo) muestran
un estado vacío que explica qué falta cargar, en vez de un dashboard con ceros.

### Base demo

6 activos inmobiliarios, 4 empresas privadas, 3 fondos de private equity, 10 posiciones
líquidas, caja, 5 créditos y 4 sociedades. Aproximadamente **$18.500 MM** en activos,
**$3.500 MM** de deuda y **$15.000 MM** de patrimonio neto. Dos activos están deliberadamente
en problemas (Costa Lodge con DSCR 1,05x y vencimiento puente en 2027; Centro Comercial Sur
con LTV sobre política), y sus tesis y decisiones registradas lo reflejan.

## Publicar

Streamlit Community Cloud **no** puede alojar esta aplicación: solo corre apps Python de
Streamlit, y esto es Next.js sobre Node. La app Streamlit del directorio raíz del repo es otra
cosa y sigue publicándose por su cuenta.

Para Vercel (gratis, sin configuración de build):

1. vercel.com → **Add New → Project** → importar `FO.Master-Dashboard`.
2. **Root Directory: `fo-os`.** Es el paso que suele olvidarse; sin él Vercel intenta construir
   la app Streamlit de la raíz. El resto (framework, comandos, salida) lo detecta solo.
3. En **Environment Variables**, agregar `APP_PASSWORD` con la contraseña compartida, marcada
   para Production, Preview y Development.
4. Deploy.

### Portón de contraseña

`proxy.ts` exige la contraseña antes de renderizar cualquier página, así que ninguna cifra del
portafolio sale del servidor sin una cookie válida — no es un gate de CSS que se salte mirando
el HTML. El token de sesión se deriva de la propia contraseña (`lib/auth.ts`), de modo que no
hace falta un segundo secreto y **cambiar `APP_PASSWORD` cierra todas las sesiones abiertas**.
La cookie es `HttpOnly`, `SameSite=Lax`, `Secure` en producción, y dura 12 horas.

Sin `APP_PASSWORD` configurada el portón queda desactivado y la aplicación es accesible sin
credenciales: cómodo en local, inaceptable en un despliegue público. La pantalla de acceso lo
dice explícitamente cuando ocurre.

Es una contraseña compartida, no un sistema de identidades: no distingue quién entra ni deja
registro por persona. Para eso hace falta un proveedor de identidad, que la arquitectura admite
pero esta versión no implementa.

## Migrar a PostgreSQL

`prisma/schema.prisma` refleja el mismo modelo, con ownership recursivo y soporte para
tesis, supuestos y decisiones de inversión desde el día uno. Reemplazar `db` en `data/index.ts`
por una carga desde Prisma no requiere tocar la lógica financiera ni las páginas.

## Pendiente por diseño

La capa de IA del command bar responde con cálculos locales sobre la base real, lista para
conectarse a un LLM. Integraciones bancarias, OCR, workflows de comité, forecasting y
reporting quedan preparados en la arquitectura pero no implementados.
