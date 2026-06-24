"use client";

import {
  Eye,
  EyeOff,
  GitBranch,
  Pencil,
  RefreshCw,
  Save,
  Trash2,
  Wifi
} from "lucide-react";
import * as React from "react";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { apiFetch } from "@/lib/api-client";
import { cn } from "@/lib/utils";

const migrationSchema = z.object({
  jiraUrl: z
    .string()
    .trim()
    .url("Ingresa una URL valida de Jira"),
  jql: z
    .string()
    .trim()
    .min(3, "Ingresa el JQL de busqueda"),
  username: z
    .string()
    .trim()
    .min(1, "Ingresa el usuario o correo de Jira"),
  token: z
    .string()
    .trim()
    .min(1, "Ingresa el token de Jira")
});

type MigrationForm = z.infer<typeof migrationSchema>;

type JiraMigrationConfig = MigrationForm & {
  id: string | null;
  hasToken: boolean;
  createdAt: string | null;
  lastTestedAt: string | null;
  lastSyncedAt: string | null;
};

const initialForm: JiraMigrationConfig = {
  id: null,
  jiraUrl: "",
  jql: "project = DES ORDER BY updated DESC",
  username: "",
  token: "",
  hasToken: false,
  createdAt: null,
  lastTestedAt: null,
  lastSyncedAt: null
};

