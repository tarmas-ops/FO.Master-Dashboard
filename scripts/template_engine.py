"""Lectura de la plantilla y lógica de cálculo de referencia (Python).

La plantilla es un libro de ENTRADAS: no tiene fórmulas. Todo lo que se calcula (patrimonio,
forecast, real vs forecast) se define aquí, y es lo que debe replicar el dashboard
(`fo-os/lib/calculos`) con una prueba de paridad contra este módulo.

Reglas:
  * Ausencia no es cero: un valor o un % vacío da `None`, nunca 0.
  * Un mes <= `Ultimo_Mes_Cerrado` es REAL: lee Flujo_Real; si una partida no tiene movimientos
    ese mes, queda en `None` (no en 0). Los meses posteriores son FORECAST: salen de Supuestos (forecast).
  * Una fila de Supuestos rige de `desde` a `hasta` (inclusive). Para cambiar un supuesto no se
    edita la fila: se le pone `hasta` y se agrega otra.
"""

from __future__ import annotations

import re
from datetime import date, datetime
from pathlib import Path

import openpyxl

ACTIVOS_SUMAN = ("Caja", "Inversiones financieras", "Bienes raíces", "Empresas", "Otros activos")
CLASES_DEUDA_SUMAN = ("Deuda – Hipotecaria", "Deuda – Patente morosa", "Deuda – Otra")


# ---------------------------------------------------------------- lectura
def _blank(v):
    return v is None or (isinstance(v, str) and not v.strip())


def read_table(ws, header_row: int = 1) -> list[dict]:
    """Filas de una pestaña como diccionarios por encabezado. Se detiene en filas sin ninguna celda."""
    heads = [c.value for c in ws[header_row]]
    out = []
    for row in ws.iter_rows(min_row=header_row + 1, values_only=True):
        if all(_blank(v) for v in row):
            continue
        out.append({h: (None if _blank(v) else v) for h, v in zip(heads, row) if h})
    return out


def named_value(wb, name):
    ref = wb.defined_names[name].attr_text
    sheet, cell = ref.split("!")
    return wb[sheet.strip("'")][cell.replace("$", "")].value


ADJ_CAT = "Ajuste por inflación (no es caja)"
FLOW_FIRST_COL = 5  # columna E: primer mes en Flujo_Plan / Flujo_Real


def read_flow_matrix(ws, n_months: int = 60) -> dict:
    """Flujo de caja en formato contable: una fila por partida (tipo en col. C), un mes por columna.

    Devuelve las partidas con su serie (None = celda vacía) y las filas de totales por su rótulo.
    Las filas «(nueva partida)» sin usar se ignoran. Para leer Flujo_Plan hay que haberlo calculado
    antes (el archivo debe traer valores guardados).
    """
    months = [first_of_month(ws.cell(4, FLOW_FIRST_COL + k).value) for k in range(n_months)]
    partidas, totales = [], {}
    for row in ws.iter_rows(min_row=5, values_only=True):
        a, b, c = row[0], row[1], row[2]
        serie = [row[FLOW_FIRST_COL - 1 + k] for k in range(n_months)]
        if a is None:
            continue
        if c in ("Ingreso", "Egreso"):
            if str(a).startswith("(nueva partida)"):
                continue
            partidas.append(dict(partida=str(a), categoria=b, tipo=c, serie=[v if isinstance(v, (int, float)) else None for v in serie]))
        else:
            totales[str(a)] = [v if isinstance(v, (int, float)) else None for v in serie]
    return dict(months=months, partidas=partidas, totales=totales)


def real_rows(matrix: dict) -> list[dict]:
    """Flujo_Real (matriz) → lista de movimientos para `monthly_flow`."""
    out = []
    for p in matrix["partidas"]:
        for m, v in zip(matrix["months"], p["serie"]):
            if v is not None:
                out.append({"Fecha": m, "Partida": p["partida"], "Tipo": p["tipo"], "Monto": v, "Categoría": p["categoria"]})
    return out


def read_template(path: Path) -> dict:
    """Lee la plantilla. Pasar el archivo con valores calculados (recalculado en Excel/LibreOffice)."""
    wb = openpyxl.load_workbook(path, data_only=True)
    params = {n: named_value(wb, n) for n in wb.defined_names}
    real_m = read_flow_matrix(wb["Flujo_Real"])
    return dict(
        params=params,
        estructura=read_table(wb["Estructura"]),
        patrimonio=read_table(wb["Patrimonio"]),
        plan=[r for r in read_table(wb["Supuestos"]) if r.get("Partida")],  # las columnas auxiliares traen valores en filas vacías
        plan_matrix=read_flow_matrix(wb["Flujo_Plan"]),
        real_matrix=real_m,
        real=real_rows(real_m),
        documentos=read_table(wb["Documentos"]),
        historial=read_table(wb["Historial"]),
        sheetnames=wb.sheetnames,
    )


