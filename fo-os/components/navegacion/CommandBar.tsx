"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Command } from "cmdk";
import { CornerDownLeft, Search, Sparkles } from "lucide-react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { ALL_NAV_ITEMS } from "./nav-config";
import { answerQuestion, EXAMPLE_QUESTIONS } from "@/lib/asistente";

/**
 * Barra de comandos (⌘K): navegación + preguntas en lenguaje natural sobre el
 * portafolio. Las respuestas se calculan localmente contra la base de datos —
 * son mocks preparados para ser reemplazados por una capa de IA real.
 */
export function CommandBar() {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [answer, setAnswer] = React.useState<string | null>(null);
  const router = useRouter();

  /** Abrir/cerrar limpiando el estado de la consulta: sin efectos que disparen renders en cascada. */
  const changeOpen = React.useCallback((next: boolean) => {
    setOpen(next);
    if (!next) {
      setQuery("");
      setAnswer(null);
    }
  }, []);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => {
          if (o) {
            setQuery("");
            setAnswer(null);
          }
          return !o;
        });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const ask = (q: string) => {
    setAnswer(answerQuestion(q));
  };

  return (
    <>
      <button
        type="button"
        onClick={() => changeOpen(true)}
        className="flex h-8 w-full max-w-md items-center gap-2 rounded-md border border-border bg-card px-3 text-[13px] text-muted-2 hover:border-border-strong hover:text-muted"
      >
        <Sparkles className="size-3.5" />
        <span className="flex-1 text-left">Pregunta sobre tu portafolio…</span>
        <kbd className="rounded border border-border bg-hover px-1.5 py-0.5 font-sans text-[10px] text-muted">⌘K</kbd>
      </button>

      <DialogPrimitive.Root open={open} onOpenChange={changeOpen}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-black/25" />
          <DialogPrimitive.Content className="fixed left-1/2 top-[14vh] z-50 w-[92vw] max-w-2xl -translate-x-1/2 overflow-hidden rounded-lg border border-border bg-card shadow-[0_16px_48px_rgba(0,0,0,0.12)] focus:outline-none">
            <DialogPrimitive.Title className="sr-only">Barra de comandos</DialogPrimitive.Title>
            <DialogPrimitive.Description className="sr-only">Navega o pregunta sobre el portafolio</DialogPrimitive.Description>
            <Command label="Barra de comandos" shouldFilter={!answer} className="flex flex-col">
              <div className="flex items-center gap-2 border-b border-border px-4">
                <Search className="size-4 text-muted-2" />
                <Command.Input
                  value={query}
                  onValueChange={(v) => {
                    setQuery(v);
                    setAnswer(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && query.trim().length > 3) {
                      e.preventDefault();
                      ask(query);
                    }
                  }}
                  placeholder="Pregunta sobre tu portafolio… o navega"
                  className="h-12 flex-1 bg-transparent text-[14px] text-foreground outline-none placeholder:text-muted-2"
                />
                {query.trim().length > 3 && !answer ? (
                  <button type="button" onClick={() => ask(query)} className="flex items-center gap-1 rounded border border-border px-2 py-1 text-[11px] text-muted hover:bg-hover">
                    Preguntar <CornerDownLeft className="size-3" />
                  </button>
                ) : null}
              </div>

              {answer ? (
                <div className="px-4 py-4">
                  <p className="mb-1 text-[11px] font-medium uppercase tracking-wider text-muted-2">Respuesta</p>
                  <p className="whitespace-pre-line text-[14px] leading-relaxed text-foreground">{answer}</p>
                  <p className="mt-3 text-[11px] text-muted-2">Respuesta generada localmente a partir de la base de datos. Capa de IA en preparación.</p>
                </div>
              ) : (
                <Command.List className="max-h-[52vh] overflow-y-auto p-2">
                  <Command.Empty className="px-3 py-6 text-center text-[13px] text-muted">
                    Sin coincidencias. Presiona Enter para preguntar.
                  </Command.Empty>
                  <Command.Group heading="Preguntas frecuentes" className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-muted-2">
                    {EXAMPLE_QUESTIONS.map((q) => (
                      <Command.Item
                        key={q}
                        value={q}
                        onSelect={() => {
                          setQuery(q);
                          ask(q);
                        }}
                        className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-[13px] text-foreground data-[selected=true]:bg-hover"
                      >
                        <Sparkles className="size-3.5 text-muted-2" />
                        {q}
                      </Command.Item>
                    ))}
                  </Command.Group>
                  <Command.Group heading="Ir a" className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-muted-2">
                    {ALL_NAV_ITEMS.map((item) => (
                      <Command.Item
                        key={item.href}
                        value={`${item.label} ${item.question}`}
                        onSelect={() => {
                          changeOpen(false);
                          router.push(item.href);
                        }}
                        className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-[13px] text-foreground data-[selected=true]:bg-hover"
                      >
                        <item.icon className="size-3.5 text-muted-2" strokeWidth={1.75} />
                        <span>{item.label}</span>
                        <span className="ml-auto text-[11px] text-muted-2">{item.question}</span>
                      </Command.Item>
                    ))}
                  </Command.Group>
                </Command.List>
              )}
            </Command>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
    </>
  );
}
