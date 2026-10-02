"""Exporta el Excel maestro al modelo de datos del Family Office OS (fo-os).

Reutiliza src/data_loader.py (que ya recalcula con LibreOffice y parsea las 13 pestañas)
y emite fo-os/data/real/dataset.json con la forma de `Database` de TypeScript.

Principio: solo se exporta lo que el Excel realmente contiene. Los campos sin fuente
(NOI, ocupación, arriendos, hipotecas por activo, fondos privados, tesis, costo de
adquisición) se omiten en vez de rellenarse con ceros, y se registran en `dataCoverage`
para que la aplicación pueda decir explícitamente qué falta y por qué un módulo está vacío.

Uso:  python3 scripts/export_real_dataset.py
"""

from __future__ import annotations

import json
import math
import re
import sys
import unicodedata
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from src.data_loader import load_fo_data  # noqa: E402

OUT_PATH = Path(__file__).resolve().parent.parent / "fo-os" / "data" / "real" / "dataset.json"

ROOT_ENTITY_ID = "fo"


def slug(text: str) -> str:
    norm = unicodedata.normalize("NFD", str(text))
    norm = "".join(c for c in norm if unicodedata.category(c) != "Mn")
    norm = re.sub(r"[^a-zA-Z0-9]+", "-", norm).strip("-").lower()
    return norm or "sin-nombre"


def num(value) -> float | None:
    if value is None:
        return None
    try:
        f = float(value)
    except (TypeError, ValueError):
        return None
    return None if math.isnan(f) else f


def clean(value) -> str | None:
    if value is None:
        return None
    s = str(value).strip()
    return s or None


# --------------------------------------------------------------------------- #
# Entidades: el Excel no tiene un grafo societario entidad→entidad, solo el titular
# de cada activo y el % de participación de la familia sobre él. Se modela como una
# estructura de un nivel: Family Office → titular (100%), y el activo cuelga del
# titular con el % de participación que trae el Excel. Eso reproduce exactamente el
# "Valor Atribuible" que ya calcula la planilla, sin inventar sociedades intermedias.
# --------------------------------------------------------------------------- #

TITULAR_ALIASES = {
    "cristian armas & paula alvear": "Cristián Armas & Paula Alvear",
    "cristián armas & paula alvear": "Cristián Armas & Paula Alvear",
    "praga": "Praga S.A.",
    "praga s.a.": "Praga S.A.",
    "nv": "NV SPA",
    "nv spa": "NV SPA",
    "nv punta lobos": "NV Punta Lobos",
    "meme spa": "Inversiones Meme Ltda",
    "inversiones meme ltda": "Inversiones Meme Ltda",
    "fo": "Family Office",
    "familia": "Family Office",
    "familia (caja)": "Family Office",
    "san salvador": "Inversiones San Salvador SPA",
}


def canonical_titular(raw) -> str:
    name = clean(raw) or "Sin titular identificado"
    return TITULAR_ALIASES.get(name.lower(), name)


class EntityRegistry:
    """Registra entidades a medida que aparecen y crea la participación FO → entidad."""

    def __init__(self) -> None:
        self.entities: dict[str, dict] = {
            ROOT_ENTITY_ID: {
                "id": ROOT_ENTITY_ID,
                "name": "Family Office",
                "entityType": "FAMILY_OFFICE",
                "country": "CL",
                "currency": "CLP",
                "description": "Perímetro consolidado: núcleo familiar + hijos.",
            }
        }
        self.ownerships: list[dict] = []

    def ensure(self, name: str, entity_type: str = "HOLDING", tax_id: str | None = None) -> str:
        canonical = canonical_titular(name)
        if canonical == "Family Office":
            return ROOT_ENTITY_ID
        eid = f"e-{slug(canonical)}"
        if eid not in self.entities:
            self.entities[eid] = {
                "id": eid,
                "name": canonical,
                "entityType": entity_type,
                "country": "CL",
                "currency": "CLP",
                **({"taxId": tax_id} if tax_id else {}),
            }
            # El Excel no informa el % de la familia sobre cada sociedad titular; el
            # porcentaje conocido está a nivel de activo. Se registra 100% aquí para no
            # duplicar el descuento, que ya viene aplicado en el activo.
            self.ownerships.append(
                {
                    "id": f"o-{slug(canonical)}",
                    "ownerEntityId": ROOT_ENTITY_ID,
                    "ownedEntityId": eid,
                    "directOwnershipPercentage": 1,
                    "votingOwnershipPercentage": 1,
                    "effectiveDate": "2026-01-01",
                }
            )
        elif tax_id and not self.entities[eid].get("taxId"):
            self.entities[eid]["taxId"] = tax_id
        return eid


