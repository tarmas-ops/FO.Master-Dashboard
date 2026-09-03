import plotly.graph_objects as go
import streamlit as st

from src.app_data import get_data
from src.auth import require_password
from src.risk_engine import DEFAULT_SCENARIOS, apply_scenario, build_ips_limits, StressScenario
from src.theme import NAVY, fmt_clp, fmt_pct, inject_base_css, metric_card, nav_bar, plotly_layout

st.set_page_config(page_title="Riesgo — Family Office", layout="wide")
require_password()
inject_base_css()
data = get_data()

st.markdown("## Módulo de Riesgo")
nav_bar("Riesgo")
st.markdown(
    '<span class="fo-muted">Límites tipo Investment Policy Statement (IPS), stress tests contra crisis históricas '
    "y detalle de concentración — el análisis de riesgo que el Excel no puede hacer por sí solo.</span>",
    unsafe_allow_html=True,
)
st.divider()

st.markdown("### Límites de política de inversión (IPS)")
st.caption("Umbrales editables — ajústalos a la política real del family office. Se recalculan en vivo.")

limits = build_ips_limits(data)
breached = [l for l in limits if l.breached]
if breached:
    st.error(f"{len(breached)} de {len(limits)} límites están fuera de rango: " + ", ".join(l.label for l in breached))
else:
    st.success(f"Los {len(limits)} límites configurados están dentro de rango.")

cols = st.columns(3)
for i, lim in enumerate(limits):
    with cols[i % 3]:
        is_pct = lim.key not in ("meses_liquidez",)
        new_limit = st.number_input(
            f"Límite — {lim.label}",
            min_value=0.0,
            value=float(lim.limit * 100 if is_pct else lim.limit),
            step=1.0,
            key=f"limit_{lim.key}",
            help=f"Valor actual: {fmt_pct(lim.current) if is_pct else f'{lim.current:.1f} meses'}",
        )
        effective_limit = new_limit / 100 if is_pct else new_limit
        currently_breached = (lim.current > effective_limit) if lim.direction == "max" else (lim.current < effective_limit)
        status = "rojo" if currently_breached else "verde"
        display_current = fmt_pct(lim.current) if is_pct else f"{lim.current:.1f} meses"
        metric_card(lim.label, display_current, f"límite: {new_limit:.1f}{'%' if is_pct else ' meses'}", status=status)

st.write("")
st.divider()
st.markdown("### Stress Test — escenarios históricos")
st.caption("Supuestos ilustrativos de caída por clase de activo (no ajustados a la serie histórica real de este portafolio). Editables.")

scenario_names = [s.name for s in DEFAULT_SCENARIOS]
tabs = st.tabs(scenario_names + ["Escenario personalizado"])

for tab, scenario in zip(tabs[:-1], DEFAULT_SCENARIOS):
    with tab:
        st.markdown(f'<span class="fo-muted">{scenario.description}</span>', unsafe_allow_html=True)
        result = apply_scenario(data, scenario)
        c1, c2, c3 = st.columns(3)
        with c1:
            metric_card("Patrimonio Neto actual", fmt_clp(result.patrimonio_neto_actual))
        with c2:
            metric_card("Patrimonio Neto en el escenario", fmt_clp(result.patrimonio_neto_shock), status="rojo" if result.perdida < 0 else "verde")
        with c3:
            metric_card("Pérdida", f"{fmt_clp(result.perdida)} ({fmt_pct(result.perdida_pct)})", status="rojo" if result.perdida < 0 else "verde")
        shock_rows = "".join(
            f"<tr><td>{clase}</td><td style='text-align:right'>{fmt_pct(shock)}</td></tr>"
            for clase, shock in scenario.shocks.items()
        )
        st.markdown(
            f'<table style="width:100%;font-size:0.9rem;"><tr><th style="text-align:left">Clase de Activo</th>'
            f'<th style="text-align:right">Shock aplicado</th></tr>{shock_rows}</table>',
            unsafe_allow_html=True,
        )

with tabs[-1]:
    st.markdown('<span class="fo-muted">Define tu propio shock por clase de activo.</span>', unsafe_allow_html=True)
    s1, s2, s3, s4 = st.columns(4)
    with s1:
        shock_liq = st.slider("Liquidez", -50, 20, 0, key="custom_liq") / 100
    with s2:
        shock_inv = st.slider("Inversiones Financieras", -50, 20, -20, key="custom_inv") / 100
    with s3:
        shock_br = st.slider("Bienes Raíces", -50, 20, -15, key="custom_br") / 100
    with s4:
        shock_emp = st.slider("Empresas (Equity)", -50, 20, -20, key="custom_emp") / 100
    custom = StressScenario(
        "Personalizado", "Escenario definido por el usuario",
        {"Liquidez": shock_liq, "Inversiones Financieras": shock_inv, "Bienes Raíces": shock_br, "Empresas (Equity)": shock_emp},
    )
    result = apply_scenario(data, custom)
    c1, c2, c3 = st.columns(3)
    with c1:
        metric_card("Patrimonio Neto actual", fmt_clp(result.patrimonio_neto_actual))
    with c2:
        metric_card("Patrimonio Neto en el escenario", fmt_clp(result.patrimonio_neto_shock), status="rojo" if result.perdida < 0 else "verde")
    with c3:
        metric_card("Pérdida", f"{fmt_clp(result.perdida)} ({fmt_pct(result.perdida_pct)})", status="rojo" if result.perdida < 0 else "verde")

st.write("")
st.divider()
st.markdown("### Concentración — detalle")
left, right = st.columns(2)
with left:
    st.markdown("**Top 5 propiedades por Valor Atribuible**")
    top_br = data.bienes_raices.nlargest(5, "Valor Atribuible (CLP)")[["Dirección", "Comuna", "Valor Atribuible (CLP)"]]
    total_activos = data.balance.total_activos
    fig = go.Figure(go.Bar(
        x=top_br["Valor Atribuible (CLP)"] / total_activos * 100,
        y=top_br["Dirección"],
        orientation="h",
        marker_color=NAVY,
    ))
    fig.update_layout(xaxis_title="% del Total de Activos", yaxis=dict(autorange="reversed"))
    fig = plotly_layout(fig, height=280)
    st.plotly_chart(fig, use_container_width=True)
with right:
    st.markdown("**Top 5 empresas por Equity Value**")
    top_emp = data.empresas.nlargest(5, "Equity Value Estimado (CLP)")[["Empresa", "Equity Value Estimado (CLP)"]]
    fig2 = go.Figure(go.Bar(
        x=top_emp["Equity Value Estimado (CLP)"] / total_activos * 100,
        y=top_emp["Empresa"],
        orientation="h",
        marker_color=NAVY,
    ))
    fig2.update_layout(xaxis_title="% del Total de Activos", yaxis=dict(autorange="reversed"))
    fig2 = plotly_layout(fig2, height=280)
    st.plotly_chart(fig2, use_container_width=True)
