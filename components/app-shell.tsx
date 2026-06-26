"use client";

import {
  BarChart3,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  GitBranch,
  HardDrive,
  KanbanSquare,
  ListTodo,
  LogOut,
  Network,
  UserCog,
  Users,
  UserRound,
  Zap
} from "lucide-react";
import { signOut } from "next-auth/react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import * as React from "react";
import { useQuery } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import type { ActiveSprintHealthDTO } from "@/app/api/sprints/active/route";

const DirectoryConnectionDialog = dynamic(
  () =>
    import("@/components/directory-connection-dialog").then(
      (mod) => mod.DirectoryConnectionDialog
    ),
  { ssr: false }
);
const JiraMigrationDialog = dynamic(
  () =>
    import("@/components/jira-migration-dialog").then(
      (mod) => mod.JiraMigrationDialog
    ),
  { ssr: false }
);
const UserManagementDialog = dynamic(
  () =>
    import("@/components/user-management-dialog").then(
      (mod) => mod.UserManagementDialog
    ),
  { ssr: false }
);
const BackupManagementDialog = dynamic(
  () =>
    import("@/components/backup-management-dialog").then(
      (mod) => mod.BackupManagementDialog
    ),
  { ssr: false }
);

const navItems = [
  { href: "/backlog", label: "Backlog", icon: ListTodo },
  { href: "/board", label: "Kanban", icon: KanbanSquare },
  { href: "/gantt", label: "Gantt", icon: GitBranch },
  { href: "/pert", label: "PERT", icon: Network },
  { href: "/executive", label: "Ejecutivo", icon: BarChart3 }
];

type AppShellUser = {
  name?: string | null;
  email?: string | null;
  role?: "admin" | "user";
};

