"""Shared visual language: dark-mode-premium palette (near-black background,
elevated cards, saturated blue/green/orange accents with a soft glow), one Plotly
dark template, and small render helpers reused by every page so the app reads as
one tool, not a stack of separate scripts."""

from __future__ import annotations

import math

import pandas as pd
import plotly.graph_objects as go
import streamlit as st

NAVY = "#5B8DEF"       # primary accent (blue)
NAVY_SOFT = "#3D6FD1"
SLATE = "#B4B4C9"      # secondary text on dark background
SLATE_LIGHT = "#7A7A94"  # muted/tertiary text
BORDER = "rgba(255,255,255,0.08)"
BG = "#0A0A0F"
CARD_BG = "#1A1A24"
CARD_BG_HOVER = "#20202D"
INK = "#F4F4F8"        # primary text

GREEN = "#22C55E"
GREEN_BG = "rgba(34,197,94,0.14)"
AMBER = "#F59E0B"
AMBER_BG = "rgba(245,158,11,0.14)"
RED = "#EF4444"
RED_BG = "rgba(239,68,68,0.14)"
ORANGE = "#F97316"

STATUS_COLORS = {
    "verde": (GREEN, GREEN_BG),
    "amarillo": (AMBER, AMBER_BG),
    "rojo": (RED, RED_BG),
}

ASSET_CLASS_COLORS = {
    "Liquidez": "#A78BFA",
    "Inversiones Financieras": ORANGE,
    "Bienes Raíces": NAVY,
    "Empresas (Equity)": GREEN,
    "Otros Activos (CxC + menores)": "#4B4B5E",
}

FONT_FAMILY = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif"


def inject_base_css() -> None:
    st.markdown(
        f"""
        <link rel="preconnect" href="https://fonts.googleapis.com">
        <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
        <style>
        html, body, [class*="css"] {{
            font-family: {FONT_FAMILY};
        }}
        .stApp {{
            background-color: {BG};
        }}
        [data-testid="stSidebar"] {{
            background-color: {BG};
            border-right: 1px solid {BORDER};
        }}
        [data-testid="stSidebar"] * {{
            color: {SLATE} !important;
        }}
        [data-testid="stSidebar"] a {{
            color: {SLATE} !important;
        }}
        h1, h2, h3 {{
            color: {INK};
            font-weight: 700;
            letter-spacing: -0.01em;
        }}
        @keyframes fo-fade-up {{
            from {{ opacity: 0; transform: translateY(8px); }}
            to {{ opacity: 1; transform: translateY(0); }}
        }}
        .fo-card {{
            background: {CARD_BG};
            border: 1px solid {BORDER};
            border-radius: 14px;
            padding: 20px 22px;
            box-shadow: 0 1px 2px rgba(0,0,0,0.4);
            transition: transform 0.15s ease, box-shadow 0.15s ease, border-color 0.15s ease;
            animation: fo-fade-up 0.35s ease-out;
        }}
        .fo-card:hover {{
            transform: translateY(-2px);
            border-color: rgba(91,141,239,0.35);
            box-shadow: 0 8px 24px rgba(0,0,0,0.45), 0 0 0 1px rgba(91,141,239,0.12);
        }}
        .fo-badge {{
            display: inline-block;
            padding: 3px 11px;
            border-radius: 999px;
            font-size: 0.78rem;
            font-weight: 600;
            letter-spacing: 0.02em;
        }}
        .fo-muted {{
            color: {SLATE_LIGHT};
            font-size: 0.85rem;
        }}
        .fo-insight {{
            color: {SLATE};
            font-size: 0.85rem;
            margin-top: 6px;
            padding-left: 10px;
            border-left: 2px solid {NAVY};
        }}
        .fo-metric-value {{
            font-size: 1.7rem;
            font-weight: 700;
            color: {INK};
            letter-spacing: -0.01em;
        }}
        .fo-navlink {{
            display: block;
            padding: 7px 14px;
            border-radius: 999px;
            background: {CARD_BG};
            border: 1px solid {BORDER};
            color: {SLATE} !important;
            text-decoration: none !important;
            font-size: 0.83rem;
            font-weight: 600;
            white-space: nowrap;
            text-align: center;
            margin-bottom: 6px;
        }}
        .fo-navlink.active {{
            background: {NAVY};
            border-color: {NAVY};
            color: #0A0A0F !important;
            box-shadow: 0 0 16px rgba(91,141,239,0.5);
        }}
        [data-testid="stPageLink"] {{
            min-height: 0 !important;
        }}
        [data-testid="stPageLink"] a {{
            padding: 7px 14px !important;
            border-radius: 999px !important;
            background: {CARD_BG} !important;
            border: 1px solid {BORDER} !important;
            font-size: 0.83rem !important;
            font-weight: 600 !important;
            justify-content: center !important;
            transition: border-color 0.15s ease, box-shadow 0.15s ease;
        }}
        [data-testid="stPageLink"] a:hover {{
            border-color: rgba(91,141,239,0.5) !important;
            box-shadow: 0 0 12px rgba(91,141,239,0.25);
        }}
        .fo-metric-label {{
            color: {SLATE_LIGHT};
            font-size: 0.82rem;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.04em;
        }}
        </style>
        """,
        unsafe_allow_html=True,
    )


