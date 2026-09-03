# Family Office OS

Sistema operativo de family office: patrimonio, liquidez, riesgo, deuda, rendimiento y
oportunidades en una sola base coherente. Next.js + TypeScript estricto + Tailwind +
Recharts, con datos ficticios completamente tipados.

```bash
npm install
npm run dev          # http://localhost:3000
npm run reconcile    # imprime las cifras maestras y verifica la conciliación
npm run typecheck
npm run lint
npm run build
```

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

Ficticios y coherentes: 6 activos inmobiliarios, 4 empresas privadas, 3 fondos de private
equity, 10 posiciones líquidas, caja, 5 créditos y 4 sociedades. Aproximadamente
**$18.500 MM** en activos, **$3.500 MM** de deuda y **$15.000 MM** de patrimonio neto.
Dos activos están deliberadamente en problemas (Costa Lodge con DSCR 1,05x y vencimiento
puente en 2027; Centro Comercial Sur con LTV sobre política), y sus tesis y decisiones
registradas lo reflejan.

## Migrar a PostgreSQL

`prisma/schema.prisma` refleja el mismo modelo, con ownership recursivo y soporte para
tesis, supuestos y decisiones de inversión desde el día uno. Reemplazar `db` en `data/index.ts`
por una carga desde Prisma no requiere tocar la lógica financiera ni las páginas.

## Pendiente por diseño

La capa de IA del command bar responde con cálculos locales sobre la base real, lista para
conectarse a un LLM. Integraciones bancarias, OCR, workflows de comité, forecasting y
reporting quedan preparados en la arquitectura pero no implementados.