export function AppShell({
  children,
  user
}: {
  children: React.ReactNode;
  user: AppShellUser;
}) {
  const pathname = usePathname();
  const [isCollapsed, setIsCollapsed] = React.useState(false);
  const [isUserMenuOpen, setIsUserMenuOpen] = React.useState(false);
  const [isDirectoryDialogOpen, setIsDirectoryDialogOpen] = React.useState(false);
  const [isUserManagementDialogOpen, setIsUserManagementDialogOpen] = React.useState(false);
  const [isJiraMigrationDialogOpen, setIsJiraMigrationDialogOpen] = React.useState(false);
  const [isBackupManagementDialogOpen, setIsBackupManagementDialogOpen] = React.useState(false);
  const userMenuRef = React.useRef<HTMLDivElement | null>(null);
  const displayName = user.name ?? user.email ?? "Usuario";
  const isAdmin = user.role === "admin";

  React.useEffect(() => {
    const saved = localStorage.getItem("sidebar-collapsed");
    if (saved === "true") setIsCollapsed(true);
  }, []);

  function toggleCollapsed() {
    setIsCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem("sidebar-collapsed", String(next));
      return next;
    });
  }

  React.useEffect(() => {
    function closeUserMenu(event: MouseEvent) {
      if (
        userMenuRef.current &&
        !userMenuRef.current.contains(event.target as Node)
      ) {
        setIsUserMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", closeUserMenu);
    return () => document.removeEventListener("mousedown", closeUserMenu);
  }, []);

  const sprintQuery = useQuery({
    queryKey: ["active-sprint-health"],
    queryFn: () => apiFetch<ActiveSprintHealthDTO | null>("/api/sprints/active"),
    staleTime: 60_000,
    refetchOnWindowFocus: false
  });

  const activeSprint = sprintQuery.data ?? null;

  const currentPage =
    navItems.find((item) => item.href === pathname)?.label ?? "AgileFlow";

  return (
    <div className="flex h-screen overflow-hidden bg-canvas">
      {/* ── Sidebar ─────────────────────────────────────── */}
      <aside
        className={cn(
          "flex shrink-0 flex-col border-r border-border-subtle bg-surface-01 transition-[width] duration-250 ease-both",
          isCollapsed ? "w-14" : "w-60"
        )}
      >
        {/* Logo */}
        <div className="flex h-12 shrink-0 items-center gap-3 border-b border-border-subtle px-3">
          <div className="flex size-7 shrink-0 items-center justify-center rounded-md bg-brand">
            <Zap className="size-4 text-white" />
          </div>
          {!isCollapsed && (
            <span className="truncate font-display text-[15px] font-semibold tracking-tight text-foreground">
              AgileFlow
            </span>
          )}
        </div>

        {/* Nav items */}
        <nav className="flex-1 space-y-0.5 overflow-y-auto px-2 py-2">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href;
            return (
              <Link
                href={item.href}
                key={item.href}
                title={isCollapsed ? item.label : undefined}
                className={cn(
                  "nav-item flex h-9 items-center gap-3 rounded-md px-2.5 text-sm font-medium transition-colors",
                  isActive
                    ? "nav-item-active text-brand"
                    : "text-muted-foreground hover:bg-surface-03 hover:text-foreground"
                )}
              >
                <Icon className="size-4 shrink-0" />
                {!isCollapsed && <span className="truncate">{item.label}</span>}
              </Link>
            );
          })}
        </nav>

        {/* Sprint health widget */}
        {!isCollapsed && activeSprint ? (
          <SprintHealthWidget sprint={activeSprint} />
        ) : null}

        {/* User + admin actions footer */}
        <div className="shrink-0 border-t border-border-subtle p-2">
          <div className="relative" ref={userMenuRef}>
            <button
              aria-expanded={isUserMenuOpen}
              aria-haspopup={isAdmin ? "menu" : undefined}
              className={cn(
                "flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm transition-colors hover:bg-surface-03",
                isCollapsed && "justify-center"
              )}
              onClick={() => isAdmin && setIsUserMenuOpen((o) => !o)}
              title={isCollapsed ? displayName : undefined}
              type="button"
            >
              <div className="flex size-6 shrink-0 items-center justify-center rounded-full bg-brand/20 text-xs font-semibold text-brand">
                {displayName.charAt(0).toUpperCase()}
              </div>
              {!isCollapsed && (
                <>
                  <span className="min-w-0 flex-1 truncate text-foreground">
                    {displayName}
                  </span>
                  {isAdmin && (
                    <ChevronDown
                      className={cn(
                        "size-3.5 shrink-0 text-muted-foreground transition-transform",
                        isUserMenuOpen && "rotate-180"
                      )}
                    />
                  )}
                </>
              )}
            </button>

            {isAdmin && isUserMenuOpen ? (
              <div
                className="absolute bottom-full left-0 z-[100] mb-1 min-w-[200px] overflow-hidden rounded-md border border-border-strong bg-surface-02 py-1 text-sm shadow-elevated"
                role="menu"
              >
                <button
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-foreground hover:bg-surface-03"
                  onClick={() => {
                    setIsUserMenuOpen(false);
                    setIsDirectoryDialogOpen(true);
                  }}
                  role="menuitem"
                  type="button"
                >
                  <UserCog className="size-4 text-muted-foreground" />
                  Directorio activo
                </button>
                <button
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-foreground hover:bg-surface-03"
                  onClick={() => {
                    setIsUserMenuOpen(false);
                    setIsJiraMigrationDialogOpen(true);
                  }}
                  role="menuitem"
                  type="button"
                >
                  <GitBranch className="size-4 text-muted-foreground" />
                  Migración Jira
                </button>
                <button
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-foreground hover:bg-surface-03"
                  onClick={() => {
                    setIsUserMenuOpen(false);
                    setIsUserManagementDialogOpen(true);
                  }}
                  role="menuitem"
                  type="button"
                >
                  <Users className="size-4 text-muted-foreground" />
                  Usuarios
                </button>
                <button
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-foreground hover:bg-surface-03"
                  onClick={() => {
                    setIsUserMenuOpen(false);
                    setIsBackupManagementDialogOpen(true);
                  }}
                  role="menuitem"
                  type="button"
                >
                  <HardDrive className="size-4 text-muted-foreground" />
                  Backups
                </button>
                <div className="my-1 border-t border-border-subtle" />
                <button
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-status-blocked hover:bg-surface-03"
                  onClick={() => signOut({ callbackUrl: "/login" })}
                  role="menuitem"
                  type="button"
                >
                  <LogOut className="size-4" />
                  Cerrar sesión
                </button>
              </div>
            ) : null}
          </div>

          {!isAdmin ? (
            <button
              className={cn(
                "mt-1 flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-sm text-muted-foreground transition-colors hover:bg-surface-03 hover:text-foreground",
                isCollapsed && "justify-center"
              )}
              onClick={() => signOut({ callbackUrl: "/login" })}
              title={isCollapsed ? "Cerrar sesión" : undefined}
              type="button"
            >
              <LogOut className="size-4 shrink-0" />
              {!isCollapsed && <span>Cerrar sesión</span>}
            </button>
          ) : null}
        </div>
      </aside>

      {/* ── Main area ───────────────────────────────────── */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {/* Topbar */}
        <header className="flex h-12 shrink-0 items-center gap-3 border-b border-border-subtle bg-canvas px-4">
          <button
            aria-label={isCollapsed ? "Expandir sidebar" : "Colapsar sidebar"}
            className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-surface-02 hover:text-foreground"
            onClick={toggleCollapsed}
            type="button"
          >
            {isCollapsed ? (
              <ChevronRight className="size-4" />
            ) : (
              <ChevronLeft className="size-4" />
            )}
          </button>
          <h1 className="text-sm font-semibold text-foreground">{currentPage}</h1>
          <div className="ml-auto flex items-center gap-2">
            <div className="hidden items-center gap-1.5 text-xs text-muted-foreground sm:flex">
              <UserRound className="size-3.5" />
              <span>{displayName}</span>
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-auto px-4 py-5">{children}</main>
      </div>

      <DirectoryConnectionDialog
        open={isDirectoryDialogOpen}
        onOpenChange={setIsDirectoryDialogOpen}
      />
      <JiraMigrationDialog
        open={isJiraMigrationDialogOpen}
        onOpenChange={setIsJiraMigrationDialogOpen}
      />
      <UserManagementDialog
        open={isUserManagementDialogOpen}
        onOpenChange={setIsUserManagementDialogOpen}
      />
      <BackupManagementDialog
        open={isBackupManagementDialogOpen}
        onOpenChange={setIsBackupManagementDialogOpen}
      />
    </div>
  );
}

