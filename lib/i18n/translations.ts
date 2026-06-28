export type Language = "es" | "en";

export const LANGUAGES: Language[] = ["es", "en"];
export const DEFAULT_LANGUAGE: Language = "es";
export const LANGUAGE_COOKIE = "agileflow-lang";

/**
 * UI chrome translations (login, sidebar, topbar, admin menus, common labels).
 * Deep feature content stays in Spanish for now and is translated incrementally.
 * Keys are flat and namespaced by area (e.g. "login.title").
 */
const es = {
  // Common
  "common.appName": "AgileFlow",
  "common.user": "Usuario",

  // Login
  "login.signInHeading": "Iniciar sesión",
  "login.subtitle": "Ingresa tus credenciales para continuar",
  "login.cardTitle": "Ingresar",
  "login.username": "Usuario",
  "login.usernamePlaceholder": "usuario o correo",
  "login.password": "Contraseña",
  "login.submit": "Entrar",
  "login.invalidCredentials":
    "Usuario o contraseña de Directorio Activo no válidos",

  // Navigation
  "nav.backlog": "Backlog",
  "nav.board": "Kanban",
  "nav.gantt": "Gantt",
  "nav.pert": "PERT",
  "nav.executive": "Ejecutivo",

  // Sidebar / topbar
  "sidebar.expand": "Expandir sidebar",
  "sidebar.collapse": "Colapsar sidebar",
  "sidebar.activeDirectory": "Directorio activo",
  "sidebar.jiraMigration": "Migración Jira",
  "sidebar.users": "Usuarios",
  "sidebar.backups": "Backups",
  "sidebar.logout": "Cerrar sesión",

  // Sprint health widget
  "sprint.active": "Sprint activo",
  "sprint.done": "{done}/{total} hechas",
  "sprint.daysLeft": "{days}d restantes",
  "sprint.dueToday": "Vence hoy",

  // Settings toggle
  "settings.spanish": "Español",
  "settings.english": "English",
  "settings.lightMode": "Modo claro",
  "settings.darkMode": "Modo oscuro"
} as const;

export type TranslationKey = keyof typeof es;

const en: Record<TranslationKey, string> = {
  // Common
  "common.appName": "AgileFlow",
  "common.user": "User",

  // Login
  "login.signInHeading": "Sign in",
  "login.subtitle": "Enter your credentials to continue",
  "login.cardTitle": "Log in",
  "login.username": "Username",
  "login.usernamePlaceholder": "username or email",
  "login.password": "Password",
  "login.submit": "Sign in",
  "login.invalidCredentials": "Invalid Active Directory username or password",

  // Navigation
  "nav.backlog": "Backlog",
  "nav.board": "Kanban",
  "nav.gantt": "Gantt",
  "nav.pert": "PERT",
  "nav.executive": "Executive",

  // Sidebar / topbar
  "sidebar.expand": "Expand sidebar",
  "sidebar.collapse": "Collapse sidebar",
  "sidebar.activeDirectory": "Active directory",
  "sidebar.jiraMigration": "Jira migration",
  "sidebar.users": "Users",
  "sidebar.backups": "Backups",
  "sidebar.logout": "Log out",

  // Sprint health widget
  "sprint.active": "Active sprint",
  "sprint.done": "{done}/{total} done",
  "sprint.daysLeft": "{days}d left",
  "sprint.dueToday": "Due today",

  // Settings toggle
  "settings.spanish": "Español",
  "settings.english": "English",
  "settings.lightMode": "Light mode",
  "settings.darkMode": "Dark mode"
};

export const translations: Record<Language, Record<TranslationKey, string>> = {
  es,
  en
};

export function isLanguage(value: unknown): value is Language {
  return value === "es" || value === "en";
}

/** Replace `{name}` placeholders in a translated string. */
export function interpolate(
  template: string,
  params?: Record<string, string | number>
): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in params ? String(params[key]) : match
  );
}
