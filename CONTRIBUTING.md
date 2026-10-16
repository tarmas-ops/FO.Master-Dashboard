# Cómo trabajar juntos en este repositorio

Somos pocas personas trabajando sobre las finanzas reales de una familia. Las reglas están pensadas para
dos cosas: **no pisarnos** y **no equivocarnos con los datos**.

## Primera vez

```bash
git clone https://github.com/tarmas-ops/FO.Master-Dashboard
cd FO.Master-Dashboard/fo-os
npm ci
npm run dev        # http://localhost:3000
```

Para ver la app sin datos reales: `NEXT_PUBLIC_DATASET=demo npm run dev`.

Si trabajas con Claude (claude.ai/code): conecta tu cuenta de GitHub, elige este repositorio y abre una
sesión. Claude lee `CLAUDE.md` al empezar, así que ya conoce las reglas del proyecto.

## Ramas y cambios

- **No trabajes directamente en la rama principal** (hoy `claude/family-office-dashboard-aice2r`,
  que es la que publica el dashboard). Crea una rama por tema: `tu-nombre/tema-corto`. Las sesiones de
  Claude crean la suya solas (`claude/...`).
- **Cambios chicos y de un solo tema.** Un PR que mezcla un rediseño con un arreglo de datos es difícil de
  revisar y de deshacer.
- Entra siempre **por Pull Request**, con la plantilla completa. **La otra persona lo revisa antes de
  fusionar.** Nadie fusiona su propio PR sin que el otro lo haya visto, salvo urgencia acordada.
- Nunca `git push --force` sobre una rama compartida.
- Los mensajes de commit explican **por qué**, en español, no solo qué.

> GitHub gratuito no permite bloquear la rama principal en repositorios privados, así que estas reglas son
> un acuerdo entre ustedes, no algo que GitHub haga cumplir. Los checks automáticos (abajo) sí corren solos.

## Antes de abrir un PR

Desde `fo-os/`:

```bash
npm run typecheck && npm run lint && npm run check-appsscript && npm run build
```

Es lo mismo que corre el CI en cada PR. Si tocaste el lector de Google Sheets (`lib/sheets/`) o el
exportador de Python, además corre las pruebas de paridad (ver `CLAUDE.md`); necesitan un archivo simulado
con datos reales que no se versiona.

## Datos reales

El Excel y `dataset.json` contienen patrimonio, RUTs y direcciones reales.

- **No pegues cifras ni RUTs reales** en issues, PRs, commits ni capturas. Usa la base demo.
- **Nunca versiones**: `.env*`, tokens, el Deploy Hook de Vercel, `fo-os/.sheets-fixture/`.
- Si ves un dato sensible en el repositorio, avisa a la otra persona antes de arreglarlo: sacarlo de
  la rama no lo saca del historial.

## Publicación

Vercel construye `fo-os` (Root Directory = `fo-os`) desde la rama principal. Antes de publicar, el build
sincroniza con la planilla de Google Sheets y **valida**; si no valida, falla y deja en línea la versión
anterior. Detalle y variables de entorno: `fo-os/integrations/google-sheets/LEEME.md`.
