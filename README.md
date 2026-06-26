# AgileFlow

**Gestión ágil sin fricción para equipos de ingeniería que no tienen tiempo para aprender Jira.**

![Estado](https://img.shields.io/badge/estado-beta-yellow)
![Next.js](https://img.shields.io/badge/Next.js-15-black)
![Licencia](https://img.shields.io/badge/licencia-MIT-blue)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-blue)

**Demo en vivo → [agileflow-indol.vercel.app](https://agileflow-indol.vercel.app)**
> Usuario: `ana.gomez@example.com` · Contraseña: `password123`

![Pantalla de acceso a AgileFlow en modo oscuro](docs/screenshots/login.png)

---

## El problema

Jira resuelve todo excepto lo que más necesita un equipo pequeño: **empezar a trabajar rápido**. Las licencias son caras, la configuración consume días, y la mitad de las funciones nunca se usan pero ralentizan todo lo que sí se usa.

Los equipos de ingeniería de 5 a 25 personas necesitan un backlog, un tablero y una forma de saber cómo va el sprint, no una plataforma enterprise.

AgileFlow es eso: una herramienta ágil self-hosted que se instala en minutos, corre en tu propia infraestructura y cubre exactamente los flujos que un equipo de desarrollo usa todos los días.

---

## La solución

### Backlog y planificación de sprints

Desde aquí gestionas el trabajo pendiente en su totalidad. Puedes crear tareas directamente, asignarlas a un sprint, cambiar su prioridad y arrancar el sprint cuando el equipo esté listo, todo sin salir de la misma pantalla.

- Búsqueda en tiempo real por código, título o épica
- Agrupación por sprint (activo, planificados, backlog)
- Mover tareas entre sprints con un clic
- Crear sprint, establecer fechas y objetivo, activar
- Al completar un sprint: las tareas sin terminar migran automáticamente al siguiente

![Vista del backlog con sprints colapsables y tareas organizadas por épica](docs/screenshots/backlog-sprint-planning.png)

---

### Tablero Kanban del sprint activo

El tablero muestra exclusivamente las tareas del sprint en curso, organizadas en tres columnas: Por hacer, En curso y Finalizada. Arrastra las tarjetas para cambiar su estado; el sistema lo guarda de inmediato.

- Drag & drop nativo (funciona en touch y desktop)
- Límite WIP en "En curso" (6 tareas): el contador cambia a ámbar al acercarse y a rojo al superarse
- Agrupación opcional por épica
- Creación rápida de tarea directamente en la columna
- Abre el detalle de cualquier tarea como panel lateral, sin perder el contexto del tablero

![Tablero Kanban con tarjetas distribuidas en tres columnas y el panel de detalle abierto a la derecha](docs/screenshots/kanban-board-con-detalle.png)

---

### Panel de detalle de tarea (sin modal)

Cuando abres una tarea, aparece como un panel deslizante desde la derecha. El tablero sigue visible. Cuando cierras, estás exactamente donde estabas.

Dentro del panel puedes:

- Editar título, descripción, estado, responsable, épica y sprint (auto-guardado)
- Registrar tiempo trabajado con descripción
- Añadir comentarios del equipo
- Adjuntar archivos (arrastrar o seleccionar)
- Ver subtareas y crearlas en el momento
- Establecer bloqueos («Bloqueada por» otra tarea)
- Consultar el historial de auditoría completo

![Panel de detalle de tarea deslizando desde la derecha con campos de edición, comentarios y registro de tiempo](docs/screenshots/detalle-tarea-panel.png)

---

### Gantt por responsable

La vista de Gantt muestra todas las tareas del proyecto con sus fechas de inicio y fin, agrupadas por persona asignada. Cambia el zoom entre día, semana, mes y trimestre para encontrar el nivel de detalle que necesitas.

- Indica visualmente quién está sobrecargado (barras apiladas)
- Detecta fechas sin definir o conflictos de solapamiento
- Exporta los datos como CSV para compartir con stakeholders externos

![Vista Gantt con barras horizontales por responsable y zoom semanal activo](docs/screenshots/gantt-responsable-semana.png)

---

### PERT de dependencias

A partir del campo "Bloqueada por" de cada tarea, el sistema construye automáticamente el grafo de dependencias del proyecto. Sin configuración adicional.

Desde aquí puedes identificar:

- El camino crítico de entrega (la cadena más larga de bloqueadores)
- Los cuellos de botella: tareas que bloquean a varias otras simultáneamente
- Las tareas sin dependencias que pueden arrancarse de inmediato

![Diagrama PERT con nodos de tareas conectados por flechas de dependencia y resaltado del camino crítico](docs/screenshots/pert-dependencias.png)

---

### Tablero ejecutivo

Diseñado para responder una sola pregunta en menos de 30 segundos: **¿cómo va el equipo?**

Incluye:

- **Daily Resource Load Index**: heatmap de carga de trabajo diaria por persona, con comparación contra jornada estándar de 8h
- **Seguimiento diario**: tabla de estimaciones, tiempo registrado y tiempo restante por tarea
- **Pendientes por estimar**: identifica tareas sin estimación que distorsionan la planeación
- **Cubos de envejecimiento**: agrupa tareas por cuánto tiempo llevan sin moverse
- Filtros por sprint, responsable y épica; exportación a CSV

![Dashboard ejecutivo con heatmap de carga diaria, tabla de seguimiento y métricas de sprint](docs/screenshots/ejecutivo-resource-load.png)

---

## Flujos principales

### Cómo planificar y arrancar un sprint

1. Entra al **Backlog** y crea las tareas de la iteración (o tómalas del backlog existente)
2. Haz clic en **"Crear sprint"**, define nombre, fechas de inicio/fin y objetivo
3. Arrastra las tareas al sprint o usa el menú de "Mover a sprint" en cada tarjeta
4. Haz clic en **"Iniciar sprint"** cuando el equipo esté listo
5. El sistema mueve automáticamente las tareas al tablero Kanban activo

> Al final del sprint, "Completar sprint" migra las tareas sin terminar al siguiente sprint planificado o al backlog.

![GIF: Flujo completo de creación de sprint, asignación de tareas y activación](docs/videos/flujo-crear-sprint.gif)

---

### Cómo registrar avance en una tarea

1. Abre el **Tablero Kanban**
2. Arrastra la tarjeta de "Por hacer" a "En curso"
3. Haz clic en la tarjeta para abrir el panel de detalle
4. En la sección de tiempo, registra las horas trabajadas y una descripción
5. Cierra el panel — el tablero sigue en pantalla sin interrupciones

> El sistema actualiza el tiempo restante en tiempo real y lo refleja en el tablero ejecutivo.

![GIF: Mover una tarea al tablero y registrar tiempo desde el panel lateral](docs/videos/flujo-registrar-avance.gif)

---

### Cómo detectar carga desequilibrada

1. Ve al **Tablero ejecutivo** desde el menú lateral
2. En la sección **Daily Resource Load Index** verás el heatmap de cada persona
3. Las celdas en rojo indican días con más del 100% de carga estimada
4. Exporta la tabla con el botón de descarga para presentarla en la reunión de refinamiento

> Filtra por sprint o épica para aislar el análisis a un área específica del proyecto.

![GIF: Navegar al ejecutivo, revisar el heatmap de carga y exportar los datos](docs/videos/flujo-revisar-carga.gif)

---

## Quick start

### Requisitos

- Node.js 20 o superior
- PostgreSQL 15 o superior
- (Opcional) Servidor LDAP / Active Directory para autenticación corporativa

### Instalación

```bash
# 1. Clona el repositorio y entra al directorio
git clone https://github.com/castellanosfelipe/AgileFlow.git agileflow && cd agileflow

# 2. Instala dependencias
npm install

# 3. Configura las variables de entorno
cp .env.example .env.local
# Edita .env.local con tu DATABASE_URL y NEXTAUTH_SECRET

# 4. Inicializa la base de datos, carga datos de prueba y arranca
npx prisma migrate deploy && npx prisma db seed && npm run dev
```

### Verifica que funciona

Abre [http://localhost:3000](http://localhost:3000) e ingresa con las credenciales del seed:

```
Usuario:    ana.gomez@example.com
Contraseña: password123
```

Deberías ver el backlog con 30 tareas distribuidas en 3 sprints y 5 épicas.

### Variables de entorno requeridas

| Variable | Descripción |
|---|---|
| `DATABASE_URL` | Conexión PostgreSQL (`postgresql://user:pass@host:5432/db`) |
| `NEXTAUTH_SECRET` | Clave aleatoria para firmar sesiones (mínimo 32 caracteres) |
| `NEXTAUTH_URL` | URL base del servidor (`http://localhost:3000` en local) |

### Autenticación LDAP / Active Directory (opcional)

Si tu equipo usa Active Directory, agrega al `.env.local`:

```env
LDAP_URL=ldap://tu-servidor:389
LDAP_BIND_DN=CN=service-account,DC=empresa,DC=com
LDAP_BIND_PASSWORD=tu-password
LDAP_BASE_DN=OU=usuarios,DC=empresa,DC=com
LDAP_USER_FILTER=(objectClass=user)
LDAP_LOGIN_ATTRIBUTE=sAMAccountName
```

Los usuarios del directorio pueden iniciar sesión de inmediato. Si LDAP no está configurado, el sistema usa autenticación local con email y contraseña.

---

## Despliegue rápido (Vercel + Neon)

La forma más rápida de publicar AgileFlow sin costo:

```bash
# 1. Crea una base de datos gratuita en neon.tech y copia la DATABASE_URL
# 2. Aplica migraciones y carga datos iniciales
DATABASE_URL="<tu-url-neon>" npx prisma migrate deploy
DATABASE_URL="<tu-url-neon>" npx prisma db seed

# 3. Instala Vercel CLI y despliega
npm i -g vercel && vercel --prod
```

---

## Métricas de éxito

Sabes que AgileFlow está funcionando bien para tu equipo cuando:

| Señal | Dónde verla |
|---|---|
| El equipo mueve sus propias tarjetas | Tablero Kanban muestra actividad diaria |
| Las estimaciones se acercan al tiempo real | Seguimiento diario en el ejecutivo muestra ratio < 1.2× |
| La carga está distribuida | Daily Resource Load Index sin celdas rojas consecutivas |
| Los sprints se completan sin sorpresas | Tasa de migración al siguiente sprint < 20% |
| No hay dependencias ocultas | PERT muestra el grafo completo antes de cada sprint |

---

## Roadmap

| Now | Next | Later |
|---|---|---|
| Tablero Kanban con DnD | Sensor de teclado para DnD (accesibilidad) | Notificaciones push |
| Panel de detalle slide-in | Rate limiting en login | Múltiples proyectos |
| Daily Resource Load Index | Columna `authProvider` en modelo de usuarios | Integración GitHub / GitLab |
| Migración desde Jira (CSV / API) | — | API pública REST |
| Backups automáticos configurables | — | Vista mobile responsive |

---

## Stack técnico

| Capa | Tecnología |
|---|---|
| Frontend | Next.js 15 (App Router), React 19, Tailwind CSS |
| Estado del servidor | TanStack Query v5 |
| Drag & Drop | dnd-kit |
| Base de datos | PostgreSQL + Prisma 6 |
| Autenticación | NextAuth v4 (local + LDAP) |
| Validación | Zod |
| Tipado | TypeScript estricto, 0 errores |

---

## Regenerar capturas de pantalla

Con el servidor corriendo y el seed ejecutado:

```bash
node scripts/capture-docs.mjs
```

Genera automáticamente los 6 screenshots y los 3 GIFs en `docs/`.

---

## Licencia

MIT — úsalo, modifícalo, despliégalo en tu infraestructura. Si lo mejoras, un PR es bienvenido.
