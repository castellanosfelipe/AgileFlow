"use client";

export type AutoSaveState = "saving" | "saved" | "error";

const autoSaveLabels: Record<AutoSaveState, string> = {
  saving: "Guardando cambio...",
  saved: "Cambio guardado.",
  error: "No se pudo guardar el cambio."
};

export function AutoSaveMessage({ state }: { state?: AutoSaveState }) {
  if (!state) return null;

  return (
    <p
      aria-live="polite"
      className={`text-xs ${
        state === "error" ? "text-destructive" : "text-muted-foreground"
      }`}
      role={state === "error" ? "alert" : "status"}
    >
      {autoSaveLabels[state]}
    </p>
  );
}
