"""Verifica la plantilla generada contra el Excel maestro y el dashboard.

Las fórmulas (Flujo_Plan y totales) se recalculan con LibreOffice y se comparan contra la lógica de
referencia de scripts/template_engine.py, que es la que debe replicar el dashboard.

  1) Estructura: pestañas esperadas, fórmulas solo donde corresponde, sin celdas con error.
  2) Patrimonio por clase, activos, deudas y neto contra el dataset del dashboard.
  3) Flujo_Plan (fórmulas) = referencia en Python = Flujo_Caja del Excel original, mes a mes.
  4) Formato contable: saldo inicial, ingresos, egresos, flujo neto y saldo final de caja.
  5) Flujo_Real: lo escrito aparece con sus totales; un mes cerrado deja de ser forecast.
  6) Tipos de supuesto en las fórmulas: frecuencia, reajuste IPC y fijo, UF, USD, fecha de término.

Uso:  python3 scripts/check_template.py [plantilla.xlsx]
Sale con código 1 si algo no cuadra. No escribe nada en el repositorio.
"""

from __future__ import annotations

import json
import shutil
import subprocess
import sys
import tempfile
from datetime import date
from pathlib import Path

import openpyxl

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "scripts"))

import template_engine as te  # noqa: E402
from export_real_dataset import build as build_dataset  # noqa: E402
from src.data_loader import load_fo_data  # noqa: E402

DEFAULT = ROOT / "data" / "plantilla" / "FO_Plantilla.xlsx"
EXPECTED_SHEETS = ["Leeme", "Estructura", "Patrimonio", "Supuestos", "Flujo_Plan", "Flujo_Real", "Documentos", "Historial"]
CON_FORMULAS = {"Leeme", "Supuestos", "Flujo_Plan", "Flujo_Real"}
FAILS: list[str] = []
M0 = te.FLOW_FIRST_COL


def recalc(src: Path, outdir: Path) -> Path:
    outdir.mkdir(parents=True, exist_ok=True)
    subprocess.run(["soffice", "--headless", "--calc", "--convert-to", "xlsx", "--outdir", str(outdir), str(src)], check=True, capture_output=True, timeout=600)
    return outdir / src.name


def check(ok: bool, label: str, detail: str = "") -> None:
    print(("  ✓ " if ok else "  ✗ ") + label + (f"  {detail}" if detail else ""))
    if not ok:
        FAILS.append(label)


def close(a, b, tol=1.0):
    return abs((a or 0) - (b or 0)) < tol


def param_cell(wb, name):
    sheet, cell = wb.defined_names[name].attr_text.split("!")
    return wb[sheet], cell.replace("$", "")


def find_row(ws, partida, tipo):
    return next(r for r in range(5, ws.max_row + 1) if ws.cell(r, 1).value == partida and ws.cell(r, 3).value == tipo)


