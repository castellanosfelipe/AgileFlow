"use client";

import {
  ChevronUp,
  Eye,
  EyeOff,
  Pencil,
  RefreshCw,
  Save,
  Trash2,
  UserRound,
  Wifi
} from "lucide-react";
import * as React from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type DirectoryConnection = {
  id: string | null;
  name: string;
  host: string;
  port: number;
  bindDn: string;
  bindPassword: string;
  hasPassword: boolean;
  baseDn: string;
  userFilter: string;
  loginAttribute: string;
  createdAt: string | null;
};

const emptyConnection: DirectoryConnection = {
  id: null,
  name: "",
  host: "",
  port: 389,
  bindDn: "",
  bindPassword: "",
  hasPassword: false,
  baseDn: "",
  userFilter: "(objectClass=user)",
  loginAttribute: "sAMAccountName",
  createdAt: null
};

function formatCreationDate(value: string | null) {
  if (!value) return "sin guardar";

  return new Intl.DateTimeFormat("es-CO", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function FloatingField({
  disabled,
  label,
  type = "text",
  value,
  onChange,
  rightAdornment
}: {
  disabled: boolean;
  label: string;
  type?: string;
  value: string | number;
  onChange: (value: string) => void;
  rightAdornment?: React.ReactNode;
}) {
  const labelStyle = {
    color: disabled ? "#a1a1aa" : "#18181b"
  };
  const controlStyle = {
    backgroundColor: disabled ? "#fafafa" : "#ffffff",
    boxShadow: disabled
      ? "inset 0 0 0 1000px #fafafa, inset 0 2px 4px rgba(0, 0, 0, 0.05)"
      : "inset 0 0 0 1000px #ffffff, 0 1px 2px rgba(0, 0, 0, 0.05)",
    color: disabled ? "#a1a1aa" : "#18181b",
    WebkitBoxShadow: disabled
      ? "inset 0 0 0 1000px #fafafa, inset 0 2px 4px rgba(0, 0, 0, 0.05)"
      : "inset 0 0 0 1000px #ffffff, 0 1px 2px rgba(0, 0, 0, 0.05)",
    WebkitTextFillColor: disabled ? "#a1a1aa" : "#18181b"
  };

  return (
    <label className="relative block">
      <span
        className={cn(
          "absolute -top-2 left-3 bg-background px-1 text-[11px] transition-colors",
          disabled ? "text-zinc-400" : "text-zinc-950"
        )}
        style={labelStyle}
      >
        {label}
      </span>
      <Input
        className={cn(
          "h-14 rounded-sm pr-11 text-sm transition-colors disabled:opacity-100",
          disabled
            ? "border-zinc-200 disabled:opacity-100 dark:border-zinc-800"
            : "border-zinc-300 dark:border-zinc-700"
        )}
        disabled={disabled}
        style={controlStyle}
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
      {rightAdornment ? (
        <span className="absolute right-3 top-1/2 -translate-y-1/2">
          {rightAdornment}
        </span>
      ) : null}
    </label>
  );
}

export function DirectoryConnectionDialog({
  open,
  onOpenChange
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [connection, setConnection] =
    React.useState<DirectoryConnection>(emptyConnection);
  const [isEditing, setIsEditing] = React.useState(false);
  const [showPassword, setShowPassword] = React.useState(false);
  const [isLoading, setIsLoading] = React.useState(false);
  const [isSaving, setIsSaving] = React.useState(false);
  const [isSyncing, setIsSyncing] = React.useState(false);
  const [isTesting, setIsTesting] = React.useState(false);
  const [isDeleting, setIsDeleting] = React.useState(false);
  const [message, setMessage] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const isReadOnly =
    !isEditing || isSaving || isSyncing || isTesting || isDeleting;

  React.useEffect(() => {
    if (!open) return;

    async function loadConnection() {
      setIsLoading(true);
      setError(null);
      setMessage(null);

      try {
        const response = await fetch("/api/directory-connection");
        if (!response.ok) throw new Error(await response.text());
        const data = (await response.json()) as DirectoryConnection;
        setConnection(data);
        setIsEditing(!data.name);
      } catch (loadError) {
        setError(
          loadError instanceof Error
            ? loadError.message
            : "No se pudo cargar la conexión"
        );
      } finally {
        setIsLoading(false);
      }
    }

    loadConnection();
  }, [open]);

  function updateConnection<K extends keyof DirectoryConnection>(
    field: K,
    value: DirectoryConnection[K]
  ) {
    setConnection((current) => ({
      ...current,
      [field]: value
    }));
  }

  async function saveConnection() {
    setIsSaving(true);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch("/api/directory-connection", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(connection)
      });

      if (!response.ok) throw new Error(await response.text());

      const data = (await response.json()) as DirectoryConnection;
      setConnection(data);
      setIsEditing(false);
      setMessage("Conexión guardada correctamente.");
      return true;
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "No se pudo guardar la conexión"
      );
      return false;
    } finally {
      setIsSaving(false);
    }
  }

  async function testConnection() {
    setIsTesting(true);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch("/api/directory-connection/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(connection)
      });
      const data = (await response.json()) as { message?: string };

      if (!response.ok) {
        throw new Error(data.message ?? "No se pudo probar la conexión");
      }

      setMessage(data.message ?? "Conexión activa y funcionando.");
    } catch (testError) {
      setError(
        testError instanceof Error
          ? testError.message
          : "No se pudo probar la conexión"
      );
    } finally {
      setIsTesting(false);
    }
  }

  async function syncConnection() {
    setIsSyncing(true);
    setError(null);
    setMessage(null);

    try {
      if (isEditing) {
        const saved = await saveConnection();
        if (!saved) return;
      }

      const response = await fetch("/api/directory-connection/sync", {
        method: "POST"
      });
      const data = (await response.json()) as { message?: string };

      if (!response.ok) throw new Error(data.message ?? "No se pudo sincronizar");

      setMessage(data.message ?? "Sincronización completada.");
    } catch (syncError) {
      setError(
        syncError instanceof Error
          ? syncError.message
          : "No se pudo sincronizar"
      );
    } finally {
      setIsSyncing(false);
    }
  }

  async function deleteConnection() {
    setIsDeleting(true);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch("/api/directory-connection", {
        method: "DELETE"
      });

      if (!response.ok) throw new Error(await response.text());

      setConnection(emptyConnection);
      setIsEditing(true);
      setMessage("Conexión eliminada. Puedes crear una nueva configuración.");
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : "No se pudo eliminar la conexión"
      );
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[96vw] rounded-none p-0">
        <Button
          aria-label="Cerrar configuración de Directorio Activo"
          className="absolute right-3 top-3"
          onClick={() => onOpenChange(false)}
          size="icon"
          type="button"
          variant="ghost"
        >
          <ChevronUp />
        </Button>
        <div className="min-h-[420px] p-4">
          <DialogHeader>
            <div className="flex items-start gap-4">
              <div className="grid size-8 shrink-0 place-items-center rounded-sm bg-primary text-primary-foreground">
                <UserRound className="size-5" />
              </div>
              <div>
                <DialogTitle>{connection.name || "Directorio activo"}</DialogTitle>
                <DialogDescription>
                  Fecha de creación: {formatCreationDate(connection.createdAt)}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          {isLoading ? (
            <p className="rounded-md border p-4 text-sm text-muted-foreground">
              Cargando conexión...
            </p>
          ) : (
            <div className="grid gap-x-4 gap-y-3 lg:grid-cols-2">
              <FloatingField
                disabled={isReadOnly}
                label="Nombre de la conexión"
                value={connection.name}
                onChange={(value) => updateConnection("name", value)}
              />
              <FloatingField
                disabled={isReadOnly}
                label="Dirección IP"
                value={connection.host}
                onChange={(value) => updateConnection("host", value)}
              />
              <FloatingField
                disabled={isReadOnly}
                label="Puerto"
                type="number"
                value={connection.port}
                onChange={(value) =>
                  updateConnection("port", Number(value || 389))
                }
              />
              <FloatingField
                disabled={isReadOnly}
                label="Usuario"
                value={connection.bindDn}
                onChange={(value) => updateConnection("bindDn", value)}
              />
              <FloatingField
                disabled={isReadOnly}
                label="Contraseña"
                type={showPassword ? "text" : "password"}
                value={
                  connection.bindPassword ||
                  (!isEditing && connection.hasPassword ? "********" : "")
                }
                onChange={(value) => updateConnection("bindPassword", value)}
                rightAdornment={
                  <button
                    aria-label={
                      showPassword ? "Ocultar contraseña" : "Mostrar contraseña"
                    }
                    className="text-muted-foreground hover:text-foreground"
                    onClick={() => setShowPassword((current) => !current)}
                    type="button"
                  >
                    {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                }
              />
              <FloatingField
                disabled={isReadOnly}
                label="LDAP query"
                value={connection.baseDn}
                onChange={(value) => updateConnection("baseDn", value)}
              />
              <FloatingField
                disabled={isReadOnly}
                label="Filtro de búsqueda"
                value={connection.userFilter}
                onChange={(value) => updateConnection("userFilter", value)}
              />
              <FloatingField
                disabled={isReadOnly}
                label="Llave para realizar login"
                value={connection.loginAttribute}
                onChange={(value) => updateConnection("loginAttribute", value)}
              />
            </div>
          )}

          {message ? (
            <p className="mt-4 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
              {message}
            </p>
          ) : null}

          {error ? (
            <p className="mt-4 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          ) : null}

          <div className="mt-6 flex justify-end gap-2">
            <Button
              disabled={isLoading || isTesting}
              onClick={testConnection}
              type="button"
              variant="outline"
            >
              <Wifi className={isTesting ? "animate-pulse" : ""} />
              Probar
            </Button>
            <Button
              disabled={isLoading || isSyncing}
              onClick={syncConnection}
              type="button"
            >
              <RefreshCw className={isSyncing ? "animate-spin" : ""} />
              Sincronizar
            </Button>
            <Button
              disabled={isLoading || isSaving}
              onClick={() => {
                if (isEditing) {
                  saveConnection();
                  return;
                }
                setIsEditing(true);
                setConnection((current) => ({
                  ...current,
                  bindPassword: ""
                }));
              }}
              type="button"
              variant="outline"
            >
              {isEditing ? <Save /> : <Pencil />}
              {isEditing ? "Guardar" : "Editar"}
            </Button>
            <Button
              disabled={isLoading || isDeleting}
              onClick={deleteConnection}
              type="button"
              variant="destructive"
            >
              <Trash2 />
              Eliminar
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