export function JiraMigrationDialog({
  open,
  onOpenChange
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [form, setForm] = React.useState<JiraMigrationConfig>(initialForm);
  const [errors, setErrors] = React.useState<Partial<Record<keyof MigrationForm, string>>>({});
  const [message, setMessage] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [showToken, setShowToken] = React.useState(false);
  const [isEditing, setIsEditing] = React.useState(true);
  const [isLoading, setIsLoading] = React.useState(false);
  const [isTesting, setIsTesting] = React.useState(false);
  const [isSyncing, setIsSyncing] = React.useState(false);
  const [isSaving, setIsSaving] = React.useState(false);
  const [isDeleting, setIsDeleting] = React.useState(false);
  const isBusy = isLoading || isTesting || isSyncing || isSaving || isDeleting;
  const isReadOnly = !isEditing || isBusy;
  const fieldLabelClass = isReadOnly
    ? "text-zinc-400"
    : "text-zinc-950";
  const fieldControlClass = isReadOnly
    ? "border-zinc-200 disabled:opacity-100 dark:border-zinc-800"
    : "border-zinc-300 dark:border-zinc-700";
  const fieldLabelStyle = {
    color: isReadOnly ? "#a1a1aa" : "#18181b"
  };
  const fieldControlStyle = {
    backgroundColor: isReadOnly ? "#fafafa" : "#ffffff",
    boxShadow: isReadOnly
      ? "inset 0 0 0 1000px #fafafa, inset 0 2px 4px rgba(0, 0, 0, 0.05)"
      : "inset 0 0 0 1000px #ffffff, 0 1px 2px rgba(0, 0, 0, 0.05)",
    color: isReadOnly ? "#a1a1aa" : "#18181b",
    WebkitBoxShadow: isReadOnly
      ? "inset 0 0 0 1000px #fafafa, inset 0 2px 4px rgba(0, 0, 0, 0.05)"
      : "inset 0 0 0 1000px #ffffff, 0 1px 2px rgba(0, 0, 0, 0.05)",
    WebkitTextFillColor: isReadOnly ? "#a1a1aa" : "#18181b"
  };

  React.useEffect(() => {
    if (!open) return;

    async function loadConfiguration() {
      setIsLoading(true);
      setErrors({});
      setMessage(null);
      setError(null);
      setShowToken(false);

      try {
        const data = await apiFetch<JiraMigrationConfig>("/api/jira-migration");
        setForm(data);
        setIsEditing(!data.id);
      } catch (loadError) {
        setError(
          loadError instanceof Error
            ? loadError.message
            : "No se pudo cargar la configuracion Jira"
        );
        setIsEditing(true);
      } finally {
        setIsLoading(false);
      }
    }

    void loadConfiguration();
  }, [open]);

  function updateField<K extends keyof MigrationForm>(
    field: K,
    value: MigrationForm[K]
  ) {
    setForm((current) => ({
      ...current,
      [field]: value
    }));
    setErrors((current) => ({
      ...current,
      [field]: undefined
    }));
    setMessage(null);
    setError(null);
  }

  function validateForm() {
    const parsed = migrationSchema.safeParse({
      jiraUrl: form.jiraUrl,
      jql: form.jql,
      username: form.username,
      token: form.token || (form.hasToken ? "token-guardado" : "")
    });

    if (!parsed.success) {
      const nextErrors: Partial<Record<keyof MigrationForm, string>> = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path[0] as keyof MigrationForm | undefined;
        if (field) nextErrors[field] = issue.message;
      }
      setErrors(nextErrors);
      setMessage(null);
      setError("Revisa la informacion solicitada para continuar.");
      return null;
    }

    setErrors({});
    setError(null);
    return {
      jiraUrl: parsed.data.jiraUrl,
      jql: parsed.data.jql,
      username: parsed.data.username,
      token: form.token.trim()
    };
  }

  async function saveConfiguration() {
    setIsSaving(true);
    setMessage(null);
    setError(null);
    const payload = validateForm();

    try {
      if (!payload) return false;

      const data = await apiFetch<JiraMigrationConfig>("/api/jira-migration", {
        method: "PATCH",
        body: JSON.stringify(payload)
      });
      setForm(data);
      setIsEditing(false);
      setMessage("Configuracion de migracion Jira guardada correctamente.");
      return true;
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "No se pudo guardar la configuracion Jira"
      );
      return false;
    } finally {
      setIsSaving(false);
    }
  }

  async function testConnection() {
    setIsTesting(true);
    setMessage(null);
    const payload = validateForm();

    try {
      if (!payload) return;

      const response = await apiFetch<{ message: string }>("/api/jira-migration/test", {
        method: "POST",
        body: JSON.stringify(payload)
      });
      setMessage(response.message);
      setForm((current) => ({
        ...current,
        lastTestedAt: new Date().toISOString()
      }));
    } catch (testError) {
      setError(
        testError instanceof Error
          ? testError.message
          : "No se pudo probar la conexion Jira"
      );
    } finally {
      setIsTesting(false);
    }
  }

  async function syncFromJira() {
    setIsSyncing(true);
    setMessage(null);

    try {
      if (isEditing) {
        const saved = await saveConfiguration();
        if (!saved) return;
      } else if (!validateForm()) {
        return;
      }

      const response = await apiFetch<{
        lastSyncedAt: string | null;
        message: string;
      }>("/api/jira-migration/sync", {
        method: "POST"
      });
      setForm((current) => ({
        ...current,
        lastSyncedAt: response.lastSyncedAt
      }));
      setMessage(response.message);
    } catch (syncError) {
      setError(
        syncError instanceof Error
          ? syncError.message
          : "No se pudo iniciar la sincronizacion Jira"
      );
    } finally {
      setIsSyncing(false);
    }
  }

  async function deleteConfiguration() {
    setIsDeleting(true);
    setMessage(null);
    setError(null);
    setErrors({});

    try {
      await apiFetch<void>("/api/jira-migration", {
        method: "DELETE"
      });
      setForm(initialForm);
      setIsEditing(true);
      setShowToken(false);
      setMessage("Configuracion eliminada. Puedes registrar una nueva conexion Jira.");
    } finally {
      setIsDeleting(false);
    }
  }

  function submitForm(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isEditing) {
      saveConfiguration();
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogClose onClose={() => onOpenChange(false)} />
        <DialogHeader>
          <DialogTitle>Migracion desde Jira</DialogTitle>
          <DialogDescription>
            Ingresa la informacion de Jira que se usara para traer tickets al
            proyecto actual.
          </DialogDescription>
        </DialogHeader>

        <form className="space-y-5" onSubmit={submitForm}>
          <div className="rounded-md border bg-muted/30 p-4">
            <div className="flex items-start gap-3">
              <span className="mt-0.5 rounded-md bg-primary/10 p-2 text-primary">
                <GitBranch className="size-4" />
              </span>
              <div className="space-y-1">
                <p className="text-sm font-medium">Datos de origen</p>
                <p className="text-sm text-muted-foreground">
                  Usa un JQL cerrado para controlar que tickets entran en la
                  migracion. El token se mantiene oculto en pantalla.
                </p>
              </div>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="space-y-2 md:col-span-2">
              <Label
                className={fieldLabelClass}
                htmlFor="jira-url"
                style={fieldLabelStyle}
              >
                URL de Jira
              </Label>
              <Input
                className={fieldControlClass}
                disabled={isReadOnly}
                id="jira-url"
                onChange={(event) => updateField("jiraUrl", event.target.value)}
                placeholder="https://empresa.atlassian.net"
                style={fieldControlStyle}
                value={form.jiraUrl}
              />
              {errors.jiraUrl ? (
                <p className="text-xs text-destructive">{errors.jiraUrl}</p>
              ) : null}
            </label>

            <label className="space-y-2 md:col-span-2">
              <Label
                className={fieldLabelClass}
                htmlFor="jira-jql"
                style={fieldLabelStyle}
              >
                JQL de busqueda
              </Label>
              <Textarea
                className={cn("min-h-24", fieldControlClass)}
                disabled={isReadOnly}
                id="jira-jql"
                onChange={(event) => updateField("jql", event.target.value)}
                placeholder='project = "APP" AND sprint in openSprints() ORDER BY created DESC'
                style={fieldControlStyle}
                value={form.jql}
              />
              {errors.jql ? (
                <p className="text-xs text-destructive">{errors.jql}</p>
              ) : null}
            </label>

            <label className="space-y-2">
              <Label
                className={fieldLabelClass}
                htmlFor="jira-username"
                style={fieldLabelStyle}
              >
                Usuario Jira
              </Label>
              <Input
                className={fieldControlClass}
                disabled={isReadOnly}
                id="jira-username"
                onChange={(event) => updateField("username", event.target.value)}
                placeholder="correo@empresa.com"
                style={fieldControlStyle}
                value={form.username}
              />
              {errors.username ? (
                <p className="text-xs text-destructive">{errors.username}</p>
              ) : null}
            </label>

            <label className="space-y-2">
              <Label
                className={fieldLabelClass}
                htmlFor="jira-token"
                style={fieldLabelStyle}
              >
                Token
              </Label>
              <div className="relative">
                <Input
                  className={cn("pr-10", fieldControlClass)}
                  disabled={isReadOnly}
                  id="jira-token"
                  onChange={(event) => updateField("token", event.target.value)}
                  placeholder={
                    form.hasToken
                      ? "Token guardado. Escribe uno nuevo para reemplazarlo"
                      : "Pega el API token o PAT"
                  }
                  style={fieldControlStyle}
                  type={showToken ? "text" : "password"}
                  value={form.token}
                />
                <button
                  aria-label={showToken ? "Ocultar token" : "Mostrar token"}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-sm p-1 text-muted-foreground hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  disabled={isBusy}
                  onClick={() => setShowToken((current) => !current)}
                  type="button"
                >
                  {showToken ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
              {errors.token ? (
                <p className="text-xs text-destructive">{errors.token}</p>
              ) : form.hasToken ? (
                <p className="text-xs text-muted-foreground">
                  Ya hay un token guardado. Deja este campo vacio si no quieres
                  cambiarlo.
                </p>
              ) : null}
            </label>
          </div>

          {message ? (
            <p
              className="rounded-md border border-primary/20 bg-primary/5 p-3 text-sm text-primary"
              role="status"
            >
              {message}
            </p>
          ) : null}

          {error ? (
            <p
              className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
              role="alert"
            >
              {error}
            </p>
          ) : null}

          <div className="flex flex-wrap justify-end gap-2">
            <Button
              disabled={isTesting}
              onClick={testConnection}
              type="button"
              variant="outline"
            >
              <Wifi className={isTesting ? "animate-pulse" : ""} />
              Probar
            </Button>
            <Button
              disabled={isSyncing}
              onClick={syncFromJira}
              type="button"
            >
              <RefreshCw className={isSyncing ? "animate-spin" : ""} />
              Sincronizar
            </Button>
            <Button
              disabled={isSaving || isSyncing}
              onClick={() => {
                if (isEditing) {
                  saveConfiguration();
                  return;
                }
                setIsEditing(true);
                setMessage(null);
                setError(null);
              }}
              type="button"
              variant="outline"
            >
              {isEditing ? <Save /> : <Pencil />}
              {isEditing ? "Guardar" : "Editar"}
            </Button>
            <Button
              disabled={isDeleting}
              onClick={deleteConfiguration}
              type="button"
              variant="destructive"
            >
              <Trash2 />
              Eliminar
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
