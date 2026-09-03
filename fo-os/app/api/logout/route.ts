import { NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth";

export async function POST(request: Request) {
  const response = NextResponse.redirect(new URL("/login", new URL(request.url).origin), { status: 303 });
  response.cookies.delete(SESSION_COOKIE);
  return response;
}