# ---------------------------------------------------------------- patrimonio
def pct_efectivo(item: dict, estructura_pct: dict):
    """% de la familia sobre el ítem. Si el ítem es una sociedad, el % sale de Estructura."""
    sub = item.get("Sociedad subyacente (ID)")
    if sub:
        return estructura_pct.get(sub)
    return item.get("% familia")


def balance(t: dict) -> dict:
    est_pct = {e["ID"]: e.get("% del dueño") for e in t["estructura"]}
    por_clase: dict[str, float] = {}
    sin_valor: list[str] = []
    contingente = provisiones = deuda = 0.0
    for it in t["patrimonio"]:
        clase, valor = it["Clase"], it.get("Valor 100% (CLP)")
        familia = (it.get("Perímetro") or "Familia") == "Familia"
        pct = pct_efectivo(it, est_pct)
        atrib = None if (valor is None or pct is None) else valor * pct
        if clase in ACTIVOS_SUMAN and familia:
            if atrib is None:
                sin_valor.append(it["ID"])
            else:
                por_clase[clase] = por_clase.get(clase, 0.0) + atrib
        elif clase == "Activo contingente" and atrib is not None:
            contingente += atrib
        elif clase == "Provisión (memo)" and valor is not None:
            provisiones += valor
        elif clase in CLASES_DEUDA_SUMAN and familia and valor is not None:
            deuda += valor
    activos = sum(por_clase.values())
    return dict(por_clase=por_clase, activos=activos, deuda=deuda, neto=activos - deuda, contingente=contingente,
                provisiones=provisiones, ajustado=activos - deuda + contingente, prudente=activos - deuda - provisiones,
                sin_valor=sin_valor)


# ---------------------------------------------------------------- flujo
def first_of_month(d) -> date:
    if isinstance(d, datetime):
        d = d.date()
    return date(d.year, d.month, 1)


