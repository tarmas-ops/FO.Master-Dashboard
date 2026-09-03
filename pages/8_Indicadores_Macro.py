import time

import streamlit as st

from src.auth import require_password
from src.market_data import fetch_all_indicators
from src.theme import inject_base_css, metric_card, nav_bar

st.set_page_config(page_title="Indicadores Macro — Family Office", layout="wide")
require_password()
inject_base_css()

st.markdown("## Indicadores Macro")
nav_bar("Indicadores Macro")
st.markdown(
    '<span class="fo-muted">Precios y tasas en vivo desde fuentes públicas gratuitas — Banco Central de Chile '
    "(mindicador.cl), Stooq y el Tesoro de EE.UU. Se actualiza cada 15 minutos.</span>",
    unsafe_allow_html=True,
)
st.divider()


@st.cache_data(ttl=900, show_spinner="Consultando indicadores en vivo...")
def _cached_indicators(bucket: int):
    return fetch_all_indicators()


col_a, col_b = st.columns([3, 1])
with col_b:
    if st.button("Actualizar ahora"):
        _cached_indicators.clear()
        st.rerun()

indicators = _cached_indicators(int(time.time() // 900))


def _fmt_value(ind) -> str:
    if ind.value is None:
        return "s/d"
    if ind.unit == "CLP":
        return f"${ind.value:,.2f}".replace(",", ".")
    if ind.unit == "%":
        return f"{ind.value:.2f}%"
    if ind.unit == "pts":
        return f"{ind.value:,.1f}".replace(",", ".")
    return f"{ind.value:,.2f} {ind.unit}"


def _render_group(title: str, items: list) -> None:
    st.markdown(f"#### {title}")
    cols = st.columns(len(items))
    for col, ind in zip(cols, items):
        with col:
            sublabel = f"{ind.source} · {ind.as_of}" if ind.value is not None and ind.as_of else (ind.error or ind.source)
            status = None if ind.value is not None else "amarillo"
            metric_card(ind.label, _fmt_value(ind), sublabel, status=status)
    st.write("")


chile = [i for i in indicators if i.label in ("Valor UF", "Dólar Observado", "Tasa Política Monetaria (Banco Central)", "Cobre (libra)")]
global_ind = [i for i in indicators if i not in chile]

_render_group("Chile", chile)
_render_group("Global", global_ind)

missing = [i for i in indicators if i.value is None]
if missing:
    st.caption(
        f"{len(missing)} de {len(indicators)} indicadores no cargaron en este momento "
        f"({', '.join(i.label for i in missing)}). Puede ser una caída temporal de la fuente — prueba "
        "'Actualizar ahora'. Este sandbox de desarrollo no tiene salida a internet hacia estas fuentes; "
        "verifica en el dashboard desplegado."
    )
