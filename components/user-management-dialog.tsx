"use client";

import {
  ChevronDown,
  Loader2,
  Plus,
  Shield,
  Trash2
} from "lucide-react";
import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";

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
import { Select } from "@/components/ui/select";
import { apiFetch } from "@/lib/api-client";

type ManagedUser = {
  id: string;
  name: string;
  email: string;
  image: string | null;
  isActive: boolean;
  role: "admin" | "user";
  source: "ldap" | "local";
};

type UsersResponse = {
  currentUserId: string;
  users: ManagedUser[];
};

const roleLabels: Record<ManagedUser["role"], string> = {
  admin: "admin",
  user: "user"
};

export function UserManagementDialog({
  open,
  onOpenChange
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [users, setUsers] = React.useState<ManagedUser[]>([]);
  const [name, setName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [role, setRole] = React.useState<ManagedUser["role"]>("user");
  const [isCreateFormOpen, setIsCreateFormOpen] = React.useState(false);
  const [isLoading, setIsLoading] = React.useState(false);
  const [isCreating, setIsCreating] = React.useState(false);
  const [updatingUserId, setUpdatingUserId] = React.useState<string | null>(null);
  const [deletingUserId, setDeletingUserId] = React.useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = React.useState<string | null>(null);
  const [message, setMessage] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  function refreshAssignableUserLists() {
    queryClient.invalidateQueries({ queryKey: ["backlog"] });
    queryClient.invalidateQueries({ queryKey: ["board"] });
  }

  React.useEffect(() => {
    if (!open) return;

    async function loadUsers() {
      setIsLoading(true);
      setError(null);
      setMessage(null);

      try {
        const data = await apiFetch<UsersResponse>("/api/users");
        setCurrentUserId(data.currentUserId);
        setUsers(data.users);
      } catch (loadError) {
        setError(
          loadError instanceof Error
            ? loadError.message
            : "No se pudieron cargar los usuarios"
        );
      } finally {
        setIsLoading(false);
      }
    }

    loadUsers();
  }, [open]);

  async function createUser(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsCreating(true);
    setError(null);
    setMessage(null);

    try {
      const createdUser = await apiFetch<ManagedUser>("/api/users", {
        method: "POST",
        body: JSON.stringify({
          name,
          email,
          password,
          role
        })
      });

      setUsers((current) => {
        const withoutCurrent = current.filter((user) => user.id !== createdUser.id);
        return [...withoutCurrent, createdUser].sort((a, b) =>
          a.name.localeCompare(b.name)
        );
      });
      setName("");
      setEmail("");
      setPassword("");
      setRole("user");
      setIsCreateFormOpen(false);
      refreshAssignableUserLists();
      setMessage("Usuario local creado correctamente.");
    } catch (createError) {
      setError(
        createError instanceof Error
          ? createError.message
          : "No se pudo crear el usuario"
      );
    } finally {
      setIsCreating(false);
    }
  }

  async function updateUser(
    userId: string,
    payload: Partial<Pick<ManagedUser, "role" | "isActive">>
  ) {
    setUpdatingUserId(userId);
    setError(null);
    setMessage(null);

    try {
      const updatedUser = await apiFetch<ManagedUser>("/api/users", {
        method: "PATCH",
        body: JSON.stringify({
          userId,
          ...payload
        })
      });

      setUsers((current) =>
        current.map((user) => (user.id === userId ? updatedUser : user))
      );
      refreshAssignableUserLists();
      setMessage("Usuario actualizado correctamente.");
    } catch (updateError) {
      setError(
        updateError instanceof Error
          ? updateError.message
          : "No se pudo actualizar el rol"
      );
    } finally {
      setUpdatingUserId(null);
    }
  }

  async function deleteLocalUser(user: ManagedUser) {
    if (user.source !== "local") return;
    const confirmed = window.confirm(
      `¿Eliminar el usuario local ${user.name}? Esta acción solo se permite si no tiene historial asociado.`
    );

    if (!confirmed) return;

    setDeletingUserId(user.id);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch(
        `/api/users?userId=${encodeURIComponent(user.id)}`,
        {
          method: "DELETE"
        }
      );

      if (!response.ok) {
        const responseMessage = await response.text();
        throw new Error(responseMessage || "No se pudo eliminar el usuario");
      }

      setUsers((current) =>
        current.filter((currentUser) => currentUser.id !== user.id)
      );
      refreshAssignableUserLists();
      setMessage("Usuario local eliminado correctamente.");
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : "No se pudo eliminar el usuario"
      );
    } finally {
      setDeletingUserId(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl">
        <DialogClose onClose={() => onOpenChange(false)} />
        <DialogHeader>
          <DialogTitle>Usuarios</DialogTitle>
          <DialogDescription>
            Crea usuarios locales y define si cada persona tiene rol user o admin.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <section className="space-y-3">
            <div className="flex justify-end">
              <Button
                aria-controls="local-user-form"
                aria-expanded={isCreateFormOpen}
                aria-label={
                  isCreateFormOpen
                    ? "Contraer formulario de usuario local"
                    : "Abrir formulario de usuario local"
                }
                onClick={() => setIsCreateFormOpen((current) => !current)}
                size="icon"
                title={
                  isCreateFormOpen
                    ? "Contraer formulario"
                    : "Crear usuario local"
                }
                type="button"
                variant="outline"
              >
                {isCreateFormOpen ? <ChevronDown /> : <Plus />}
              </Button>
            </div>

            {isCreateFormOpen ? (
              <form
                className="space-y-3 rounded-md border p-3"
                id="local-user-form"
                onSubmit={createUser}
              >
            <div className="space-y-2">
              <Label htmlFor="local-user-name">Nombre</Label>
              <Input
                id="local-user-name"
                placeholder="Nombre completo"
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="local-user-email">Correo</Label>
              <Input
                id="local-user-email"
                placeholder="usuario@empresa.com"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="local-user-password">Contraseña</Label>
              <Input
                id="local-user-password"
                placeholder="Minimo 8 caracteres"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="local-user-role">Rol</Label>
              <Select
                id="local-user-role"
                value={role}
                onChange={(event) =>
                  setRole(event.target.value as ManagedUser["role"])
                }
              >
                <option value="user">user</option>
                <option value="admin">admin</option>
              </Select>
            </div>

            <Button
              className="w-full"
              disabled={isCreating}
              type="submit"
            >
              {isCreating ? <Loader2 className="animate-spin" /> : <Plus />}
              Crear usuario
            </Button>
              </form>
            ) : null}
          </section>

          <section className="space-y-3">
            <div className="flex items-center gap-2">
              <Shield className="size-4 text-muted-foreground" />
              <h3 className="text-sm font-semibold">Roles del equipo</h3>
            </div>

            {isLoading ? (
              <div className="rounded-md border p-4 text-sm text-muted-foreground">
                Cargando usuarios...
              </div>
            ) : null}

            {!isLoading && users.length ? (
              <div className="grid max-h-[520px] gap-3 overflow-y-auto pr-1 md:grid-cols-2">
                {users.map((user) => {
                  const isBusy =
                    updatingUserId === user.id || deletingUserId === user.id;

                  return (
                    <div
                      className={`rounded-md border p-3 transition ${
                        user.isActive ? "bg-background" : "bg-muted/35"
                      }`}
                      key={user.id}
                    >
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="truncate text-sm font-semibold text-foreground">
                              {user.name}
                            </p>
                            <span className="rounded-sm border bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">
                              {user.source === "ldap"
                                ? "Directorio activo"
                                : "Local"}
                            </span>
                          </div>
                          <p className="mt-1 truncate text-xs text-muted-foreground">
                            {user.email}
                          </p>
                        </div>

                        <div className="flex shrink-0 flex-wrap items-center gap-2">
                          <label
                            className={`inline-flex h-9 cursor-pointer items-center gap-2 rounded-md border px-2.5 text-xs font-medium transition ${
                              user.isActive
                                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                                : "border-zinc-200 bg-zinc-100 text-zinc-600"
                            }`}
                          >
                            <input
                              aria-label={`${
                                user.isActive ? "Inactivar" : "Activar"
                              } ${user.name}`}
                              checked={user.isActive}
                              className="size-3.5 rounded border-input accent-emerald-600"
                              disabled={isBusy || user.id === currentUserId}
                              type="checkbox"
                              onChange={(event) =>
                                updateUser(user.id, {
                                  isActive: event.target.checked
                                })
                              }
                            />
                            Activo
                          </label>

                          <Select
                            aria-label={`Rol de ${user.name}`}
                            className="h-9 w-28"
                            disabled={isBusy}
                            value={user.role}
                            onChange={(event) =>
                              updateUser(user.id, {
                                role: event.target.value as ManagedUser["role"]
                              })
                            }
                          >
                            <option value="user">{roleLabels.user}</option>
                            <option value="admin">{roleLabels.admin}</option>
                          </Select>

                          {user.source === "local" ? (
                            <Button
                              aria-label={`Eliminar usuario local ${user.name}`}
                              disabled={isBusy || user.id === currentUserId}
                              onClick={() => deleteLocalUser(user)}
                              size="icon"
                              title="Eliminar usuario local"
                              type="button"
                              variant="ghost"
                            >
                              {deletingUserId === user.id ? (
                                <Loader2 className="animate-spin" />
                              ) : (
                                <Trash2 />
                              )}
                            </Button>
                          ) : (
                            <span
                              aria-label="Usuario de Directorio Activo"
                              className="size-9"
                            />
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : null}

            {!isLoading && !users.length ? (
              <div className="rounded-md border p-4 text-sm text-muted-foreground">
                No hay usuarios registrados.
              </div>
            ) : null}
          </section>
        </div>

        {message ? (
          <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
            {message}
          </p>
        ) : null}

        {error ? (
          <p
            className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
            role="alert"
          >
            {error}
          </p>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
