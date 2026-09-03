import { db } from "@/data";
import { configuredPassword } from "@/lib/auth";

export const metadata = { title: "Acceso · Family Office OS" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const params = await searchParams;
  const next = typeof params.next === "string" ? params.next : "/resumen";
  const failed = params.error === "1";
  const gateDisabled = configuredPassword() === undefined;

  return (
    <main className="flex min-h-dvh items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-2.5">
          <div className="flex size-7 items-center justify-center rounded-[6px] bg-foreground text-[12px] font-semibold text-white">FO</div>
          <div>
            <p className="text-[14px] font-semibold leading-tight text-foreground">{db.familyOffice.name}</p>
            <p className="text-[11px] leading-tight text-muted">Sistema Operativo</p>
          </div>
        </div>

        <div className="mt-6 rounded-lg border border-border bg-card px-6 py-6">
          <h1 className="text-[15px] font-semibold text-foreground">Acceso privado</h1>
          <p className="mt-1 text-[13px] leading-relaxed text-muted">
            Esta aplicación contiene información patrimonial. Ingresa la contraseña compartida para continuar.
          </p>

          <form action="/api/login" method="POST" className="mt-5">
            <input type="hidden" name="next" value={next} />
            <label htmlFor="password" className="text-[12px] font-medium text-foreground">
              Contraseña
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoFocus
              autoComplete="current-password"
              className="mt-1.5 w-full rounded-md border border-border bg-background px-3 py-2 text-[13px] text-foreground outline-none focus:border-foreground/30"
            />
            {failed ? <p className="mt-2 text-[12px] text-negative">Contraseña incorrecta.</p> : null}
            <button
              type="submit"
              className="mt-4 w-full rounded-md bg-foreground px-3 py-2 text-[13px] font-medium text-white transition-opacity hover:opacity-90"
            >
              Entrar
            </button>
          </form>

          {gateDisabled ? (
            <p className="mt-4 border-t border-border pt-4 text-[12px] leading-relaxed text-muted">
              No hay contraseña configurada (<code className="rounded bg-hover px-1 py-0.5">APP_PASSWORD</code>), así que el portón está
              desactivado y la aplicación es accesible sin credenciales.
            </p>
          ) : null}
        </div>
      </div>
    </main>
  );
}
