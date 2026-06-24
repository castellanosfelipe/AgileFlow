"use client";

import {
  BarChart3,
  ChevronDown,
  GitBranch,
  HardDrive,
  KanbanSquare,
  ListTodo,
  LogOut,
  Network,
  UserCog,
  Users,
  UserRound
} from "lucide-react";
import { signOut } from "next-auth/react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import * as React from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

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
  const [isUserMenuOpen, setIsUserMenuOpen] = React.useState(false);
  const [isDirectoryDialogOpen, setIsDirectoryDialogOpen] =
    React.useState(false);
  const [isUserManagementDialogOpen, setIsUserManagementDialogOpen] =
    React.useState(false);
  const [isJiraMigrationDialogOpen, setIsJiraMigrationDialogOpen] =
    React.useState(false);
  const [isBackupManagementDialogOpen, setIsBackupManagementDialogOpen] =
    React.useState(false);
  const userMenuRef = React.useRef<HTMLDivElement | null>(null);
  const displayName = user.name ?? user.email ?? "Usuario";
  const isAdmin = user.role === "admin";

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

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4">
          <div className="flex items-center gap-4">
            <Link className="font-semibold" href="/backlog">
              Jira Lite
            </Link>
            <nav className="flex items-center gap-1">
              {navItems.map((item) => {
                const Icon = item.icon;
                const active = pathname === item.href;
                return (
                  <Button
                    asChild
                    className={cn(active && "bg-accent text-accent-foreground")}
                    key={item.href}
                    size="sm"
                    variant="ghost"
                  >
                    <Link href={item.href}>
                      <Icon />
                      {item.label}
                    </Link>
                  </Button>
                );
              })}
            </nav>
          </div>

          <div className="flex items-center gap-2">
            <div className="relative" ref={userMenuRef}>
              {isAdmin ? (
                <Button
                  aria-expanded={isUserMenuOpen}
                  aria-haspopup="menu"
                  className="hidden max-w-64 text-muted-foreground sm:inline-flex"
                  onClick={() => setIsUserMenuOpen((current) => !current)}
                  size="sm"
                  type="button"
                  variant="ghost"
                >
                  <UserRound className="size-4" />
                  <span className="max-w-44 truncate">{displayName}</span>
                  <ChevronDown
                    className={cn(
                      "size-4 transition-transform",
                      isUserMenuOpen && "rotate-180"
                    )}
                  />
                </Button>
              ) : (
                <div className="hidden items-center gap-2 px-2 text-sm text-muted-foreground sm:flex">
                  <UserRound className="size-4" />
                  <span className="max-w-44 truncate">{displayName}</span>
                </div>
              )}
              {isAdmin && isUserMenuOpen ? (
                <div
                  className="absolute right-0 top-11 z-[100] min-w-56 overflow-hidden rounded-md border border-border bg-card p-1 text-sm text-card-foreground shadow-xl ring-1 ring-black/5 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                  role="menu"
                >
                  <button
                    className="flex w-full items-center gap-2 rounded-sm px-3 py-2 text-left hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    onClick={() => {
                      setIsUserMenuOpen(false);
                      setIsDirectoryDialogOpen(true);
                    }}
                    role="menuitem"
                    type="button"
                  >
                    <UserCog className="size-4" />
                    Directorio activo
                  </button>
                  <button
                    className="flex w-full items-center gap-2 rounded-sm px-3 py-2 text-left hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    onClick={() => {
                      setIsUserMenuOpen(false);
                      setIsJiraMigrationDialogOpen(true);
                    }}
                    role="menuitem"
                    type="button"
                  >
                    <GitBranch className="size-4" />
                    Migracion Jira
                  </button>
                  <button
                    className="flex w-full items-center gap-2 rounded-sm px-3 py-2 text-left hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    onClick={() => {
                      setIsUserMenuOpen(false);
                      setIsUserManagementDialogOpen(true);
                    }}
                    role="menuitem"
                    type="button"
                  >
                    <Users className="size-4" />
                    Usuarios
                  </button>
                  <button
                    className="flex w-full items-center gap-2 rounded-sm px-3 py-2 text-left hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    onClick={() => {
                      setIsUserMenuOpen(false);
                      setIsBackupManagementDialogOpen(true);
                    }}
                    role="menuitem"
                    type="button"
                  >
                    <HardDrive className="size-4" />
                    Backups
                  </button>
                </div>
              ) : null}
            </div>
            <Button
              onClick={() => signOut({ callbackUrl: "/login" })}
              size="sm"
              type="button"
              variant="outline"
            >
              <LogOut />
              Salir
            </Button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6">{children}</main>
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
