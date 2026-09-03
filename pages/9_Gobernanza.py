import hashlib

import pandas as pd
import streamlit as st

from src.app_data import get_data
from src.auth import require_password
from src.data_loader import DATA_DIR
from src.kpi_engine import build_kpi_cards
from src.snapshots import load_snapshots
from src.theme import fmt_clp, fmt_pct, inject_base_css, nav_bar

st.set_page_config(page_title="Gobernanza y Metodología — Family Office", layout="wide")
require_password()
inject_base_css()
data = get_data()

st.markdown("## Gobernanza y Metodología")
nav_bar("Gobernanza")
st.markdown(
    '<span class="fo-muted">Cómo se calcula cada cifra, de dónde viene, y qué cambió entre versiones del archivo '
    "maestro — para que ningún número en el dashboard sea una caja negra.</span>",
    unsafe_allow_html=True,
)
st.divider()

st.markdown("### Trazabilidad del archivo fuente")
raw_path = DATA_DIR / "FO_Master_Consolidado.xlsx"
file_hash = hashlib.sha256(raw_path.read_bytes()).hexdigest() if raw_path.exists() else None
c1, c2, c3 = st.columns(3)
with c1:
    st.markdown(f"**Última recarga**\n\n{data.fecha_carga}")
with c2:
    st.markdown(f"**SHA-256 del archivo**\n\n`{file_hash[:16] + '…' if file_hash else 's/d'}`")
with c3:
    st.markdown("**Recalculado con**\n\nLibreOffice headless (fórmulas forzadas a recalcular antes de leer)")
st.caption(
    "El hash identifica exactamente qué versión del Excel produjo las cifras que ves. Dos snapshots con el mismo "
    "hash son, byte a byte, el mismo archivo — útil para confirmar que un 'reload' no cambió nada."
)

st.write("")
st.markdown("### Metodología por sección")

with st.expander("Bienes Raíces — cómo se valoriza cada propiedad", expanded=False):
    st.markdown(
        f"""
- **Valor Balance** = Tasación Comercial si existe; si no, Avalúo Fiscal × **{data.supuestos['factor_tasacion']:.2f}**
  (factor definido en la pestaña Supuestos del Excel, hoy calibrado por el cliente).
- **Valor Atribuible** = Valor Balance × % Participación (por defecto 100% si el Excel no especifica copropiedad).
- El dashboard **completa automáticamente** el Valor Balance/Atribuible de propiedades donde esas celdas venían en
  blanco en el Excel original, aplicando la misma fórmula de arriba — quedan marcadas en el panel de
  **Datos Pendientes** para que el family office las confirme.
- Fuente: pestaña `Bienes_Raices`, columnas `Avalúo Fiscal`, `Tasación Comercial`, `% Participación`.
"""
    )

with st.expander("Empresas — cómo se estima el Equity Value", expanded=False):
    st.markdown(
        """
- **Equity Value Estimado** = % Participación (provisorio) × Patrimonio Contable.
- Si falta cualquiera de los dos datos, el Equity Value se muestra en $0 — **no** significa que la empresa no
  valga nada, significa que aún no se cargó su información en el Excel.
- Fuente: pestaña `Empresas`. El semáforo de completitud (página Empresas) evalúa 3 señales por empresa:
  RUT confirmado, % verificado, Patrimonio Contable cargado.
"""
    )

with st.expander("Flujo de Caja — Saldo Acumulado reconstruido", expanded=False):
    st.markdown(
        """
- La fila `Saldo Acumulado` de la grilla mensual (60 meses) venía **vacía** en el archivo fuente.
- El dashboard la reconstruye como suma acumulada de `Saldo Mensual`, **anclada** al valor conocido de la tabla
  `Resumen Anual` en oct-2026 (que también respalda el KPI "Peor Saldo Acumulado proyectado").
- Esto significa que el punto de oct-2026 es exacto; los puntos intermedios son una interpolación razonable pero
  no vienen directamente del modelo original — verificar contra el archivo fuente antes de decisiones de caja.
"""
    )

st.write("")
st.markdown("### KPIs — umbrales de los semáforos")
kpi_rows = [
    {"KPI": c.label, "Sección": c.section, "Umbral / lógica": c.note}
    for c in build_kpi_cards(data)
]
st.dataframe(pd.DataFrame(kpi_rows), use_container_width=True, hide_index=True)

st.write("")
st.markdown("### Simulador de escenarios — supuestos del modelo")
st.markdown(
    """
- La deuda nueva se toma una vez, al año 0 (no hay calendario de desembolsos).
- El interés se paga de flujo de caja cada año — **no se capitaliza** sobre el saldo de la deuda.
- El capital reasignado compone anualmente a la tasa que el usuario elige en el slider.
- No considera impuestos, amortización de capital ni costos de transacción.
- Con apalancamiento en 0%, el escenario reproduce exactamente el KPI "Patrimonio Neto proyectado" del Excel —
  eso sirve como validación cruzada del modelo.
"""
)

st.write("")
st.markdown("### Registro de cambios entre versiones")
snapshots = load_snapshots()
if len(snapshots) < 2:
    st.info(
        f"Hay {len(snapshots)} snapshot(s) guardado(s). El registro de cambios aparece automáticamente cuando "
        "existan al menos 2 versiones distintas del Excel cargadas en el tiempo."
    )
else:
    snap = snapshots.sort_values("fecha_carga").reset_index(drop=True)
    rows = []
    for i in range(1, len(snap)):
        prev, curr = snap.iloc[i - 1], snap.iloc[i]
        delta = curr["patrimonio_neto"] - prev["patrimonio_neto"]
        delta_pct = delta / prev["patrimonio_neto"] if prev["patrimonio_neto"] else None
        rows.append({
            "Desde": prev["fecha_carga"],
            "Hasta": curr["fecha_carga"],
            "Patrimonio Neto (antes)": fmt_clp(prev["patrimonio_neto"]),
            "Patrimonio Neto (después)": fmt_clp(curr["patrimonio_neto"]),
            "Variación": fmt_clp(delta),
            "Variación %": fmt_pct(delta_pct) if delta_pct is not None else "s/d",
        })
    st.dataframe(pd.DataFrame(rows), use_container_width=True, hide_index=True)