function SprintHealthWidget({ sprint }: { sprint: ActiveSprintHealthDTO }) {
  const donePercent =
    sprint.total > 0 ? Math.round((sprint.done / sprint.total) * 100) : 0;
  const daysLeft =
    sprint.endsAt != null
      ? Math.ceil(
          (new Date(sprint.endsAt).getTime() - Date.now()) /
            (1000 * 60 * 60 * 24)
        )
      : null;

  return (
    <div className="mx-2 mb-2 rounded-md border border-border-subtle bg-surface-02 p-3">
      <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
        Sprint activo
      </p>
      <p className="mb-2 truncate text-xs font-medium text-foreground">
        {sprint.name}
      </p>

      {/* Progress bar */}
      <div className="sprint-progress-bar mb-2">
        <div
          className="sprint-progress-fill"
          style={{ width: `${donePercent}%` }}
        />
      </div>

      <div className="flex items-center justify-between text-[10px] text-muted-foreground">
        <span>
          {sprint.done}/{sprint.total} hechas
        </span>
        {daysLeft !== null ? (
          <span
            className={cn(
              daysLeft <= 2 && "font-semibold text-status-blocked",
              daysLeft > 2 && daysLeft <= 5 && "text-accent-data"
            )}
          >
            {daysLeft > 0 ? `${daysLeft}d restantes` : "Vence hoy"}
          </span>
        ) : null}
      </div>
    </div>
  );
}
