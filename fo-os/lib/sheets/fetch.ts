import type { SheetsPayload } from "./source";

export class SheetsFetchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SheetsFetchError";
  }
}

interface FetchOptions {
  retries?: number;
  timeoutMs?: number;
  /** Para pruebas: permite inyectar otro `fetch`. */
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
}

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Pide los datos al Apps Script de la planilla. El token viaja en el cuerpo del POST, no en
 * la URL, para que no quede en registros de acceso. Esta función no escribe el endpoint ni el
 * token en ningún mensaje.
 *
 * Apps Script responde un POST con una redirección a la URL de salida; `fetch` la sigue.
 */
export async function fetchSheets(endpoint: string, token: string, options: FetchOptions = {}): Promise<SheetsPayload> {
  const { retries = 3, timeoutMs = 90_000, fetchImpl = fetch, sleep = wait } = options;
  let lastError = "";

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetchImpl(endpoint, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({ token }),
        redirect: "follow",
        signal: AbortSignal.timeout(timeoutMs),
      });
      // Errores transitorios del servidor o límite de uso: se reintentan, no se interpretan.
      if (res.status >= 500 || res.status === 429) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();

      let json: unknown;
      try {
        json = JSON.parse(text);
      } catch {
        // Una página HTML en vez de JSON casi siempre es el acceso de la implementación mal configurado.
        throw new SheetsFetchError(
          'El endpoint no devolvió datos (respuesta no es JSON). Revisa que la implementación del Apps Script tenga "Quién tiene acceso: Cualquier persona" y que SHEETS_ENDPOINT sea la URL de la aplicación web.',
        );
      }
      const body = json as { error?: string } & Partial<SheetsPayload>;
      if (body.error) {
        // Errores de autorización o de formato no se arreglan reintentando.
        throw new SheetsFetchError(`El Apps Script respondió con un error: ${body.error}`);
      }
      if (!body.sheets || typeof body.sheets !== "object") throw new SheetsFetchError("La respuesta del Apps Script no trae las pestañas (campo `sheets`).");
      if (!res.ok) throw new SheetsFetchError(`El endpoint respondió HTTP ${res.status}.`);
      return { generatedAt: body.generatedAt ?? new Date().toISOString(), spreadsheetName: body.spreadsheetName, sheets: body.sheets };
    } catch (e) {
      if (e instanceof SheetsFetchError) throw e;
      lastError = e instanceof Error ? e.message : String(e);
      if (attempt < retries) await sleep(1000 * 2 ** (attempt - 1));
    }
  }
  throw new SheetsFetchError(`No se pudo contactar al Apps Script tras ${retries} intentos (${lastError}).`);
}
