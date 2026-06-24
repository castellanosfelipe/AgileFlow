# Jira Lite MVP Starter

Aplicacion Next.js full stack para un MVP tipo Jira con gestion operativa y vistas de seguimiento del proyecto actual.

- `/backlog`
- `/board`
- `/gantt`
- `/pert`
- `/executive`

## Stack

- Next.js App Router
- TypeScript
- Tailwind CSS
- shadcn/ui
- Prisma
- PostgreSQL
- NextAuth
- Zod
- TanStack Query
- dnd-kit
- Playwright

## Estructura principal

```txt
app/
  (app)/
    backlog/page.tsx
    board/page.tsx
    gantt/page.tsx
    pert/page.tsx
    executive/page.tsx
    layout.tsx
  login/page.tsx
  api/auth/[...nextauth]/route.ts
  api/project-insights/route.ts
  globals.css
  layout.tsx
  providers.tsx
components/
  app-shell.tsx
  ui/
lib/
  auth.ts
  prisma.ts
  schemas.ts
prisma/
  schema.prisma
Dockerfile
docker-compose.yml
playwright.config.ts
```

## Variables de entorno

Copia el archivo de ejemplo:

```bash
cp .env.example .env
```

Valores por defecto:

```txt
DATABASE_URL="postgresql://postgres:postgres@localhost:5433/jira_lite_mvp?schema=public"
NEXTAUTH_URL="http://localhost:3000"
NEXTAUTH_SECRET="change-me-in-local-development"
LDAP_URL="ldap://192.168.1.117:389"
LDAP_BIND_DN="CN=user3,OU=perfil_movil,OU=usuarios,DC=newcreangel,DC=local"
LDAP_BIND_PASSWORD="change-me"
LDAP_BASE_DN="OU=perfil_movil,OU=usuarios,DC=newcreangel,DC=local"
LDAP_USER_FILTER="(objectClass=user)"
LDAP_LOGIN_ATTRIBUTE="sAMAccountName"
LDAP_REQUIRED_GROUP_DN="CN=VPN,CN=Users,DC=newcreangel,DC=local"
```

## Ejecucion con Docker Compose

Levanta PostgreSQL y la aplicacion completa:

```bash
docker compose up -d --build
```

Docker Compose ejecuta automaticamente:

- PostgreSQL en el contenedor `jira-lite-mvp-postgres`.
- Next.js en el contenedor `jira-lite-mvp-app`.
- `prisma migrate deploy` antes de iniciar la app.

Abre:

- `http://localhost:3000/login`
- `http://localhost:3000/backlog`
- `http://localhost:3000/board`
- `http://localhost:3000/gantt`
- `http://localhost:3000/pert`
- `http://localhost:3000/executive`

Comandos utiles:

```bash
docker compose logs -f app
docker compose logs -f postgres
docker compose ps
docker compose down
```

La base de datos se conserva en el volumen Docker `postgres-data`. Los adjuntos
y backups quedan montados en:

- `public/uploads`
- `backups`

Si ya tienes `npm run dev` corriendo localmente, detenlo antes de levantar todo
con Docker porque ambos usan el puerto `3000`.

## Ejecucion local para desarrollo

Instala dependencias:

```bash
npm install
```

Levanta solo PostgreSQL:

```bash
docker compose up -d postgres
```

Genera Prisma Client y aplica la migracion inicial:

```bash
npm run db:migrate
```

Levanta la aplicacion:

```bash
npm run dev
```

Abre:

- `http://localhost:3000/login`
- `http://localhost:3000/backlog`
- `http://localhost:3000/board`
- `http://localhost:3000/gantt`
- `http://localhost:3000/pert`
- `http://localhost:3000/executive`

El login usa Directorio Activo por medio de NextAuth Credentials. Ingresa con
el usuario de AD, por ejemplo `sAMAccountName`, correo o UPN, y su contrasena.
Si `LDAP_REQUIRED_GROUP_DN` esta configurado, solo pueden autenticarse los
usuarios miembros de ese grupo. Los usuarios registrados, activos y miembros
del proyecto aparecen como responsables, incluyendo usuarios locales.

## Scripts

```bash
npm run dev
npm run build
npm run typecheck
npm run db:generate
npm run db:migrate
npm run test:e2e
```

## Alcance funcional

El producto contiene estas vistas de usuario:

- `/backlog`
- `/board`
- `/gantt`
- `/pert`
- `/executive`

`/login` existe unicamente como entrada de autenticacion.

Funcionalidad permitida:

- Creacion, inicio y cierre de sprints.
- Creacion y gestion basica de issues.
- Creacion de subtareas desde el detalle de una tarea.
- Carga de adjuntos en el detalle de una tarea. En desarrollo se guardan en `public/uploads/issues`.
- Movimiento de issues entre backlog, sprints y columnas Kanban.
- Auditoria basica de eventos importantes.
- Vista Gantt alimentada por fechas, responsables, sprints, epicas y subtareas del proyecto actual.
- Vista PERT alimentada por dependencias del campo Bloqueada por.
- Tablero ejecutivo alimentado por estimaciones, tiempo consumido, estados, fechas y carga por responsable.

Las vistas Gantt, PERT y Ejecutivo no usan una conexion externa a Jira. Consumen
los datos internos de PostgreSQL por medio de `/api/project-insights`.

Funcionalidad fuera de alcance:

- Vista lista.
- Roadmap.
- Formularios o flujos avanzados.
- Automatizaciones.
- Microservicios.
