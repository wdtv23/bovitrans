# CLAUDE.md — Guía operativa para Claude Code

> Este archivo lo lee Claude Code al iniciar cada sesión. Contiene el **cómo** se
> construye BoviTrans. El **qué** y el **por qué** (dominio, reglas de negocio,
> glosario, formatos) están en los archivos referidos abajo.

## Antes de empezar — leé siempre estos archivos
1. `.claude/custom_instructions.md` — rol (analista + arquitecto), contexto de
   negocio, **reglas de negocio no negociables**, glosario y RNF.
2. `BACKLOG.md` — épicas, historias de usuario, criterios de aceptación (Gherkin)
   y tareas técnicas. **Es la fuente de verdad de qué implementar y en qué orden.**
3. `db/init.sql` — esquema real de la base. No reinventar el modelo; el código se
   adapta a este esquema.

No empieces a codificar sin haber leído los tres. Si algo del backlog es ambiguo,
proponé un supuesto explícito antes de implementar.

---

## Decisiones técnicas fijadas (no improvisar otras librerías)

- **Framework:** Next.js (App Router) + **TypeScript**. API en Route Handlers
  (`app/api/.../route.ts`). `next.config.js` debe tener `output: 'standalone'`
  (lo requiere el Dockerfile ya existente).
- **Base de datos:** PostgreSQL. Acceso con **`pg`** (node-postgres) y consultas
  parametrizadas (`$1, $2…`). **Sin ORM** — el proyecto valora SQL explícito y el
  esquema ya está escrito a mano en `db/init.sql`.
- **Validación:** **`zod`** en el borde de cada endpoint. El backend nunca confía
  en el cliente (validación en doble capa: cliente para UX, servidor como verdad).
- **Auth:** contraseñas con **`bcryptjs`** (JS puro, evita compilación nativa en
  Alpine). Sesión vía **JWT firmado en cookie httpOnly** (`jose`). Middleware que
  protege rutas/endpoints y exige rol `admin` en el CRUD de usuarios.
- **Mapas:** **Leaflet** + OpenStreetMap; ruteo con OSRM público o Leaflet Routing
  Machine; fallback de distancia manual. El ruteo corre en el navegador (cliente),
  no en el contenedor.
- **Cálculo de negocio:** función **pura** en `src/lib/pricing.ts`
  (costo de combustible + `trips_required = ceil(N/C)`), con **tests unitarios**,
  reutilizada por el backend y por la proyección del frontend.

Si una decisión no está acá, preferí la opción más simple que cumpla el MVP y
dejala documentada; no agregues dependencias “por las dudas”.

---

## Orden de trabajo (por épica, una US a la vez)

Seguí la priorización del backlog. Implementá **una US completa** (API + UI +
validación + criterios de aceptación), pará para revisión, y recién después seguí.

0. **Scaffolding** — proyecto Next.js, estructura de carpetas, cliente `pg`,
   conexión vía `DATABASE_URL`. Verificar que `docker compose up --build` levante
   app + base juntas.
1. **`src/lib/pricing.ts` + tests** — la lógica núcleo primero, con tests verdes.
2. **EP-07 Auth** — primero login + middleware de sesión; luego CRUD de usuarios
   con control por rol; luego atribución (`created_by`/`assigned_by`).
3. **EP-01 Flota** y **EP-02 Solicitudes** — CRUDs, ya con atribución.
4. **EP-05 Precio de combustible** — parámetro configurable.
5. **EP-03 Mapa** — Leaflet, ruta, distancia, proyección dinámica de costo.
6. **EP-04 Asignación** — asignar camión, calcular costo (usa `pricing.ts`),
   alerta de capacidad y regla de no doble-booking.

---

## Convenciones

- **API REST:** recursos en plural; códigos HTTP correctos
  (`200/201`, `400` validación, `401` no autenticado, `403` sin permiso,
  `404` no encontrado, `409` conflicto, `422` regla de negocio, `500` interno);
  errores con forma `{ error: { code, message, fields? } }`; nunca filtrar stack
  traces al cliente.
- **UI/UX:** prolija, moderna, responsiva; toda vista de datos contempla estados
  de carga, vacío y error; tarjetas KPI arriba del panel. Localización `es-PY`,
  moneda en Guaraníes (`Gs. 1.234.567`, sin decimales).
- **Commits:** Conventional Commits, uno por unidad lógica
  (`feat(auth): …`, `feat(trucks): …`, `test(pricing): …`). No acumular un commit
  gigante. El humano revisa y commitea.
- **Git:** todo el desarrollo en la rama `feature/bovitrans-mvp`.

---

## Comandos

```bash
# Levantar todo (app + base)
docker compose up --build

# Solo la base (para probar el esquema/seed de forma aislada)
docker compose up db

# Resetear la base desde cero (init.sql solo corre al crear el volumen)
docker compose down -v

# Inspeccionar la base
docker exec -it bovitrans-db psql -U bovitrans -d bovitrans

# Desarrollo local de la app (fuera de Docker), si aplica
npm run dev
npm test
```

## Credenciales semilla
`admin` / `admin123` (admin) · `operador1` y `operador2` / `operador123` (operador).
Ver `db/init.sql` para flota y solicitudes de ejemplo.
