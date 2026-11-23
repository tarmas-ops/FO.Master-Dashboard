"""Genera la plantilla normalizada (opción B) a partir del Excel maestro actual.

Lee el Excel con el mismo lector que usa el dashboard (src/data_loader.py) y el exportador
(scripts/export_real_dataset.py), así que lo que migra es exactamente lo que el dashboard ya
muestra. Escribe un .xlsx con fórmulas vivas (sin números metidos dentro de fórmulas).

Principios de la plantilla:
  * Una fila = un hecho. Las pestañas de eventos (Valorizaciones, Saldos_Pasivos, Movimientos)
    solo crecen; el valor vigente es el de la última fecha.
  * Ausencia no es cero: si no hay valorización, el valor vigente queda vacío, no en 0.
  * El forecast sale de Supuestos_Forecast. Un mes pasa de FORECAST a REAL cuando se mueve
    `Ultimo_Mes_Cerrado` en Parametros; desde entonces ese mes lee Movimientos.
  * Los supuestos no se pisan: se termina la fila vieja (`Hasta`) y se agrega una nueva, de modo
    que se puede comparar lo real contra el supuesto que regía en ese momento.

El archivo generado contiene patrimonio y RUTs reales: se escribe en data/plantilla/, que está
ignorado por git. Este script no contiene ninguna cifra.

Uso:  python3 scripts/build_template.py [ruta_salida.xlsx]
"""

from __future__ import annotations

import json
import math
import sys
from datetime import date
from pathlib import Path

import openpyxl
from openpyxl import Workbook
from openpyxl.formatting.rule import CellIsRule, FormulaRule
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter as CL
from openpyxl.workbook.defined_name import DefinedName
from openpyxl.worksheet.datavalidation import DataValidation

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "scripts"))

from export_real_dataset import build as build_dataset, canonical_titular, slug  # noqa: E402
from src.data_loader import load_fo_data  # noqa: E402

DEFAULT_OUT = ROOT / "data" / "plantilla" / "FO_Plantilla.xlsx"
RENT_MAPPING = ROOT / "fo-os" / "data" / "real" / "rent_mapping.json"

# Capacidad de cada tabla (filas con fórmulas ya puestas). Si una tabla crece más, se copian hacia abajo.
ENT_MAX, PAR_MAX, ACT_MAX, VAL_MAX = 300, 300, 400, 1001
PAS_MAX, SAL_MAX, CAT_MAX, MOV_MAX = 100, 501, 150, 5000
SF_SLOTS = 450
MESES = 60

# ------------------------------------------------------------------ estilos
NAVY, GREY, YELLOW = "1F2A44", "EEF0F4", "FFF4C2"
F_HEAD = Font(bold=True, color="FFFFFF", name="Calibri", size=10)
F_INPUT = Font(color="1F4FD8", name="Calibri", size=10)
F_CALC = Font(color="000000", name="Calibri", size=10)
F_TITLE = Font(bold=True, size=14, color=NAVY, name="Calibri")
F_BOLD = Font(bold=True, name="Calibri", size=10)
FILL_HEAD = PatternFill("solid", fgColor=NAVY)
FILL_CALC = PatternFill("solid", fgColor="5B6478")
FILL_GREY = PatternFill("solid", fgColor=GREY)
FILL_YELLOW = PatternFill("solid", fgColor=YELLOW)
THIN = Side(style="thin", color="D5D9E0")
BORDER = Border(bottom=THIN)
FMT_CLP = '#,##0;[Red]-#,##0;"–"'
FMT_PCT = "0.0%"
FMT_DATE = "dd-mm-yyyy"
FMT_MES = "mmm-yy"


def clean(value):
    if value is None:
        return None
    if isinstance(value, float) and math.isnan(value):
        return None
    s = str(value).strip()
    return s or None


def num(value):
    try:
        f = float(value)
    except (TypeError, ValueError):
        return None
    return None if math.isnan(f) else f


def iso(text):
    return date.fromisoformat(text[:10]) if text else None


def first_of_month(d: date) -> date:
    return date(d.year, d.month, 1)


def prev_month(d: date) -> date:
    return date(d.year - 1, 12, 1) if d.month == 1 else date(d.year, d.month - 1, 1)


# ------------------------------------------------------------------ listas
LISTAS = {
    "Tipo_Entidad": ["Family Office", "Persona", "Titularidad conjunta", "Sociedad operativa", "Sociedad patrimonial", "Otro"],
    "Perimetro_Entidad": ["Núcleo", "Fuera", "Sociedad"],
    "Clase_Activo": ["Caja", "Inversiones financieras", "Bienes raíces", "Empresas", "Otros activos", "Activo contingente"],
    "Liquidez": ["Inmediata", "Corta (≤ 10 días)", "Ilíquido"],
    "Perimetro_Activo": ["Familia", "Empresa", "Fuera", "Pendiente"],
    "Metodo": ["TASACION", "EEFF", "SALDO", "DECLARADO", "ESTIMADO"],
    "Moneda": ["CLP", "UF", "USD"],
    "Si_No": ["SI", "NO"],
    "Estado_Activo": ["Vigente", "Vendido"],
    "Tipo_Pasivo": ["Hipotecario", "Consumo", "Patente morosa", "Factoring", "Provisión", "Otro"],
    "Estado_Pasivo": ["Vigente", "Moroso", "Pagado"],
    "Tipo_Tasa": ["Fija", "Variable"],
    "Tipo_Concepto": ["INGRESO", "EGRESO"],
    "Frecuencia": ["MENSUAL", "TRIMESTRAL", "SEMESTRAL", "ANUAL", "UNICO"],
    "Reajuste": ["NINGUNO", "IPC", "FIJO"],
    "Estado_Movimiento": ["DEVENGADO", "PAGADO"],
    "Estado_Vinculo": ["CONFIRMADO", "PROPUESTO", "SIN_IDENTIFICAR"],
    "Tipo_Documento": ["Tasación", "Cartola", "Factura de arriendo", "Factura de servicio", "Estado financiero", "Memo de empresa", "Certificado de deuda", "Otro"],
    "Estado_Documento": ["Recibido", "Leído", "Aprobado", "Rechazado"],
    "Destino": ["Valorizaciones", "Saldos_Pasivos", "Movimientos", "Supuestos_Forecast"],
    "Estado_Propuesta": ["PENDIENTE", "APROBADA", "RECHAZADA"],
}

# Categoría de cada concepto del flujo → categoría equivalente que ya entiende el dashboard.
CATEGORIAS = [
    ("Arriendos", "ARRIENDOS"),
    ("Retiros y dividendos de empresas", "DIVIDENDOS"),
    ("Pensiones y remuneraciones", "OTROS_INGRESOS"),
    ("Intereses", "INTERESES"),
    ("Cobro de cuotas por cobrar", "OTROS_INGRESOS"),
    ("Otros ingresos", "OTROS_INGRESOS"),
    ("Servicio de deuda", "SERVICIO_DEUDA"),
    ("Impuestos y contribuciones", "IMPUESTOS"),
    ("Capex y arreglos", "CAPEX"),
    ("Honorarios y asesorías", "GASTOS_FAMILY_OFFICE"),
    ("Gastos de propiedades", "GASTOS_OPERACIONALES"),
    ("Servicios básicos", "GASTOS_OPERACIONALES"),
    ("Vivienda", "GASTOS_OPERACIONALES"),
    ("Hogar y familia", "GASTOS_OPERACIONALES"),
    ("Salud", "GASTOS_OPERACIONALES"),
    ("Seguros", "GASTOS_OPERACIONALES"),
    ("Transporte", "GASTOS_OPERACIONALES"),
    ("Ocio y viajes", "GASTOS_OPERACIONALES"),
    ("Retiros de empresas (egreso)", "GASTOS_OPERACIONALES"),
    ("Otros gastos", "GASTOS_OPERACIONALES"),
    ("Ajuste por inflación (no es caja)", "AJUSTE_NO_CAJA"),
]

# (texto contenido en el concepto en MAYÚSCULAS, categoría). El primero que calza gana.
CATEGORIA_POR_CONCEPTO = [
    ("EFECTO INFLACION", "Ajuste por inflación (no es caja)"),
    ("PAGO DIVIDENDO", "Servicio de deuda"),
    ("DIVIDENDOS CONSTANTINO", "Servicio de deuda"),
    ("PENSIONES", "Pensiones y remuneraciones"),
    ("SUELDO", "Pensiones y remuneraciones"),
    ("CLASES UNIVERSIDADES", "Pensiones y remuneraciones"),
    ("PAGOS CAPITAL OFFICE", "Retiros y dividendos de empresas"),
    ("INTERESES", "Intereses"),
    ("VALLE CENTRO", "Cobro de cuotas por cobrar"),
    ("ADMINISTRADORA BBRR", "Otros ingresos"),
    ("OTROS INGRESOS", "Otros ingresos"),
    ("ARRIENDO", "Arriendos"),  # ingresos; los egresos "ARRIENDO LA LUMA" se corrigen abajo
    ("CONTRIBUCIONES", "Impuestos y contribuciones"),
    ("IMPUESTOS", "Impuestos y contribuciones"),
    ("PATENTES COMERCIALES", "Impuestos y contribuciones"),
    ("PATENTES AUTOS", "Transporte"),
    ("COMPRA CASA", "Capex y arreglos"),
    ("CASA NUBA", "Capex y arreglos"),
    ("ARREGLOS SANTUARIO", "Capex y arreglos"),
    ("GASTOS CASA SANTUARIO", "Capex y arreglos"),
    ("CONTABILIDAD", "Honorarios y asesorías"),
    ("HONORARIOS", "Honorarios y asesorías"),
    ("CONTRATOS PREVER", "Honorarios y asesorías"),
    ("ADMINISTRACION PROPIEDADES", "Gastos de propiedades"),
    ("COMISIONES PROPIEDAES", "Gastos de propiedades"),
    ("GASTOS COMUNES Y ARREGLOS PROPIEDADES", "Gastos de propiedades"),
    ("AGUA", "Servicios básicos"),
    ("GAS", "Servicios básicos"),
    ("LUZ", "Servicios básicos"),
    ("CELULARES", "Servicios básicos"),
    ("LA LUMA", "Vivienda"),
    ("BODEGA PASEO TAMARUGO", "Vivienda"),
    ("NANAS", "Hogar y familia"),
    ("CAROLA", "Hogar y familia"),
    ("COMIDA", "Hogar y familia"),
    ("PREPARACION CLASES", "Hogar y familia"),
    ("MATRIMONIOS", "Hogar y familia"),
    ("DOCTORES", "Salud"),
    ("FARMACIA", "Salud"),
    ("HOSPITALIZACIONES", "Salud"),
    ("ISAPRES", "Salud"),
    ("SEGUROS", "Seguros"),
    ("DEDUCIBLE SEGUROS", "Seguros"),
    ("AUTOS BENCINA", "Transporte"),
    ("TAGS", "Transporte"),
    ("CLUB DE POLO", "Ocio y viajes"),
    ("OCIO", "Ocio y viajes"),
    ("VIAJES", "Ocio y viajes"),
    ("RETIROS EMPRESAS", "Retiros de empresas (egreso)"),
]


def categoria_de(concepto: str, tipo: str) -> str:
    up = concepto.upper()
    if tipo == "EGRESO" and "ARRIENDO" in up and "LA LUMA" in up:
        return "Vivienda"
    for needle, cat in CATEGORIA_POR_CONCEPTO:
        if needle in up:
            if tipo == "INGRESO" and cat == "Retiros de empresas (egreso)":
                return "Retiros y dividendos de empresas"
            return cat
    return "Otros ingresos" if tipo == "INGRESO" else "Otros gastos"


