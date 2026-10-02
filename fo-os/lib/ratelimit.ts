/**
 * Límite de intentos fallidos de login, por IP.
 *
 * Alcance honesto: el estado vive en la memoria de la instancia. En un entorno serverless
 * hay varias instancias y cada una cuenta por separado, así que esto frena a un atacante
 * casual o a un script ingenuo, pero no a uno que reparta intentos entre instancias. La
 * defensa que de verdad escala es una contraseña larga; para un límite global haría falta
 * un almacén compartido (Upstash/Vercel KV), que esta versión no incorpora.
 */
const MAX_FAILURES = 5;
const WINDOW_MS = 15 * 60 * 1000;

const failures = new Map<string, { count: number; firstAt: number }>();

export function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "desconocida";
}

/** Segundos que faltan para poder reintentar, o 0 si no está bloqueada. */
export function lockedForSeconds(ip: string, now = Date.now()): number {
  const entry = failures.get(ip);
  if (!entry) return 0;
  if (now - entry.firstAt > WINDOW_MS) {
    failures.delete(ip);
    return 0;
  }
  return entry.count >= MAX_FAILURES ? Math.ceil((entry.firstAt + WINDOW_MS - now) / 1000) : 0;
}

export function recordFailure(ip: string, now = Date.now()): void {
  const entry = failures.get(ip);
  if (!entry || now - entry.firstAt > WINDOW_MS) {
    failures.set(ip, { count: 1, firstAt: now });
  } else {
    entry.count += 1;
  }
  // Evita que el mapa crezca sin límite si alguien rota IPs.
  if (failures.size > 5000) {
    for (const [key, value] of failures) if (now - value.firstAt > WINDOW_MS) failures.delete(key);
  }
}

export function clearFailures(ip: string): void {
  failures.delete(ip);
}
