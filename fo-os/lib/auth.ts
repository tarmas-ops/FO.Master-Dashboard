/**
 * Portón de contraseña compartida, del mismo tipo que el de la app Streamlit: no es un
 * sistema de identidades, es lo que separa un enlace público de uno privado.
 *
 * El token de sesión se deriva de la propia contraseña, así que no hace falta un segundo
 * secreto y cambiar `APP_PASSWORD` invalida todas las sesiones abiertas. La cookie no lleva
 * la contraseña: lleva su hash, que no sirve para reconstruirla.
 */
export const SESSION_COOKIE = "fo_os_session";

/** Token de sesión derivado de la contraseña. Web Crypto: funciona en Node y en el edge. */
export async function sessionToken(password: string): Promise<string> {
  const bytes = new TextEncoder().encode(`fo-os::${password}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Comparación de tiempo constante: no filtra cuántos caracteres iniciales coinciden. */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * Contraseña configurada. Si no hay ninguna, el portón queda deshabilitado: en desarrollo
 * local eso es lo cómodo, y en Vercel la variable es obligatoria (ver README).
 */
export function configuredPassword(): string | undefined {
  const value = process.env.APP_PASSWORD;
  return value && value.length > 0 ? value : undefined;
}
