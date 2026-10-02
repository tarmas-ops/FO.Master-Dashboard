# Conectar el dashboard a tu planilla de Google Sheets

Después de esta configuración (se hace una sola vez, unos 20 minutos) tú editas la planilla y el
dashboard se actualiza solo en unos 10 a 15 minutos. Si prefieres que sea inmediato, hay un botón
**Dashboard → Publicar ahora** dentro de la planilla.

**Qué pasa si te equivocas al editar:** antes de publicar, el dashboard revisa los datos. Si algo no
cuadra (una pestaña borrada, una fórmula con error, un cambio desproporcionado), **no publica y deja
en línea la versión anterior**. Una planilla mal editada nunca llega al dashboard.

Necesitas: tu cuenta de Google, tu cuenta de Vercel, y estos dos archivos de esta carpeta:
`Code.gs` y `Mapeo_Arriendos.csv`.

---

## Paso 1 · Subir tu Excel a Google Sheets

1. Entra a [sheets.google.com](https://sheets.google.com) y abre una hoja **en blanco**.
2. Menú **Archivo → Importar → Subir**, y arrastra `FO_Master_Consolidado.xlsx`.
3. Elige **Crear una hoja de cálculo nueva** → **Importar datos** → **Abrir ahora**.
4. **Revisa que estén estas 10 pestañas, con estos nombres exactos** (abajo en la barra):
   `Supuestos`, `Perimetro_Familiar`, `Liquidez`, `Inversiones_Financieras`, `Otras_Partidas`,
   `Bienes_Raices`, `Empresas`, `Pasivos`, `Flujo_Caja`, `Balance_Consolidado`.
5. Recorre las pestañas y confirma que ninguna celda muestre `#REF!`, `#DIV/0!` ni otro error.

## Paso 2 · Agregar la pestaña de arriendos

1. En la misma planilla: **Archivo → Importar → Subir** y arrastra `Mapeo_Arriendos.csv`.
2. Elige **Insertar hojas nuevas** → **Importar datos**.
3. Debe quedar una pestaña llamada `Mapeo_Arriendos`.

Esa pestaña dice a qué propiedades corresponde cada arriendo del flujo de caja. En la columna
**Estado** puedes poner `CONFIRMADO` cuando verifiques un vínculo.

## Paso 3 · Instalar el puente

1. En la planilla: **Extensiones → Apps Script**.
2. Se abre un editor con un archivo `Code.gs`. **Borra todo** lo que hay y **pega el contenido** de
   `Code.gs` de esta carpeta.
3. Pulsa el ícono de guardar (disquete).
4. Arriba a la derecha: **Implementar → Nueva implementación**.
5. Junto a "Seleccionar tipo" pulsa el engranaje ⚙ y elige **Aplicación web**.
6. Configura:
   - **Ejecutar como:** Yo
   - **Quién tiene acceso:** Cualquier persona
7. Pulsa **Implementar**. Google pedirá permisos: **Autorizar acceso**, elige tu cuenta.
   Verás el aviso *"Google no ha verificado esta aplicación"*: es porque el script es tuyo.
   Pulsa **Configuración avanzada → Ir a (nombre del proyecto) (no seguro) → Permitir**.
8. **Copia la "URL de la aplicación web"** y déjala a mano (la usarás en el paso 6).

> "Cualquier persona" no deja los datos abiertos: el script solo responde a quien trae el token
> secreto, que se genera en el paso 5 y que nadie ve en la planilla.

## Paso 4 · Crear el aviso de Vercel

1. En [vercel.com](https://vercel.com) abre tu proyecto → **Settings → Git**.
2. Baja hasta **Deploy Hooks**. Nombre: `planilla`. Rama: la misma que ya publica tu dashboard.
3. Pulsa **Create Hook** y **copia la URL**.

## Paso 5 · Configurar desde la planilla

1. Vuelve a la planilla y **recarga la página**. Aparece un menú nuevo: **Dashboard**.
2. **Dashboard → Configurar (una sola vez)**. Autoriza los permisos si te los pide.
3. Pega la URL del Deploy Hook (paso 4) y pulsa OK.
4. Aparece una ventana con dos valores: `SHEETS_ENDPOINT` y `SHEETS_TOKEN`. **No cierres esa ventana
   todavía.**

> Si `SHEETS_ENDPOINT` dice "todavía no hay una implementación", falta el paso 3.7: vuelve a
> Implementar y repite este paso.

## Paso 6 · Pasar los dos valores a Vercel

1. En Vercel, tu proyecto → **Settings → Environment Variables**.
2. Agrega `SHEETS_ENDPOINT` con el primer valor y `SHEETS_TOKEN` con el segundo.
   Márcalas para **Production, Preview y Development**.
3. Ve a **Deployments**, abre el más reciente → menú **⋯ → Redeploy**.
4. Al terminar, abre el detalle del despliegue → **Build Logs**. Debes ver líneas como:

   ```
   [sheets] Descargando la planilla…
   [sheets] Validación OK — 112 activos, 2635 movimientos…
   ```

   En **Configuración** del dashboard, el origen de datos dirá **Google Sheets**.

El token es como una contraseña: no lo pegues en chats ni correos. Si se filtra, usa
**Dashboard → Regenerar token** en la planilla: el anterior deja de funcionar al instante y la ventana
te muestra el nuevo para que lo pegues en Vercel (`SHEETS_TOKEN`) y vuelvas a publicar.

---

## Cómo editar sin romper nada

- **Propiedades, empresas o cuentas nuevas: insértalas ARRIBA de la fila `TOTAL`** (clic derecho en
  una fila → *Insertar 1 fila arriba*). Lo que escribas debajo del TOTAL no se lee; el dashboard lo
  avisa en **Configuración → Brechas de datos**, pero no lo incluye.
- **No cambies los nombres de las pestañas** ni el texto de los **encabezados** de las tablas
  ("Dirección", "Avalúo Fiscal", "Monto (CLP)"…). Sí puedes agregar columnas nuevas.
- Deja que las fórmulas se calculen: no pegues "valores" encima de ellas sin querer.
- Si el dashboard no cambia, revisa **Dashboard → Ver estado** en la planilla. Si el cambio era
  válido, el **Build Log** de Vercel dice por qué no se publicó.

## Si una publicación falla

El dashboard sigue mostrando la versión anterior; no se rompe nada. En Vercel, el despliegue
aparece con error rojo y el **Build Log** dice qué corregir, por ejemplo:

| Mensaje | Qué pasó |
| --- | --- |
| `Falta la pestaña "Pasivos"` | Borraste o renombraste una pestaña. |
| `celda(s) con error de fórmula: Empresas!D7 (#REF!)` | Una fórmula apunta a algo que ya no existe. |
| `Cambio desproporcionado…` | El patrimonio o la cantidad de activos cambió más de 40%. Si es real, define `SHEETS_ALLOW_BIG_CHANGE=1` en Vercel, vuelve a publicar, y bórrala después. |
| `no es JSON` | El acceso de la implementación no es "Cualquier persona" (paso 3.6). |

## Límites

- Se publica a lo más una vez cada 15 minutos y 20 veces al día, para cuidar el plan gratuito de
  Vercel. **Dashboard → Publicar ahora** respeta el tope diario pero no la espera.
- Una edición se publica cuando la planilla queda quieta entre dos revisiones (cada 5 minutos),
  para no publicar a medio editar.