def add_months(d: date, n: int) -> date:
    k = d.year * 12 + d.month - 1 + n
    return date(k // 12, k % 12 + 1, 1)


def idx(d: date) -> int:
    return d.year * 12 + d.month


def months_from(start, n: int = 60) -> list[date]:
    s = first_of_month(start)
    return [add_months(s, k) for k in range(n)]


def expand_row(row: dict, months: list[date], params: dict) -> list:
    """Serie mensual de una fila de Supuestos. `None` = no se puede calcular (USD sin dólar)."""
    monto, moneda = row.get("Monto"), row.get("Moneda") or "CLP"
    freq, desde = row.get("Frecuencia"), row.get("Desde")
    if monto is None or desde is None:
        return [0.0] * len(months)
    d0 = idx(first_of_month(desde))
    hasta = idx(first_of_month(row["Hasta"])) if row.get("Hasta") else 10**9
    mes_pago = row.get("Mes de pago")
    reaj = row.get("Reajuste") or "NINGUNO"
    tasa = params["IPC_Anual"] if reaj == "IPC" else (row.get("% reajuste anual") or 0.0) if reaj == "FIJO" else 0.0
    mes_reaj = row.get("Mes del reajuste") or 1
    out = []
    for m in months:
        i = idx(m)
        if not (d0 <= i <= hasta):
            out.append(0.0)
            continue
        if freq == "MENSUAL":
            paga = True
        elif freq == "TRIMESTRAL":
            paga = (m.month - mes_pago) % 3 == 0
        elif freq == "SEMESTRAL":
            paga = (m.month - mes_pago) % 6 == 0
        elif freq == "ANUAL":
            paga = m.month == mes_pago
        elif freq == "UNICO":
            paga = i == d0
        else:
            paga = False
        if not paga:
            out.append(0.0)
            continue
        n = max(0, (i - mes_reaj) // 12 - (d0 - mes_reaj) // 12) if tasa else 0
        if moneda == "UF":
            fx = params["UF_Hoy"] * (1 + params["IPC_Anual"]) ** (max(0, i - idx(first_of_month(params["Fecha_Corte"]))) / 12)
        elif moneda == "USD":
            if not params.get("USD_CLP"):
                out.append(None)
                continue
            fx = params["USD_CLP"]
        else:
            fx = 1.0
        out.append(monto * (1 + tasa) ** n * fx)
    return out


def _add(a, b):
    if a is None or b is None:
        return None
    return a + b


def monthly_flow(t: dict, n_months: int = 60) -> dict:
    """Flujo por partida y mes combinando REAL (meses cerrados) y FORECAST.

    Devuelve {"months", "estado" (REAL/FORECAST por mes), "partidas": {(tipo, partida): {"es_caja",
    "categoria", "serie"}}}. En un mes REAL sin movimientos de una partida la serie trae `None`.
    """
    p = t["params"]
    months = months_from(p["Mes_Inicio"], n_months)
    cierre = idx(first_of_month(p["Ultimo_Mes_Cerrado"]))
    estado = ["REAL" if idx(m) <= cierre else "FORECAST" for m in months]
    partidas: dict[tuple, dict] = {}
    for r in t["plan"]:
        key = (r["Tipo"], r["Partida"])
        slot = partidas.setdefault(key, dict(es_caja=r.get("Categoría") != ADJ_CAT, categoria=r.get("Categoría"),
                                             plan=[0.0] * n_months, real=[None] * n_months))
        serie = expand_row(r, months, p)
        slot["plan"] = [_add(a, b) for a, b in zip(slot["plan"], serie)]
    for r in t["real"]:
        if r.get("Monto") is None or r.get("Fecha") is None:
            continue
        key = (r["Tipo"], r["Partida"])
        slot = partidas.setdefault(key, dict(es_caja=r.get("Categoría") != ADJ_CAT, categoria=r.get("Categoría"), plan=[0.0] * n_months, real=[None] * n_months))
        i = idx(first_of_month(r["Fecha"]))
        for k, m in enumerate(months):
            if idx(m) == i:
                slot["real"][k] = (slot["real"][k] or 0.0) + r["Monto"]
    for slot in partidas.values():
        slot["serie"] = [slot["real"][k] if estado[k] == "REAL" else slot["plan"][k] for k in range(n_months)]
    return dict(months=months, estado=estado, partidas=partidas)


def totales(flujo: dict) -> dict:
    """Totales mensuales de caja y de ajustes que no son caja."""
    n = len(flujo["months"])
    ing = [0.0] * n
    egr = [0.0] * n
    aj_i = [0.0] * n
    aj_e = [0.0] * n
    for (tipo, _), s in flujo["partidas"].items():
        for k, v in enumerate(s["serie"]):
            if v is None:
                continue
            tgt = (ing if s["es_caja"] else aj_i) if tipo == "Ingreso" else (egr if s["es_caja"] else aj_e)
            tgt[k] += v
    return dict(ingresos=ing, egresos=egr, neto_caja=[a - b for a, b in zip(ing, egr)],
                ajustes=[a - b for a, b in zip(aj_i, aj_e)],
                neto_original=[(a + c) - (b + d) for a, b, c, d in zip(ing, egr, aj_i, aj_e)])


def desviaciones(t: dict, flujo: dict, umbral: float | None = None) -> list[dict]:
    """Real vs forecast acumulado en los meses cerrados, por partida."""
    umbral = umbral if umbral is not None else t["params"].get("Umbral_Desv", 0.10)
    cerrados = [k for k, e in enumerate(flujo["estado"]) if e == "REAL"]
    out = []
    for (tipo, partida), s in flujo["partidas"].items():
        if not cerrados:
            break
        fc = sum(v for k in cerrados if (v := s["plan"][k]) is not None)
        real = sum(v for k in cerrados if (v := s["real"][k]) is not None)
        dif = real - fc
        senal = "" if (fc == 0 and real == 0) else ("REVISAR" if fc == 0 or abs(dif) / abs(fc) > umbral else "OK")
        out.append(dict(tipo=tipo, partida=partida, forecast=fc, real=real, diferencia=dif,
                        promedio_real=real / len(cerrados), promedio_forecast=fc / len(cerrados), senal=senal))
    return out


# ---------------------------------------------------------------- controles de completitud
def completitud(t: dict) -> list[tuple[str, int]]:
    ids = {e["ID"] for e in t["estructura"]}
    pat = t["patrimonio"]
    b = balance(t)
    docs_req = sum(1 for it in pat if it.get("Método") in ("TASACION", "EEFF") and not it.get("Documento (link)"))
    return [
        ("IDs duplicados en Patrimonio", len(pat) - len({i["ID"] for i in pat})),
        ("Activos que suman al patrimonio sin valor o sin %", len(b["sin_valor"])),
        ("Ítems con titular que no existe en Estructura", sum(1 for i in pat if i.get("Titular (ID)") and i["Titular (ID)"] not in ids)),
        ("Ítems sin titular", sum(1 for i in pat if not i.get("Titular (ID)") and i["Clase"] != "Activo contingente")),
        ("Valores TASACION / EEFF sin documento", docs_req),
        ("Deudas hipotecarias sin saldo", sum(1 for i in pat if i["Clase"] == "Deuda – Hipotecaria" and i.get("Valor 100% (CLP)") is None)),
        ("Filas de Supuestos sin monto o sin «Desde»", sum(1 for r in t["plan"] if r.get("Monto") is None or r.get("Desde") is None)),
        ("Supuestos en USD sin dólar cargado", sum(1 for r in t["plan"] if r.get("Moneda") == "USD") if not t["params"].get("USD_CLP") else 0),
    ]


def clean_name(s: str) -> str:
    return re.sub(r"\s+", " ", str(s)).strip()
