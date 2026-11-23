"""Genera la plantilla de datos (6 pestañas + Historial) a partir del Excel maestro actual.

Lee el Excel con el mismo lector que usa el dashboard (src/data_loader.py) y el exportador
(scripts/export_real_dataset.py), así que lo que migra es exactamente lo que el dashboard ya
muestra.

La plantilla es un libro de ENTRADAS: no tiene fórmulas. Lo que se calcula (patrimonio, forecast,
real vs forecast) lo hace el dashboard; la lógica de referencia está en scripts/template_engine.py.

  Leeme        instrucciones y parámetros (UF, dólar, inflación, último mes cerrado)
  Estructura   personas y sociedades, con su dueño y su %
  Patrimonio   una fila por activo o deuda: valor actual, fecha, método y documento
  Flujo_Plan   reglas de ingresos y egresos hacia adelante (monto, frecuencia, reajuste, desde/hasta)
  Flujo_Real   lo real de cada mes
  Documentos   cartolas, tasaciones y facturas, con su estado de aprobación
  Historial    foto de valores en el tiempo (protegida; la completa el sistema)

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
from openpyxl.formatting.rule import FormulaRule
from openpyxl.styles import Alignment, Font, PatternFill
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
MESES = 60
ROWS = 1000  # filas con listas desplegables

NAVY, OPT, YELLOW = "1F2A44", "5B6478", "FFF4C2"
F_HEAD = Font(bold=True, color="FFFFFF", name="Calibri", size=10)
F_INPUT = Font(color="1F4FD8", name="Calibri", size=10)
F_TITLE = Font(bold=True, size=14, color=NAVY, name="Calibri")
F_BOLD = Font(bold=True, name="Calibri", size=10)
F_NOTE = Font(color="5B6478", size=10, name="Calibri")
FILL_REQ = PatternFill("solid", fgColor=NAVY)
FILL_OPT = PatternFill("solid", fgColor=OPT)
FILL_YELLOW = PatternFill("solid", fgColor=YELLOW)
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




CLASES = ["Caja", "Inversiones financieras", "Bienes raíces", "Empresas", "Otros activos", "Activo contingente",
          "Deuda – Hipotecaria", "Deuda – Patente morosa", "Deuda – Otra", "Provisión (memo)"]
LISTAS = {
    "tipo_entidad": ["Family Office", "Persona", "Titularidad conjunta", "Sociedad operativa", "Sociedad patrimonial", "Otro"],
    "perimetro_ent": ["Núcleo", "Fuera", "Sociedad"],
    "clase": CLASES,
    "liquidez": ["Inmediata", "Corta (≤ 10 días)", "Ilíquido"],
    "perimetro": ["Familia", "Empresa", "Fuera", "Pendiente"],
    "metodo": ["TASACION", "EEFF", "SALDO", "DECLARADO", "ESTIMADO"],
    "tipo_flujo": ["Ingreso", "Egreso"],
    "moneda": ["CLP", "UF", "USD"],
    "freq": ["MENSUAL", "TRIMESTRAL", "SEMESTRAL", "ANUAL", "UNICO"],
    "reaj": ["NINGUNO", "IPC", "FIJO"],
    "si_no": ["SI", "NO"],
    "estado_mov": ["DEVENGADO", "PAGADO"],
    "tipo_doc": ["Tasación", "Cartola", "Factura de arriendo", "Factura de servicio", "Estado financiero", "Memo de empresa", "Certificado de deuda", "Otro"],
    "estado_doc": ["Recibido", "Leído", "Aprobado", "Rechazado"],
}


def lista_inline(nombre):
    return '"' + ",".join(LISTAS[nombre]) + '"'


def table(ws, columns, widths):
    """columns = [(título, obligatoria)]. Encabezado azul = obligatoria, gris = opcional."""
    for i, (t, req) in enumerate(columns, 1):
        c = ws.cell(1, i, t)
        c.font = F_HEAD
        c.fill = FILL_REQ if req else FILL_OPT
        c.alignment = Alignment(wrap_text=True, vertical="center")
        ws.column_dimensions[CL(i)].width = widths[i - 1]
    ws.row_dimensions[1].height = 34
    ws.freeze_panes = "C2"
    ws.auto_filter.ref = f"A1:{CL(len(columns))}{ROWS}"


def put_row(ws, r, values, fmts=None):
    for j, v in enumerate(values, 1):
        c = ws.cell(r, j, v)
        c.font = F_INPUT
        if fmts and fmts.get(j):
            c.number_format = fmts[j]


def fmt_cols(ws, fmts, first=2, last=ROWS):
    for col, f in fmts.items():
        for r in range(first, last + 1):
            ws.cell(r, col).number_format = f


def dv_inline(ws, col, lista):
    dv = DataValidation(type="list", formula1=lista_inline(lista), allow_blank=True)
    dv.error, dv.errorTitle = "Elige un valor de la lista.", "Valor no permitido"
    ws.add_data_validation(dv)
    dv.add(f"{CL(col)}2:{CL(col)}{ROWS}")


def dv_range(ws, col, ref, strict=True):
    dv = DataValidation(type="list", formula1=ref, allow_blank=True, showErrorMessage=strict)
    ws.add_data_validation(dv)
    dv.add(f"{CL(col)}2:{CL(col)}{ROWS}")


def segmentar(valores):
    """Serie mensual → filas de supuesto. Ceros y vacíos = sin pago (compresión sin pérdida).

    Tramos de ≥2 meses iguales → MENSUAL con Desde/Hasta. Pagos sueltos del mismo mes del año con
    el mismo monto → ANUAL. El resto, UNICO.
    """
    v = [0.0 if (x is None or (isinstance(x, float) and math.isnan(x))) else round(float(x), 2) for x in valores]
    out, i, singles = [], 0, []
    while i < len(v):
        j = i
        while j + 1 < len(v) and abs(v[j + 1] - v[i]) < 0.5:
            j += 1
        if abs(v[i]) >= 0.5:
            if j > i:
                out.append(("MENSUAL", v[i], i, j))
            else:
                singles.append((i, v[i]))
        i = j + 1
    por_mes: dict[int, list] = {}
    for idx_, val in singles:
        por_mes.setdefault(idx_ % 12, []).append((idx_, val))
    usados = set()
    for items in por_mes.values():
        k = 0
        while k < len(items):
            m = k
            while m + 1 < len(items) and items[m + 1][0] - items[m][0] == 12 and abs(items[m + 1][1] - items[k][1]) < 0.5:
                m += 1
            if m > k:
                out.append(("ANUAL", items[k][1], items[k][0], items[m][0]))
                usados.update(items[x][0] for x in range(k, m + 1))
            k = m + 1
    for idx_, val in singles:
        if idx_ not in usados:
            out.append(("UNICO", val, idx_, idx_))
    out.sort(key=lambda r: (r[2], r[3]))
    return out


def metodo_de(a: dict) -> str:
    q = a.get("valuationQuality")
    if a["assetClass"] == "INMOBILIARIO":
        return "DECLARADO" if q == "TASADO" else "ESTIMADO"
    if a["assetClass"] in ("EMPRESAS_PRIVADAS", "OTROS"):
        return "DECLARADO"
    if any(k in a["name"].lower() for k in ("collins", "citify", "polo")):
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
    if sub.startswith("Fondo mutuo") or sub in ("USD", "Posición en USD") or sub == "Instrumento financiero":
        return "Corta (≤ 10 días)"
    return "Ilíquido"


CLASE = {"CAJA": "Caja", "MERCADOS_PUBLICOS": "Inversiones financieras", "INMOBILIARIO": "Bienes raíces",
         "EMPRESAS_PRIVADAS": "Empresas", "OTROS": "Otros activos"}

# Partidas que se mantienen una por una (contractuales o con tratamiento propio). El resto de los
# egresos se agrupa en un presupuesto por categoría: los totales no cambian.
INDIVIDUALES_EGRESO = {"Servicio de deuda", "Retiros de empresas (egreso)", "Ajuste por inflación (no es caja)"}


def main(out_path: Path) -> None:
    d = load_fo_data()
    ds = build_dataset()
    as_of = iso(ds["asOf"])
    meses = [first_of_month(m) for m in d.flujo_caja.meses]
    assert len(meses) == MESES, f"El flujo trae {len(meses)} meses, se esperaban {MESES}"

    # ---------------------------------------------------------------- Estructura (migración)
    ent_rows, ent_id = [], {}

    def add_entity(name, tipo, rut=None, perim="Sociedad", nota=None, dueno=None, pct=None):
        key = slug(name)
        if key in ent_id:
            row = ent_rows[int(ent_id[key][2:])]
            if rut and not row["rut"]:
                row["rut"] = rut
            return ent_id[key]
        eid = f"E-{len(ent_rows):03d}"
        ent_rows.append(dict(id=eid, name=name, tipo=tipo, rut=rut, perim=perim, dueno=dueno, pct=pct, nota=nota))
        ent_id[key] = eid
        return eid

    add_entity("Family Office", "Family Office", perim="Núcleo", nota="Raíz del perímetro consolidado (núcleo familiar + hijos).")
    personas = {}
    for _, p in d.perimetro_nucleo.iterrows():
        n = clean(p["Persona"])
        if n:
            personas[slug(n)] = (n, clean(p["RUT"]), "Núcleo", clean(p["Rol"]))
    for _, p in d.perimetro_fuera.iterrows():
        n = clean(p["Persona"])
        if n:
            personas[slug(n)] = (n, clean(p["RUT"]), "Fuera", clean(p["Nota"]))
    for n, rut, perim, nota in personas.values():
        add_entity(n, "Persona", rut, perim, nota)
    TIPO_DS = {"SPV": "Sociedad patrimonial", "HOLDING": "Sociedad patrimonial", "OPERATING_COMPANY": "Sociedad operativa"}
    for e in ds["entities"]:
        if e["id"] in ("fo", "e-sin-titular-identificado") or slug(e["name"]) in ent_id:
            continue
        tipo = "Titularidad conjunta" if "&" in e["name"] else TIPO_DS.get(e["entityType"], "Otro")
        add_entity(e["name"], tipo, e.get("taxId"))
    pct_sociedad = {}
    for _, row in d.empresas.iterrows():
        n = clean(row["Empresa"])
        if not n:
            continue
        rut, confirmado = clean(row["RUT"]), bool(row["RUT confirmado"])
        eid = add_entity(n, "Sociedad operativa", rut if confirmado else None)
        e = ent_rows[int(eid[2:])]
        e["tipo"] = "Sociedad operativa"
        e["dueno"] = "E-000"
        e["pct"] = num(row["% Participación (provisorio)"])
        notas = []
        if rut and not confirmado:
            notas.append(f"RUT sin confirmar en el Excel original: {rut}" if any(ch.isdigit() for ch in rut) else "RUT pendiente de confirmar")
        if e["pct"] is None:
            notas.append("El Excel original no informa el % de participación.")
        else:
            notas.append("% provisorio del Excel original.")
        e["nota"] = " ".join(notas)
        pct_sociedad[eid] = e["pct"]
    ent_by_dsid = {e["id"]: ent_id.get(slug(e["name"]), "" if e["id"] == "e-sin-titular-identificado" else None) for e in ds["entities"]}
    ent_by_dsid["fo"] = "E-000"

    def entity_for(raw):
        name = canonical_titular(raw or "Sin titular identificado")
        if name == "Family Office":
            return "E-000"
        if name.startswith("Sin titular"):
            return ""
        return add_entity(name, "Sociedad patrimonial")

    # ---------------------------------------------------------------- Patrimonio (migración)
    wf = openpyxl.load_workbook(ROOT / "data" / "FO_Master_Consolidado.xlsx")
    formulas_br = {}
    for row in wf["Bienes_Raices"].iter_rows(min_row=5):
        direccion, tas = clean(row[2].value), row[8].value
        if direccion and isinstance(tas, str) and tas.startswith("="):
            formulas_br[direccion] = tas
    items = []

    def nuevo(**kw):
        it = dict(id=f"P-{len(items) + 1:03d}", nombre=None, clase=None, titular="", sub="", pct=1.0, valor=None, fecha=None, metodo=None,
                  doc=None, liq=None, perim="Familia", comuna=None, rol=None, sup=None, f_adq=None, costo=None, contraparte=None,
                  tasa=None, venc=None, garantia=None, nota=None, ant=None)
        it.update(kw)
        items.append(it)
        return it

    for a in ds["assets"]:
        sn = a.get("sourceNotes") or {}
        emp = a["assetClass"] == "EMPRESAS_PRIVADAS"
        sin_valor = (emp and a["currentValue"] == 0) or (a["assetClass"] == "MERCADOS_PUBLICOS" and a["currentValue"] == 0 and a.get("subAssetClass") == "Instrumento financiero")
        nota = sn.get("nota") if isinstance(sn.get("nota"), str) else None
        if a["name"] in formulas_br:
            nota = f"Valor tomado de una fórmula del Excel original: {formulas_br[a['name']]}"
        if emp:
            nota = "Valor del 100% de la sociedad; en el Excel original se obtuvo dividiendo el equity declarado por el %." if not sin_valor else None
            titular, sub, pct = "E-000", add_entity(a["name"], "Sociedad operativa"), None
        else:
            eid = ent_by_dsid.get(a["ownerEntityId"])
            titular, sub, pct = (eid if eid is not None else ""), "", a["ownershipPercentage"]
        nuevo(nombre=a["name"], clase=CLASE[a["assetClass"]], titular=titular, sub=sub, pct=pct,
              valor=None if sin_valor else a["currentValue"], fecha=None if sin_valor else iso(a.get("lastValuationDate") or ds["asOf"]),
              metodo=None if sin_valor else metodo_de(a), liq=liquidez_de(a),
              comuna=a.get("city") if a["assetClass"] == "INMOBILIARIO" else None, rol=sn.get("rolSII"), sup=a.get("surfaceM2"),
              nota=nota, ant=a["id"])
    for _, row in d.bienes_raices.iterrows():  # propiedades que el Excel lista sin valor
        if num(row["Valor Balance (CLP)"]) is None:
            nuevo(nombre=clean(row["Dirección"]) or f"Propiedad {row['ID']}", clase="Bienes raíces", titular=entity_for(clean(row["Titular"])),
                  pct=num(row["% Participación"]) or 1.0, liq="Ilíquido", comuna=clean(row["Comuna"]),
                  nota="El Excel original la lista sin avalúo ni tasación: falta valorizar.")
    for fuente, clase in ((d.liquidez.detalle, "Caja"), (d.inversiones.detalle, "Inversiones financieras")):
        for _, row in fuente.iterrows():  # fuera del perímetro: se listan, no suman
            perim, nombre, monto = clean(row["Perímetro"]) or "Familia", clean(row["Cuenta/Instrumento"]), num(row["Monto (CLP)"])
            if perim == "Familia" or not nombre:
                continue
            nuevo(nombre=nombre, clase=clase, titular=entity_for(clean(row["Titular/Entidad"])), valor=monto, fecha=as_of if monto is not None else None,
                  metodo="SALDO" if monto is not None else None, liq="Inmediata" if clase == "Caja" else "Corta (≤ 10 días)", perim=perim,
                  nota="Fuera del perímetro consolidado: se lista pero no suma al patrimonio.")
    for _, row in d.activos_contingentes.iterrows():
        nombre, monto = clean(row.iloc[0]), num(row.iloc[1])
        if nombre and monto is not None and "TOTAL" not in nombre.upper():
            nuevo(nombre=nombre, clase="Activo contingente", titular="E-000", valor=monto, fecha=as_of, metodo="DECLARADO", liq="Ilíquido",
                  nota=f"Contingente: no suma al patrimonio hasta que se cobre. {clean(row.iloc[2]) or ''}".strip())
    for l in ds["loans"]:
        nuevo(nombre=l["name"], clase="Deuda – Patente morosa", titular=ent_by_dsid.get(l["borrowerEntityId"]) or "", valor=l["balance"], fecha=as_of,
              metodo="DECLARADO", contraparte=l["bank"], nota="Saldo moroso informado en la hoja Pasivos del Excel original.")
    casa = next((i["id"] for i in items if "casa santuario" in i["nombre"].lower() and i["clase"] == "Bienes raíces"), None)
    p_santuario = nuevo(nombre="Crédito hipotecario Casa Santuario", clase="Deuda – Hipotecaria", contraparte="Santander", garantia=casa, pct=1.0,
                        nota="Deducido del flujo (\"Pago dividendo Casa Santuario Santander\"). FALTA: saldo, tasa, plazo y deudor. Confirmar.")
    p_constantino = nuevo(nombre="Crédito hipotecario Constantino", clase="Deuda – Hipotecaria", pct=1.0,
                          nota="Deducido del flujo (\"Dividendos Constantino\"). FALTA: acreedor, saldo, tasa, plazo, propiedad y deudor. Confirmar.")
    for _, row in d.otras_partidas.provisiones.iterrows():
        nombre, monto = clean(row["Concepto"]), num(row["Monto (CLP)"])
        if nombre and monto is not None:
            nuevo(nombre=nombre, clase="Provisión (memo)", valor=abs(monto), fecha=as_of, metodo="DECLARADO", contraparte="(Provisión interna)",
                  nota="Fondo reservado: no resta del patrimonio en el Excel original.")

    # ---------------------------------------------------------------- Flujo_Plan (migración)
    mapping = json.loads(RENT_MAPPING.read_text(encoding="utf-8"))["streams"]
    por_nombre = {i["nombre"].lower(): i["id"] for i in items if i["clase"] == "Bienes raíces"}
    fc = d.flujo_caja
    plan, originales = [], []  # originales: (tipo, partida original, categoría, serie) para verificar

    def filas(tipo, partida, categoria, serie, es_caja="SI", vinculo=None, nota=None):
        for freq, monto, a, b in segmentar(serie):
            plan.append(dict(id=f"SF-{len(plan) + 1:03d}", partida=partida, tipo=tipo, categoria=categoria, monto=monto, moneda="CLP", freq=freq,
                             mes=meses[a].month if freq == "ANUAL" else None, desde=meses[a],
                             hasta=None if (freq == "MENSUAL" and b == MESES - 1) else meses[b], reaj="NINGUNO", pj=None, mj=None,
                             vinculo=vinculo, es_caja=None if es_caja == "SI" else "NO", nota=nota))

    grupos: dict[str, dict] = {}
    for tipo, df in (("Ingreso", fc.ingresos), ("Egreso", fc.egresos)):
        for concepto, serie in df.iterrows():
            nombre = clean_name = " ".join(str(concepto).split())
            if not nombre or nombre.upper().startswith("TOTAL"):
                continue
            tipo_u = "INGRESO" if tipo == "Ingreso" else "EGRESO"
            cat = categoria_de(nombre, tipo_u)
            vals = serie.tolist()
            originales.append((tipo, nombre, cat, vals))
            es_caja = "NO" if "EFECTO INFLACION" in nombre.upper() else "SI"
            if tipo == "Egreso" and cat not in INDIVIDUALES_EGRESO:
                g = grupos.setdefault(cat, dict(serie=[0.0] * MESES, nombres=[]))
                g["serie"] = [a + (0.0 if (b is None or (isinstance(b, float) and math.isnan(b))) else float(b)) for a, b in zip(g["serie"], vals)]
                g["nombres"].append(nombre)
                continue
            vinculo, nota = None, None
            up = nombre.upper()
            if tipo == "Ingreso":
                for m in mapping:
                    if m["concept"].upper() in up:
                        ids = [pid for n_, pid in por_nombre.items() if any(x.lower() in n_ for x in m["match"])]
                        vinculo = ", ".join(ids) or None
                        nota = f"Vínculo {m['status']}: {m.get('note') or ''}".strip()
                        break
            if "DIVIDENDO CASA SANTUARIO" in up:
                vinculo, nota = p_santuario["id"], "Cuota de crédito hipotecario deducida del nombre. Falta fecha de término."
            if "DIVIDENDOS CONSTANTINO" in up:
                vinculo, nota = p_constantino["id"], "Cuota de crédito hipotecario deducida del nombre. Falta fecha de término."
            if es_caja == "NO":
                nota = "No es caja: ajuste del modelo original. Decidir si se mantiene."
            filas(tipo, nombre, cat, vals, es_caja, vinculo, nota)
    for cat, g in grupos.items():
        nombres = g["nombres"]
        resumen = ", ".join(n.title() for n in nombres)
        filas("Egreso", f"Presupuesto — {cat}", cat, g["serie"], nota=f"Suma de {len(nombres)} partidas del Excel original: {resumen}"[:400])

    # Lo que no es caja va al final (son contiguas: se pueden borrar de una vez si se decide no usarlas).
    plan.sort(key=lambda r: r["es_caja"] == "NO")
    for k, r in enumerate(plan, 1):
        r["id"] = f"SF-{k:03d}"

    # ================================================================ ESCRITURA
    wb = Workbook()
    wb.remove(wb.active)
    S = {}
    for nombre, color in (("Leeme", "999999"), ("Estructura", "1F4FD8"), ("Patrimonio", "1F4FD8"), ("Flujo_Plan", "E67E22"),
                          ("Flujo_Real", "2E8B57"), ("Documentos", "2E8B57"), ("Historial", "999999")):
        S[nombre] = wb.create_sheet(nombre)
        S[nombre].sheet_properties.tabColor = color

    # ---------------- Leeme (instrucciones + parámetros + lista de categorías)
    ws = S["Leeme"]
    ws.column_dimensions["A"].width = 3
    ws.column_dimensions["B"].width = 34
    ws.column_dimensions["C"].width = 18
    ws.column_dimensions["D"].width = 70
    ws.column_dimensions["F"].width = 36
    ws.column_dimensions["G"].width = 28
    ws["B1"] = "Plantilla del Family Office"
    ws["B1"].font = F_TITLE
    ws["B2"] = "Este archivo solo guarda lo que se escribe. Los totales, el forecast y los controles los calcula el dashboard."
    ws["B2"].font = F_NOTE
    ws["B4"], ws["C4"], ws["D4"] = "Parámetro", "Valor", "Qué es"
    for c in ("B4", "C4", "D4"):
        ws[c].font, ws[c].fill = F_HEAD, FILL_REQ
    uf, usd = d.supuestos.get("valor_uf"), d.supuestos.get("tc_usd_clp")
    params = [
        ("Fecha_Corte", "Fecha de corte del balance", as_of, FMT_DATE, "Fecha a la que corresponden los valores de Patrimonio."),
        ("Mes_Inicio", "Primer mes del flujo", meses[0], FMT_MES, "El flujo cubre 60 meses desde aquí."),
        ("Ultimo_Mes_Cerrado", "Último mes cerrado (REAL)", prev_month(meses[0]), FMT_MES,
         "Hasta este mes el flujo es REAL (Flujo_Real); desde el siguiente es forecast (Flujo_Plan). Para cerrar un mes: cargar su Flujo_Real y mover esta fecha."),
        ("UF_Hoy", "UF a la fecha de corte (CLP)", uf, "#,##0.00", "Banco Central. Convierte y proyecta los supuestos en UF."),
        ("USD_CLP", "Dólar observado (CLP)", usd, "#,##0.00", "PENDIENTE: sin él, los supuestos en USD no se calculan (quedan sin dato)."),
        ("IPC_Anual", "Inflación anual proyectada", d.supuestos.get("inflacion_anual"), FMT_PCT, "Reajusta los supuestos con reajuste IPC y proyecta la UF."),
        ("Umbral_Desv", "Umbral de desviación real vs forecast", 0.10, FMT_PCT, "Sobre este % de diferencia, el dashboard marca REVISAR SUPUESTO."),
        ("Factor_Avaluo", "Factor tasación / avalúo fiscal", d.supuestos.get("factor_tasacion"), "0.00", "Instrucción del cliente para estimar valor cuando no hay tasación."),
        ("Ret_Liquidez", "Retorno esperado — Liquidez", d.supuestos.get("retorno_liquidez"), FMT_PCT, "Supuesto referencial del Excel original."),
        ("Ret_Inversiones", "Retorno esperado — Inversiones", d.supuestos.get("retorno_inversiones"), FMT_PCT, "Supuesto referencial."),
        ("Ret_Inmobiliario", "Retorno esperado — Bienes raíces", d.supuestos.get("retorno_bienes_raices"), FMT_PCT, "Supuesto referencial."),
        ("Ret_Empresas", "Retorno esperado — Empresas", d.supuestos.get("retorno_empresas"), FMT_PCT, "Supuesto referencial."),
        ("Tasa_Descuento", "Tasa de descuento (VAN)", d.supuestos.get("tasa_descuento"), FMT_PCT, "Supuesto referencial."),
    ]
    for i, (name, label, val, fmt, note) in enumerate(params, 5):
        ws.cell(i, 2, label).font = F_BOLD
        c = ws.cell(i, 3, val)
        c.font, c.number_format = F_INPUT, fmt
        if val is None:
            c.fill = FILL_YELLOW
        ws.cell(i, 4, note).font = F_NOTE
        ws.cell(i, 4).alignment = Alignment(wrap_text=True, vertical="top")
        wb.defined_names[name] = DefinedName(name, attr_text=f"Leeme!$C${i}")
    ws["F4"], ws["G4"] = "Categoría de flujo", "Equivalente en el dashboard"
    for c in ("F4", "G4"):
        ws[c].font, ws[c].fill = F_HEAD, FILL_REQ
    for i, (cat, eq) in enumerate(CATEGORIAS, 5):
        ws.cell(i, 6, cat).font = F_INPUT
        ws.cell(i, 7, eq).font = F_INPUT
    cat_ref = f"=Leeme!$F$5:$F${4 + len(CATEGORIAS)}"
    r0 = 5 + len(params) + 1
    guia = [
        ("Idea central", "Una fila por cosa. Los valores llevan fecha y método. Lo que no se sabe se deja vacío (nunca 0)."),
        ("Encabezados", "Azul = campo que conviene completar siempre. Gris = opcional (solo si aplica). Celda amarilla = falta un dato."),
        ("Qué se actualiza", "Cada semana: Patrimonio (saldos). Cada mes: Flujo_Real y el último mes cerrado. Por evento: Estructura, Patrimonio (tasaciones, deudas), Flujo_Plan."),
        ("No hacer", "No cambiar nombres de pestañas ni de encabezados. No pegar fórmulas ni números dentro de celdas de texto. Los valores van en CLP."),
        ("Materialidad", "El detalle completo (documento, método, tasación) importa para lo que pesa más del 2% del patrimonio. Para lo menor basta nombre, valor y fecha."),
        ("Cómo cerrar un mes", "1) Cargar en Flujo_Real lo del mes (monto en positivo; el signo lo da «Tipo»). 2) Mover «Último mes cerrado» al mes siguiente. 3) El dashboard compara real vs plan y marca qué supuestos revisar."),
        ("Cómo cambiar un supuesto", "No se edita la fila vieja: se le pone fecha en «Hasta» (último mes que rigió) y se agrega otra fila con «Desde» = mes siguiente."),
        ("Tipos de supuesto", "Frecuencia MENSUAL, TRIMESTRAL, SEMESTRAL, ANUAL (en «Mes de pago») o UNICO. Reajuste NINGUNO, IPC (usa la inflación de arriba) o FIJO (con su %). Moneda CLP, UF o USD."),
        ("Cuotas de créditos", "Una fila de Flujo_Plan con categoría «Servicio de deuda», «Vinculado a» la deuda (ID de Patrimonio) y fecha «Hasta» = último mes de pago."),
        ("Historial", "Pestaña protegida: la completa el sistema con una foto de valores. No se edita a mano."),
    ]
    for i, (a_, b_) in enumerate(guia, r0):
        ws.cell(i, 2, a_).font = F_BOLD
        ws.cell(i, 2).alignment = Alignment(vertical="top")
        c = ws.cell(i, 3, b_)
        ws.merge_cells(start_row=i, start_column=3, end_row=i, end_column=4)
        c.alignment = Alignment(wrap_text=True, vertical="top")
        ws.row_dimensions[i].height = 32

    # ---------------- Estructura
    ws = S["Estructura"]
    table(ws, [("ID", True), ("Nombre", True), ("Tipo", True), ("RUT", False), ("Perímetro", False), ("Dueño (ID)", False), ("% del dueño", False), ("Notas", False)],
          [9, 46, 22, 16, 12, 11, 12, 70])
    for i, e in enumerate(ent_rows, 2):
        put_row(ws, i, [e["id"], e["name"], e["tipo"], e["rut"], e["perim"], e["dueno"], e["pct"], e["nota"]])
        if e["dueno"] and e["pct"] is None:
            ws.cell(i, 7).fill = FILL_YELLOW
    fmt_cols(ws, {7: FMT_PCT})
    dv_inline(ws, 3, "tipo_entidad")
    dv_inline(ws, 5, "perimetro_ent")
    dv_range(ws, 6, f"=$A$2:$A${ROWS}")

    # ---------------- Patrimonio
    ws = S["Patrimonio"]
    cols = [("ID", True), ("Nombre", True), ("Clase", True), ("Titular (ID)", True), ("% familia", True), ("Valor 100% (CLP)", True),
            ("Fecha del valor", True), ("Método", True), ("Documento (link)", False), ("Sociedad subyacente (ID)", False), ("Perímetro", False),
            ("Liquidez", False), ("Comuna", False), ("Rol SII", False), ("Superficie m²", False), ("Fecha adquisición", False),
            ("Costo adquisición (CLP)", False), ("Acreedor / contraparte", False), ("Tasa anual", False), ("Vencimiento", False),
            ("Garantía (ID)", False), ("Notas", False), ("ID anterior", False)]
    table(ws, cols, [8, 44, 22, 10, 9, 18, 12, 12, 30, 12, 10, 16, 14, 12, 10, 12, 16, 22, 9, 12, 10, 60, 26])
    for i, it in enumerate(items, 2):
        put_row(ws, i, [it["id"], it["nombre"], it["clase"], it["titular"] or None, it["pct"], it["valor"], it["fecha"], it["metodo"], it["doc"],
                        it["sub"] or None, it["perim"], it["liq"], it["comuna"], it["rol"], it["sup"], it["f_adq"], it["costo"], it["contraparte"],
                        it["tasa"], it["venc"], it["garantia"], it["nota"], it["ant"]])
    fmt_cols(ws, {5: FMT_PCT, 6: FMT_CLP, 7: FMT_DATE, 16: FMT_DATE, 17: FMT_CLP, 19: FMT_PCT, 20: FMT_DATE})
    dv_inline(ws, 3, "clase")
    dv_inline(ws, 8, "metodo")
    dv_inline(ws, 11, "perimetro")
    dv_inline(ws, 12, "liquidez")
    dv_range(ws, 4, f"=Estructura!$A$2:$A${ROWS}")
    dv_range(ws, 10, f"=Estructura!$A$2:$A${ROWS}")
    dv_range(ws, 21, f"=$A$2:$A${ROWS}")
    amarillo = PatternFill("solid", bgColor=YELLOW)
    ws.conditional_formatting.add(f"F2:F{ROWS}", FormulaRule(formula=['AND($A2<>"",$F2="")'], fill=amarillo))
    ws.conditional_formatting.add(f"D2:D{ROWS}", FormulaRule(formula=['AND($A2<>"",$D2="",$C2<>"Activo contingente")'], fill=amarillo))

    # ---------------- Flujo_Plan
    ws = S["Flujo_Plan"]
    table(ws, [("ID", True), ("Partida", True), ("Tipo", True), ("Categoría", True), ("Monto", True), ("Moneda", True), ("Frecuencia", True),
               ("Mes de pago", False), ("Desde", True), ("Hasta", False), ("Reajuste", False), ("% reajuste anual", False), ("Mes del reajuste", False),
               ("Vinculado a (ID de Patrimonio)", False), ("Es caja", False), ("Notas", False)],
          [8, 52, 9, 30, 15, 8, 12, 8, 10, 10, 11, 10, 10, 16, 8, 80])
    for i, r in enumerate(plan, 2):
        put_row(ws, i, [r["id"], r["partida"], r["tipo"], r["categoria"], r["monto"], r["moneda"], r["freq"], r["mes"], r["desde"], r["hasta"],
                        r["reaj"], r["pj"], r["mj"], r["vinculo"], r["es_caja"], r["nota"]])
    fmt_cols(ws, {5: "#,##0.##", 9: FMT_MES, 10: FMT_MES, 12: FMT_PCT})
    for col, lst in ((3, "tipo_flujo"), (6, "moneda"), (7, "freq"), (11, "reaj"), (15, "si_no")):
        dv_inline(ws, col, lst)
    dv_range(ws, 4, cat_ref)

    # ---------------- Flujo_Real
    ws = S["Flujo_Real"]
    table(ws, [("Fecha", True), ("Partida", True), ("Tipo", True), ("Monto", True), ("Estado", True), ("Documento (link)", False),
               ("Categoría (si la partida es nueva)", False), ("Notas", False)], [12, 52, 9, 16, 12, 34, 30, 60])
    fmt_cols(ws, {1: FMT_DATE, 4: FMT_CLP})
    dv_inline(ws, 3, "tipo_flujo")
    dv_inline(ws, 5, "estado_mov")
    dv_range(ws, 2, f"=Flujo_Plan!$B$2:$B${ROWS}", strict=False)
    dv_range(ws, 7, cat_ref)
    ws["J1"] = "Monto siempre en positivo (el signo lo da «Tipo»). DEVENGADO = reconocido aunque no esté pagado; PAGADO = ya movió caja. Una partida nueva puede escribirse libremente."
    ws["J1"].font = F_NOTE

    # ---------------- Documentos
    ws = S["Documentos"]
    table(ws, [("ID", True), ("Fecha de subida", True), ("Tipo", True), ("Ítem (ID de Patrimonio o Estructura)", True), ("Link", True), ("Subido por", True),
               ("Estado", True), ("Dato propuesto", False), ("Aprobado por", False), ("Notas", False)], [8, 14, 22, 22, 50, 14, 12, 40, 14, 50])
    fmt_cols(ws, {2: FMT_DATE})
    dv_inline(ws, 3, "tipo_doc")
    dv_inline(ws, 7, "estado_doc")
    ws["L1"] = "Cola del módulo de carga: la lectura automática escribe en «Dato propuesto» y nada pasa a Patrimonio o Flujo_Real hasta que una persona aprueba."
    ws["L1"].font = F_NOTE

    # ---------------- Historial (línea base de la migración)
    ws = S["Historial"]
    table(ws, [("Fecha", True), ("Ítem (ID)", True), ("Valor 100% (CLP)", True), ("% familia", True), ("Método", True), ("Origen", True)], [12, 10, 20, 10, 12, 40])
    r = 2
    for it in items:
        if it["valor"] is None:
            continue
        put_row(ws, r, [it["fecha"], it["id"], it["valor"], it["pct"], it["metodo"], "Línea base de la migración inicial"])
        r += 1
    fmt_cols(ws, {1: FMT_DATE, 3: FMT_CLP, 4: FMT_PCT}, last=r - 1)
    ws.protection.sheet = True
    ws["H1"] = "Protegida: la completa el sistema (foto de valores en cada actualización). Para editar a mano hay que desproteger la hoja."
    ws["H1"].font = F_NOTE

    out_path.parent.mkdir(parents=True, exist_ok=True)
    wb.save(out_path)
    print(f"Escrito {out_path}")
    print(f"  pestañas {len(wb.sheetnames)} · estructura {len(ent_rows)} · patrimonio {len(items)} · flujo_plan {len(plan)} filas")
    meta = dict(
        originales=[dict(tipo=t, partida=p, categoria=c, serie=[0.0 if (x is None or (isinstance(x, float) and math.isnan(x))) else float(x) for x in s]) for t, p, c, s in originales],
        ant={i["id"]: i["ant"] for i in items if i["ant"]},
        items_sin_valor=[i["nombre"] for i in items if i["valor"] is None],
        n_plan=len(plan), n_original_conceptos=len(originales),
    )
    (out_path.parent / "_meta.json").write_text(json.dumps(meta, ensure_ascii=False), encoding="utf-8")


if __name__ == "__main__":
    main(Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_OUT)
