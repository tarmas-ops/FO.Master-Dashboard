"""Verifica la plantilla generada contra el Excel maestro y el dashboard.

La plantilla no tiene fórmulas, así que no hace falta recalcularla: se lee tal cual y se aplica la
lógica de referencia de scripts/template_engine.py (la que debe replicar el dashboard).

  1) Patrimonio por clase, activos, deudas y neto contra el dataset del dashboard.
  2) Flujo de 60 meses contra Flujo_Caja del Excel: caja exacta mes a mes, ajustes no caja,
     y totales por categoría (la agrupación del presupuesto no cambia los totales).
  3) Paso de FORECAST a REAL: meses cerrados leen Flujo_Real, el resto el plan.
  4) Tipos de supuesto: frecuencias, reajuste IPC y fijo, UF, USD, rango de fechas.
  5) Estructura de la plantilla: pestañas esperadas, sin fórmulas, sin celdas con error.

Uso:  python3 scripts/check_template.py [plantilla.xlsx]
Sale con código 1 si algo no cuadra. No escribe nada.
"""

from __future__ import annotations

import copy
import json
import sys
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
EXPECTED_SHEETS = ["Leeme", "Estructura", "Patrimonio", "Flujo_Plan", "Flujo_Real", "Documentos", "Historial"]
FAILS: list[str] = []


def check(ok: bool, label: str, detail: str = "") -> None:
    print(("  ✓ " if ok else "  ✗ ") + label + (f"  {detail}" if detail else ""))
    if not ok:
        FAILS.append(label)


