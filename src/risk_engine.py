"""Formal risk module: stress-test scenarios applied to the current Balance.

Shock magnitudes are illustrative — typical drawdowns observed for each asset
class in past crises — not fitted to this specific portfolio's actual return
series (no such history exists yet). They're editable in the UI for exactly
that reason: treat them as a starting point a CIO would recalibrate, not a
forecast.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from src.data_loader import FOData


@dataclass
class StressScenario:
    name: str
    description: str
    shocks: dict[str, float]  # Clase de Activo -> fractional change (negative = loss)


DEFAULT_SCENARIOS: list[StressScenario] = [
    StressScenario(
        "Crisis Financiera 2008",
        "Colapso de crédito global, caída simultánea de renta variable y bienes raíces.",
        {"Liquidez": 0.0, "Inversiones Financieras": -0.35, "Bienes Raíces": -0.25, "Empresas (Equity)": -0.30},
    ),
    StressScenario(
        "COVID-19 (2020)",
        "Shock rápido y profundo, recuperación veloz en activos financieros; bienes raíces e ilíquidos con caída menor.",
        {"Liquidez": 0.0, "Inversiones Financieras": -0.30, "Bienes Raíces": -0.10, "Empresas (Equity)": -0.20},
    ),
    StressScenario(
        "Shock de Tasas 2022",
        "Alza agresiva de tasas: renta fija y variable caen juntas, bienes raíces se resiente por costo de deuda.",
        {"Liquidez": 0.005, "Inversiones Financieras": -0.18, "Bienes Raíces": -0.12, "Empresas (Equity)": -0.15},
    ),
]


@dataclass
class StressResult:
    scenario: StressScenario
    patrimonio_neto_actual: float
    patrimonio_neto_shock: float
    perdida: float
    perdida_pct: float | None


def apply_scenario(data: FOData, scenario: StressScenario) -> StressResult:
    dist = data.balance.distribucion_activos.set_index("Clase de Activo")["Monto (CLP)"]
    shocked_assets = sum(monto * (1 + scenario.shocks.get(clase, 0.0)) for clase, monto in dist.items())
    pn_actual = data.balance.patrimonio_neto
    pn_shock = shocked_assets - data.balance.total_pasivos
    perdida = pn_shock - pn_actual
    return StressResult(
        scenario=scenario,
        patrimonio_neto_actual=pn_actual,
        patrimonio_neto_shock=pn_shock,
        perdida=perdida,
        perdida_pct=(perdida / pn_actual) if pn_actual else None,
    )


@dataclass
class IPSLimit:
    key: str
    label: str
    current: float
    limit: float
    direction: str  # "max" (breach if current > limit) or "min" (breach if current < limit)

    @property
    def breached(self) -> bool:
        return self.current > self.limit if self.direction == "max" else self.current < self.limit


def build_ips_limits(data: FOData, overrides: dict[str, float] | None = None) -> list[IPSLimit]:
    overrides = overrides or {}
    from src.kpi_engine import build_kpi_cards

    cards = {c.label: c.value for c in build_kpi_cards(data)}
    defaults = [
        ("concentracion_inmobiliaria", "Concentración en Bienes Raíces", cards.get("Concentración en Bienes Raíces"), 0.60, "max"),
        ("concentracion_empresas", "Concentración en Empresas (equity)", cards.get("Concentración en Empresas (equity)"), 0.60, "max"),
        ("mayor_propiedad", "Concentración — mayor propiedad individual", cards.get("Concentración — mayor propiedad individual"), 0.15, "max"),
        ("meses_liquidez", "Meses de liquidez pura", cards.get("Meses de liquidez pura"), 3.0, "min"),
        ("apalancamiento", "Apalancamiento (Pasivos / Activos)", cards.get("Apalancamiento (Pasivos / Activos)"), 0.30, "max"),
        ("hhi", "Índice HHI (por clase de activo)", cards.get("Índice HHI (por clase de activo)"), 0.50, "max"),
    ]
    limits = []
    for key, label, current, default_limit, direction in defaults:
        if current is None:
            continue
        limits.append(IPSLimit(key, label, current, overrides.get(key, default_limit), direction))
    return limits