# ------------------------------------------------------------------ helpers de hoja
def header(ws, row, titles, calc_from=None, widths=None, freeze=True):
    for i, t in enumerate(titles, 1):
        c = ws.cell(row, i, t)
        c.font = F_HEAD
        c.fill = FILL_CALC if (calc_from and i >= calc_from) else FILL_HEAD
        c.alignment = Alignment(wrap_text=True, vertical="center")
    ws.row_dimensions[row].height = 32
    if widths:
        for i, w in enumerate(widths, 1):
            ws.column_dimensions[CL(i)].width = w
    if freeze:
        ws.freeze_panes = ws.cell(row + 1, 3)


def put(ws, row, col, value, fmt=None, calc=False):
    c = ws.cell(row, col, value)
    c.font = F_CALC if calc else F_INPUT
    if fmt:
        c.number_format = fmt
    return c


def dropdown(ws, col, first, last, list_name, listas_ref):
    col_idx, n = listas_ref[list_name]
    dv = DataValidation(type="list", formula1=f"=Listas!${CL(col_idx)}$2:${CL(col_idx)}${n + 1}", allow_blank=True)
    dv.error = "Elige un valor de la lista."
    dv.errorTitle = "Valor no permitido"
    ws.add_data_validation(dv)
    dv.add(f"{CL(col)}{first}:{CL(col)}{last}")


def dropdown_range(ws, col, first, last, ref):
    dv = DataValidation(type="list", formula1=ref, allow_blank=True)
    ws.add_data_validation(dv)
    dv.add(f"{CL(col)}{first}:{CL(col)}{last}")


# ------------------------------------------------------------------ migración
def segmentar(valores):
    """Serie mensual → filas de supuesto. Ceros y vacíos = sin pago.

    Tramos de ≥2 meses iguales → MENSUAL con Desde/Hasta. Pagos sueltos del mismo mes del año
    con el mismo monto → ANUAL. El resto, UNICO. Es una compresión sin pérdida: regenerar la
    serie desde las filas da la misma serie.
    """
    v = [0.0 if (x is None or (isinstance(x, float) and math.isnan(x))) else round(float(x), 2) for x in valores]
    out, i, singles = [], 0, []
    while i < len(v):
        j = i
        while j + 1 < len(v) and abs(v[j + 1] - v[i]) < 0.5:
            j += 1
        if abs(v[i]) >= 0.5:
            if j > i:
                out.append(("MENSUAL", v[i], i, j, None))
            else:
                singles.append((i, v[i]))
        i = j + 1
    # Pagos sueltos que se repiten cada 12 meses con el mismo monto → ANUAL.
    por_mes = {}
    for idx, val in singles:
        por_mes.setdefault(idx % 12, []).append((idx, val))
    usados = set()
    for _, items in por_mes.items():
        k = 0
        while k < len(items):
            m = k
            while m + 1 < len(items) and items[m + 1][0] - items[m][0] == 12 and abs(items[m + 1][1] - items[k][1]) < 0.5:
                m += 1
            if m > k:
                out.append(("ANUAL", items[k][1], items[k][0], items[m][0], items[k][0] % 12))
                usados.update(items[x][0] for x in range(k, m + 1))
            k = m + 1
    for idx, val in singles:
        if idx not in usados:
            out.append(("UNICO", val, idx, idx, None))
    out.sort(key=lambda r: (r[2], r[3]))
    return out


def expandir(fila, n=MESES):
    """Inversa de `segmentar` para una fila; la usa la verificación."""
    freq, monto, a, b, _ = fila
    serie = [0.0] * n
    if freq == "MENSUAL":
        for k in range(a, b + 1):
            serie[k] = monto
    elif freq == "ANUAL":
        for k in range(a, b + 1, 12):
            serie[k] = monto
    else:
        serie[a] = monto
    return serie


def metodo_de(a: dict, sin_valor: bool) -> str:
    q = a.get("valuationQuality")
    if a["assetClass"] == "INMOBILIARIO":
        return "DECLARADO" if q == "TASADO" else "ESTIMADO"
    if a["assetClass"] == "EMPRESAS_PRIVADAS":
        return "DECLARADO"
    nombre = a["name"].lower()
    if any(k in nombre for k in ("collins", "citify", "polo")):
        return "DECLARADO"
    if a["assetClass"] == "OTROS":
        return "DECLARADO"
    return "SALDO"


def liquidez_de(a: dict) -> str:
    c, sub, nombre = a["assetClass"], a.get("subAssetClass", ""), a["name"].lower()
    if c == "CAJA":
        return "Inmediata"
    if c in ("INMOBILIARIO", "EMPRESAS_PRIVADAS", "OTROS"):
        return "Ilíquido"
    if any(k in nombre for k in ("collins", "citify", "polo", "apv", "habitat", "fraccional", "crypto")):
        return "Ilíquido"
    if (sub.startswith("Fondo mutuo") or sub in ("USD", "Posición en USD")) and "habitat" not in nombre:
        return "Corta (≤ 10 días)"
    if sub == "Instrumento financiero":
        return "Corta (≤ 10 días)"
    return "Ilíquido"


CLASE = {
    "CAJA": "Caja",
    "MERCADOS_PUBLICOS": "Inversiones financieras",
    "INMOBILIARIO": "Bienes raíces",
    "EMPRESAS_PRIVADAS": "Empresas",
    "OTROS": "Otros activos",
}


