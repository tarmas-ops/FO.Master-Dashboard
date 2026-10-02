/**
 * Prueba de punta a punta del sincronizador: levanta un servidor local que imita al Apps Script
 * (incluida la redirección que hace Google al responder un POST) y ejecuta sync-sheets.ts de
 * verdad, con planillas buenas y malas. Lo que se verifica es lo que importa: una planilla mala
 * NUNCA modifica el dataset publicado.
 *
 *   npm run check-sync
 */
import { spawn } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { norm } from "../lib/sheets/cells";
import type { SheetsPayload } from "../lib/sheets/source";

const root = join(__dirname, "..");
const fixturePath = join(root, ".sheets-fixture", "payload.json");
if (!existsSync(fixturePath)) {
  console.error("Falta .sheets-fixture/payload.json. Genéralo con: python3 scripts/export_sheet_fixture.py");
  process.exit(2);
}
const base = JSON.parse(readFileSync(fixturePath, "utf8")) as SheetsPayload;
const TOKEN = "t".repeat(64);
const work = join(root, ".sheets-fixture", "e2e");
mkdirSync(work, { recursive: true });
const dataset = join(work, "dataset.json");

type Mode = "ok" | "wrongToken" | "html" | "missingTab" | "formulaError" | "bigDrop" | "down";
let mode: Mode = "ok";

function payloadFor(m: Mode): unknown {
  const p = structuredClone(base);
  if (m === "formulaError") p.sheets["Empresas"][6][3] = "#REF!";
  if (m === "bigDrop") {
    const g = p.sheets["Empresas"];
    p.sheets["Empresas"] = g.filter((r) => !norm(r[0]).includes("easa")); // EASA es el 43% del patrimonio
  }
  if (m === "missingTab") return { error: 'Falta la pestaña "Pasivos".' };
  return p;
}

const server: Server = createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    if (req.method === "POST" && req.url === "/exec") {
      if (mode === "down") {
        res.writeHead(500).end("boom");
        return;
      }
      // Apps Script responde el POST con una redirección y entrega el resultado por GET.
      let token = "";
      try {
        token = (JSON.parse(body) as { token?: string }).token ?? "";
      } catch {
        /* ignorar */
      }
      res.writeHead(302, { Location: `/out?ok=${token === TOKEN && mode !== "wrongToken" ? 1 : 0}` }).end();
      return;
    }
    if (req.method === "GET" && req.url?.startsWith("/out")) {
      const authorized = req.url.includes("ok=1");
      if (mode === "html") {
        res.writeHead(200, { "Content-Type": "text/html" }).end("<html><body>Inicia sesión en Google</body></html>");
        return;
      }
      res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify(authorized ? payloadFor(mode) : { error: "No autorizado." }));
      return;
    }
    res.writeHead(404).end();
  });
});

const sha = () => createHash("sha256").update(readFileSync(dataset)).digest("hex");
let failed = 0;

// Asíncrono a propósito: el servidor simulado vive en este mismo proceso, y un spawnSync lo
// bloquearía mientras el sincronizador espera su respuesta.
function exec(args: string[], env: NodeJS.ProcessEnv): Promise<{ status: number | null; out: string }> {
  return new Promise((resolve) => {
    const child = spawn(join(root, "node_modules", ".bin", "tsx"), args, { env });
    let out = "";
    child.stdout.on("data", (c) => (out += c));
    child.stderr.on("data", (c) => (out += c));
    const timer = setTimeout(() => child.kill("SIGKILL"), 60_000);
    child.on("close", (status) => {
      clearTimeout(timer);
      resolve({ status, out });
    });
  });
}

async function run(
  name: string,
  setMode: Mode,
  env: Record<string, string | undefined>,
  expect: { exit: number; changes: boolean; stderr?: RegExp; args?: string[] },
  port: number,
) {
  mode = setMode;
  copyFileSync(join(root, "data", "real", "dataset.json"), dataset);
  const before = sha();
  const r = await exec([join(__dirname, "sync-sheets.ts"), ...(expect.args ?? [])], {
    PATH: process.env.PATH ?? "",
    HOME: process.env.HOME ?? "",
    SHEETS_DATASET_PATH: dataset,
    ...Object.fromEntries(Object.entries(env).filter(([, v]) => v !== undefined)),
  } as unknown as NodeJS.ProcessEnv);
  const changed = sha() !== before;
  const leaked = r.out.includes(TOKEN) || r.out.includes(`127.0.0.1:${port}`);
  const ok = r.status === expect.exit && changed === expect.changes && (!expect.stderr || expect.stderr.test(r.out)) && !leaked;
  console.log(`${ok ? "  ok " : " FALLA"}  ${name}${leaked ? "  [¡filtró el token o la URL!]" : ""}`);
  if (!ok) {
    failed++;
    console.log(`        exit=${r.status} (esperado ${expect.exit}) dataset modificado=${changed} (esperado ${expect.changes})`);
    console.log(r.out.split("\n").slice(-8).map((l) => "        " + l).join("\n"));
  }
}

server.listen(0, "127.0.0.1", async () => {
  const port = (server.address() as { port: number }).port;
  const good = { SHEETS_ENDPOINT: `http://127.0.0.1:${port}/exec`, SHEETS_TOKEN: TOKEN };

  await run("sin variables: no hace nada y no toca el dataset", "ok", {}, { exit: 0, changes: false, stderr: /dataset incluido/ }, port);
  await run("configuración incompleta (falta el token) falla", "ok", { SHEETS_ENDPOINT: good.SHEETS_ENDPOINT }, { exit: 1, changes: false, stderr: /SHEETS_TOKEN/ }, port);
  await run("planilla correcta: actualiza el dataset", "ok", good, { exit: 0, changes: true, stderr: /Validación OK/ }, port);
  await run("--dry-run valida pero no escribe", "ok", good, { exit: 0, changes: false, stderr: /dry-run/, args: ["--dry-run"] }, port);
  await run("token incorrecto: no publica", "wrongToken", good, { exit: 1, changes: false, stderr: /No autorizado/ }, port);
  await run("el endpoint devuelve HTML (acceso mal configurado): no publica", "html", good, { exit: 1, changes: false, stderr: /no es JSON/ }, port);
  await run("pestaña faltante: no publica", "missingTab", good, { exit: 1, changes: false, stderr: /Pasivos/ }, port);
  await run("celda con #REF!: no publica", "formulaError", good, { exit: 1, changes: false, stderr: /#REF!/ }, port);
  await run("cambio desproporcionado (se borra EASA): no publica", "bigDrop", good, { exit: 1, changes: false, stderr: /desproporcionado/ }, port);
  await run("…salvo que se confirme con SHEETS_ALLOW_BIG_CHANGE=1", "bigDrop", { ...good, SHEETS_ALLOW_BIG_CHANGE: "1" }, { exit: 0, changes: true }, port);
  await run("servidor caído: reintenta y no publica", "down", good, { exit: 1, changes: false, stderr: /3 intentos/ }, port);

  server.close();
  console.log(failed === 0 ? "\nSINCRONIZACIÓN: OK" : `\nSINCRONIZACIÓN: ${failed} caso(s) fallaron`);
  process.exit(failed === 0 ? 0 : 1);
});