def main() -> int:
    src = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT
    meta = json.loads((src.parent / "_meta.json").read_text(encoding="utf-8"))
    work = Path(tempfile.mkdtemp(prefix="plantilla_"))
    d = load_fo_data()
    ds = build_dataset()

    print("1) Estructura de la plantilla")
    wbf = openpyxl.load_workbook(src)
    check(wbf.sheetnames == EXPECTED_SHEETS, "8 pestañas esperadas", ", ".join(wbf.sheetnames))
    indebidas = [ws.title for ws in wbf if ws.title not in CON_FORMULAS and any(isinstance(c.value, str) and c.value.startswith("=") for row in ws.iter_rows() for c in row)]
    check(not indebidas, "Estructura, Patrimonio, Documentos e Historial son solo entradas (sin fórmulas)", ", ".join(indebidas))
    t = te.read_template(recalc(src, work / "base"))
    wbv = openpyxl.load_workbook(work / "base" / src.name, data_only=True)
    errores = [f"{ws.title}!{c.coordinate} {c.value}" for ws in wbv for row in ws.iter_rows() for c in row if isinstance(c.value, str) and (c.value.startswith("#") or c.value.startswith("Err:"))]
    check(not errores, "ninguna celda con error de fórmula", ", ".join(errores[:5]))

    print("2) Patrimonio: plantilla vs dataset del dashboard")
    b = te.balance(t)
    clases = {"Caja": "CAJA", "Inversiones financieras": "MERCADOS_PUBLICOS", "Bienes raíces": "INMOBILIARIO", "Empresas": "EMPRESAS_PRIVADAS", "Otros activos": "OTROS"}
    for nombre, cls in clases.items():
        esperado = sum(a["currentValue"] * a["ownershipPercentage"] for a in ds["assets"] if a["assetClass"] == cls)
        check(close(b["por_clase"].get(nombre, 0), esperado), nombre, f"dif ${b['por_clase'].get(nombre, 0) - esperado:,.2f}")
    activos = sum(a["currentValue"] * a["ownershipPercentage"] for a in ds["assets"])
    deuda = sum(l["balance"] for l in ds["loans"])
    check(close(b["activos"], activos), "total activos")
    check(close(b["deuda"], deuda), "total deudas que suman")
    check(close(b["neto"], activos - deuda), "patrimonio neto = activos − deudas")
    check(close(b["contingente"], d.total_activos_contingentes), "activos contingentes (memo)")
    check(close(b["provisiones"], abs(d.otras_partidas.provisiones_subtotal_memo)), "provisiones (memo)")
    check(close(b["prudente"], activos - deuda - b["provisiones"]), "patrimonio prudente = neto − provisiones")
    check(len(b["sin_valor"]) == 38, "ítems sin valor = 32 sociedades + 5 instrumentos + La cabaña", str(len(b["sin_valor"])))
    check(all(p["Valor 100% (CLP)"] is None or p["Valor 100% (CLP)"] > 0 or p["Clase"] in ("Caja", "Inversiones financieras") for p in t["patrimonio"]),
          "los ceros son solo saldos de cuentas que el Excel declara en 0")

    print("3) Flujo_Plan (fórmulas) vs referencia en Python vs Excel original")
    PM = t["plan_matrix"]
    flujo = te.monthly_flow(t)
    n = 60
    peor = 0.0
    for p in PM["partidas"]:
        ref = flujo["partidas"][(p["tipo"], p["partida"])]["plan"]
        peor = max(peor, max(abs((a or 0) - (c or 0)) for a, c in zip(p["serie"], ref)))
    check(peor < 0.01, f"las fórmulas dan lo mismo que la referencia, en las {len(PM['partidas'])} partidas × 60 meses", f"máx ${peor:,.4f}")
    check(len(PM["partidas"]) == len(flujo["partidas"]), "toda partida de Supuestos tiene su fila en el flujo", f"{len(PM['partidas'])} filas")
    orig = meta["originales"]
    TOT = PM["totales"]
    ing_caja = [sum(o["serie"][k] for o in orig if o["tipo"] == "Ingreso" and "EFECTO INFLACION" not in o["partida"].upper()) for k in range(n)]
    egr_caja = [sum(o["serie"][k] for o in orig if o["tipo"] == "Egreso" and "EFECTO INFLACION" not in o["partida"].upper()) for k in range(n)]
    check(max(abs(a - c) for a, c in zip(TOT["TOTAL INGRESOS"], ing_caja)) < 1, "TOTAL INGRESOS = Excel original, mes a mes")
    check(max(abs(a - c) for a, c in zip(TOT["TOTAL EGRESOS"], egr_caja)) < 1, "TOTAL EGRESOS = Excel original, mes a mes (presupuestos agrupados)")
    sm = [float(x) for x in d.flujo_caja.saldo_mensual.tolist()]
    neto_orig = TOT["Flujo neto como en el Excel original (caja + ajustes)"]
    check(max(abs(a - c) for a, c in zip(neto_orig, sm)) < 1, "flujo neto como en el Excel original (caja + ajustes), mes a mes", f"máx ${max(abs(a - c) for a, c in zip(neto_orig, sm)):,.2f}")
    por_cat_plan, por_cat_orig = {}, {}
    for p in PM["partidas"]:
        por_cat_plan[(p["tipo"], p["categoria"])] = por_cat_plan.get((p["tipo"], p["categoria"]), 0.0) + sum(v or 0 for v in p["serie"])
    for o in orig:
        por_cat_orig[(o["tipo"], o["categoria"])] = por_cat_orig.get((o["tipo"], o["categoria"]), 0.0) + sum(o["serie"])
    check(all(close(por_cat_plan.get(k, 0), v) for k, v in por_cat_orig.items()), "totales por categoría (60 meses) iguales al Excel", f"{len(por_cat_orig)} categorías")

    print("4) Formato de flujo de caja contable")
    ap, ni, cf = TOT["SALDO INICIAL DE CAJA"], TOT["FLUJO NETO DE CAJA"], TOT["SALDO FINAL DE CAJA"]
    check(close(ap[0], b["por_clase"]["Caja"]), "saldo inicial = caja de Patrimonio", f"{ap[0]:,.0f}")
    check(all(close(ap[k] + ni[k], cf[k]) for k in range(n)), "saldo inicial + flujo neto = saldo final, cada mes")
    check(all(close(cf[k], ap[k + 1]) for k in range(n - 1)), "el saldo final de un mes es el inicial del siguiente")
    check(all(close(ni[k], TOT["TOTAL INGRESOS"][k] - TOT["TOTAL EGRESOS"][k]) for k in range(n)), "flujo neto = ingresos − egresos")
    wsP = wbv["Flujo_Plan"]
    check(all(wsP.cell(4, M0 + k).value.month == te.add_months(te.first_of_month(t["params"]["Mes_Inicio"]), k).month for k in range(n)), "60 meses consecutivos desde «Primer mes del flujo»")
    check(all(m == "FORECAST" for m in [wsP.cell(2, M0 + k).value for k in range(3)]), "sin meses cerrados, todo es FORECAST")

    print("5) Flujo_Real y paso de FORECAST a REAL")
    wr = openpyxl.load_workbook(src)
    R = wr["Flujo_Real"]
    ms = PM["months"]
    p_real = "ARRIENDOS MK 9"
    r_arr = find_row(R, p_real, "Ingreso")
    r_gasto = find_row(R, "(nueva partida)", "Egreso") if False else next(r for r in range(5, R.max_row + 1) if R.cell(r, 1).value == "(nueva partida)" and R.cell(r, 2).value == "Otros gastos")
    R.cell(r_arr, M0).value = 2_000_000
    R.cell(r_arr, M0 + 1).value = 1_800_000
    R.cell(r_gasto, 1).value = "Gasto no planificado"
    R.cell(r_gasto, M0 + 1).value = 300_000
    hoja, celda = param_cell(wr, "Ultimo_Mes_Cerrado")
    hoja[celda].value = ms[1]  # cierra agosto y septiembre
    prueba = work / "real.xlsx"
    wr.save(prueba)
    t2 = te.read_template(recalc(prueba, work / "real"))
    wv = openpyxl.load_workbook(work / "real" / "real.xlsx", data_only=True)
    RV = wv["Flujo_Real"]
    check([RV.cell(2, M0 + k).value for k in range(3)] == ["REAL", "REAL", "FORECAST"], "agosto y septiembre REAL, octubre FORECAST")
    tot_r = t2["real_matrix"]["totales"]
    check(close(tot_r["TOTAL INGRESOS"][0], 2_000_000) and close(tot_r["TOTAL INGRESOS"][1], 1_800_000), "Flujo_Real: TOTAL INGRESOS de los meses cerrados")
    check(close(tot_r["TOTAL EGRESOS"][1], 300_000) and close(tot_r["FLUJO NETO DE CAJA"][1], 1_500_000), "Flujo_Real: egresos y flujo neto (una partida nueva entra igual)")
    caja0 = tot_r["SALDO INICIAL DE CAJA"][0]
    check(close(tot_r["SALDO FINAL DE CAJA"][1], caja0 + 2_000_000 + 1_500_000), "Flujo_Real: saldo final de caja encadenado")
    check(tot_r["TOTAL INGRESOS"][2] in (None, "") and tot_r["SALDO FINAL DE CAJA"][2] in (None, ""), "un mes sin cerrar y sin datos queda en blanco (no en cero)")
    f2 = te.monthly_flow(t2)
    s = f2["partidas"][("Ingreso", p_real)]
    check(s["serie"][0] == 2_000_000 and s["serie"][1] == 1_800_000, "la referencia combina: meses cerrados leen Flujo_Real")
    check(s["serie"][2] == flujo["partidas"][("Ingreso", p_real)]["serie"][2], "octubre mantiene el forecast")
    otro = next(k for k, v in f2["partidas"].items() if k[0] == "Ingreso" and k != ("Ingreso", p_real) and v["plan"][0])
    check(f2["partidas"][otro]["serie"][0] is None, "partida sin movimiento real en mes cerrado: sin dato (no cero)", str(otro[1])[:30])
    dv = {x["partida"]: x for x in te.desviaciones(t2, f2)}
    check(close(dv[p_real]["real"], 3_800_000) and close(dv[p_real]["promedio_real"], 1_900_000), "desviaciones: real acumulado y promedio mensual", dv[p_real]["senal"])
    check(dv["Gasto no planificado"]["senal"] == "REVISAR", "una partida sin plan se marca REVISAR")

    print("6) Tipos de supuesto dentro de las fórmulas")
    wp = openpyxl.load_workbook(src)
    S = wp["Supuestos"]
    F = wp["Flujo_Plan"]
    r_prueba = next(r for r in range(5, F.max_row + 1) if F.cell(r, 1).value == "(nueva partida)" and F.cell(r, 2).value == "Otros ingresos")
    F.cell(r_prueba, 1).value = "PRUEBA"
    base = dict(Moneda="CLP", Reajuste="NINGUNO", Tipo="Ingreso", Partida="PRUEBA")
    casos = [
        dict(Monto=1_000_000, Frecuencia="MENSUAL", Reajuste="IPC", **{"Mes del reajuste": 1}, Desde=date(2026, 8, 1)),
        dict(Monto=12_000_000, Frecuencia="ANUAL", Reajuste="FIJO", **{"Mes de pago": 3, "% reajuste anual": 0.05, "Mes del reajuste": 3}, Desde=date(2027, 3, 1)),
        dict(Monto=600_000, Frecuencia="TRIMESTRAL", **{"Mes de pago": 2}, Desde=date(2026, 8, 15)),
        dict(Monto=50, Moneda="UF", Frecuencia="MENSUAL", Desde=date(2026, 8, 1)),
        dict(Monto=5_000_000, Frecuencia="UNICO", Desde=date(2026, 10, 1)),
        dict(Monto=100, Frecuencia="MENSUAL", Desde=date(2026, 8, 1), Hasta=date(2026, 10, 1)),
        dict(Monto=700_000, Frecuencia="SEMESTRAL", **{"Mes de pago": 11}, Desde=date(2026, 8, 1)),
    ]
    usd = dict(Monto=800, Moneda="USD", Frecuencia="MENSUAL", Desde=date(2026, 8, 1))
    col = {"Partida": 2, "Tipo": 3, "Moneda": 4, "Monto": 5, "Frecuencia": 6, "Mes de pago": 7, "Desde": 8, "Hasta": 9, "Reajuste": 10, "% reajuste anual": 11, "Mes del reajuste": 12}
    n0 = 2 + meta["n_plan"]
    for k, c in enumerate(casos + [usd]):
        for key, v in {**base, **c}.items():
            S.cell(n0 + k, col[key]).value = v
        S.cell(n0 + k, 13).value = "Otros ingresos"
    prueba2 = work / "tipos.xlsx"
    wp.save(prueba2)
    t3 = te.read_template(recalc(prueba2, work / "tipos"))
    fila = next(p for p in t3["plan_matrix"]["partidas"] if p["partida"] == "PRUEBA")
    P = dict(t3["params"])
    M = te.months_from(P["Mes_Inicio"])
    esperado = [0.0] * n
    for c in casos:
        esperado = [a + (v or 0) for a, v in zip(esperado, te.expand_row({**base, **c}, M, P))]
    dif = max(abs((a or 0) - b_) for a, b_ in zip(fila["serie"], esperado))
    check(dif < 0.01, "siete reglas combinadas (IPC, anual con reajuste fijo, trimestral, UF, único, con fecha de término, semestral)", f"máx ${dif:,.4f}")
    check(abs(fila["serie"][5] - (1_000_000 * 1.03 + 0)) < 5_000_000, "reajuste IPC aplicado a partir de enero")
    aviso = openpyxl.load_workbook(work / "tipos" / "tipos.xlsx", data_only=True)["Flujo_Plan"]["A2"].value or ""
    check("USD" in aviso, "supuesto en USD sin dólar cargado: el flujo lo avisa (no lo incluye en silencio)", aviso[:60])
    wp2 = openpyxl.load_workbook(prueba2)
    hoja, celda = param_cell(wp2, "USD_CLP")
    hoja[celda].value = 900
    prueba3 = work / "usd.xlsx"
    wp2.save(prueba3)
    t4 = te.read_template(recalc(prueba3, work / "usd"))
    fila4 = next(p for p in t4["plan_matrix"]["partidas"] if p["partida"] == "PRUEBA")
    P4 = dict(t4["params"])
    exp4 = [0.0] * n
    for c in casos + [usd]:
        exp4 = [a + (v or 0) for a, v in zip(exp4, te.expand_row({**base, **c}, M, P4))]
    check(max(abs((a or 0) - b_) for a, b_ in zip(fila4["serie"], exp4)) < 0.01 and close(fila4["serie"][0] - fila["serie"][0], 720_000), "con dólar cargado: 800 USD × 900 = 720.000 por mes")

    print("7) Completitud (lo que el dashboard avisaría)")
    for label, cnt in te.completitud(t):
        print(f"     {'OK     ' if cnt == 0 else 'REVISAR'} {cnt:>3}  {label}")

    shutil.rmtree(work, ignore_errors=True)
    print()
    if FAILS:
        print(f"FALLÓ: {len(FAILS)} verificación(es): {', '.join(FAILS)}")
        return 1
    print("Todo cuadra.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