def main(out_path: Path) -> None:
    d = load_fo_data()
    ds = build_dataset()
    as_of = iso(ds["asOf"])
    uf = d.supuestos.get("valor_uf")
    usd = d.supuestos.get("tc_usd_clp")
    ipc = d.supuestos.get("inflacion_anual")
    factor = d.supuestos.get("factor_tasacion")
    meses = [first_of_month(m) for m in d.flujo_caja.meses]
    assert len(meses) == MESES, f"El flujo trae {len(meses)} meses, se esperaban {MESES}"

    wb = Workbook()
    wb.remove(wb.active)
    sheets = {}
    for name, color in [
        ("LEEME", "999999"), ("Parametros", "1F4FD8"), ("Balance", "5B6478"), ("Controles", "C0392B"), ("Pendientes", "C0392B"),
        ("Entidades", "1F4FD8"), ("Participaciones", "1F4FD8"), ("Activos", "1F4FD8"), ("Valorizaciones", "2E8B57"),
        ("Pasivos", "1F4FD8"), ("Saldos_Pasivos", "2E8B57"), ("Catalogo_Conceptos", "1F4FD8"),
        ("Supuestos_Forecast", "E67E22"), ("Forecast", "5B6478"), ("Movimientos", "2E8B57"),
        ("Flujo_Mensual", "5B6478"), ("Desviaciones", "5B6478"), ("Documentos", "2E8B57"), ("Propuestas", "2E8B57"),
        ("Listas", "999999"),
    ]:
        ws = wb.create_sheet(name)
        ws.sheet_properties.tabColor = color
        sheets[name] = ws

    # ---------------------------------------------------------------- Listas
    ws = sheets["Listas"]
    listas_ref = {}
    col = 1
    for name, values in LISTAS.items():
        ws.cell(1, col, name).font = F_HEAD
        ws.cell(1, col).fill = FILL_HEAD
        for i, v in enumerate(values, 2):
            ws.cell(i, col, v).font = F_INPUT
        listas_ref[name] = (col, len(values))
        ws.column_dimensions[CL(col)].width = 24
        col += 1
    col += 1
    cat_col = col
    ws.cell(1, cat_col, "Categoría").font = F_HEAD
    ws.cell(1, cat_col).fill = FILL_HEAD
    ws.cell(1, cat_col + 1, "Equivalente en el dashboard").font = F_HEAD
    ws.cell(1, cat_col + 1).fill = FILL_HEAD
    for i, (c, e) in enumerate(CATEGORIAS, 2):
        ws.cell(i, cat_col, c).font = F_INPUT
        ws.cell(i, cat_col + 1, e).font = F_INPUT
    ws.column_dimensions[CL(cat_col)].width = 36
    ws.column_dimensions[CL(cat_col + 1)].width = 28
    cat_rng = f"Listas!${CL(cat_col)}$2:${CL(cat_col)}${len(CATEGORIAS) + 1}"
    cat_map = f"Listas!${CL(cat_col)}$2:${CL(cat_col + 1)}${len(CATEGORIAS) + 1}"

    # ---------------------------------------------------------------- Parametros
    ws = sheets["Parametros"]
    ws["A1"], ws["A1"].font = "Parámetros", F_TITLE
    ws["A2"] = "Celdas azules: se editan. El resto se calcula."
    ws["A2"].font = Font(italic=True, color="5B6478")
    header(ws, 4, ["Parámetro", "Valor", "Qué es"], widths=[38, 18, 90])
    ws.freeze_panes = "A5"
    params = [
        ("Fecha_Corte", "Fecha de corte del balance", as_of, FMT_DATE, "Fecha a la que corresponden los valores de Valorizaciones. Declarada en el Excel original."),
        ("Mes_Inicio", "Primer mes del horizonte", meses[0], FMT_MES, "Primer mes del forecast (el flujo original arranca aquí y cubre 60 meses)."),
        ("Ultimo_Mes_Cerrado", "Último mes cerrado (REAL)", prev_month(meses[0]), FMT_MES,
         "Los meses hasta esta fecha leen Movimientos (real). Los posteriores usan Supuestos_Forecast. Para cerrar un mes: cargar sus Movimientos y mover esta fecha al mes siguiente."),
        ("UF_Hoy", "Valor UF a la fecha de corte (CLP)", uf, "#,##0.00", "Fuente: Banco Central. Se usa para convertir supuestos en UF y proyectarlos."),
        ("USD_CLP", "Dólar observado (CLP)", usd, "#,##0.00", "PENDIENTE en el Excel original. Sin este valor, los supuestos en USD no se calculan (quedan vacíos, no en cero)."),
        ("IPC_Anual", "Inflación anual proyectada", ipc, FMT_PCT, "Reajusta los supuestos con reajuste IPC y proyecta la UF."),
        ("Factor_Avaluo", "Factor tasación / avalúo fiscal", factor, "0.00", "Instrucción del cliente: proxy cuando no hay tasación. Solo informativo; el valor ya está en Valorizaciones."),
        ("Umbral_Desv", "Umbral de desviación real vs forecast", 0.10, FMT_PCT, "Sobre este % de diferencia, Desviaciones marca REVISAR SUPUESTO."),
        ("Ret_Liquidez", "Retorno esperado — Liquidez", d.supuestos.get("retorno_liquidez"), FMT_PCT, "Supuesto referencial del Excel original."),
        ("Ret_Inversiones", "Retorno esperado — Inversiones financieras", d.supuestos.get("retorno_inversiones"), FMT_PCT, "Supuesto referencial."),
        ("Ret_Inmobiliario", "Retorno esperado — Bienes raíces", d.supuestos.get("retorno_bienes_raices"), FMT_PCT, "Supuesto referencial."),
        ("Ret_Empresas", "Retorno esperado — Empresas", d.supuestos.get("retorno_empresas"), FMT_PCT, "Supuesto referencial."),
        ("Tasa_Descuento", "Tasa de descuento (VAN)", d.supuestos.get("tasa_descuento"), FMT_PCT, "Supuesto referencial."),
    ]
    pr = {}
    for i, (name, label, val, fmt, note) in enumerate(params, 5):
        ws.cell(i, 1, label).font = F_BOLD
        c = put(ws, i, 2, val, fmt)
        if val is None:
            c.fill = FILL_YELLOW
        ws.cell(i, 3, note).font = Font(color="5B6478", size=10)
        wb.defined_names[name] = DefinedName(name, attr_text=f"Parametros!$B${i}")
        pr[name] = i
    r = 5 + len(params)
    ws.cell(r, 1, "Índice del mes de corte").font = F_BOLD
    put(ws, r, 2, "=YEAR(Fecha_Corte)*12+MONTH(Fecha_Corte)", "0", calc=True)
    ws.cell(r, 3, "Cálculo interno (año×12+mes).").font = Font(color="5B6478", size=10)
    wb.defined_names["Idx_Corte"] = DefinedName("Idx_Corte", attr_text=f"Parametros!$B${r}")

    # ---------------------------------------------------------------- Entidades
    ws = sheets["Entidades"]
    ent_rows, ent_id = [], {}  # ent_rows: lista de dicts; ent_id: clave(slug) → ID
    ent_by_dsid = {}

    def add_entity(name, tipo, rut=None, rut_ok=None, perim="Sociedad", rol=None, nota=None):
        key = slug(name)
        if key in ent_id:
            row = ent_rows[int(ent_id[key][2:])]
            if rut and not row["rut"]:
                row["rut"], row["rut_ok"] = rut, rut_ok
            return ent_id[key]
        eid = f"E-{len(ent_rows):03d}"
        ent_rows.append(dict(id=eid, name=name, tipo=tipo, rut=rut, rut_ok=rut_ok, perim=perim, rol=rol, nota=nota))
        ent_id[key] = eid
        return eid

    add_entity("Family Office", "Family Office", perim="Núcleo", nota="Raíz del perímetro consolidado (núcleo familiar + hijos).")
    personas = {}
    for _, p in d.perimetro_nucleo.iterrows():
        n = clean(p["Persona"])
        if n:
            personas[slug(n)] = (n, clean(p["RUT"]), clean(p["Rol"]), "Núcleo", clean(p["Vinculación societaria"]))
    for _, p in d.perimetro_fuera.iterrows():
        n = clean(p["Persona"])
        if n:
            personas[slug(n)] = (n, clean(p["RUT"]), "Vinculado fuera del núcleo", "Fuera", clean(p["Nota"]))
    for n, rut, rol, perim, nota in personas.values():
        add_entity(n, "Persona", rut, "SI" if rut else None, perim, rol, nota)

    TIPO_DS = {"FAMILY_OFFICE": "Family Office", "SPV": "Sociedad patrimonial", "HOLDING": "Sociedad patrimonial", "OPERATING_COMPANY": "Sociedad operativa"}
    for e in ds["entities"]:
        if e["id"] == "fo" or e["id"] == "e-sin-titular-identificado":
            continue
        if slug(e["name"]) in personas or slug(e["name"]) in ent_id:
            continue
        tipo = "Titularidad conjunta" if "&" in e["name"] else TIPO_DS.get(e["entityType"], "Otro")
        add_entity(e["name"], tipo, e.get("taxId"), "SI" if e.get("taxId") else None)

    # RUT de cada sociedad desde la hoja Empresas (con su bandera de confirmación)
    for _, row in d.empresas.iterrows():
        n = clean(row["Empresa"])
        if not n:
            continue
        rut = clean(row["RUT"])
        confirmado = bool(row["RUT confirmado"])
        eid = add_entity(n, "Sociedad operativa", rut if confirmado else None, "SI" if confirmado else "NO")
        if rut and not confirmado:
            ent_rows[int(eid[2:])]["nota"] = f"RUT sin confirmar en el Excel original: {rut}" if any(ch.isdigit() for ch in rut) else "RUT pendiente de confirmar"
    for e in ds["entities"]:
        ent_by_dsid[e["id"]] = ent_id.get(slug(e["name"]), "" if e["id"] == "e-sin-titular-identificado" else None)
    ent_by_dsid["fo"] = "E-000"

    def entity_for(raw_name):
        name = canonical_titular(raw_name or "Sin titular identificado")
        if name == "Family Office":
            return "E-000"
        if name.startswith("Sin titular"):
            return ""
        return add_entity(name, "Sociedad patrimonial")

    # ---------------------------------------------------------------- Activos (migración)
    activos = []  # dicts
    vals = []  # valorizaciones
    wf = openpyxl.load_workbook(ROOT / "data" / "FO_Master_Consolidado.xlsx")
    formulas_br = {}
    for row in wf["Bienes_Raices"].iter_rows(min_row=5):
        direccion, tas = clean(row[2].value), row[8].value
        if direccion and isinstance(tas, str) and tas.startswith("="):
            formulas_br[direccion] = tas

    def nuevo_activo(**kw):
        a = dict(id=f"AC-{len(activos) + 1:03d}", sub="", titular="", subyacente="", pct=None, moneda="CLP", liq="", comuna=None,
                 rol=None, sup=None, perim="Familia", suma="SI", estado="Vigente", nota=None, ant=None)
        a.update(kw)
        activos.append(a)
        return a

    ds_to_ac = {}
    for a in ds["assets"]:
        clase = CLASE[a["assetClass"]]
        sin_valor = (
            a["assetClass"] == "EMPRESAS_PRIVADAS" and a["currentValue"] == 0
        ) or (a["assetClass"] == "MERCADOS_PUBLICOS" and a["currentValue"] == 0 and a.get("subAssetClass") == "Instrumento financiero")
        sn = a.get("sourceNotes") or {}
        if a["assetClass"] == "EMPRESAS_PRIVADAS":
            under = add_entity(a["name"], "Sociedad operativa")
            titular, sub, pct = "E-000", under, None
        else:
            titular, sub, pct = entity_for_ds(ds, a, ent_by_dsid), "", a["ownershipPercentage"]
        ac = nuevo_activo(
            nombre=a["name"], clase=clase, subclase=a.get("subAssetClass"), titular=titular, subyacente=sub, pct=pct,
            liq=liquidez_de(a), comuna=a.get("city") if a["assetClass"] == "INMOBILIARIO" else None,
            rol=sn.get("rolSII"), sup=a.get("surfaceM2"), ant=a["id"],
            nota=sn.get("nota") if isinstance(sn.get("nota"), str) else None,
        )
        ds_to_ac[a["id"]] = ac["id"]
        if sin_valor:
            continue
        nota_val = a.get("valuationMethod")
        if a["name"] in formulas_br:
            nota_val = f"{nota_val}. Origen: celda con fórmula del Excel original ({formulas_br[a['name']]})"
        if a["assetClass"] == "EMPRESAS_PRIVADAS":
            nota_val = f"{nota_val}. Valor del 100% de la sociedad; en el Excel se calculó dividiendo el equity declarado por el %."
        vals.append(dict(fecha=iso(a.get("lastValuationDate") or ds["asOf"]), activo=ac["id"], valor=a["currentValue"],
                         metodo=metodo_de(a, False), nota=nota_val))
    # Participaciones de la familia en cada sociedad (% provisorio del Excel)
    participaciones = []
    for _, row in d.empresas.iterrows():
        n = clean(row["Empresa"])
        if not n:
            continue
        pct = num(row["% Participación (provisorio)"])
        participaciones.append(dict(dueno="E-000", poseido=ent_id[slug(n)], pct=pct, confirmado="NO",
                                    nota=None if pct is not None else "El Excel original no informa el %."))
    # Cuentas e instrumentos fuera del perímetro (el Excel los lista pero no suman al patrimonio)
    for fuente, clase, sub in ((d.liquidez.detalle, "Caja", "Cuenta o efectivo"), (d.inversiones.detalle, "Inversiones financieras", "Instrumento financiero")):
        for _, row in fuente.iterrows():
            perim = clean(row["Perímetro"]) or "Familia"
            nombre = clean(row["Cuenta/Instrumento"])
            monto = num(row["Monto (CLP)"])
            if perim == "Familia" or not nombre:
                continue
            tit = entity_for(clean(row["Titular/Entidad"]))
            ac = nuevo_activo(nombre=nombre, clase=clase, subclase=sub, titular=tit, liq="Inmediata" if clase == "Caja" else "Corta (≤ 10 días)",
                              perim=perim, suma="NO", nota="Fuera del perímetro consolidado: se lista pero no suma al patrimonio.")
            if monto is not None:
                vals.append(dict(fecha=as_of, activo=ac["id"], valor=monto, metodo="SALDO", nota=None))
    # Activos contingentes (memo)
    for _, row in d.activos_contingentes.iterrows():
        nombre, monto = clean(row.iloc[0]), num(row.iloc[1])
        if not nombre or "TOTAL" in nombre.upper() or monto is None:
            continue
        ac = nuevo_activo(nombre=nombre, clase="Activo contingente", subclase="Cuenta por cobrar en disputa", titular="E-000", pct=1,
                          liq="Ilíquido", suma="NO", nota=clean(row.iloc[2]))
        vals.append(dict(fecha=as_of, activo=ac["id"], valor=monto, metodo="DECLARADO", nota="Contingente: no suma al patrimonio hasta que se cobre."))
    # Propiedades que el Excel lista sin valor: se registran igual (sin valorización) para que se vean como pendientes.
    for _, row in d.bienes_raices.iterrows():
        if num(row["Valor Balance (CLP)"]) is None:
            nombre = clean(row["Dirección"]) or f"Propiedad {row['ID']}"
            nuevo_activo(nombre=nombre, clase="Bienes raíces", subclase=clean(row["Tipo"]), titular=entity_for(clean(row["Titular"])),
                         pct=num(row["% Participación"]) or 1, liq="Ilíquido", comuna=clean(row["Comuna"]),
                         nota="El Excel original la lista sin avalúo ni tasación: falta valorizar.")

    # ---------------------------------------------------------------- Pasivos (migración)
    pasivos, saldos_p = [], []

    def nuevo_pasivo(**kw):
        p = dict(id=f"PA-{len(pasivos) + 1:03d}", acreedor=None, tipo="Otro", deudor="", garantia="", moneda="CLP", original=None,
                 inicio=None, venc=None, tasa=None, tipo_tasa=None, estado="Vigente", suma="SI", nota=None)
        p.update(kw)
        pasivos.append(p)
        return p

    for l in ds["loans"]:
        p = nuevo_pasivo(acreedor=l["bank"], tipo="Patente morosa", deudor=ent_by_dsid.get(l["borrowerEntityId"]) or "",
                         original=l["originalAmount"], estado="Moroso", nota=l["name"])
        saldos_p.append(dict(fecha=as_of, pasivo=p["id"], saldo=l["balance"], nota="Saldo moroso informado en la hoja Pasivos del Excel."))
    ac_casa = next((a["id"] for a in activos if "casa santuario" in a["nombre"].lower() and a["clase"] == "Bienes raíces"), "")
    p_santuario = nuevo_pasivo(acreedor="Santander", tipo="Hipotecario", garantia=ac_casa,
                               nota="Deducido del flujo de caja (\"Pago dividendo Casa Santuario Santander\"). FALTA: saldo, tasa, plazo, cuota y deudor. Confirmar.")
    p_constantino = nuevo_pasivo(acreedor=None, tipo="Hipotecario",
                                 nota="Deducido del flujo de caja (\"Dividendos Constantino\"). FALTA: acreedor, saldo, tasa, plazo, propiedad y deudor. Confirmar.")
    for _, row in d.otras_partidas.provisiones.iterrows():
        nombre, monto = clean(row["Concepto"]), num(row["Monto (CLP)"])
        if not nombre or monto is None:
            continue
        p = nuevo_pasivo(acreedor="(Provisión interna)", tipo="Provisión", suma="NO", nota=f"{nombre}. Fondo reservado: no resta del patrimonio en el Excel original.")
        saldos_p.append(dict(fecha=as_of, pasivo=p["id"], saldo=abs(monto), nota="Monto provisionado (memo)."))

    # ---------------------------------------------------------------- Catálogo y Supuestos (migración)
    mapping = json.loads(RENT_MAPPING.read_text(encoding="utf-8"))["streams"]
    asset_by_name = {a["nombre"].lower(): a["id"] for a in activos}
    catalogo, supuestos = [], []
    cat_id = {}
    fc = d.flujo_caja
    for tipo, df in (("INGRESO", fc.ingresos), ("EGRESO", fc.egresos)):
        for concepto, serie in df.iterrows():
            nombre = str(concepto).strip()
            if not nombre or nombre.upper().startswith("TOTAL"):
                continue
            cid = f"C-{len(catalogo) + 1:03d}"
            cat_id[(tipo, nombre)] = cid
            up = nombre.upper()
            vinculos, estado_v, nota_v = "", None, None
            if tipo == "INGRESO":
                for m in mapping:
                    if m["concept"].upper() in up:
                        ids = [a_id for n_, a_id in asset_by_name.items() if any(x.lower() in n_ for x in m["match"])]
                        vinculos, estado_v, nota_v = ", ".join(ids), m["status"], m.get("note")
                        break
            if "DIVIDENDO CASA SANTUARIO" in up:
                vinculos, estado_v, nota_v = p_santuario["id"], "PROPUESTO", "Cuota de crédito hipotecario deducida del nombre."
            if "DIVIDENDOS CONSTANTINO" in up:
                vinculos, estado_v, nota_v = p_constantino["id"], "PROPUESTO", "Cuota de crédito hipotecario deducida del nombre."
            es_caja = "NO" if "EFECTO INFLACION" in up.replace("Ó", "O") else "SI"
            anual12 = sum(0.0 if (x is None or (isinstance(x, float) and math.isnan(x))) else float(x) for x in serie.tolist()[:12])
            catalogo.append(dict(id=cid, nombre=nombre, tipo=tipo, es_caja=es_caja, cat=categoria_de(nombre, tipo),
                                 vinculos=vinculos, estado_v=estado_v, nota=nota_v, anual12=anual12))
            for freq, monto, a, b, mes in segmentar(serie.tolist()):
                desde, hasta = meses[a], meses[b]
                supuestos.append(dict(concepto=cid, monto=monto, moneda="CLP", freq=freq, mes=(meses[a].month if freq in ("ANUAL",) else None),
                                      reaj="NINGUNO", pj=None, mj=None, desde=desde, hasta=None if (freq == "MENSUAL" and b == MESES - 1) else hasta,
                                      origen="Migrado literal del Excel (revisar)", nota=None))
    assert len(supuestos) <= SF_SLOTS, f"{len(supuestos)} supuestos exceden {SF_SLOTS}"

    # ================================================================ ESCRITURA
    # ---------------------------------------------------------------- Entidades
    ws = sheets["Entidades"]
    header(ws, 1, ["ID", "Nombre", "Tipo", "RUT", "RUT confirmado", "Perímetro", "Rol / vinculación", "Notas"], widths=[9, 44, 22, 16, 12, 12, 40, 60])
    for i, e in enumerate(ent_rows, 2):
        for j, k in enumerate(["id", "name", "tipo", "rut", "rut_ok", "perim", "rol", "nota"], 1):
            put(ws, i, j, e[k])
    dropdown(ws, 3, 2, ENT_MAX, "Tipo_Entidad", listas_ref)
    dropdown(ws, 5, 2, ENT_MAX, "Si_No", listas_ref)
    dropdown(ws, 6, 2, ENT_MAX, "Perimetro_Entidad", listas_ref)

    # ---------------------------------------------------------------- Participaciones
    ws = sheets["Participaciones"]
    header(ws, 1, ["ID", "Dueño_ID", "Poseído_ID", "% participación", "Desde", "% confirmado", "Notas"], widths=[9, 12, 12, 14, 12, 12, 70])
    for i, p in enumerate(participaciones, 2):
        put(ws, i, 1, f"PT-{i - 1:03d}")
        put(ws, i, 2, p["dueno"])
        put(ws, i, 3, p["poseido"])
        c = put(ws, i, 4, p["pct"], FMT_PCT)
        if p["pct"] is None:
            c.fill = FILL_YELLOW
        put(ws, i, 5, None, FMT_DATE)
        put(ws, i, 6, p["confirmado"])
        put(ws, i, 7, p["nota"])
    dropdown(ws, 6, 2, PAR_MAX, "Si_No", listas_ref)
    dropdown_range(ws, 2, 2, PAR_MAX, f"=Entidades!$A$2:$A${ENT_MAX}")
    dropdown_range(ws, 3, 2, PAR_MAX, f"=Entidades!$A$2:$A${ENT_MAX}")

    # ---------------------------------------------------------------- Activos
    ws = sheets["Activos"]
    H = ["ID", "Nombre", "Clase", "Subclase", "Titular_ID", "Entidad_Subyacente_ID", "% participación", "Moneda", "Liquidez",
         "Comuna", "Rol SII", "Superficie m²", "Fecha adquisición", "Costo adquisición (CLP)", "Perímetro", "Suma al patrimonio",
         "Estado", "Notas", "ID anterior",
         "Fecha valorización", "Valor 100% vigente (CLP)", "Método vigente", "Valor atribuible (CLP)", "Documento vigente"]
    header(ws, 1, H, calc_from=20, widths=[9, 44, 20, 26, 10, 12, 12, 8, 18, 14, 12, 10, 12, 16, 11, 11, 10, 50, 28, 12, 18, 12, 18, 30])
    for i, a in enumerate(activos, 2):
        vals_row = [a["id"], a["nombre"], a["clase"], a["subclase"], a["titular"], a["subyacente"] or None, a["pct"], a["moneda"], a["liq"],
                    a["comuna"], a["rol"], a["sup"], None, None, a["perim"], a["suma"], a["estado"], a["nota"], a["ant"]]
        for j, v in enumerate(vals_row, 1):
            put(ws, i, j, v, FMT_PCT if j == 7 else FMT_DATE if j == 13 else FMT_CLP if j == 14 else None)
        if a["titular"] == "" and a["clase"] != "Activo contingente":
            ws.cell(i, 5).fill = FILL_YELLOW
    V = "Valorizaciones"
    for i in range(2, ACT_MAX + 1):
        row_is_empty = i - 2 >= len(activos)
        # % participación de las sociedades: sale de Participaciones (nada se almacena dos veces)
        if not row_is_empty and activos[i - 2]["clase"] == "Empresas":
            put(ws, i, 7, f'=IFERROR(IF(INDEX(Participaciones!$D$2:$D${PAR_MAX},MATCH(F{i},Participaciones!$C$2:$C${PAR_MAX},0))="","",'
                          f'INDEX(Participaciones!$D$2:$D${PAR_MAX},MATCH(F{i},Participaciones!$C$2:$C${PAR_MAX},0))),"")', FMT_PCT, calc=True)
        k = f"{V}!$K$2:$K${VAL_MAX}"
        put(ws, i, 20, f'=IF(A{i}="","",IFERROR(INDEX({V}!$A$2:$A${VAL_MAX},MATCH(A{i},{k},0)),""))', FMT_DATE, calc=True)
        put(ws, i, 21, f'=IF(A{i}="","",IFERROR(INDEX({V}!$C$2:$C${VAL_MAX},MATCH(A{i},{k},0)),""))', FMT_CLP, calc=True)
        put(ws, i, 22, f'=IF(A{i}="","",IFERROR(INDEX({V}!$D$2:$D${VAL_MAX},MATCH(A{i},{k},0)),""))', None, calc=True)
        put(ws, i, 23, f'=IF(OR(U{i}="",G{i}=""),"",U{i}*G{i})', FMT_CLP, calc=True)
        put(ws, i, 24, f'=IF(A{i}="","",IFERROR(IF(INDEX({V}!$E$2:$E${VAL_MAX},MATCH(A{i},{k},0))="","",INDEX({V}!$E$2:$E${VAL_MAX},MATCH(A{i},{k},0))),""))', None, calc=True)
    for col_, lst in ((3, "Clase_Activo"), (8, "Moneda"), (9, "Liquidez"), (15, "Perimetro_Activo"), (16, "Si_No"), (17, "Estado_Activo")):
        dropdown(ws, col_, 2, ACT_MAX, lst, listas_ref)
    dropdown_range(ws, 5, 2, ACT_MAX, f"=Entidades!$A$2:$A${ENT_MAX}")
    dropdown_range(ws, 6, 2, ACT_MAX, f"=Entidades!$A$2:$A${ENT_MAX}")
    ws.auto_filter.ref = f"A1:X{ACT_MAX}"

    # ---------------------------------------------------------------- Valorizaciones
    ws = sheets["Valorizaciones"]
    header(ws, 1, ["Fecha", "Activo_ID", "Valor 100% (CLP)", "Método", "Documento (link)", "Moneda origen", "Monto origen", "Ingresado por", "Notas", "Es vigente", "Clave vigente"],
           calc_from=10, widths=[12, 11, 20, 12, 34, 10, 16, 14, 70, 9, 12])
    for i, v in enumerate(vals, 2):
        put(ws, i, 1, v["fecha"], FMT_DATE)
        put(ws, i, 2, v["activo"])
        put(ws, i, 3, v["valor"], FMT_CLP)
        put(ws, i, 4, v["metodo"])
        put(ws, i, 8, "Migración inicial")
        put(ws, i, 9, v["nota"])
    for i in range(2, VAL_MAX + 1):
        put(ws, i, 10, f'=IF(B{i}="","",IF(A{i}=SUMPRODUCT(MAX(($B$2:$B${VAL_MAX}=B{i})*($A$2:$A${VAL_MAX}))),1,0))', "0", calc=True)
        put(ws, i, 11, f'=IF(J{i}=1,B{i},"")', None, calc=True)
        ws.cell(i, 1).number_format = FMT_DATE
        ws.cell(i, 3).number_format = FMT_CLP
    dropdown(ws, 4, 2, VAL_MAX, "Metodo", listas_ref)
    dropdown(ws, 6, 2, VAL_MAX, "Moneda", listas_ref)
    dropdown_range(ws, 2, 2, VAL_MAX, f"=Activos!$A$2:$A${ACT_MAX}")

    # ---------------------------------------------------------------- Pasivos
    ws = sheets["Pasivos"]
    header(ws, 1, ["ID", "Acreedor", "Tipo", "Deudor_ID", "Activo en garantía (ID)", "Moneda", "Monto original", "Fecha inicio", "Fecha vencimiento",
                   "Tasa anual", "Tipo de tasa", "Estado", "Suma al patrimonio", "Notas", "Fecha saldo vigente", "Saldo vigente (CLP)"],
           calc_from=15, widths=[9, 30, 16, 10, 16, 8, 16, 12, 12, 10, 10, 10, 11, 80, 12, 18])
    for i, p in enumerate(pasivos, 2):
        row_vals = [p["id"], p["acreedor"], p["tipo"], p["deudor"] or None, p["garantia"] or None, p["moneda"], p["original"], p["inicio"], p["venc"],
                    p["tasa"], p["tipo_tasa"], p["estado"], p["suma"], p["nota"]]
        for j, v in enumerate(row_vals, 1):
            c = put(ws, i, j, v, FMT_CLP if j == 7 else FMT_DATE if j in (8, 9) else FMT_PCT if j == 10 else None)
            if p["tipo"] == "Hipotecario" and j in (2, 4, 7, 10) and v is None:
                c.fill = FILL_YELLOW
    S = "Saldos_Pasivos"
    for i in range(2, PAS_MAX + 1):
        k = f"{S}!$H$2:$H${SAL_MAX}"
        put(ws, i, 15, f'=IF(A{i}="","",IFERROR(INDEX({S}!$A$2:$A${SAL_MAX},MATCH(A{i},{k},0)),""))', FMT_DATE, calc=True)
        put(ws, i, 16, f'=IF(A{i}="","",IFERROR(INDEX({S}!$C$2:$C${SAL_MAX},MATCH(A{i},{k},0)),""))', FMT_CLP, calc=True)
    for col_, lst in ((3, "Tipo_Pasivo"), (6, "Moneda"), (11, "Tipo_Tasa"), (12, "Estado_Pasivo"), (13, "Si_No")):
        dropdown(ws, col_, 2, PAS_MAX, lst, listas_ref)
    dropdown_range(ws, 4, 2, PAS_MAX, f"=Entidades!$A$2:$A${ENT_MAX}")
    dropdown_range(ws, 5, 2, PAS_MAX, f"=Activos!$A$2:$A${ACT_MAX}")

    # ---------------------------------------------------------------- Saldos_Pasivos
    ws = sheets["Saldos_Pasivos"]
    header(ws, 1, ["Fecha", "Pasivo_ID", "Saldo (CLP)", "Documento (link)", "Ingresado por", "Notas", "Es vigente", "Clave vigente"], calc_from=7,
           widths=[12, 11, 18, 34, 14, 70, 9, 12])
    for i, s in enumerate(saldos_p, 2):
        put(ws, i, 1, s["fecha"], FMT_DATE)
        put(ws, i, 2, s["pasivo"])
        put(ws, i, 3, s["saldo"], FMT_CLP)
        put(ws, i, 5, "Migración inicial")
        put(ws, i, 6, s["nota"])
    for i in range(2, SAL_MAX + 1):
        put(ws, i, 7, f'=IF(B{i}="","",IF(A{i}=SUMPRODUCT(MAX(($B$2:$B${SAL_MAX}=B{i})*($A$2:$A${SAL_MAX}))),1,0))', "0", calc=True)
        put(ws, i, 8, f'=IF(G{i}=1,B{i},"")', None, calc=True)
        ws.cell(i, 1).number_format = FMT_DATE
        ws.cell(i, 3).number_format = FMT_CLP
    dropdown_range(ws, 2, 2, SAL_MAX, f"=Pasivos!$A$2:$A${PAS_MAX}")

    # ---------------------------------------------------------------- Catalogo_Conceptos
    ws = sheets["Catalogo_Conceptos"]
    header(ws, 1, ["ID", "Concepto", "Tipo", "Es caja", "Categoría", "Categoría confirmada", "Vinculado a (IDs)", "Estado del vínculo", "Notas", "Categoría en el dashboard"],
           calc_from=10, widths=[9, 56, 10, 8, 32, 12, 30, 16, 70, 24])
    for i, c in enumerate(catalogo, 2):
        for j, v in enumerate([c["id"], c["nombre"], c["tipo"], c["es_caja"], c["cat"], "NO", c["vinculos"] or None, c["estado_v"], c["nota"]], 1):
            put(ws, i, j, v)
        if c["tipo"] == "INGRESO" and "ARRIENDO" in c["nombre"].upper() and not c["vinculos"]:
            ws.cell(i, 7).fill = FILL_YELLOW
    for i in range(2, CAT_MAX + 1):
        put(ws, i, 10, f'=IF(E{i}="","",IFERROR(VLOOKUP(E{i},{cat_map},2,FALSE),""))', None, calc=True)
    dropdown(ws, 3, 2, CAT_MAX, "Tipo_Concepto", listas_ref)
    dropdown(ws, 4, 2, CAT_MAX, "Si_No", listas_ref)
    dropdown(ws, 6, 2, CAT_MAX, "Si_No", listas_ref)
    dropdown(ws, 8, 2, CAT_MAX, "Estado_Vinculo", listas_ref)
    dropdown_range(ws, 5, 2, CAT_MAX, f"={cat_rng}")

    # ---------------------------------------------------------------- Supuestos_Forecast
    ws = sheets["Supuestos_Forecast"]
    SFH = ["ID", "Concepto_ID", "Monto base", "Moneda", "Frecuencia", "Mes de pago", "Reajuste", "% reajuste anual", "Mes del reajuste",
           "Desde", "Hasta", "Origen", "Notas", "Concepto", "Tipo", "Estado"]
    header(ws, 1, SFH, calc_from=14, widths=[9, 11, 16, 8, 12, 9, 11, 10, 10, 11, 11, 34, 50, 50, 10, 16])
    for i, s in enumerate(supuestos, 2):
        row_vals = [f"SF-{i - 1:03d}", s["concepto"], s["monto"], s["moneda"], s["freq"], s["mes"], s["reaj"], s["pj"], s["mj"], s["desde"], s["hasta"], s["origen"], s["nota"]]
        for j, v in enumerate(row_vals, 1):
            put(ws, i, j, v, "#,##0.##" if j == 3 else FMT_PCT if j == 8 else FMT_MES if j in (10, 11) else None)
    for i in range(2, SF_SLOTS + 2):
        put(ws, i, 14, f'=IF(B{i}="","",IFERROR(INDEX(Catalogo_Conceptos!$B$2:$B${CAT_MAX},MATCH(B{i},Catalogo_Conceptos!$A$2:$A${CAT_MAX},0)),"¿Concepto_ID no existe?"))', None, calc=True)
        put(ws, i, 15, f'=IF(B{i}="","",IFERROR(INDEX(Catalogo_Conceptos!$C$2:$C${CAT_MAX},MATCH(B{i},Catalogo_Conceptos!$A$2:$A${CAT_MAX},0)),""))', None, calc=True)
        put(ws, i, 16, f'=IF(B{i}="","",IF(K{i}="","VIGENTE",IF(K{i}<=Ultimo_Mes_Cerrado,"TERMINADO","VIGENTE (con fin)")))', None, calc=True)
        ws.cell(i, 10).number_format = FMT_MES
        ws.cell(i, 11).number_format = FMT_MES
        ws.cell(i, 3).number_format = "#,##0.##"
    dropdown_range(ws, 2, 2, SF_SLOTS + 1, f"=Catalogo_Conceptos!$A$2:$A${CAT_MAX}")
    for col_, lst in ((4, "Moneda"), (5, "Frecuencia"), (7, "Reajuste")):
        dropdown(ws, col_, 2, SF_SLOTS + 1, lst, listas_ref)

    # ---------------------------------------------------------------- Forecast (grilla calculada)
    ws = sheets["Forecast"]
    M0 = 13  # primera columna de meses
    ws["A1"], ws["A1"].font = "Forecast mensual por supuesto (calculado — no editar)", F_TITLE
    labels = ["SF_ID", "Concepto_ID", "Tipo", "Monto base", "Moneda", "Frecuencia", "Mes pago", "Tasa reajuste", "Mes reaj.", "Desde (idx)", "Hasta (idx)", "Forecast meses cerrados"]
    for i, t in enumerate(labels, 1):
        c = ws.cell(4, i, t)
        c.font, c.fill = F_HEAD, FILL_CALC
        c.alignment = Alignment(wrap_text=True)
    ws.cell(2, 12, "Estado del mes →").font = F_BOLD
    ws.cell(3, 12, "Índice →").font = F_BOLD
    for k in range(MESES):
        c = M0 + k
        ws.cell(4, c, meses[k] if k == 0 else f"=EDATE({CL(c - 1)}4,1)").number_format = FMT_MES
        ws.cell(4, c).font, ws.cell(4, c).fill = F_HEAD, FILL_CALC
        ws.cell(3, c, f"=YEAR({CL(c)}4)*12+MONTH({CL(c)}4)")
        ws.cell(2, c, f'=IF({CL(c)}4<=Ultimo_Mes_Cerrado,"REAL","FORECAST")')
        ws.column_dimensions[CL(c)].width = 11
    ws.cell(4, M0).value = "=Mes_Inicio"
    ws.cell(4, M0).number_format = FMT_MES
    for i, w in enumerate([9, 11, 9, 14, 8, 12, 8, 9, 8, 9, 9, 16], 1):
        ws.column_dimensions[CL(i)].width = w
    first, last_c = CL(M0), CL(M0 + MESES - 1)
    FR0 = 5
    for n in range(SF_SLOTS):
        r = FR0 + n
        s = n + 2  # fila en Supuestos_Forecast
        SF = "Supuestos_Forecast"
        ws.cell(r, 1, f'=IF({SF}!B{s}="","",{SF}!A{s})')
        ws.cell(r, 2, f'=IF(A{r}="","",{SF}!B{s})')
        ws.cell(r, 3, f'=IF(A{r}="","",{SF}!O{s})')
        ws.cell(r, 4, f'=IF(A{r}="","",{SF}!C{s})').number_format = "#,##0.##"
        ws.cell(r, 5, f'=IF(A{r}="","",{SF}!D{s})')
        ws.cell(r, 6, f'=IF(A{r}="","",{SF}!E{s})')
        ws.cell(r, 7, f'=IF(A{r}="","",{SF}!F{s})')
        ws.cell(r, 8, f'=IF(A{r}="","",IF({SF}!G{s}="IPC",IPC_Anual,IF({SF}!G{s}="FIJO",{SF}!H{s},0)))').number_format = FMT_PCT
        ws.cell(r, 9, f'=IF(A{r}="","",IF({SF}!I{s}="",1,{SF}!I{s}))')
        ws.cell(r, 10, f'=IF(OR(A{r}="",{SF}!J{s}=""),"",YEAR({SF}!J{s})*12+MONTH({SF}!J{s}))')
        ws.cell(r, 11, f'=IF(A{r}="","",IF({SF}!K{s}="",99999,YEAR({SF}!K{s})*12+MONTH({SF}!K{s})))')
        ws.cell(r, 12, f'=IF(A{r}="","",SUMIF(${first}$2:${last_c}$2,"REAL",{first}{r}:{last_c}{r}))').number_format = FMT_CLP
        for k in range(MESES):
            c = CL(M0 + k)
            pay = (f'IF($F{r}="MENSUAL",1,IF($F{r}="TRIMESTRAL",IF(MOD(MONTH({c}$4)-$G{r},3)=0,1,0),'
                   f'IF($F{r}="SEMESTRAL",IF(MOD(MONTH({c}$4)-$G{r},6)=0,1,0),'
                   f'IF($F{r}="ANUAL",IF(MONTH({c}$4)=$G{r},1,0),IF($F{r}="UNICO",IF({c}$3=$J{r},1,0),0)))))')
            reaj = f'IF($H{r}=0,1,(1+$H{r})^MAX(0,INT(({c}$3-$I{r})/12)-INT(($J{r}-$I{r})/12)))'
            fx = f'IF($E{r}="UF",UF_Hoy*(1+IPC_Anual)^(MAX(0,{c}$3-Idx_Corte)/12),IF($E{r}="USD",USD_CLP,1))'
            f_ = (f'=IF(OR($A{r}="",$D{r}="",$J{r}=""),0,IF(AND($E{r}="USD",USD_CLP=""),"",'
                  f'IF(AND({c}$3>=$J{r},{c}$3<=$K{r}),{pay}*$D{r}*{reaj}*{fx},0)))')
            cell = ws.cell(r, M0 + k, f_)
            cell.number_format = '#,##0;[Red]-#,##0;;'
    ws.freeze_panes = ws.cell(FR0, M0)
    FR1 = FR0 + SF_SLOTS - 1

    # ---------------------------------------------------------------- Movimientos
    ws = sheets["Movimientos"]
    header(ws, 1, ["Fecha", "Concepto_ID", "Detalle / contraparte", "Monto (CLP)", "Estado", "Documento (link)", "Ingresado por", "Notas"],
           widths=[12, 11, 40, 18, 12, 34, 14, 50])
    for i in range(2, 202):
        ws.cell(i, 1).number_format = FMT_DATE
        ws.cell(i, 4).number_format = FMT_CLP
    dropdown(ws, 5, 2, MOV_MAX, "Estado_Movimiento", listas_ref)
    dropdown_range(ws, 2, 2, MOV_MAX, f"=Catalogo_Conceptos!$A$2:$A${CAT_MAX}")
    ws["J1"] = "Aquí va lo REAL, siempre en positivo: el signo lo da el tipo del concepto. DEVENGADO = reconocido aunque no esté pagado; PAGADO = ya salió o entró caja."
    ws["J1"].font = Font(italic=True, color="5B6478")

    # ---------------------------------------------------------------- Flujo_Mensual
    ws = sheets["Flujo_Mensual"]
    E0 = 5  # primera columna de meses
    ws["A1"], ws["A1"].font = "Flujo mensual: REAL hasta el último mes cerrado, FORECAST después", F_TITLE
    ws["A2"] = "Estado del mes →"
    ws["A2"].font = F_BOLD
    for k in range(MESES):
        c = E0 + k
        mc = CL(M0 + k)
        ws.cell(2, c, f"=Forecast!{mc}2")
        ws.cell(3, c, f"=Forecast!{mc}3")
        ws.cell(4, c, f"=Forecast!{mc}4").number_format = FMT_MES
        ws.cell(4, c).font, ws.cell(4, c).fill = F_HEAD, FILL_HEAD
        ws.column_dimensions[CL(c)].width = 12
    for i, w in enumerate([10, 50, 10, 8], 1):
        ws.column_dimensions[CL(i)].width = w
    for i, t in enumerate(["ID", "Concepto", "Tipo", "Es caja"], 1):
        ws.cell(4, i, t).font, ws.cell(4, i).fill = F_HEAD, FILL_HEAD
    CR0, CR1 = 17, 17 + CAT_MAX - 2  # filas de conceptos (una por fila del catálogo)
    rng = lambda c: f"{c}${CR0}:{c}${CR1}"  # noqa: E731
    totals = [
        (6, "Total ingresos (caja)", "ing"),
        (7, "Total egresos (caja)", "egr"),
        (8, "Neto de caja", "neto"),
        (9, "Ajustes que no son caja (neto)", "ajuste"),
        (10, "Neto como en el Excel original (caja + ajustes)", "orig"),
        (12, "Caja inicial / caja proyectada al cierre", "caja"),
    ]
    for r, label, kind in totals:
        ws.cell(r, 2, label).font = F_BOLD
    ws.cell(11, 2, "Caja inmediata a la fecha de corte (Activos)").font = F_BOLD
    ws.cell(11, 5, f'=SUMIFS(Activos!$W$2:$W${ACT_MAX},Activos!$I$2:$I${ACT_MAX},"Inmediata",Activos!$O$2:$O${ACT_MAX},"Familia",Activos!$P$2:$P${ACT_MAX},"SI")').number_format = FMT_CLP
    ws.cell(13, 2, "Meses de egreso cubiertos por la liquidez actual (12 primeros meses)").font = F_BOLD
    for k in range(MESES):
        c = CL(E0 + k)
        ws.cell(6, E0 + k, f'=SUMIFS({c}${CR0}:{c}${CR1},$C${CR0}:$C${CR1},"INGRESO",$D${CR0}:$D${CR1},"SI")').number_format = FMT_CLP
        ws.cell(7, E0 + k, f'=SUMIFS({c}${CR0}:{c}${CR1},$C${CR0}:$C${CR1},"EGRESO",$D${CR0}:$D${CR1},"SI")').number_format = FMT_CLP
        ws.cell(8, E0 + k, f"={c}6-{c}7").number_format = FMT_CLP
        ws.cell(9, E0 + k, f'=SUMIFS({c}${CR0}:{c}${CR1},$C${CR0}:$C${CR1},"INGRESO",$D${CR0}:$D${CR1},"NO")-SUMIFS({c}${CR0}:{c}${CR1},$C${CR0}:$C${CR1},"EGRESO",$D${CR0}:$D${CR1},"NO")').number_format = FMT_CLP
        ws.cell(10, E0 + k, f"={c}8+{c}9").number_format = FMT_CLP
        prev = "$E$11" if k == 0 else f"{CL(E0 + k - 1)}12"
        ws.cell(12, E0 + k, f"={prev}+{c}8").number_format = FMT_CLP
    for r in (6, 7, 8, 9, 10, 12):
        for k in range(MESES):
            ws.cell(r, E0 + k).font = F_BOLD
    ws.cell(13, 5, f'=IFERROR(Balance!B32/(SUM({CL(E0)}7:{CL(E0 + 11)}7)/12),"")').number_format = "0.0"
    for c_, t in enumerate(["ID", "Concepto", "Tipo", "Es caja"], 1):
        ws.cell(16, c_, t).font, ws.cell(16, c_).fill = F_HEAD, FILL_HEAD
    for k in range(MESES):
        ws.cell(16, E0 + k, f"={CL(E0 + k)}4").number_format = FMT_MES
        ws.cell(16, E0 + k).font, ws.cell(16, E0 + k).fill = F_HEAD, FILL_HEAD
    CAT = "Catalogo_Conceptos"
    for n in range(CR1 - CR0 + 1):
        r, cr = CR0 + n, n + 2
        ws.cell(r, 1, f'=IF({CAT}!A{cr}="","",{CAT}!A{cr})')
        ws.cell(r, 2, f'=IF(A{r}="","",{CAT}!B{cr})')
        ws.cell(r, 3, f'=IF(A{r}="","",{CAT}!C{cr})')
        ws.cell(r, 4, f'=IF(A{r}="","",{CAT}!D{cr})')
        for k in range(MESES):
            c, fc_ = CL(E0 + k), CL(M0 + k)
            real = (f'IF(COUNTIFS(Movimientos!$B$2:$B${MOV_MAX},$A{r},Movimientos!$A$2:$A${MOV_MAX},">="&{c}$4,Movimientos!$A$2:$A${MOV_MAX},"<"&EDATE({c}$4,1))=0,"",'
                    f'SUMIFS(Movimientos!$D$2:$D${MOV_MAX},Movimientos!$B$2:$B${MOV_MAX},$A{r},Movimientos!$A$2:$A${MOV_MAX},">="&{c}$4,Movimientos!$A$2:$A${MOV_MAX},"<"&EDATE({c}$4,1)))')
            fore = f'SUMIFS(Forecast!{fc_}${FR0}:{fc_}${FR1},Forecast!$B${FR0}:$B${FR1},$A{r})'
            ws.cell(r, E0 + k, f'=IF($A{r}="","",IF({c}$2="REAL",{real},{fore}))').number_format = '#,##0;[Red]-#,##0;;'
    ws.freeze_panes = ws.cell(5, E0)
    ws.conditional_formatting.add(f"{CL(E0)}2:{CL(E0 + MESES - 1)}2", CellIsRule(operator="equal", formula=['"REAL"'], fill=PatternFill("solid", bgColor="C9EBD5")))

    # ---------------------------------------------------------------- Desviaciones
    ws = sheets["Desviaciones"]
    ws["A1"], ws["A1"].font = "Real vs forecast (meses cerrados) — para recalibrar supuestos", F_TITLE
    ws["A2"] = "Meses cerrados:"
    ws["A2"].font = F_BOLD
    ws["C2"] = "=MAX(0,(YEAR(Ultimo_Mes_Cerrado)*12+MONTH(Ultimo_Mes_Cerrado))-(YEAR(Mes_Inicio)*12+MONTH(Mes_Inicio))+1)"
    header(ws, 4, ["ID", "Concepto", "Tipo", "Forecast acumulado", "Real acumulado", "Diferencia (real − forecast)", "% desviación", "Promedio mensual real", "Promedio mensual forecast", "Señal"],
           widths=[9, 50, 10, 18, 18, 18, 12, 18, 18, 22])
    ws.freeze_panes = "C5"
    for n in range(CAT_MAX - 1):
        r, cr = 5 + n, n + 2
        ws.cell(r, 1, f'=IF({CAT}!A{cr}="","",{CAT}!A{cr})')
        ws.cell(r, 2, f'=IF(A{r}="","",{CAT}!B{cr})')
        ws.cell(r, 3, f'=IF(A{r}="","",{CAT}!C{cr})')
        ws.cell(r, 4, f'=IF(OR(A{r}="",$C$2=0),"",SUMIFS(Forecast!$L${FR0}:$L${FR1},Forecast!$B${FR0}:$B${FR1},A{r}))').number_format = FMT_CLP
        ws.cell(r, 5, f'=IF(OR(A{r}="",$C$2=0),"",SUMIFS(Movimientos!$D$2:$D${MOV_MAX},Movimientos!$B$2:$B${MOV_MAX},A{r},Movimientos!$A$2:$A${MOV_MAX},">="&Mes_Inicio,Movimientos!$A$2:$A${MOV_MAX},"<"&EDATE(Ultimo_Mes_Cerrado,1)))').number_format = FMT_CLP
        ws.cell(r, 6, f'=IF(D{r}="","",E{r}-D{r})').number_format = FMT_CLP
        ws.cell(r, 7, f'=IF(OR(D{r}="",D{r}=0),"",F{r}/ABS(D{r}))').number_format = FMT_PCT
        ws.cell(r, 8, f'=IF(D{r}="","",E{r}/$C$2)').number_format = FMT_CLP
        ws.cell(r, 9, f'=IF(D{r}="","",D{r}/$C$2)').number_format = FMT_CLP
        ws.cell(r, 10, f'=IF(D{r}="","",IF(AND(D{r}=0,E{r}=0),"",IF(D{r}=0,"REVISAR SUPUESTO (no había)",IF(ABS(F{r})/ABS(D{r})>Umbral_Desv,"REVISAR SUPUESTO","OK"))))')
    ws.conditional_formatting.add("J5:J200", FormulaRule(formula=['LEFT(J5,7)="REVISAR"'], fill=PatternFill("solid", bgColor="FFD9D9")))

    # ---------------------------------------------------------------- Documentos y Propuestas
    ws = sheets["Documentos"]
    header(ws, 1, ["ID", "Fecha de subida", "Tipo", "Item_ID (activo / pasivo / entidad)", "Link", "Subido por", "Estado", "Notas"], widths=[9, 14, 22, 24, 50, 14, 12, 50])
    dropdown(ws, 3, 2, 2000, "Tipo_Documento", listas_ref)
    dropdown(ws, 7, 2, 2000, "Estado_Documento", listas_ref)
    ws = sheets["Propuestas"]
    header(ws, 1, ["ID", "Fecha", "Documento_ID", "Destino", "Item_ID", "Fecha del dato", "Valor / monto propuesto", "Método", "Confianza de lectura", "Estado", "Aprobado por", "Fecha aprobación", "Notas"],
           widths=[9, 12, 12, 20, 12, 12, 20, 12, 12, 12, 14, 14, 50])
    dropdown(ws, 4, 2, 2000, "Destino", listas_ref)
    dropdown(ws, 8, 2, 2000, "Metodo", listas_ref)
    dropdown(ws, 10, 2, 2000, "Estado_Propuesta", listas_ref)
    ws["O1"] = "Cola del módulo de carga: la lectura automática propone aquí y nada pasa a Valorizaciones / Saldos / Movimientos hasta que una persona aprueba."
    ws["O1"].font = Font(italic=True, color="5B6478")

    # ---------------------------------------------------------------- Balance
    ws = sheets["Balance"]
    ws["A1"], ws["A1"].font = "Balance consolidado (calculado desde Activos, Valorizaciones y Pasivos)", F_TITLE
    ws["A2"] = "Esta hoja no se digita: cuadra siempre porque suma lo mismo que el dashboard."
    ws["A2"].font = Font(italic=True, color="5B6478")
    header(ws, 4, ["Clase de activo", "Monto atribuible (CLP)", "% del total", "Activos sin valor"], widths=[50, 22, 12, 16])
    ws.freeze_panes = "A5"
    A = lambda col: f"Activos!${col}$2:${col}${ACT_MAX}"  # noqa: E731
    clases = ["Caja", "Inversiones financieras", "Bienes raíces", "Empresas", "Otros activos"]
    for i, cl in enumerate(clases, 5):
        ws.cell(i, 1, cl)
        ws.cell(i, 2, f'=SUMIFS({A("W")},{A("C")},A{i},{A("P")},"SI",{A("O")},"Familia")').number_format = FMT_CLP
        ws.cell(i, 3, f"=IF($B$10=0,\"\",B{i}/$B$10)").number_format = FMT_PCT
        ws.cell(i, 4, f'=SUMPRODUCT(({A("C")}=A{i})*({A("P")}="SI")*({A("O")}="Familia")*({A("U")}=""))')
    ws.cell(10, 1, "TOTAL ACTIVOS").font = F_BOLD
    ws.cell(10, 2, "=SUM(B5:B9)").number_format = FMT_CLP
    ws.cell(11, 1, "TOTAL PASIVOS (suman al patrimonio)").font = F_BOLD
    ws.cell(11, 2, f'=SUMIFS(Pasivos!$P$2:$P${PAS_MAX},Pasivos!$M$2:$M${PAS_MAX},"SI")').number_format = FMT_CLP
    ws.cell(12, 1, "PATRIMONIO NETO (Activos − Pasivos)").font = F_BOLD
    ws.cell(12, 2, "=B10-B11").number_format = FMT_CLP
    for r in (10, 11, 12):
        ws.cell(r, 2).font = F_BOLD
    ws.cell(14, 1, "MEMOS").font = F_BOLD
    ws.cell(15, 1, "Activos contingentes (no suman)")
    ws.cell(15, 2, f'=SUMIFS({A("W")},{A("C")},"Activo contingente")').number_format = FMT_CLP
    ws.cell(16, 1, "Provisiones (fondos reservados, no restan en el Excel original)")
    ws.cell(16, 2, f'=SUMIFS(Pasivos!$P$2:$P${PAS_MAX},Pasivos!$C$2:$C${PAS_MAX},"Provisión")').number_format = FMT_CLP
    ws.cell(17, 1, "Patrimonio ajustado por contingencias (como en el Excel original)")
    ws.cell(17, 2, "=B12+B15").number_format = FMT_CLP
    ws.cell(18, 1, "Patrimonio prudente (resta provisiones, sin contingentes)")
    ws.cell(18, 2, "=B12-B16").number_format = FMT_CLP
    ws.cell(20, 1, "CALIDAD DEL DATO (según el método de la valorización vigente)").font = F_BOLD
    header(ws, 21, ["Método", "Monto atribuible (CLP)", "% del total", ""], freeze=False)
    for i, m in enumerate(LISTAS["Metodo"], 22):
        ws.cell(i, 1, m)
        ws.cell(i, 2, f'=SUMIFS({A("W")},{A("V")},A{i},{A("P")},"SI",{A("O")},"Familia")').number_format = FMT_CLP
        ws.cell(i, 3, f'=IF($B$10=0,"",B{i}/$B$10)').number_format = FMT_PCT
    ws.cell(27, 1, "LIQUIDEZ POR TRAMO").font = F_BOLD
    header(ws, 28, ["Tramo", "Monto atribuible (CLP)", "% del total", ""], freeze=False)
    for i, t in enumerate(LISTAS["Liquidez"], 29):
        ws.cell(i, 1, t)
        ws.cell(i, 2, f'=SUMIFS({A("W")},{A("I")},A{i},{A("P")},"SI",{A("O")},"Familia")').number_format = FMT_CLP
        ws.cell(i, 3, f'=IF($B$10=0,"",B{i}/$B$10)').number_format = FMT_PCT
    ws.cell(32, 1, "Liquidez disponible (inmediata + corta)").font = F_BOLD
    ws.cell(32, 2, "=B29+B30").number_format = FMT_CLP
    ws.cell(33, 1, "Cobertura de egresos (meses, 12 primeros del forecast)")
    ws.cell(33, 2, "=Flujo_Mensual!E13").number_format = "0.0"

    # ---------------------------------------------------------------- Controles
    ws = sheets["Controles"]
    ws["A1"], ws["A1"].font = "Controles de calidad — todo debe decir OK antes de publicar", F_TITLE
    header(ws, 3, ["Control", "Casos", "Estado", "Qué hacer"], widths=[70, 10, 12, 90])
    ws.freeze_panes = "A4"
    VA, VB, VD, VE = (f"Valorizaciones!${c}$2:${c}${VAL_MAX}" for c in "ABDE")
    VBC = f"Valorizaciones!$C$2:$C${VAL_MAX}"
    SFB = f"Supuestos_Forecast!$B$2:$B${SF_SLOTS + 1}"
    checks = [
        ("IDs de activo duplicados", f"=SUMPRODUCT(({A('A')}<>\"\")*(COUNTIF({A('A')},{A('A')})>1))", "Cada activo debe tener un ID único."),
        ("Activos que suman al patrimonio sin valorización", f'=SUMPRODUCT(({A("P")}="SI")*({A("O")}="Familia")*({A("A")}<>"")*({A("U")}=""))', "Cargar la primera valorización o marcar «Suma al patrimonio» = NO."),
        ("Activos sin titular", f'=SUMPRODUCT(({A("A")}<>"")*({A("E")}="")*({A("C")}<>"Activo contingente"))', "Completar Titular_ID."),
        ("Activos con Titular_ID que no existe en Entidades", f'=SUMPRODUCT(({A("E")}<>"")*(COUNTIF(Entidades!$A$2:$A${ENT_MAX},{A("E")})=0))', "Crear la entidad o corregir el ID."),
        ("Bienes raíces sin Rol SII", f'=SUMPRODUCT(({A("C")}="Bienes raíces")*({A("K")}="")*({A("A")}<>""))', "Completar el Rol SII (o «Pendiente» si se está tramitando)."),
        ("Valorizaciones con Activo_ID inexistente", f'=SUMPRODUCT(({VB}<>"")*(COUNTIF({A("A")},{VB})=0))', "Corregir el ID."),
        ("Valorizaciones sin valor, fecha o método", f'=SUMPRODUCT(({VB}<>"")*((Valorizaciones!$C$2:$C${VAL_MAX}="")+({VA}="")+({VD}="")>0))', "Completar la fila."),
        ("Dos valorizaciones del mismo activo en la misma fecha", f'=SUMPRODUCT(({VB}<>"")*(COUNTIFS({VB},{VB},{VA},{VA})>1))', "Dejar una sola por activo y fecha."),
        ("Valorizaciones con método TASACION / EEFF sin documento", f'=SUMPRODUCT((({VD}="TASACION")+({VD}="EEFF"))*(Valorizaciones!$E$2:$E${VAL_MAX}=""))', "Adjuntar el link al documento o cambiar el método a DECLARADO."),
        ("Pasivos hipotecarios sin saldo vigente", f'=SUMPRODUCT((Pasivos!$C$2:$C${PAS_MAX}="Hipotecario")*(Pasivos!$P$2:$P${PAS_MAX}=""))', "Cargar el saldo insoluto (certificado del banco): sin él el patrimonio neto está sobrestimado."),
        ("Pasivos sin Deudor_ID", f'=SUMPRODUCT((Pasivos!$A$2:$A${PAS_MAX}<>"")*(Pasivos!$D$2:$D${PAS_MAX}=""))', "Completar quién debe."),
        ("Supuestos con Concepto_ID inexistente", f'=SUMPRODUCT(({SFB}<>"")*(COUNTIF({CAT}!$A$2:$A${CAT_MAX},{SFB})=0))', "Corregir el ID o crear el concepto en Catalogo_Conceptos."),
        ("Supuestos sin fecha «Desde» o sin monto", f'=SUMPRODUCT(({SFB}<>"")*((Supuestos_Forecast!$J$2:$J${SF_SLOTS + 1}="")+(Supuestos_Forecast!$C$2:$C${SF_SLOTS + 1}="")>0))', "Completar la fila: sin ella no entra al forecast."),
        ("Supuestos en USD y dólar sin cargar", f'=IF(USD_CLP="",SUMPRODUCT((Supuestos_Forecast!$D$2:$D${SF_SLOTS + 1}="USD")*1),0)', "Cargar USD_CLP en Parametros."),
        ("Movimientos con Concepto_ID inexistente", f'=SUMPRODUCT((Movimientos!$B$2:$B$2000<>"")*(COUNTIF({CAT}!$A$2:$A${CAT_MAX},Movimientos!$B$2:$B$2000)=0))', "Corregir el ID."),
        ("Conceptos de arriendo sin propiedad vinculada", f'=SUMPRODUCT(({CAT}!$C$2:$C${CAT_MAX}="INGRESO")*({CAT}!$G$2:$G${CAT_MAX}="")*(ISNUMBER(SEARCH("ARRIENDO",{CAT}!$B$2:$B${CAT_MAX}))))', "Vincular a una propiedad en Catalogo_Conceptos (o crear la propiedad en Activos)."),
        ("Conceptos con categoría sin confirmar", f'=SUMPRODUCT(({CAT}!$A$2:$A${CAT_MAX}<>"")*({CAT}!$F$2:$F${CAT_MAX}<>"SI"))', "Revisar la categoría propuesta y marcar «Categoría confirmada» = SI."),
        ("Último mes cerrado anterior al inicio del horizonte (todo es forecast)", "=IF(Ultimo_Mes_Cerrado<Mes_Inicio,1,0)", "Esperado mientras no se cierre ningún mes. Se resuelve al cargar el primer mes real."),
    ]
    for i, (label, formula, todo) in enumerate(checks, 4):
        ws.cell(i, 1, label)
        ws.cell(i, 2, formula)
        ws.cell(i, 3, f'=IF(B{i}=0,"OK","REVISAR")')
        ws.cell(i, 4, todo).font = Font(color="5B6478", size=10)
    ws.conditional_formatting.add(f"C4:C{3 + len(checks)}", CellIsRule(operator="equal", formula=['"REVISAR"'], fill=PatternFill("solid", bgColor="FFD9D9")))
    ws.conditional_formatting.add(f"C4:C{3 + len(checks)}", CellIsRule(operator="equal", formula=['"OK"'], fill=PatternFill("solid", bgColor="C9EBD5")))

    # ---------------------------------------------------------------- Pendientes (decisiones y datos que faltan)
    def mm(x):
        t = f"${abs(x) / 1e6:,.1f} MM"
        return t.replace(",", "§").replace(".", ",").replace("§", ".")

    ws = sheets["Pendientes"]
    ws["A1"], ws["A1"].font = "Pendientes: decisiones y datos que faltan", F_TITLE
    ws["A2"] = "Salen de revisar el Excel original. Cuando uno se resuelve, marcarlo RESUELTO; el control correspondiente en «Controles» se pone en OK."
    ws["A2"].font = Font(italic=True, color="5B6478")
    header(ws, 4, ["N°", "Tema", "Qué hay que decidir o cargar", "Dónde se resuelve", "Por qué importa", "Responsable", "Estado"], widths=[5, 30, 70, 26, 62, 12, 11])
    sin_rol = [c for c in catalogo if c["tipo"] == "INGRESO" and "ARRIENDO" in c["nombre"].upper() and not c["vinculos"]]
    cero = [a["name"] for a in ds["assets"] if a["assetClass"] == "MERCADOS_PUBLICOS" and a["currentValue"] == 0 and a.get("subAssetClass") == "Instrumento financiero"]
    infl_i = sum(c["anual12"] for c in catalogo if "EFECTO INFLACION" in c["nombre"].upper() and c["tipo"] == "INGRESO")
    infl_e = sum(c["anual12"] for c in catalogo if "EFECTO INFLACION" in c["nombre"].upper() and c["tipo"] == "EGRESO")
    cuota = {c["nombre"]: c["anual12"] for c in catalogo if c["estado_v"] and c["vinculos"] in (p_santuario["id"], p_constantino["id"])}
    declarados = [a["nombre"] for a in activos for v in vals if v["activo"] == a["id"] and v["metodo"] == "DECLARADO" and a["clase"] in ("Bienes raíces", "Empresas")]
    formulas_txt = "; ".join(f"{k}: {v}" for k, v in formulas_br.items())
    items = [
        ("Arriendos sin propiedad", "Los conceptos " + ", ".join(f"{c['nombre']} ({mm(c['anual12'])}/año)" for c in sin_rol) + " no calzan con ninguna propiedad cargada. ¿Faltan propiedades en Activos o llevan otro nombre?", "Activos y Catalogo_Conceptos (col. Vinculado a)", f"Son {mm(sum(c['anual12'] for c in sin_rol))} al año de arriendo sin respaldo en el balance: no se puede calcular el rendimiento de esas propiedades.", "Tú"),
        ("Créditos hipotecarios", f"Cargar saldo, tasa, plazo, acreedor y deudor de los dos créditos que el flujo paga ({mm(sum(cuota.values()))} al año en cuotas). Certificado de deuda del banco.", "Pasivos (PA-006, PA-007) y Saldos_Pasivos", "Hoy el patrimonio neto no resta esa deuda: está sobrestimado por el saldo insoluto. También habilita LTV y DSCR.", "Tú"),
        ("Zapallar: ¿doble conteo?", "«Cementerio Zapallar» (lote 12) y «Tumba Zapallar» (otras partidas): ¿son el mismo bien? Si lo son, quitar uno.", "Activos", "Si es el mismo bien, el patrimonio está sobrestimado en el valor más bajo de los dos.", "Tú"),
        ("Efecto Inflación", f"Aparece como ingreso ({mm(infl_i)} en 12 meses) y como egreso ({mm(infl_e)}). No es caja. ¿Se excluye del forecast o se reemplaza por reajustes reales (IPC / UF) en cada supuesto?", "Catalogo_Conceptos (Es caja) y Supuestos_Forecast", f"Hoy infla el ingreso neto en {mm(infl_i - infl_e)} al año. La plantilla ya lo separa en «Ajustes que no son caja».", "Tú"),
        ("Cuentas sin saldo", "Cargar el saldo de: " + ", ".join(cero) + ".", "Valorizaciones (método SALDO)", "Están en el Excel con 0, pero no se sabe si es 0 real o falta cargarlas. Hoy figuran como «sin valor».", "Tú"),
        ("Sociedades sin valor", f"{sum(1 for a in ds['assets'] if a['assetClass'] == 'EMPRESAS_PRIVADAS' and a['currentValue'] == 0)} de {len(d.empresas)} sociedades no tienen valor. Priorizar las relevantes y pedir estados financieros; EASA es cerca de la mitad del patrimonio.", "Valorizaciones (método EEFF)", "Son la mayor incertidumbre del patrimonio. Hoy solo EASA y Capital Office tienen valor, y ambos son cifras declaradas.", "Tú"),
        ("Valores declarados sin respaldo", f"{len(declarados)} valorizaciones son DECLARADO (sin documento): " + ", ".join(declarados) + ". Adjuntar tasación o estados financieros.", "Valorizaciones (Método y Documento)", "Un valor declarado puede estar lejos del de mercado. Al adjuntar el documento pasa a TASACION / EEFF.", "Tú"),
        ("Fórmulas con números fijos", "Valores calculados con números pegados en la fórmula del Excel original. Confirmar cada base: " + formulas_txt + ".", "Valorizaciones", "En particular: Strip Center usa 1.100 MM / 40% pero la participación cargada es 35% (hasta $137,5 MM de diferencia); Tajamar usa una UF fija de $40.850.", "Tú"),
        ("Propiedades sin valor ni titular", "«La cabaña» no tiene avalúo ni tasación; Tajamar no tiene titular; faltan ID y Rol SII en varias propiedades.", "Activos y Valorizaciones", "No suman al patrimonio hasta que se valoricen; sin titular no hay look-through.", "Tú"),
        ("Costo y año de compra", "Ninguna propiedad tiene año ni costo de adquisición.", "Activos (Fecha adquisición, Costo)", "Sin costo no se puede calcular ganancia no realizada ni IRR.", "Tú"),
        ("Provisiones", f"Hay {mm(sum(abs(s['saldo']) for s in saldos_p if s['pasivo'] in [p['id'] for p in pasivos if p['tipo'] == 'Provisión']))} de provisiones (impuestos, factoring, hospitalizaciones, arreglos). ¿Restan del patrimonio? Hoy no restan, pero los activos contingentes sí se suman en la versión «ajustada».", "Pasivos (Suma al patrimonio)", "La plantilla muestra el «Patrimonio prudente» (resta provisiones, sin contingentes) al lado del neto.", "Tú"),
        ("Dólar y UF", "Cargar el dólar observado y actualizar la UF a la fecha de trabajo.", "Parametros", "Sin dólar no se calculan los supuestos en USD ni la exposición cambiaria.", "Tú"),
        ("Meses ya vencidos", "El flujo original arranca en agosto de 2026 y es una proyección de octubre de 2025. Cargar lo real de los meses ya transcurridos y cerrarlos.", "Movimientos y Parametros (Último mes cerrado)", "Es el paso que convierte forecast en real y permite recalibrar los supuestos.", "Tú"),
        ("Saldos al día", "Los saldos están a la fecha de corte del Excel. Actualizarlos a una fecha reciente.", "Valorizaciones", "El dashboard muestra esa antigüedad en cada cifra.", "Tú"),
        ("Categorías de gastos", f"{len(catalogo)} conceptos con categoría propuesta por Claude. Revisar y marcar «Categoría confirmada».", "Catalogo_Conceptos", "Antes se adivinaban por texto («FO» o «HONORARIO» clasificaban mal).", "Tú + Claude"),
        ("«Retiros empresas» como egreso y «Valle Centro»", "«Retiros empresas» figura también como egreso (4,0 MM/mes): ¿qué es? «Valle Centro» (110 cuotas) se cuenta como dividendo y parece una cuenta por cobrar.", "Catalogo_Conceptos", "Cambia la lectura de ingresos recurrentes de las empresas.", "Tú"),
        ("Supuestos migrados literales", f"Los {len(supuestos)} supuestos son el flujo original comprimido, sin reajustes. Reemplazar los principales por reglas (arriendos con reajuste UF/IPC, cuotas con fecha de término, dividendos en su mes).", "Supuestos_Forecast", "Es lo que hace que el forecast sea una proyección y no solo la copia del Excel.", "Tú + Claude"),
    ]
    for i, (tema, que, donde, porque, resp) in enumerate(items, 5):
        for j, v in enumerate([i - 4, tema, que, donde, porque, resp, "ABIERTO"], 1):
            c = ws.cell(i, j, v)
            c.font = F_BOLD if j == 2 else F_CALC
            c.alignment = Alignment(wrap_text=True, vertical="top")
    dv = DataValidation(type="list", formula1='"ABIERTO,RESUELTO"', allow_blank=False)
    ws.add_data_validation(dv)
    dv.add(f"G5:G{4 + len(items)}")
    ws.conditional_formatting.add(f"G5:G{4 + len(items)}", CellIsRule(operator="equal", formula=['"RESUELTO"'], fill=PatternFill("solid", bgColor="C9EBD5")))
    ws.freeze_panes = "A5"

    # ---------------------------------------------------------------- LEEME
    ws = sheets["LEEME"]
    ws.column_dimensions["A"].width = 3
    ws.column_dimensions["B"].width = 28
    ws.column_dimensions["C"].width = 95
    ws["B1"], ws["B1"].font = "Plantilla del Family Office — cómo se usa", F_TITLE
    lineas = [
        ("", ""),
        ("Idea central", "Una fila = un hecho. Los valores no se pisan: se agrega una fila nueva con su fecha y el valor vigente es el último. Lo que no se sabe se deja vacío (nunca 0)."),
        ("Colores", "Letra azul = dato que se escribe. Letra negra = fórmula (no tocar). Encabezado gris = columna calculada. Celda amarilla = dato pendiente."),
        ("", ""),
        ("Qué se actualiza y cuándo", ""),
        ("Cada semana (15 min)", "Valorizaciones: saldos de cuentas y fondos (método SALDO). Documentos: link de la cartola."),
        ("Cada mes", "Movimientos: lo real del mes. Parametros: UF y dólar. Luego cerrar el mes (ver abajo)."),
        ("Por evento", "Activos, Entidades y Participaciones (altas/bajas). Valorizaciones (tasación nueva). Pasivos y Saldos_Pasivos."),
        ("Cada año", "Tasaciones de propiedades y estados financieros de las sociedades."),
        ("", ""),
        ("Cómo cerrar un mes", "1) Cargar en Movimientos todo lo real del mes (en positivo; DEVENGADO o PAGADO).  2) En Parametros, mover «Último mes cerrado» a ese mes.  3) Ese mes pasa de FORECAST a REAL en Flujo_Mensual.  4) Revisar Desviaciones: donde diga REVISAR SUPUESTO, ajustar el supuesto."),
        ("Cómo cambiar un supuesto", "No se edita la fila vieja: se le pone fecha en «Hasta» (el último mes en que rigió) y se agrega una fila nueva con «Desde» = mes siguiente. Así queda registrado el supuesto que usaste en cada mes."),
        ("Tipos de supuesto", "MENSUAL (todos los meses), TRIMESTRAL / SEMESTRAL / ANUAL (en el «Mes de pago»; contribuciones, dividendos de una sociedad, seguros) y UNICO (un solo pago). Reajuste: NINGUNO, IPC (usa Parametros) o FIJO (con su %). La moneda puede ser CLP, UF o USD."),
        ("Cuotas de créditos", "Un concepto de egreso (categoría «Servicio de deuda») vinculado al Pasivo; el monto, los meses y la fecha de término son supuestos. Cuando se ingresa el saldo real en Saldos_Pasivos, se recalibra."),
        ("", ""),
        ("Mapa de pestañas", ""),
        ("Parametros", "Fecha de corte, último mes cerrado, UF, dólar, inflación."),
        ("Balance / Controles", "Resultados. Balance se calcula solo. Controles debe decir OK antes de publicar."),
        ("Entidades / Participaciones", "Personas y sociedades, y quién es dueño de qué %. La participación look-through se calcula, no se escribe."),
        ("Activos / Valorizaciones", "Qué se tiene y cuánto vale. Cada valor lleva fecha, método (TASACION, EEFF, SALDO, DECLARADO, ESTIMADO) y link al documento."),
        ("Pasivos / Saldos_Pasivos", "Deudas y su saldo en el tiempo. Las provisiones se registran con Suma al patrimonio = NO."),
        ("Catalogo_Conceptos", "Lista cerrada de conceptos de ingreso y egreso, con categoría y propiedad vinculada. Reemplaza adivinar por el texto del nombre."),
        ("Supuestos_Forecast / Forecast", "Supuestos hacia adelante (se editan) y la grilla mensual que se calcula sola."),
        ("Movimientos / Flujo_Mensual / Desviaciones", "Lo real, el flujo combinado (real + forecast) y la comparación para recalibrar."),
        ("Documentos / Propuestas", "Índice de documentos y cola de aprobación del módulo de carga."),
        ("", ""),
        ("Qué NO hacer", "No cambiar nombres de pestañas ni de encabezados. No pegar valores sobre fórmulas. No escribir números dentro de fórmulas. No borrar filas de eventos: se corrigen agregando otra con fecha posterior."),
        ("Datos migrados", "Todo viene del Excel maestro. Los flujos de caja del Excel original eran una proyección (no había datos reales), por eso entraron como supuestos y Movimientos parte vacío."),
    ]
    for i, (a, b) in enumerate(lineas, 2):
        ws.cell(i, 2, a).font = F_BOLD
        c = ws.cell(i, 3, b)
        c.alignment = Alignment(wrap_text=True, vertical="top")
        ws.cell(i, 2).alignment = Alignment(vertical="top")

    out_path.parent.mkdir(parents=True, exist_ok=True)
    wb.save(out_path)
    print(f"Escrito {out_path}")
    print(f"  entidades {len(ent_rows)} · participaciones {len(participaciones)} · activos {len(activos)} · valorizaciones {len(vals)}")
    print(f"  pasivos {len(pasivos)} · saldos {len(saldos_p)} · conceptos {len(catalogo)} · supuestos {len(supuestos)} (de {SF_SLOTS} filas disponibles)")
    # Guarda el mapeo para la verificación
    meta = dict(ds_to_ac=ds_to_ac, supuestos=[dict(concepto=s["concepto"], freq=s["freq"], monto=s["monto"]) for s in supuestos],
                catalogo={c["id"]: dict(tipo=c["tipo"], nombre=c["nombre"], es_caja=c["es_caja"]) for c in catalogo})
    (out_path.parent / "_meta.json").write_text(json.dumps(meta, ensure_ascii=False), encoding="utf-8")


def entity_for_ds(ds, asset, ent_by_dsid):
    eid = ent_by_dsid.get(asset["ownerEntityId"])
    return eid if eid is not None else ""


if __name__ == "__main__":
    main(Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_OUT)
