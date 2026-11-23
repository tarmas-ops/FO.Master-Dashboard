"""Verifica la plantilla generada contra el Excel maestro y el dataset del dashboard.

1) Recalcula la plantilla con LibreOffice (las fórmulas no traen valores guardados).
2) Revisa que ninguna celda tenga error de fórmula.
3) Concilia: patrimonio por clase, total de activos/pasivos y flujo mensual contra la fuente.
4) Prueba el paso de FORECAST a REAL: carga movimientos de prueba en una copia, mueve
   `Ultimo_Mes_Cerrado` y comprueba que el mes cambia de fuente y que Desviaciones reacciona.

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

from export_real_dataset import build as build_dataset  # noqa: E402
from src.data_loader import load_fo_data  # noqa: E402

DEFAULT = ROOT / "data" / "plantilla" / "FO_Plantilla.xlsx"
FAILS: list[str] = []


def recalc(src: Path, outdir: Path) -> Path:
    outdir.mkdir(parents=True, exist_ok=True)
    subprocess.run(["soffice", "--headless", "--calc", "--convert-to", "xlsx", "--outdir", str(outdir), str(src)],
                   check=True, capture_output=True, timeout=600)
    return outdir / src.name


def check(ok: bool, label: str, detail: str = "") -> None:
    print(("  ✓ " if ok else "  ✗ ") + label + (f"  {detail}" if detail else ""))
    if not ok:
        FAILS.append(label)


def main() -> int:
    src = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT
    work = Path(tempfile.mkdtemp(prefix="plantilla_"))
    rec = recalc(src, work / "a")
    wb = openpyxl.load_workbook(rec, data_only=True)

    print("1) Errores de fórmula")
    errores = []
    for ws in wb:
        for row in ws.iter_rows():
            for c in row:
                if isinstance(c.value, str) and (c.value.startswith("#") or c.value.startswith("Err:")):
                    errores.append(f"{ws.title}!{c.coordinate} {c.value}")
    check(not errores, "ninguna celda con error", ", ".join(errores[:6]))

    d = load_fo_data()
    ds = build_dataset()
    B = wb["Balance"]

    print("2) Patrimonio: plantilla vs dataset del dashboard")
    clases = {"Caja": ("CAJA",), "Inversiones financieras": ("MERCADOS_PUBLICOS",), "Bienes raíces": ("INMOBILIARIO",),
              "Empresas": ("EMPRESAS_PRIVADAS",), "Otros activos": ("OTROS",)}
    for r in range(5, 10):
        nombre = B.cell(r, 1).value
        esperado = sum(a["currentValue"] * a["ownershipPercentage"] for a in ds["assets"] if a["assetClass"] in clases[nombre])
        obtenido = B.cell(r, 2).value or 0
        check(abs(obtenido - esperado) < 1, f"{nombre}", f"dif ${obtenido - esperado:,.2f}")
    activos = sum(a["currentValue"] * a["ownershipPercentage"] for a in ds["assets"])
    pasivos = sum(l["balance"] for l in ds["loans"])
    check(abs(B["B10"].value - activos) < 1, "total activos", f"dif ${B['B10'].value - activos:,.2f}")
    check(abs(B["B11"].value - pasivos) < 1, "total pasivos", f"dif ${B['B11'].value - pasivos:,.2f}")
    check(abs(B["B12"].value - (activos - pasivos)) < 1, "patrimonio neto = activos − pasivos")
    cont = d.total_activos_contingentes
    check(abs(B["B15"].value - cont) < 1, "activos contingentes (memo)", f"{B['B15'].value:,.0f} vs {cont:,.0f}")
    check(abs(B["B16"].value - abs(d.otras_partidas.provisiones_subtotal_memo)) < 1, "provisiones (memo)")
    check(abs(B["B17"].value - (activos - pasivos + cont)) < 1, "patrimonio ajustado por contingencias = neto + contingentes")
    check(abs(B["B18"].value - (activos - pasivos - abs(d.otras_partidas.provisiones_subtotal_memo))) < 1, "patrimonio prudente = neto − provisiones")

    print("3) Flujo mensual: plantilla vs Flujo_Caja del Excel (60 meses)")
    F = wb["Flujo_Mensual"]
    max_dif = 0.0
    max_ing = 0.0
    max_egr = 0.0
    for k in range(60):
        col = 5 + k
        neto = F.cell(10, col).value
        esp = float(d.flujo_caja.saldo_mensual.iloc[k])
        max_dif = max(max_dif, abs(neto - esp))
        ing = F.cell(6, col).value + sum(
            (F.cell(r, col).value or 0) for r in range(17, 17 + 150)
            if F.cell(r, 3).value == "INGRESO" and F.cell(r, 4).value == "NO")
        egr = F.cell(7, col).value + sum(
            (F.cell(r, col).value or 0) for r in range(17, 17 + 150)
            if F.cell(r, 3).value == "EGRESO" and F.cell(r, 4).value == "NO")
        max_ing = max(max_ing, abs(ing - float(d.flujo_caja.total_ingresos.iloc[k])))
        max_egr = max(max_egr, abs(egr - float(d.flujo_caja.total_egresos.iloc[k])))
    check(max_dif < 5, "neto mensual (60 meses)", f"máx. diferencia ${max_dif:,.2f}")
    check(max_ing < 5, "total ingresos mensual", f"máx. diferencia ${max_ing:,.2f}")
    check(max_egr < 5, "total egresos mensual", f"máx. diferencia ${max_egr:,.2f}")

    print("4) Controles")
    C = wb["Controles"]
    for r in range(4, 30):
        if C.cell(r, 1).value:
            print(f"     {C.cell(r, 3).value:8} {C.cell(r, 2).value!s:>5}  {C.cell(r, 1).value}")

    print("5) Paso de FORECAST a REAL (copia de prueba)")
    wt = openpyxl.load_workbook(src)  # fórmulas intactas
    P = wt["Parametros"]
    fila = next(r for r in range(1, 40) if P.cell(r, 1).value == "Último mes cerrado (REAL)")
    meses = [F.cell(4, 5 + k).value for k in range(3)]  # ago, sep, oct
    cierre_original = P.cell(fila, 2).value
    P.cell(fila, 2).value = date(meses[1].year, meses[1].month, 1)  # cerrar hasta septiembre
    M = wt["Movimientos"]
    # Concepto de prueba: el primer ingreso mensual con monto fijo
    cat = json.loads((src.parent / "_meta.json").read_text(encoding="utf-8"))["catalogo"]
    cid = next(k for k, v in cat.items() if "ARRIENDOS MK 9" in v["nombre"].upper())
    fila_cat = int(cid[2:]) + 1
    M.cell(2, 1).value = date(meses[0].year, meses[0].month, 10)
    M.cell(2, 2).value = cid
    M.cell(2, 4).value = 2_000_000
    M.cell(2, 5).value = "PAGADO"
    M.cell(3, 1).value = date(meses[1].year, meses[1].month, 10)
    M.cell(3, 2).value = cid
    M.cell(3, 4).value = 1_800_000
    M.cell(3, 5).value = "DEVENGADO"
    prueba = work / "prueba.xlsx"
    wt.save(prueba)
    wr = openpyxl.load_workbook(recalc(prueba, work / "b"), data_only=True)
    F2, D2 = wr["Flujo_Mensual"], wr["Desviaciones"]
    fila_concepto = 17 + (int(cid[2:]) - 1)
    check(F2.cell(2, 5).value == "REAL" and F2.cell(2, 6).value == "REAL" and F2.cell(2, 7).value == "FORECAST", "agosto y septiembre pasan a REAL, octubre sigue FORECAST")
    check(F2.cell(fila_concepto, 5).value == 2_000_000, "agosto lee el movimiento real", str(F2.cell(fila_concepto, 5).value))
    check(F2.cell(fila_concepto, 6).value == 1_800_000, "septiembre lee el movimiento real", str(F2.cell(fila_concepto, 6).value))
    sin_mov = next(r for r in range(17, 17 + 150) if F2.cell(r, 4).value == "SI" and F2.cell(r, 3).value == "INGRESO" and r != fila_concepto and F.cell(r, 5).value)
    check(F2.cell(sin_mov, 5).value in (None, ""), "un concepto sin movimiento real queda vacío (no cero)", repr(F2.cell(sin_mov, 5).value))
    check(F2.cell(fila_concepto, 7).value == F.cell(fila_concepto, 7).value, "octubre mantiene el forecast")
    fila_d = 5 + (int(cid[2:]) - 1)
    check(D2["C2"].value == 2, "Desviaciones cuenta 2 meses cerrados", str(D2["C2"].value))
    check(D2.cell(fila_d, 5).value == 3_800_000, "real acumulado = 3.800.000", str(D2.cell(fila_d, 5).value))
    check(isinstance(D2.cell(fila_d, 10).value, str) and D2.cell(fila_d, 10).value != "", "Desviaciones emite una señal", str(D2.cell(fila_d, 10).value))
    P.cell(fila, 2).value = cierre_original

    print("6) Tipos de supuesto: frecuencia, reajuste, UF, USD, rango de fechas")
    wt = openpyxl.load_workbook(src)
    C = wt["Catalogo_Conceptos"]
    n_cat = sum(1 for r in range(2, 150) if C.cell(r, 1).value)
    fila_c = n_cat + 2
    C.cell(fila_c, 1).value, C.cell(fila_c, 2).value, C.cell(fila_c, 3).value, C.cell(fila_c, 4).value = "C-TEST", "PRUEBA", "INGRESO", "SI"
    S = wt["Supuestos_Forecast"]
    n_sup = sum(1 for r in range(2, 460) if S.cell(r, 1).value)
    casos = [  # monto, moneda, freq, mes, reaj, pj, mj, desde, hasta
        (1_000_000, "CLP", "MENSUAL", None, "IPC", None, 1, date(2026, 8, 1), None),
        (12_000_000, "CLP", "ANUAL", 3, "FIJO", 0.05, 3, date(2027, 3, 1), None),
        (600_000, "CLP", "TRIMESTRAL", 2, "NINGUNO", None, None, date(2026, 8, 15), None),
        (50, "UF", "MENSUAL", None, "NINGUNO", None, None, date(2026, 8, 1), None),
        (5_000_000, "CLP", "UNICO", None, "NINGUNO", None, None, date(2026, 10, 1), None),
        (100, "CLP", "MENSUAL", None, "NINGUNO", None, None, date(2026, 8, 1), date(2026, 10, 1)),
        (800, "USD", "MENSUAL", None, "NINGUNO", None, None, date(2026, 8, 1), None),
        (700_000, "CLP", "SEMESTRAL", 11, "NINGUNO", None, None, date(2026, 8, 1), None),
    ]
    for k, (monto, mon, fr, mes, rj, pj, mj, de, ha) in enumerate(casos):
        r = 2 + n_sup + k
        for col, v in enumerate([f"SF-T{k}", "C-TEST", monto, mon, fr, mes, rj, pj, mj, de, ha], 1):
            S.cell(r, col).value = v
    prueba2 = work / "prueba2.xlsx"
    wt.save(prueba2)
    wr = openpyxl.load_workbook(recalc(prueba2, work / "c"), data_only=True)
    FC = wr["Forecast"]
    uf, ipc = d.supuestos["valor_uf"], d.supuestos["inflacion_anual"]

    def val(caso, mes_idx):  # mes_idx 0 = ago-26
        return FC.cell(5 + n_sup + caso, 13 + mes_idx).value

    check(val(0, 0) == 1_000_000 and val(0, 4) == 1_000_000, "IPC: sin reajuste hasta diciembre")
    check(abs(val(0, 5) - 1_000_000 * (1 + ipc)) < 0.01, "IPC: reajuste en enero (+3%)", str(val(0, 5)))
    check(abs(val(0, 17) - 1_000_000 * (1 + ipc) ** 2) < 0.01, "IPC: segundo reajuste en enero siguiente")
    check(val(1, 6) in (0, None) and val(1, 7) == 12_000_000, "ANUAL: paga solo en marzo, desde marzo-27", f"{val(1, 6)}, {val(1, 7)}")
    check(abs(val(1, 19) - 12_600_000) < 0.01, "ANUAL con reajuste fijo 5%: marzo-28 = 12,6 MM", str(val(1, 19)))
    pagos = [i for i in range(60) if (val(2, i) or 0) > 0]
    check(pagos[:4] == [0, 3, 6, 9], "TRIMESTRAL: ago, nov, feb, may", str(pagos[:4]))
    check(abs(val(3, 0) - 50 * uf * (1 + ipc) ** (1 / 12)) < 0.01, "UF: 50 UF × UF proyectada", f"{val(3, 0):,.2f}")
    check([i for i in range(60) if (val(4, i) or 0) != 0] == [2], "UNICO: solo octubre-26")
    check([i for i in range(60) if (val(5, i) or 0) != 0] == [0, 1, 2], "Hasta: termina en octubre-26")
    check(val(6, 0) in ("", None), "USD sin dólar cargado: queda vacío, no cero", repr(val(6, 0)))
    check([i for i in range(60) if (val(7, i) or 0) != 0][:3] == [3, 9, 15], "SEMESTRAL: noviembre y mayo", str([i for i in range(60) if (val(7, i) or 0) != 0][:3]))
    ctl = {wr["Controles"].cell(r, 1).value: wr["Controles"].cell(r, 2).value for r in range(4, 30)}
    check(ctl.get("Supuestos en USD y dólar sin cargar") == 1, "Controles avisa del supuesto en USD sin dólar")

    shutil.rmtree(work, ignore_errors=True)
    print()
    if FAILS:
        print(f"FALLÓ: {len(FAILS)} verificación(es): {', '.join(FAILS)}")
        return 1
    print("Todo cuadra.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