def main() -> int:
    src = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT
    meta = json.loads((src.parent / "_meta.json").read_text(encoding="utf-8"))
    t = te.read_template(src)
    d = load_fo_data()
    ds = build_dataset()

    print("1) Estructura de la plantilla")
    check(t["sheetnames"] == EXPECTED_SHEETS, "7 pestañas esperadas", ", ".join(t["sheetnames"]))
    wb = openpyxl.load_workbook(src)
    formulas = [f"{ws.title}!{c.coordinate}" for ws in wb for row in ws.iter_rows() for c in row if isinstance(c.value, str) and c.value.startswith("=")]
    check(not formulas, "ninguna fórmula (solo entradas)", ", ".join(formulas[:4]))

    print("2) Patrimonio: plantilla vs dataset del dashboard")
    b = te.balance(t)
    clases = {"Caja": "CAJA", "Inversiones financieras": "MERCADOS_PUBLICOS", "Bienes raíces": "INMOBILIARIO", "Empresas": "EMPRESAS_PRIVADAS", "Otros activos": "OTROS"}
    for nombre, cls in clases.items():
        esperado = sum(a["currentValue"] * a["ownershipPercentage"] for a in ds["assets"] if a["assetClass"] == cls)
        check(abs(b["por_clase"].get(nombre, 0) - esperado) < 1, nombre, f"dif ${b['por_clase'].get(nombre, 0) - esperado:,.2f}")
    activos = sum(a["currentValue"] * a["ownershipPercentage"] for a in ds["assets"])
    deuda = sum(l["balance"] for l in ds["loans"])
    check(abs(b["activos"] - activos) < 1, "total activos", f"dif ${b['activos'] - activos:,.2f}")
    check(abs(b["deuda"] - deuda) < 1, "total deudas que suman")
    check(abs(b["neto"] - (activos - deuda)) < 1, "patrimonio neto = activos − deudas")
    check(abs(b["contingente"] - d.total_activos_contingentes) < 1, "activos contingentes (memo)")
    check(abs(b["provisiones"] - abs(d.otras_partidas.provisiones_subtotal_memo)) < 1, "provisiones (memo)")
    check(abs(b["prudente"] - (activos - deuda - b["provisiones"])) < 1, "patrimonio prudente = neto − provisiones")
    check(len(b["sin_valor"]) == sum(1 for a in ds["assets"] if a["assetClass"] == "EMPRESAS_PRIVADAS" and a["currentValue"] == 0)
          + sum(1 for a in ds["assets"] if a["assetClass"] == "MERCADOS_PUBLICOS" and a["currentValue"] == 0 and a.get("subAssetClass") == "Instrumento financiero") + 1,
          "ítems sin valor = 32 sociedades + 5 instrumentos + La cabaña", str(len(b["sin_valor"])))
    check(all(p["Valor 100% (CLP)"] is None or p["Valor 100% (CLP)"] > 0 or p["Clase"] in ("Caja", "Inversiones financieras") for p in t["patrimonio"]),
          "los ceros son solo saldos de cuentas que el Excel declara en 0")

    print("3) Flujo de 60 meses: plantilla vs Flujo_Caja del Excel")
    flujo = te.monthly_flow(t)
    tot = te.totales(flujo)
    orig = meta["originales"]
    n = 60
    ing_caja = [sum(o["serie"][k] for o in orig if o["tipo"] == "Ingreso" and "EFECTO INFLACION" not in o["partida"].upper()) for k in range(n)]
    egr_caja = [sum(o["serie"][k] for o in orig if o["tipo"] == "Egreso" and "EFECTO INFLACION" not in o["partida"].upper()) for k in range(n)]
    check(max(abs(a - c) for a, c in zip(tot["ingresos"], ing_caja)) < 1, "ingresos de caja, mes a mes", f"máx ${max(abs(a - c) for a, c in zip(tot['ingresos'], ing_caja)):,.2f}")
    check(max(abs(a - c) for a, c in zip(tot["egresos"], egr_caja)) < 1, "egresos de caja, mes a mes (con el presupuesto agrupado)", f"máx ${max(abs(a - c) for a, c in zip(tot['egresos'], egr_caja)):,.2f}")
    sm = d.flujo_caja.saldo_mensual.tolist()
    # El Excel original incluye "Efecto Inflación" en el neto: se migra exacto y se separa como "no caja".
    dif = [a - float(e) for a, e in zip(tot["neto_original"], sm)]
    check(max(abs(x) for x in dif) < 1, "neto como en el Excel original (caja + ajustes), mes a mes", f"máx ${max(abs(x) for x in dif):,.2f}")
    aj = [sum(o["serie"][k] * (1 if o["tipo"] == "Ingreso" else -1) for o in orig if "EFECTO INFLACION" in o["partida"].upper()) for k in range(n)]
    check(max(abs(a - c) for a, c in zip(tot["ajustes"], aj)) < 1, "ajustes que no son caja, mes a mes")
    por_cat_plan, por_cat_orig = {}, {}
    for (tipo, _), s in flujo["partidas"].items():
        if s["es_caja"]:
            por_cat_plan[(tipo, s["categoria"])] = por_cat_plan.get((tipo, s["categoria"]), 0.0) + sum(v for v in s["serie"] if v is not None)
    for o in orig:
        if "EFECTO INFLACION" in o["partida"].upper():
            continue
        por_cat_orig[(o["tipo"], o["categoria"])] = por_cat_orig.get((o["tipo"], o["categoria"]), 0.0) + sum(o["serie"])
    check(all(abs(por_cat_plan.get(k, 0) - v) < 1 for k, v in por_cat_orig.items()), "totales por categoría (60 meses) iguales al Excel", f"{len(por_cat_orig)} categorías")
    check(len({(r['Tipo'], r['Partida']) for r in t['plan']}) < meta["n_original_conceptos"], "menos partidas que los 71 conceptos originales",
          f"{len({(r['Tipo'], r['Partida']) for r in t['plan']})} partidas, {len(t['plan'])} filas")

    print("4) Paso de FORECAST a REAL")
    t2 = copy.deepcopy(t)
    ms = flujo["months"]
    t2["params"]["Ultimo_Mes_Cerrado"] = ms[1]  # cierra agosto y septiembre
    p_real = next(r for r in t["plan"] if r["Tipo"] == "Ingreso" and "MK 9" in r["Partida"])
    t2["real"] = [dict(Fecha=date(ms[0].year, ms[0].month, 10), Partida=p_real["Partida"], Tipo="Ingreso", Monto=2_000_000, Estado="PAGADO"),
                  dict(Fecha=date(ms[1].year, ms[1].month, 10), Partida=p_real["Partida"], Tipo="Ingreso", Monto=1_800_000, Estado="DEVENGADO"),
                  dict(Fecha=date(ms[1].year, ms[1].month, 12), Partida="Gasto no planificado", Tipo="Egreso", Monto=300_000, Estado="PAGADO", **{"Categoría": "Otros gastos"})]
    f2 = te.monthly_flow(t2)
    s = f2["partidas"][("Ingreso", p_real["Partida"])]
    check(f2["estado"][:3] == ["REAL", "REAL", "FORECAST"], "agosto y septiembre REAL, octubre FORECAST")
    check(s["serie"][0] == 2_000_000 and s["serie"][1] == 1_800_000, "los meses cerrados leen Flujo_Real")
    check(s["serie"][2] == flujo["partidas"][("Ingreso", p_real["Partida"])]["serie"][2], "octubre mantiene el forecast")
    otro = next(k for k, v in f2["partidas"].items() if k[0] == "Ingreso" and k != ("Ingreso", p_real["Partida"]) and v["plan"][0])
    check(f2["partidas"][otro]["serie"][0] is None, "partida sin movimiento real en mes cerrado: sin dato (no cero)", str(otro[1])[:30])
    check(("Egreso", "Gasto no planificado") in f2["partidas"], "una partida real que no estaba en el plan entra igual")
    dv = {x["partida"]: x for x in te.desviaciones(t2, f2)}
    x = dv[p_real["Partida"]]
    check(abs(x["real"] - 3_800_000) < 1 and abs(x["promedio_real"] - 1_900_000) < 1, "desviaciones: real acumulado y promedio mensual", f"{x['senal']}")
    check(dv["Gasto no planificado"]["senal"] == "REVISAR", "una partida sin plan se marca REVISAR")

    print("5) Tipos de supuesto")
    P = dict(t["params"])
    P["USD_CLP"] = None
    base = dict(Moneda="CLP", Reajuste="NINGUNO")
    M = te.months_from(P["Mes_Inicio"])
    ipc, uf = P["IPC_Anual"], P["UF_Hoy"]
    e = lambda **k: te.expand_row({**base, **k}, M, P)  # noqa: E731
    a = e(Monto=1_000_000, Frecuencia="MENSUAL", Reajuste="IPC", **{"Mes del reajuste": 1}, Desde=date(2026, 8, 1))
    check(a[4] == 1_000_000 and abs(a[5] - 1_000_000 * (1 + ipc)) < .01 and abs(a[17] - 1_000_000 * (1 + ipc) ** 2) < .01, "IPC: reajuste cada enero")
    a = e(Monto=12_000_000, Frecuencia="ANUAL", Reajuste="FIJO", **{"Mes de pago": 3, "% reajuste anual": 0.05, "Mes del reajuste": 3}, Desde=date(2027, 3, 1))
    check([i for i, v in enumerate(a) if v] == [7, 19, 31, 43, 55] and abs(a[19] - 12_600_000) < .01, "ANUAL con reajuste fijo 5%: marzo de cada año")
    check([i for i, v in enumerate(e(Monto=600_000, Frecuencia="TRIMESTRAL", **{"Mes de pago": 2}, Desde=date(2026, 8, 15))) if v][:4] == [0, 3, 6, 9], "TRIMESTRAL")
    check([i for i, v in enumerate(e(Monto=700_000, Frecuencia="SEMESTRAL", **{"Mes de pago": 11}, Desde=date(2026, 8, 1))) if v][:3] == [3, 9, 15], "SEMESTRAL")
    a = e(Monto=50, Moneda="UF", Frecuencia="MENSUAL", Desde=date(2026, 8, 1))
    check(abs(a[0] - 50 * uf * (1 + ipc) ** (1 / 12)) < .01, "UF: 50 UF × UF proyectada", f"{a[0]:,.2f}")
    check([i for i, v in enumerate(e(Monto=5_000_000, Frecuencia="UNICO", Desde=date(2026, 10, 1))) if v] == [2], "UNICO")
    check([i for i, v in enumerate(e(Monto=100, Frecuencia="MENSUAL", Desde=date(2026, 8, 1), Hasta=date(2026, 10, 1))) if v] == [0, 1, 2], "Hasta: termina en octubre")
    check(e(Monto=800, Moneda="USD", Frecuencia="MENSUAL", Desde=date(2026, 8, 1))[0] is None, "USD sin dólar cargado: sin dato, no cero")
    P["USD_CLP"] = 900
    check(te.expand_row({**base, "Monto": 800, "Moneda": "USD", "Frecuencia": "MENSUAL", "Desde": date(2026, 8, 1)}, M, P)[0] == 720_000, "USD con dólar: 800 × 900")

    print("6) Completitud (lo que el dashboard avisaría)")
    for label, cnt in te.completitud(t):
        print(f"     {'OK     ' if cnt == 0 else 'REVISAR'} {cnt:>3}  {label}")

    print()
    if FAILS:
        print(f"FALLÓ: {len(FAILS)} verificación(es): {', '.join(FAILS)}")
        return 1
    print("Todo cuadra.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
