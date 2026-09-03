import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { SESSION_COOKIE, configuredPassword, safeEqual, sessionToken } from "@/lib/auth";

/**
 * Exige la contraseña antes de servir cualquier página. Corre antes del render, así que
 * ninguna cifra del portafolio sale del servidor sin cookie válida.
 */
export async function proxy(request: NextRequest) {
  const password = configuredPassword();
  if (!password) return NextResponse.next();

  const cookie = request.cookies.get(SESSION_COOKIE)?.value;
  if (cookie && safeEqual(cookie, await sessionToken(password))) return NextResponse.next();

  const login = new URL("/login", request.url);
  // Se recuerda a dónde iba para devolverlo ahí después de entrar.
  const target = request.nextUrl.pathname + request.nextUrl.search;
  if (target !== "/") login.searchParams.set("next", target);
  return NextResponse.redirect(login);
}

export const config = {
  // Todo salvo la propia pantalla de acceso, sus endpoints y los assets estáticos.
  matcher: ["/((?!login|api/login|api/logout|_next/static|_next/image|favicon.ico).*)"],
};
