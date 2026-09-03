"""Live macro/market indicators from free, no-API-key public sources.

Every fetch is independent and defensive: a network failure, timeout, or an
upstream format change returns an Indicator with value=None and an error note
rather than raising — so one broken source never takes the whole page down.
Callers are expected to wrap this module's entry point in a short-TTL
st.cache_data (see pages/8_Indicadores_Macro.py) so a page rerun doesn't
re-hit these APIs on every widget interaction.

Sources, chosen for being free and keyless:
- mindicador.cl — Chilean Central Bank data (UF, dólar observado, UTM, TPM,
  cobre) in a single JSON response.
- stooq.com — free daily CSV quotes, no signup, for US equities/ETFs/gold.
- home.treasury.gov — official daily par yield curve XML feed, for UST yields.

This session's own sandbox cannot reach any of these domains (network egress
policy), so none of this has been exercised against live responses — only
against each source's documented/expected format. Verify on first deploy.
"""

from __future__ import annotations

import datetime
import re
from dataclasses import dataclass

import requests

TIMEOUT = 8


@dataclass
class Indicator:
    label: str
    value: float | None
    unit: str
    source: str
    as_of: str | None
    error: str | None = None


def _mindicador_all() -> dict:
    try:
        r = requests.get("https://mindicador.cl/api", timeout=TIMEOUT)
        r.raise_for_status()
        return r.json()
    except Exception:
        return {}


def _from_mindicador(data: dict, key: str, label: str, unit: str) -> Indicator:
    node = data.get(key)
    if not isinstance(node, dict) or node.get("valor") is None:
        return Indicator(label, None, unit, "mindicador.cl", None, error="Fuente no disponible")
    return Indicator(label, float(node["valor"]), unit, "mindicador.cl (Banco Central de Chile)", node.get("fecha"))


def _stooq_quote(symbol: str, label: str, unit: str) -> Indicator:
    source = f"stooq.com ({symbol})"
    try:
        r = requests.get(f"https://stooq.com/q/d/l/?s={symbol}&i=d", timeout=TIMEOUT)
        r.raise_for_status()
        lines = [ln for ln in r.text.strip().splitlines() if ln]
        if len(lines) < 2:
            return Indicator(label, None, unit, source, None, error="Sin datos")
        cols = lines[-1].split(",")
        # Date,Open,High,Low,Close,Volume
        if len(cols) < 5 or cols[4] in ("N/D", ""):
            return Indicator(label, None, unit, source, None, error="Sin datos")
        return Indicator(label, float(cols[4]), unit, source, cols[0])
    except Exception:
        return Indicator(label, None, unit, source, None, error="Fuente no disponible")


def _treasury_yields() -> dict[str, Indicator]:
    labels = {"10y": ("Treasury 10 años", "BC_10YEAR"), "30y": ("Treasury 30 años", "BC_30YEAR")}
    source = "home.treasury.gov"
    out = {k: Indicator(lbl, None, "%", source, None, error="Fuente no disponible") for k, (lbl, _) in labels.items()}
    try:
        today = datetime.date.today()
        url = (
            "https://home.treasury.gov/resource-center/data-chart-center/interest-rates/"
            f"pages/xml?data=daily_treasury_yield_curve&field_tdr_date_value_month={today:%Y%m}"
        )
        r = requests.get(url, timeout=TIMEOUT)
        r.raise_for_status()
        text = r.text
        date_matches = re.findall(r"<d:NEW_DATE[^>]*>([^<]+)</d:NEW_DATE>", text)
        as_of = date_matches[-1][:10] if date_matches else None
        for key, (lbl, tag) in labels.items():
            matches = re.findall(rf"<d:{tag}[^>]*>([\d.]+)</d:{tag}>", text)
            if matches:
                out[key] = Indicator(lbl, float(matches[-1]), "%", source, as_of)
    except Exception:
        pass
    return out


def fetch_all_indicators() -> list[Indicator]:
    md = _mindicador_all()
    treasuries = _treasury_yields()
    return [
        _from_mindicador(md, "uf", "Valor UF", "CLP"),
        _from_mindicador(md, "dolar", "Dólar Observado", "CLP"),
        _from_mindicador(md, "tpm", "Tasa Política Monetaria (Banco Central)", "%"),
        _from_mindicador(md, "libra_cobre", "Cobre (libra)", "USD/lb"),
        treasuries["10y"],
        treasuries["30y"],
        _stooq_quote("^spx", "S&P 500", "pts"),
        _stooq_quote("vti.us", "VTI (Vanguard Total Market)", "USD"),
        _stooq_quote("xauusd", "Oro (spot)", "USD/oz"),
        _stooq_quote("^ipsa", "IPSA", "pts"),
    ]
