import { NextResponse } from "next/server";
import { SESSION_COOKIE, configuredPassword, safeEqual, sessionToken } from "@/lib/auth";

export async function POST(request: Request) {
  const form = await request.formData();
  const submitted = String(form.get("password") ?? "");
  const next = String(form.get("next") ?? "/resumen");
  const password = configuredPassword();

  const origin = new URL(request.url).origin;
  if (!password || !safeEqual(submitted, password)) {
    const back = new URL("/login", origin);
    back.searchParams.set("error", "1");
    if (next !== "/resumen") back.searchParams.set("next", next);
    return NextResponse.redirect(back, { status: 303 });
  }

  // `next` se restringe a rutas internas: un valor externo convertiría el login en un
  // redirector abierto hacia otro sitio.
  const destination = next.startsWith("/") && !next.startsWith("//") ? next : "/resumen";
  const response = NextResponse.redirect(new URL(destination, origin), { status: 303 });
  response.cookies.set(SESSION_COOKIE, await sessionToken(password), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 12,
  });
  return response;
}
