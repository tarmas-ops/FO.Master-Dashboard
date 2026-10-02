"""Simula lo que enviaría el Apps Script de Google Sheets, a partir del Excel local.

Sirve para verificar el lector en TypeScript sin acceso a Google: el resultado de
`fo-os/scripts/check-parity.ts` sobre este archivo debe coincidir con dataset.json, que
genera `export_real_dataset.py` desde el mismo Excel.

El archivo resultante contiene el patrimonio real, así que NO se versiona (ver .gitignore).

Uso:  python3 scripts/export_sheet_fixture.py
"""

from __future__ import annotations

import datetime
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import openpyxl  # noqa: E402

from src.excel_recalc import ensure_recalculated  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "fo-os" / ".sheets-fixture" / "payload.json"
MAPPING = ROOT / "fo-os" / "data" / "real" / "rent_mapping.json"

# Debe coincidir con TABS de fo-os/integrations/google-sheets/Code.gs
TABS = [
    "Supuestos",
    "Perimetro_Familiar",
    "Liquidez",
    "Inversiones_Financieras",
    "Otras_Partidas",
    "Bienes_Raices",
    "Empresas",
    "Pasivos",
    "Flujo_Caja",
    "Balance_Consolidado",
]


def cell(value):
    """Mismo criterio que getValues() de Apps Script: vacío = "", fechas = yyyy-MM-dd."""
    if value is None:
        return ""
    if isinstance(value, (datetime.datetime, datetime.date)):
        return value.strftime("%Y-%m-%d")
    return value


def grid(ws) -> list[list]:
    rows = [[cell(c) for c in row] for row in ws.iter_rows(values_only=True)]
    # getDataRange() devuelve solo el rango usado: se recortan filas y columnas vacías al final.
    while rows and all(v == "" for v in rows[-1]):
        rows.pop()
    width = 0
    for row in rows:
        for i, v in enumerate(row):
            if v != "":
                width = max(width, i + 1)
    return [row[:width] + [""] * (width - len(row[:width])) for row in rows]


def main() -> None:
    recalc = ensure_recalculated(ROOT / "data")
    wb = openpyxl.load_workbook(recalc, data_only=True)
    sheets = {name: grid(wb[name]) for name in TABS}

    # La pestaña de mapeo de arriendos vive en el Sheet; aquí se reconstruye desde el JSON base.
    entries = json.loads(MAPPING.read_text(encoding="utf-8"))["streams"]
    sheets["Mapeo_Arriendos"] = [["Concepto", "Propiedades", "Estado", "Nota"]] + [
        [e["concept"], "; ".join(e["match"]), e["status"], e.get("note") or ""] for e in entries
    ]

    payload = {
        "generatedAt": datetime.datetime.now().isoformat(timespec="seconds"),
        "spreadsheetName": "FO_Master_Consolidado (simulado)",
        "sheets": sheets,
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
    print(f"Escrito {OUT.relative_to(ROOT)} ({OUT.stat().st_size / 1024:,.0f} KB, {len(sheets)} pestañas)")


if __name__ == "__main__":
    main()