_NAV_ITEMS = [
    ("Inicio", "app.py"),
    ("Balance", "pages/1_Balance.py"),
    ("KPIs", "pages/2_KPIs.py"),
    ("Riesgo", "pages/10_Riesgo.py"),
    ("Flujo Caja", "pages/3_Flujo_Caja.py"),
    ("Indicadores Macro", "pages/8_Indicadores_Macro.py"),
    ("Datos Pendientes", "pages/4_Datos_Pendientes.py"),
    ("Empresas", "pages/5_Empresas.py"),
    ("Simulador", "pages/6_Simulador.py"),
    ("Historial", "pages/7_Historial.py"),
    ("Gobernanza", "pages/9_Gobernanza.py"),
]


def nav_bar(current: str) -> None:
    """Row of links to every page, visible above the fold on every page.

    Streamlit's own page navigation lives in the sidebar, which starts collapsed on
    mobile behind a small arrow — easy to miss entirely, which is what made the app
    read as a static report on a phone instead of something with more to tap into.
    This bar is a second, always-visible way to move between pages. It uses
    st.page_link (not raw <a> tags) specifically because raw links force a full
    browser reload and drop st.session_state — including the login flag from
    require_password() — while st.page_link navigates client-side and keeps the
    session, and thus the login, intact.
    """
    # Explicit rows of (up to) 4 columns each — built by slicing, not by indexing a
    # single wide row with i % 4 — so that when columns stack to full-width on a
    # narrow screen, items still stack in left-to-right reading order instead of
    # being interleaved by column.
    rows = [_NAV_ITEMS[i:i + 4] for i in range(0, len(_NAV_ITEMS), 4)]
    for row in rows:
        cols = st.columns(4)
        for col, (label, path) in zip(cols, row):
            with col:
                if label == current:
                    st.markdown(f'<div class="fo-navlink active">{label}</div>', unsafe_allow_html=True)
                else:
                    st.page_link(path, label=label)


def status_badge_html(status: str, text: str | None = None) -> str:
    color, bg = STATUS_COLORS.get(status, (SLATE, "#2A2A38"))
    label = text or status.upper()
    return f'<span class="fo-badge" style="color:{color};background:{bg};">{label}</span>'


def insight_html(text: str) -> str:
    """A one-line takeaway rendered under a chart, in the accent-bordered style."""
    return f'<div class="fo-insight">{text}</div>'


def plotly_layout(fig: go.Figure, height: int | None = None) -> go.Figure:
    fig.update_layout(
        font=dict(family=FONT_FAMILY, color=INK, size=13),
        paper_bgcolor="rgba(0,0,0,0)",
        plot_bgcolor="rgba(0,0,0,0)",
        margin=dict(l=10, r=10, t=40, b=10),
        legend=dict(orientation="h", yanchor="bottom", y=-0.25, xanchor="center", x=0.5, font=dict(color=SLATE)),
        colorway=[NAVY, GREEN, ORANGE, "#A78BFA", "#4B4B5E", SLATE_LIGHT],
        hoverlabel=dict(bgcolor=CARD_BG, bordercolor=BORDER, font=dict(color=INK, family=FONT_FAMILY)),
    )
    if height:
        fig.update_layout(height=height)
    fig.update_xaxes(gridcolor=BORDER, zerolinecolor=BORDER, color=SLATE)
    fig.update_yaxes(gridcolor=BORDER, zerolinecolor=BORDER, color=SLATE)
    return fig


def _is_missing(value) -> bool:
    return value is None or (isinstance(value, float) and math.isnan(value))


def fmt_clp(value: float | None, decimals: int = 0) -> str:
    if _is_missing(value):
        return "s/d"
    sign = "-" if value < 0 else ""
    formatted = f"{abs(value):,.{decimals}f}".replace(",", "§").replace(".", ",").replace("§", ".")
    return f"{sign}${formatted}"


def fmt_pct(value: float | None, decimals: int = 1) -> str:
    if _is_missing(value):
        return "s/d"
    return f"{value * 100:.{decimals}f}%"


def format_display_df(df: pd.DataFrame, currency_cols: tuple[str, ...] = (), pct_cols: tuple[str, ...] = ()) -> pd.DataFrame:
    """Returns a copy of df with the given columns replaced by already-formatted
    display strings (including 's/d' for missing values). st.dataframe's Arrow-based
    grid does not reliably apply pandas Styler formatters/na_rep to null cells, so
    pre-formatting to plain strings is the reliable way to control how blanks render."""
    out = df.copy()
    for col in currency_cols:
        out[col] = out[col].apply(fmt_clp)
    for col in pct_cols:
        out[col] = out[col].apply(fmt_pct)
    return out


def esc_dollar(text: str) -> str:
    """Streamlit's markdown renders $...$ as LaTeX (MathJax); a stray pair of dollar
    signs anywhere in one markdown call (e.g. two CLP amounts in the same block) gets
    silently re-styled as math. Swap the literal '$' for its HTML entity wherever text
    is going into st.markdown(unsafe_allow_html=True) so currency strings never form
    an accidental math delimiter pair."""
    return text.replace("$", "&#36;")


def metric_card(label: str, value: str, sublabel: str = "", status: str | None = None) -> None:
    badge = status_badge_html(status) if status else ""
    st.markdown(
        f"""
        <div class="fo-card">
            <div class="fo-metric-label">{label}</div>
            <div class="fo-metric-value">{esc_dollar(value)}</div>
            <div class="fo-muted">{esc_dollar(sublabel)} {badge}</div>
        </div>
        """,
        unsafe_allow_html=True,
    )