RENT_MAPPING_PATH = Path(__file__).resolve().parent / "rent_mapping.json"


def _add_months(iso: str, months: int) -> str:
    y, m, d = (int(x) for x in iso.split("-"))
    total = (y * 12 + (m - 1)) + months
    return date(total // 12, total % 12 + 1, min(d, 28)).isoformat()


def _rent_streams(transactions: list[dict], assets: list[dict], as_of: str, gaps: list[dict]) -> list[dict]:
    """Arriendo anual (próximos 12 meses desde la fecha de corte) por concepto, con las
    propiedades a las que se vincula y el estado de ese vínculo."""
    mapping = json.loads(RENT_MAPPING_PATH.read_text(encoding="utf-8"))["streams"]
    horizon = _add_months(as_of, 12)
    window = [t for t in transactions if as_of < t["date"] <= horizon and t["type"] == "INGRESO"]
    real_estate = [a for a in assets if a["assetClass"] == "INMOBILIARIO"]
    streams = []
    claimed: set[str] = set()
    for i, entry in enumerate(mapping):
        concept = entry["concept"].upper()
        matched = [t for t in window if concept in t["description"].upper()]
        if not matched:
            continue
        asset_ids = [
            a["id"] for a in real_estate if any(m.lower() in a["name"].lower() for m in entry["match"])
        ]
        claimed.update(t["id"] for t in matched)
        streams.append(
            {
                "id": f"rent-{i}",
                "concept": entry["concept"],
                "annualRent": round(sum(t["amount"] for t in matched)),
                "assetIds": asset_ids,
                "status": entry["status"],
                "note": entry.get("note"),
            }
        )
    # Cualquier arriendo del flujo que el mapeo no cubra se informa en vez de perderse.
    leftovers = {}
    for t in window:
        if t["category"] == "ARRIENDOS" and t["id"] not in claimed:
            leftovers[t["description"]] = leftovers.get(t["description"], 0) + t["amount"]
    for description, amount in leftovers.items():
        streams.append(
            {
                "id": f"rent-extra-{slug(description)[:24]}",
                "concept": description,
                "annualRent": round(amount),
                "assetIds": [],
                "status": "SIN_IDENTIFICAR",
                "note": "Concepto de arriendo del flujo sin vínculo en scripts/rent_mapping.json.",
            }
        )
    unidentified = [s for s in streams if s["status"] == "SIN_IDENTIFICAR"]
    if unidentified:
        total = sum(s["annualRent"] for s in unidentified)
        names = ", ".join(f"{s['concept']} (${s['annualRent'] / 1e6:,.1f} MM)" for s in unidentified)
        gaps.append(
            {
                "module": "Flujo de caja",
                "field": "Arriendos sin propiedad identificada",
                "detail": f"${total / 1e6:,.1f} MM/año de arriendo no calza con ninguna propiedad cargada: {names}. O faltan propiedades en Bienes_Raices, o llevan otro nombre.",
            }
        )
    return streams


def build() -> dict:
    d = load_fo_data()
    # Fecha a la que corresponden los datos: la declara el Excel. La de procesamiento
    # (`fecha_carga`) solo se usa de respaldo y se deja constancia en las brechas.
    corte_balance = d.supuestos.get("fecha_corte_balance")
    as_of = corte_balance or d.fecha_carga[:10]
    reg = EntityRegistry()
    assets: list[dict] = []
    gaps: list[dict] = []

    def gap(module: str, field: str, detail: str) -> None:
        gaps.append({"module": module, "field": field, "detail": detail})

    # ---------------- Bienes Raíces ---------------- #
    br = d.bienes_raices
    sin_valor: list[str] = []
    for _, row in br.iterrows():
        value = num(row["Valor Balance (CLP)"])
        if value is None:
            sin_valor.append(clean(row["Dirección"]) or f"Propiedad {row['ID']}")
            continue
        name = clean(row["Dirección"]) or f"Propiedad {row['ID']}"
        entity_id = reg.ensure(row["Titular"] or "Sin titular identificado", "SPV")
        assets.append(
            {
                "id": f"re-{row['ID']}-{slug(name)[:40]}",
                "name": name,
                "assetClass": "INMOBILIARIO",
                "subAssetClass": clean(row["Tipo"]) or "Inmueble",
                "sector": "INMOBILIARIO",
                "country": "CL",
                "currency": "CLP",
                "currentValue": value,
                "ownerEntityId": entity_id,
                "ownershipPercentage": num(row["% Participación"]) or 1,
                "valuationMethod": clean(row["Fuente valor usado"]) or "Sin método declarado",
                # Tasación comercial = TASADO; "avalúo fiscal × factor" es un proxy. La fecha de
                # la tasación no está en el Excel, así que no se informa una.
                "valuationQuality": "TASADO" if num(row["Tasación Comercial (CLP)"]) is not None else "PROXY",
                "liquid": False,
                "location": ", ".join(x for x in [clean(row["Dirección"]), clean(row["Comuna"])] if x) or "Sin dirección",
                "city": clean(row["Comuna"]) or "Sin comuna",
                "tenants": [],
                **({"surfaceM2": num(row["Sup. (m²)"])} if num(row["Sup. (m²)"]) else {}),
                "sourceNotes": {
                    "avaluoFiscal": num(row["Avalúo Fiscal (CLP)"]),
                    "tasacionComercial": num(row["Tasación Comercial (CLP)"]),
                    "rolSII": clean(row["Rol SII"]),
                    "participacionConfirmada": bool(row["% Participación confirmado"]),
                },
            }
        )
    if sin_valor:
        gap("Inmobiliario", "Propiedades sin valor", f"No se cargaron por no tener tasación ni avalúo: {', '.join(sin_valor)}.")
    proxies = sum(1 for a in assets if a["assetClass"] == "INMOBILIARIO" and a.get("valuationQuality") == "PROXY")
    if proxies:
        gap("Inmobiliario", "Tasaciones comerciales", f"{proxies} de {sum(1 for a in assets if a['assetClass'] == 'INMOBILIARIO')} propiedades se valoran con avalúo fiscal × factor, un proxy; el valor real puede diferir.")
    if not corte_balance:
        gap("General", "Fecha de corte", "El Excel no declara fecha de corte del balance; se usó la fecha de procesamiento, que no es la fecha de los datos.")
    if not d.supuestos.get("tc_usd_clp"):
        gap("General", "Tipo de cambio USD/CLP", "La hoja Supuestos lo marca como PENDIENTE; sin él no se puede medir la exposición en dólares.")
    gap("Inmobiliario", "NOI, arriendos, ocupación, WALE, arrendatarios", "El Excel no registra datos operacionales de las propiedades, solo su valorización.")
    gap("Inmobiliario", "Costo de adquisición", "No hay costo histórico por propiedad, por lo que no se puede calcular ganancia no realizada ni IRR.")
    gap("Deuda", "Créditos hipotecarios por activo", "El único pasivo del Excel son patentes comerciales morosas; no hay deuda asociada a los inmuebles, así que no hay LTV ni DSCR.")

    # ---------------- Empresas ---------------- #
    for _, row in d.empresas.iterrows():
        name = clean(row["Empresa"])
        if not name:
            continue
        pct = num(row["% Participación (provisorio)"])
        patrimonio = num(row["Patrimonio Contable (CLP)"])
        equity = num(row["Equity Value Estimado (CLP)"]) or 0
        # `currentValue` es el valor del 100% de la sociedad; el % va aparte. Usar el
        # equity value aquí volvería a aplicar el descuento de participación.
        value_100 = patrimonio if patrimonio is not None else (equity / pct if pct else equity)
        entity_id = reg.ensure(name, "OPERATING_COMPANY", clean(row["RUT"]) if row["RUT confirmado"] else None)
        assets.append(
            {
                "id": f"co-{slug(name)[:44]}",
                "name": name,
                "assetClass": "EMPRESAS_PRIVADAS",
                "subAssetClass": "Participación societaria",
                "sector": "DIVERSIFICADO",
                "country": "CL",
                "currency": "CLP",
                "currentValue": value_100,
                "ownerEntityId": entity_id,
                "ownershipPercentage": pct if pct is not None else 1,
                "valuationMethod": "% participación × patrimonio contable" if equity else "Sin EEFF cargados",
                "valuationQuality": "CONTABLE" if patrimonio is not None else "SIN_DATO",
                "liquid": False,
                "history": [],
                "sourceNotes": {
                    "rut": clean(row["RUT"]),
                    "rutConfirmado": bool(row["RUT confirmado"]),
                    "patrimonioContable": num(row["Patrimonio Contable (CLP)"]),
                    "participacionInformada": pct is not None,
                },
            }
        )
    sin_eeff = int(d.empresas["Patrimonio Contable (CLP)"].isna().sum())
    gap("Empresas", "Ingresos, EBITDA, deuda neta, dividendos", "El Excel solo registra % de participación y patrimonio contable; no hay estados financieros.")
    gap("Empresas", "Patrimonio contable", f"{sin_eeff} de {len(d.empresas)} sociedades no tienen EEFF cargados, por lo que su equity value es $0 y el patrimonio real es mayor al mostrado.")

    # ---------------- Liquidez ---------------- #
    # El Excel consolida solo el núcleo familiar + hijos (decisión declarada del cliente):
    # las cuentas de sociedades y de personas fuera del núcleo no suman al patrimonio.
    # Se respeta ese perímetro para que los totales concilien con el Balance del Excel.
    for i, row in d.liquidez.detalle.iterrows():
        value = num(row["Monto (CLP)"])
        name = clean(row["Cuenta/Instrumento"])
        perimetro = clean(row["Perímetro"]) or "Familia"
        if value is None or not name or perimetro != "Familia":
            continue
        entity_id = reg.ensure(row["Titular/Entidad"] or "Family Office", "HOLDING")
        assets.append(
            {
                "id": f"cash-{i}-{slug(name)[:36]}",
                "name": name,
                "assetClass": "CAJA",
                "subAssetClass": "Cuenta o efectivo",
                "sector": "FINANCIERO",
                "country": "CL",
                "currency": "CLP",
                "currentValue": value,
                "ownerEntityId": entity_id,
                "ownershipPercentage": 1,
                "valuationMethod": "Saldo declarado",
                "lastValuationDate": as_of,
                "valuationQuality": "SALDO",
                "liquid": True,
                "bank": clean(row["Titular/Entidad"]) or "Sin identificar",
                "accountType": perimetro,
                "sourceNotes": {"perimetro": perimetro, "nota": clean(row["Nota"])},
            }
        )

    # ---------------- Inversiones financieras ---------------- #
    for i, row in d.inversiones.detalle.iterrows():
        value = num(row["Monto (CLP)"])
        name = clean(row["Cuenta/Instrumento"])
        perimetro = clean(row["Perímetro"]) or "Familia"
        if value is None or not name or perimetro != "Familia":
            continue
        entity_id = reg.ensure(row["Titular/Entidad"] or "Family Office", "HOLDING")
        assets.append(
            {
                "id": f"fin-{i}-{slug(name)[:36]}",
                "name": name,
                "assetClass": "MERCADOS_PUBLICOS",
                "subAssetClass": clean(row["Nota"]) or "Instrumento financiero",
                "sector": "FINANCIERO",
                "country": "CL",
                "currency": "CLP",
                "currentValue": value,
                "ownerEntityId": entity_id,
                "ownershipPercentage": 1,
                "valuationMethod": "Valor declarado",
                "lastValuationDate": as_of,
                "valuationQuality": "SALDO",
                "liquid": True,
                "ticker": slug(name)[:12].upper(),
                "issuer": clean(row["Titular/Entidad"]) or "Sin identificar",
                "sourceNotes": {"perimetro": perimetro, "nota": clean(row["Nota"])},
            }
        )
    gap("Mercados Públicos", "Cantidad, precio, dividendos, costo", "El Excel registra el monto total de cada posición, no el número de unidades ni su precio.")
    gap("Mercados Privados", "Fondos, capital calls, NAV, vintage", "El Excel no registra compromisos en fondos privados, por lo que MOIC, DPI, TVPI e IRR no son calculables.")

    # ---------------- Otras partidas ---------------- #
    for i, row in d.otras_partidas.cuentas_por_cobrar.iterrows():
        value = num(row["Monto (CLP)"])
        if not value:
            continue
        name = clean(row["Concepto"]) or f"Cuenta por cobrar {i}"
        assets.append(
            {
                "id": f"oth-cxc-{i}",
                "name": name,
                "assetClass": "OTROS",
                "subAssetClass": "Cuenta por cobrar operacional",
                "sector": "FINANCIERO",
                "country": "CL",
                "currency": "CLP",
                "currentValue": value,
                "ownerEntityId": ROOT_ENTITY_ID,
                "ownershipPercentage": 1,
                "valuationMethod": "Valor nominal",
                "lastValuationDate": as_of,
                "valuationQuality": "SALDO",
                "liquid": False,
            }
        )
    for i, row in d.otras_partidas.otros_menores.iterrows():
        value = num(row["Monto (CLP)"])
        if not value:
            continue
        name = clean(row["Concepto"]) or f"Otro activo {i}"
        assets.append(
            {
                "id": f"oth-menor-{i}",
                "name": name,
                "assetClass": "OTROS",
                "subAssetClass": "Activo menor",
                "sector": "DIVERSIFICADO",
                "country": "CL",
                "currency": "CLP",
                "currentValue": value,
                "ownerEntityId": ROOT_ENTITY_ID,
                "ownershipPercentage": 1,
                "valuationMethod": "Valor declarado",
                "lastValuationDate": as_of,
                "valuationQuality": "SALDO",
                "liquid": False,
            }
        )

    # ---------------- Pasivos ---------------- #
    loans = []
    for i, row in d.pasivos.iterrows():
        balance = num(row["Deuda (CLP)"])
        empresa = clean(row["Empresa"])
        if not balance or not empresa:
            continue
        entity_id = reg.ensure(empresa, "OPERATING_COMPANY", clean(row["RUT"]))
        loans.append(
            {
                "id": f"loan-patente-{i}",
                "name": f"Patente comercial morosa — {empresa}",
                "bank": f"Municipalidad de {clean(row['Comuna'])}" if clean(row["Comuna"]) else "Municipalidad",
                "borrowerEntityId": entity_id,
                "balance": balance,
                "originalAmount": balance,
                "currency": "CLP",
                "rate": 0,
                "rateType": "FIJA",
                "amortization": "BULLET",
                "amortizationYears": 0,
                # El Excel registra la patente como morosa, no su fecha de vencimiento: no se
                # inventa una. `delinquent` es lo que realmente sabemos.
                "delinquent": True,
                "annualDebtService": balance,
            }
        )
    gap("Deuda", "Tasas, plazos y calendario de vencimientos", "Las patentes morosas son deuda exigible sin tasa ni cuadro de amortización declarados.")

    # ---------------- Flujo de caja ---------------- #
    fc = d.flujo_caja
    transactions = []
    seq = 0

    def add_tx(month, category, tx_type, amount, description):
        nonlocal seq
        if amount is None or abs(amount) < 1:
            return
        seq += 1
        transactions.append(
            {
                "id": f"tx-{seq}",
                "date": f"{month.isoformat()[:7]}-15",
                "entityId": ROOT_ENTITY_ID,
                "account": "Flujo consolidado",
                "category": category,
                "type": tx_type,
                "amount": abs(amount),
                "currency": "CLP",
                "description": description,
                "realized": month.isoformat()[:10] <= as_of,
            }
        )

    INCOME_MAP = [
        (("ARRIENDO",), "ARRIENDOS"),
        (("PENSION", "SUELDO", "CLASES"), "OTROS_INGRESOS"),
        (("RETIRO", "PAGOS", "PAGO"), "DIVIDENDOS"),
        (("INTERES",), "INTERESES"),
    ]
    EXPENSE_MAP = [
        (("DIVIDENDO", "CREDITO", "PAGO DIVIDENDO"), "SERVICIO_DEUDA"),
        (("CONTRIBUCION", "IMPUESTO", "PATENTE"), "IMPUESTOS"),
        (("COMPRA", "ARREGLO", "REMODEL"), "CAPEX"),
        (("HONORARIO", "CONTABILIDAD", "FO"), "GASTOS_FAMILY_OFFICE"),
    ]

    def map_category(label: str, is_income: bool) -> str:
        up = (label or "").upper()
        table = INCOME_MAP if is_income else EXPENSE_MAP
        for keys, cat in table:
            if any(k in up for k in keys):
                return cat
        return "OTROS_INGRESOS" if is_income else "GASTOS_OPERACIONALES"

    for concept, series in fc.ingresos.iterrows():
        label = str(concept).strip()
        category = map_category(label, True)
        for month, value in series.items():
            add_tx(month, category, "INGRESO", num(value), label)
    for concept, series in fc.egresos.iterrows():
        label = str(concept).strip()
        category = map_category(label, False)
        for month, value in series.items():
            add_tx(month, category, "EGRESO", num(value), label)

    # ---------------- Ensamblado ---------------- #
    balance = d.balance

    # ---------------- Flujos de arriendo ---------------- #
    # El flujo de caja trae arriendos por concepto, no por propiedad. Se vinculan por nombre
    # con un mapeo editable (scripts/rent_mapping.json) y cada vínculo declara su estado:
    # nada se reparte entre propiedades por la fuerza.
    rent_streams = _rent_streams(transactions, assets, as_of, gaps)

    # Partidas del flujo que no se comportan como caja operativa. No se excluyen en silencio
    # (eso sería decidir por el cliente): se informan con su monto para que se revisen.
    horizon = _add_months(as_of, 12)
    in_window = [t for t in transactions if as_of < t["date"] <= horizon]
    inflacion = sum(t["amount"] for t in in_window if "EFECTO INFLACION" in t["description"].upper().replace("Ó", "O"))
    if inflacion:
        gaps.append(
            {
                "module": "Flujo de caja",
                "field": "'Efecto Inflación' contado como ingreso",
                "detail": f"${inflacion / 1e6:,.1f} MM en los próximos 12 meses figuran como ingreso, pero un ajuste por inflación no es caja. Infla los ingresos y el flujo neto proyectado.",
            }
        )
    valle = sum(t["amount"] for t in in_window if "VALLE CENTRO" in t["description"].upper())
    if valle:
        gaps.append(
            {
                "module": "Flujo de caja",
                "field": "Cuotas de 'Valle Centro' como dividendos",
                "detail": f"${valle / 1e6:,.1f} MM/año de un pago en 110 cuotas se clasifican como dividendos; parece una cuenta por cobrar, no un retiro de empresa.",
            }
        )

    net_worth_history = []
    for _, row in fc.resumen_anual.iterrows():
        horizonte = clean(row["Horizonte"]) or ""
        year_match = re.search(r"(20\d\d)", horizonte)
        if not year_match:
            continue

    persons = [
        {"id": f"p-{slug(r['Persona'])}", "name": r["Persona"], "role": clean(r["Rol"]) or "Miembro", "familyShare": 0}
        for _, r in d.perimetro_nucleo.iterrows()
        if clean(r["Persona"])
    ]

    supuestos = d.supuestos
    dataset = {
        "familyOffice": {
            "id": "fo",
            "name": "Family Office — Grupo Familiar",
            "baseCurrency": "CLP",
            "rootEntityId": ROOT_ENTITY_ID,
            "minimumLiquidityReserve": 0,
            "maxPolicyLTV": 0.65,
        },
        "persons": persons,
        "entities": list(reg.entities.values()),
        "ownerships": reg.ownerships,
        "assets": assets,
        "loans": loans,
        "creditLines": [],
        "transactions": transactions,
        "valuations": [],
        "capitalCalls": [],
        "distributions": [],
        "commitments": [],
        "documents": [],
        "theses": [],
        "decisions": [],
        "deals": [],
        "netWorthHistory": net_worth_history,
        "rentStreams": rent_streams,
        "fx": {
            "UF": supuestos.get("valor_uf") or 0,
            "USD": supuestos.get("tc_usd_clp") or 0,
            "asOf": as_of,
        },
        "allocationTargets": [],
        "asOf": as_of,
        "dataCoverage": {
            "source": "FO_Master_Consolidado.xlsx",
            "loadedAt": d.fecha_carga,
            "balanceAsOf": corte_balance,
            "cashflowAsOf": d.supuestos.get("fecha_corte_flujo"),
            "gaps": gaps,
            "excelTotals": {
                "totalActivos": balance.total_activos,
                "totalPasivos": balance.total_pasivos,
                "patrimonioNeto": balance.patrimonio_neto,
            },
            "reconciliation": _reconciliation(balance, assets),
        },
    }
    return dataset


# Mapeo entre las líneas del Balance del Excel y las clases de activo que exporta este
# script. Permite comparar línea por línea en vez de dar un único total agregado.
_BALANCE_TO_CLASS = {
    "Liquidez": ("CAJA",),
    "Inversiones Financieras": ("MERCADOS_PUBLICOS", "RENTA_FIJA"),
    "Bienes Raíces": ("INMOBILIARIO",),
    "Empresas (Equity)": ("EMPRESAS_PRIVADAS",),
    "Otros Activos (CxC + menores)": ("OTROS",),
}


def _reconciliation(balance, assets: list[dict]) -> list[dict]:
    """Compara cada línea del Balance del Excel contra lo efectivamente cargado.

    Una diferencia no es necesariamente un error del export: el Balance del Excel puede
    estar desactualizado respecto del detalle de sus propias pestañas. Se informa el número
    en vez de esconderlo, para que quien revise decida cuál de los dos corregir.
    """
    rows = []
    for _, line in balance.distribucion_activos.iterrows():
        concepto = str(line["Clase de Activo"]).strip()
        classes = _BALANCE_TO_CLASS.get(concepto)
        if classes is None:
            continue
        app_value = sum(a["currentValue"] * a["ownershipPercentage"] for a in assets if a["assetClass"] in classes)
        excel_value = float(line["Monto (CLP)"])
        rows.append(
            {
                "concept": concepto,
                "excel": excel_value,
                "app": app_value,
                "difference": app_value - excel_value,
            }
        )
    return rows


def main() -> None:
    dataset = build()
    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(json.dumps(dataset, ensure_ascii=False, indent=1), encoding="utf-8")

    activos = sum(a["currentValue"] * a["ownershipPercentage"] for a in dataset["assets"])
    pasivos = sum(l["balance"] for l in dataset["loans"])
    excel = dataset["dataCoverage"]["excelTotals"]
    print(f"Escrito {OUT_PATH.relative_to(OUT_PATH.parent.parent.parent)}")
    print(f"  entidades      {len(dataset['entities'])}")
    print(f"  activos        {len(dataset['assets'])}")
    print(f"  créditos       {len(dataset['loans'])}")
    print(f"  movimientos    {len(dataset['transactions'])}")
    print(f"  brechas datos  {len(dataset['dataCoverage']['gaps'])}")
    print()
    print("CONCILIACIÓN CONTRA EL EXCEL")
    print(f"  activos exportados   ${activos:,.0f}")
    print(f"  activos en el Excel  ${excel['totalActivos']:,.0f}")
    print(f"  diferencia           ${activos - excel['totalActivos']:,.0f}")
    print(f"  pasivos exportados   ${pasivos:,.0f}  (Excel ${excel['totalPasivos']:,.0f})")


if __name__ == "__main__":
    main()
