# BoviTrans — Documentación Técnica

> Plataforma logística para digitalizar y optimizar el transporte terrestre de ganado
> vacuno en Paraguay. MVP desarrollado con Next.js 15 + PostgreSQL 16.

---

## Índice

1. [Arquitectura de la solución](#1-arquitectura-de-la-solución)
2. [Modelo de datos](#2-modelo-de-datos)
3. [API REST](#3-api-rest)
4. [Correr el proyecto con Docker](#4-correr-el-proyecto-con-docker)
5. [Limitaciones y decisiones fuera de alcance](#5-limitaciones-y-decisiones-fuera-de-alcance)

---

## 1. Arquitectura de la solución

### 1.1 Stack tecnológico

| Capa | Tecnología | Versión |
|---|---|---|
| Framework web | Next.js App Router | ^15.3.3 |
| Lenguaje | TypeScript (strict) | ^5.8.3 |
| Base de datos | PostgreSQL | 16 (Alpine) |
| Cliente DB | node-postgres (`pg`) | ^8.13.3 |
| Validación | Zod | ^3.24.3 |
| Autenticación | bcryptjs + jose (JWT HS256) | ^2.4.3 / ^5.9.6 |
| Mapas | Leaflet + OpenStreetMap | ^1.9.4 |
| Estilos | Tailwind CSS | ^3.4.17 |
| Tests | Jest + ts-jest | ^29.7.0 |
| Contenedores | Docker Compose + Dockerfile multi-stage | — |

### 1.2 Estructura de carpetas

```
bovitrans/
├── db/
│   └── init.sql                  ← DDL + seed; se ejecuta al crear el volumen
├── src/
│   ├── middleware.ts              ← Edge Runtime: valida JWT en todas las rutas
│   ├── lib/
│   │   ├── db.ts                 ← Pool singleton de node-postgres
│   │   ├── auth.ts               ← signSession / verifySession / getSession
│   │   ├── api-guard.ts          ← requireAuth() / requireAdmin()
│   │   ├── pricing.ts            ← Función pura de cálculo de costo
│   │   └── pricing.test.ts       ← 16 tests unitarios
│   └── app/
│       ├── layout.tsx            ← Layout raíz (HTML + Tailwind)
│       ├── page.tsx              ← Dashboard (Server Component)
│       ├── login/page.tsx        ← Pantalla de login (Client Component)
│       ├── trucks/               ← Módulo de flota
│       ├── requests/             ← Módulo de solicitudes + mapa
│       ├── settings/             ← Configuración de precio
│       ├── users/                ← Gestión de usuarios (admin)
│       ├── components/           ← NavBar, LogoutButton
│       └── api/                  ← Route Handlers (un archivo por endpoint)
│           ├── auth/login|logout/
│           ├── health/
│           ├── users/[id]/status/
│           ├── trucks/[id]/status/
│           ├── requests/[id]/assign|distance|status/
│           └── settings/fuel-price/
├── Dockerfile                    ← Build multi-stage (deps → builder → runner)
├── docker-compose.yml            ← Orquesta app + db
└── .env.example                  ← Plantilla de variables de entorno
```

### 1.3 Separación frontend / API / base de datos

**Frontend (Server Components y Client Components)**

Next.js App Router distingue dos tipos de componentes:

- **Server Components** (default): se renderizan en el servidor, tienen acceso directo a `getSession()` mediante `next/headers`. Se usan para las páginas (`page.tsx`), que verifican la sesión y cargan el layout antes de enviar HTML al cliente. Ejemplo: `src/app/trucks/page.tsx` verifica la sesión y monta `TrucksClient`.
- **Client Components** (`'use client'`): se hidratan en el navegador. Gestionan estado local, llaman a la API con `fetch`, y renderizan formularios interactivos. Ejemplo: `TrucksClient.tsx`, `RequestsClient.tsx`, `RequestMapModal.tsx`.

Leaflet requiere `window`/`document` y por eso se importa dinámicamente dentro de un `useEffect` en `RequestMapModal.tsx`. El CSS de Leaflet se inyecta como `<link>` en el `<head>` la primera vez que se monta el modal.

**API (Route Handlers)**

Todos los endpoints viven en `src/app/api/` con el sufijo `route.ts`. Siguen el patrón:

```
1. requireAuth() / requireAdmin()   ← guarda la sesión, devuelve 401/403 si falla
2. Validación Zod del body          ← 400 si el payload no cumple el schema
3. Lógica de negocio + pool.query   ← 404/409/422 según la regla violada
4. NextResponse.json(resultado)     ← 200/201/204 en éxito
```

**Base de datos**

El módulo `src/lib/db.ts` expone un singleton de `Pool` (node-postgres). En desarrollo, el pool se guarda en `globalThis._pgPool` para sobrevivir el hot-reload sin agotar conexiones. En producción, se instancia una sola vez.

Las consultas usan SQL parametrizado (`$1, $2…`) en todos los endpoints — sin ORM, sin interpolación de strings.

### 1.4 Flujo de una request HTTP

```
Browser
  │
  ▼
src/middleware.ts  (Edge Runtime)
  │  ├─ Ruta pública (/login, /api/auth/*) → pasa directo
  │  ├─ Sin cookie → 401 JSON  o  redirect /login
  │  └─ JWT inválido/expirado → 401 JSON  o  redirect /login
  │
  ▼
Route Handler  (Node.js Runtime)
  │
  ├─ requireAuth() / requireAdmin()
  │    └─ Lee cookies() vía next/headers, verifica JWT con jose
  │
  ├─ Zod.safeParse(body)
  │    └─ Falla → 400 { error: { code, message, fields } }
  │
  ├─ pool.query(SQL, [$1…])
  │    ├─ Regla de negocio violada → 409 / 422
  │    └─ Error inesperado → 500, log en stderr
  │
  └─ NextResponse.json(resultado, { status: 200|201|204 })
```

**Nota sobre el Edge Runtime en middleware**: `src/middleware.ts` corre en el Edge Runtime de Next.js, que no soporta módulos Node.js nativos (`pg`, `next/headers`). Por eso el middleware importa solo `COOKIE_NAME` desde `auth.ts` e inlinea la verificación JWT con `jose` directamente, sin usar `getSession()`.

### 1.5 Autenticación y sesión

- Contraseñas almacenadas con **bcryptjs** (cost 10). Nunca en texto plano.
- Login devuelve una **cookie `bovitrans_session`** con las propiedades `httpOnly`, `sameSite: lax`, `secure` en producción. TTL: 8 horas.
- El JWT contiene `{ sub: userId, username, role }` firmado con HS256 usando `AUTH_SECRET`.
- Protección contra enumeración de usuarios: el endpoint de login **siempre** ejecuta `bcrypt.compare` — incluso cuando el usuario no existe — usando un hash de relleno (`DUMMY_HASH`), igualando el tiempo de respuesta.
- El middleware protege todas las rutas excepto `/login`, `/api/auth/login` y `/api/auth/logout`.

---

## 2. Modelo de datos

### 2.1 Diagrama de tablas

```
users
  id · username · password_hash · role · is_active · created_at · updated_at

trucks
  id · plate · capacity · consumption_l_per_km · status · created_by→users · created_at

transport_requests
  id · requester_name · head_count · origin_{label,lat,lng} · dest_{label,lat,lng}
  distance_km · status · created_by→users · created_at · updated_at

assignments
  id · request_id→transport_requests · truck_id→trucks
  distance_km · consumption_snapshot · fuel_price_snapshot
  trips_required · total_fuel_cost · is_active
  assigned_by→users · created_at

settings
  key (PK) · value · updated_at
```

### 2.2 Por qué cada tabla

**`users`**  
Autenticación y atribución. Todo camión, solicitud y asignación lleva `created_by` o `assigned_by` apuntando a esta tabla. El rol (`admin` / `operador`) controla el acceso a los endpoints de gestión de usuarios.

**`trucks`**  
Catálogo de flota. `plate` tiene `UNIQUE`; `capacity` y `consumption_l_per_km` tienen `CHECK > 0`. Estos dos atributos son inmutables por diseño (decisión de dominio: si cambian, se da de baja el camión y se crea uno nuevo). El `status` (`active`/`inactive`) implementa el soft-delete: el historial se conserva porque las FK de `assignments` son `ON DELETE RESTRICT`.

**`transport_requests`**  
Ciclo de vida de un pedido de transporte. `distance_km` es nullable y se completa en un paso posterior (el ruteo en el mapa). El `status` avanza por una máquina de estados explícita:

```
pending ──────────────────────► cancelled   (terminal)
   │                                ▲
   │ (POST /assign)                 │
   ▼                                │
assigned ──► completed (terminal)   │
   └──────────────────────────────► ┘
```

La transición `pending → assigned` solo ocurre desde `POST /api/requests/:id/assign`, nunca desde el endpoint de status.

**`assignments`**  
Registra el vínculo camión↔solicitud con todos los parámetros del cálculo congelados al momento de asignar. `is_active = TRUE` mientras el viaje está en curso; pasa a `FALSE` cuando la solicitud se completa o cancela (en la misma transacción del PATCH de status).

**`settings`**  
Parámetros globales clave/valor. Actualmente solo contiene `fuel_price_per_liter`. El diseño clave/valor permite agregar parámetros futuros sin migración de esquema.

### 2.3 Snapshots en `assignments`

Cuando se asigna un camión, el endpoint `POST /api/requests/:id/assign` lee y guarda en la fila de `assignments`:

| Columna | Fuente | Propósito |
|---|---|---|
| `distance_km` | `transport_requests.distance_km` | Distancia al momento de asignar |
| `consumption_snapshot` | `trucks.consumption_l_per_km` | Consumo del camión al asignar |
| `fuel_price_snapshot` | `settings.fuel_price_per_liter` | Precio vigente al asignar |
| `trips_required` | `calculatePricing()` | `ceil(head_count / capacity)` |
| `total_fuel_cost` | `calculatePricing()` | `distancia × consumo × precio × viajes` |

**Consecuencia**: modificar el precio del combustible en `/settings` no altera ningún costo histórico. El cálculo usa la función pura `calculatePricing` de `src/lib/pricing.ts` tanto en el servidor (fuente de verdad) como en el cliente (proyección previa a confirmar). El resultado server-side es el único que se persiste.

### 2.4 No doble-booking con índices parciales

La regla "un camión solo puede tener un viaje activo a la vez" se impone en **dos capas**:

**Capa 1 — Aplicación** (`assign/route.ts`):
```sql
SELECT id FROM assignments WHERE truck_id = $1 AND is_active = TRUE
-- Si devuelve filas → 409 TRUCK_OCCUPIED antes de intentar el INSERT
```

**Capa 2 — Base de datos** (`db/init.sql`):
```sql
CREATE UNIQUE INDEX uq_active_assignment_per_truck
    ON assignments(truck_id) WHERE is_active;

CREATE UNIQUE INDEX uq_active_assignment_per_request
    ON assignments(request_id) WHERE is_active;
```

Los índices parciales (`WHERE is_active`) son críticos: solo aplican la restricción de unicidad a las filas donde `is_active = TRUE`. Las asignaciones históricas (`is_active = FALSE`) pueden repetir `truck_id` libremente, preservando el historial completo de viajes de cada camión.

Si dos requests concurrentes pasaran simultáneamente el chequeo de aplicación (race condition), el `INSERT` de la segunda fallaría con el código PostgreSQL `23505` (unique violation), que el `catch` del endpoint convierte en 409.

### 2.5 Integridad referencial

Todas las FK usan `ON DELETE RESTRICT`:

- `trucks.created_by → users(id)` — no se puede eliminar un usuario con camiones
- `transport_requests.created_by → users(id)` — no se puede eliminar un usuario con solicitudes
- `assignments.request_id → transport_requests(id)` — no se puede eliminar una solicitud con asignaciones
- `assignments.truck_id → trucks(id)` — no se puede eliminar un camión con asignaciones
- `assignments.assigned_by → users(id)` — no se puede eliminar un usuario con asignaciones

Cuando una eliminación falla por FK, PostgreSQL devuelve el código `23503`; los endpoints lo capturan y devuelven 409 con un mensaje que sugiere desactivar en lugar de eliminar.

### 2.6 Triggers de `updated_at`

Las tablas `users`, `trucks`, `transport_requests` y `settings` tienen un trigger `BEFORE UPDATE` que llama a la función `set_updated_at()`. La tabla `assignments` no tiene `updated_at` porque es inmutable una vez creada (solo `is_active` cambia, y ese cambio se refleja por la relación con la solicitud).

---

## 3. API REST

### 3.1 Formato de respuesta

**Éxito:**
```json
{ "user": { ... } }           // recurso singular
{ "users": [ ... ] }          // colección
```

**Error:**
```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Mensaje legible",
    "fields": { "campo": ["mensaje por campo"] }   // solo en errores de validación
  }
}
```

Los stack traces nunca se incluyen en las respuestas de error.

### 3.2 Autenticación

Todos los endpoints excepto los marcados como `público` requieren la cookie `bovitrans_session` con un JWT válido. Los endpoints marcados `[admin]` requieren adicionalmente `role = 'admin'`.

### 3.3 Endpoints

#### Autenticación

| Método | Ruta | Auth | Body | Respuestas |
|---|---|---|---|---|
| `POST` | `/api/auth/login` | público | `{ username, password }` | `200` usuario+cookie · `400` validación · `401` credenciales inválidas · `500` |
| `POST` | `/api/auth/logout` | público | — | `200` limpia cookie |

#### Diagnóstico

| Método | Ruta | Auth | Respuestas |
|---|---|---|---|
| `GET` | `/api/health` | público | `200` `{ status: "ok", db_time }` · `500` DB no disponible |

#### Usuarios

| Método | Ruta | Auth | Body / Query | Respuestas |
|---|---|---|---|---|
| `GET` | `/api/users` | [admin] | — | `200` lista · `401` · `403` · `500` |
| `POST` | `/api/users` | [admin] | `{ username, password, role }` | `201` · `400` · `401` · `403` · `409` username duplicado · `500` |
| `PATCH` | `/api/users/:id` | [admin] | `{ role?, password? }` (al menos uno) | `200` · `400` · `401` · `403` · `404` · `422 LAST_ADMIN` · `500` |
| `PATCH` | `/api/users/:id/status` | [admin] | `{ is_active: boolean }` | `200` · `400` · `401` · `403` · `404` · `422 LAST_ADMIN` · `500` |
| `DELETE` | `/api/users/:id` | [admin] | — | `204` · `401` · `403` · `404` · `409` FK activa · `422 LAST_ADMIN` · `500` |

**Regla LAST_ADMIN**: `PATCH role`, `PATCH status { is_active: false }` y `DELETE` retornan `422` con `code: "LAST_ADMIN"` si el usuario objetivo es el único admin activo del sistema.

#### Flota

| Método | Ruta | Auth | Body / Query | Respuestas |
|---|---|---|---|---|
| `GET` | `/api/trucks` | auth | `?status=active\|inactive` | `200` lista con campo `is_available` · `401` · `500` |
| `POST` | `/api/trucks` | auth | `{ plate, capacity, consumption_l_per_km }` | `201` · `400` · `401` · `409` patente duplicada · `500` |
| `PATCH` | `/api/trucks/:id/status` | auth | `{ status: "active"\|"inactive" }` | `200` · `400` · `401` · `404` · `500` |
| `DELETE` | `/api/trucks/:id` | auth | — | `204` · `401` · `404` · `409` tiene asignaciones · `500` |

El campo `is_available` en el listado se calcula con un `LEFT JOIN` sobre `assignments WHERE is_active = TRUE`. Un camión es disponible si no tiene asignación activa.

La patente se normaliza automáticamente a mayúsculas con `.trim().toUpperCase()` antes de persistir.

#### Solicitudes de transporte

| Método | Ruta | Auth | Body / Query | Respuestas |
|---|---|---|---|---|
| `GET` | `/api/requests` | auth | `?status=pending\|assigned\|completed\|cancelled` | `200` lista con `created_by_username` · `401` · `500` |
| `POST` | `/api/requests` | auth | `{ requester_name, head_count, origin_label, origin_lat, origin_lng, dest_label, dest_lat, dest_lng }` | `201` · `400` · `401` · `500` |
| `PATCH` | `/api/requests/:id` | auth | campos editables (solo si `pending`) | `200` · `400` · `401` · `404` · `422 INVALID_STATE` · `500` |
| `PATCH` | `/api/requests/:id/distance` | auth | `{ distance_km: number > 0 }` | `200` · `400` · `401` · `404` · `422 INVALID_STATE` (completed/cancelled) · `500` |
| `PATCH` | `/api/requests/:id/status` | auth | `{ status }` | `200` · `400` · `401` · `404` · `422 INVALID_TRANSITION` · `500` |
| `POST` | `/api/requests/:id/assign` | auth | `{ truck_id, force_multiple_trips?: boolean }` | `201` assignment+request · `400` · `401` · `404` · `409 TRUCK_OCCUPIED` · `422` (varios) · `500` |

**Transiciones de estado válidas desde `PATCH /status`**:
- `pending → cancelled`
- `assigned → completed`
- `assigned → cancelled`

`pending → assigned` solo ocurre mediante `POST /assign`.

**Códigos 422 de `POST /assign`**:

| `code` | Condición |
|---|---|
| `INVALID_STATE` | La solicitud no está en estado `pending` |
| `MISSING_DISTANCE` | `distance_km` es NULL en la solicitud |
| `TRUCK_INACTIVE` | El camión seleccionado no está activo |
| `CAPACITY_EXCEEDED` | `head_count > truck.capacity` y `force_multiple_trips` es `false`. Incluye `data.trips_required`, `data.total_fuel_cost`, etc. |

Cuando devuelve `409 TRUCK_OCCUPIED`, el mismo código se usa para el rechazo de la capa de aplicación (SELECT previo) y para el catch del error `23505` de PostgreSQL (rechazo del índice único parcial en INSERT concurrente).

**Atomicidad de `POST /assign`**: la operación usa una transacción explícita (`BEGIN / COMMIT / ROLLBACK`) con `SELECT … FOR UPDATE` sobre la fila de la solicitud y del camión para prevenir race conditions bajo carga concurrente.

#### Configuración

| Método | Ruta | Auth | Body | Respuestas |
|---|---|---|---|---|
| `GET` | `/api/settings/fuel-price` | auth | — | `200` `{ key, value: number, updated_at }` · `401` · `404` · `500` |
| `PUT` | `/api/settings/fuel-price` | auth | `{ value: number > 0 }` | `200` valor actualizado · `400` · `401` · `500` |

`PUT` usa `INSERT … ON CONFLICT DO UPDATE` (upsert), por lo que funciona aunque la fila no exista.

---

## 4. Correr el proyecto con Docker

### 4.1 Prerrequisitos

- Docker Engine ≥ 24 y Docker Compose V2 (`docker compose`)
- Puerto 3000 libre (app) y puerto 5432 libre (base), o configurar alternativas en `.env`

### 4.2 Primera vez

```bash
# 1. Clonar el repositorio
git clone <url-del-repo>
cd bovitrans

# 2. Crear el archivo de variables de entorno a partir de la plantilla
cp .env.example .env
# Editar .env si es necesario (ver sección 4.4)

# 3. Construir las imágenes e iniciar los contenedores
docker compose up --build
```

La primera vez que se levanta el volumen `pgdata`, PostgreSQL ejecuta automáticamente `db/init.sql`, que crea todas las tablas y los datos semilla. Este script **solo corre una vez** (al crear el volumen).

Cuando los logs muestren `bovitrans-app | ▲ Next.js ... ready`, la app está disponible en `http://localhost:3000`.

### 4.3 Credenciales semilla

| Usuario | Contraseña | Rol |
|---|---|---|
| `admin` | `admin123` | Administrador |
| `operador1` | `operador123` | Operador |
| `operador2` | `operador123` | Operador |

### 4.4 Variables de entorno

| Variable | Default | Descripción |
|---|---|---|
| `POSTGRES_USER` | `bovitrans` | Usuario de PostgreSQL |
| `POSTGRES_PASSWORD` | `bovitrans` | Contraseña de PostgreSQL |
| `POSTGRES_DB` | `bovitrans` | Nombre de la base |
| `DB_PORT` | `5432` | Puerto del host expuesto por el contenedor de la base |
| `APP_PORT` | `3000` | Puerto del host donde escucha la app |
| `AUTH_SECRET` | `change-me-in-production` | Secreto para firmar JWTs — **cambiar en producción** |
| `DATABASE_URL` | (ver `.env.example`) | Cadena de conexión interna (host `db` = nombre del servicio Docker) |

Si el puerto 5432 del host ya está ocupado (p.ej. por una instancia local de PostgreSQL), configurar `DB_PORT=5433` en `.env`. La `DATABASE_URL` no necesita cambiarse porque la comunicación app→db usa la red interna de Docker (el host `db` siempre usa el puerto 5432 internamente).

### 4.5 Comandos frecuentes

```bash
# Levantar (sin rebuild si no cambió el código)
docker compose up

# Levantar con rebuild de la imagen de la app
docker compose up --build

# Solo la base de datos (para probar el schema de forma aislada)
docker compose up db

# Detener y eliminar contenedores (los datos persisten en el volumen)
docker compose down

# Resetear la base desde cero (elimina el volumen; el seed se re-ejecuta al volver a levantar)
docker compose down -v

# Ver logs en tiempo real
docker compose logs -f app
docker compose logs -f db

# Conectarse directamente a PostgreSQL
docker exec -it bovitrans-db psql -U bovitrans -d bovitrans

# Correr tests unitarios (fuera de Docker, requiere Node.js local)
npm test
```

### 4.6 Desarrollo local de la app (sin Docker)

```bash
# Requiere una instancia de PostgreSQL accesible y Node.js 20+
npm install

# Configurar DATABASE_URL y AUTH_SECRET en .env apuntando a la DB local
npm run dev   # → http://localhost:3000 con hot-reload
```

### 4.7 Inspeccionar la base después de levantar

```sql
-- Verificar tablas
\dt

-- Ver solicitudes con su estado
SELECT id, requester_name, head_count, status FROM transport_requests;

-- Ver asignaciones activas (camiones ocupados)
SELECT a.id, t.plate, r.requester_name, a.total_fuel_cost, a.is_active
FROM assignments a
JOIN trucks t ON t.id = a.truck_id
JOIN transport_requests r ON r.id = a.request_id;
```

---

## 5. Limitaciones y decisiones fuera de alcance

### Decisiones del MVP que simplifican intencionalmente

**Sin ORM.** El proyecto usa SQL parametrizado directo con node-postgres. La razón explícita es transparencia en las consultas y control total sobre el esquema. El DDL vive íntegro en `db/init.sql`.

**Precio de combustible como único valor global.** No existe historial de precios ni vigencia por fecha. Si el precio cambia, las asignaciones nuevas usan el nuevo valor; las anteriores están protegidas por el snapshot. No se contempló en el MVP un precio por tipo de combustible ni por región.

**Política de múltiples viajes.** Cuando `head_count > truck.capacity`, el costo total se calcula como `costo_por_viaje × ceil(head_count / capacity)`. Esta fórmula asume que cada viaje recorre la distancia completa (ida) y que el costo es estrictamente proporcional al número de viajes. No modela el regreso del camión al origen.

**Distancia obtenida del cliente.** La distancia que se persiste en `transport_requests.distance_km` proviene del servicio público de OSRM (`router.project-osrm.org`) llamado desde el navegador. No hay validación server-side de que la distancia sea geográficamente razonable para las coordenadas dadas.

**Sin paginación.** Los endpoints `GET /api/trucks`, `GET /api/requests` y `GET /api/users` retornan todos los registros sin paginación ni cursor. Con volúmenes altos de datos esto degradaría el rendimiento.

**Sin refresh tokens.** La sesión expira a las 8 horas. Al expirar, el usuario es redirigido al login sin posibilidad de renovar el token silenciosamente.

**Sin HTTPS en desarrollo.** El `docker compose` expone los puertos en HTTP. La cookie `secure: true` solo se activa con `NODE_ENV=production`; en desarrollo la cookie viaja sin cifrado.

**`AUTH_SECRET` por defecto inseguro.** El valor por defecto `change-me-in-production` está en el código fuente. Cualquier despliegue fuera del entorno local debe configurar un secreto aleatorio fuerte (mínimo 32 bytes). Ejemplo: `openssl rand -base64 32`.

### Limitaciones técnicas conocidas

**OSRM público con límites de uso.** El servicio `router.project-osrm.org` es una instancia de demostración con rate limiting no documentado. En producción debería reemplazarse por una instancia propia de OSRM, por GraphHopper, o por la Directions API de un proveedor comercial.

**Tests solo para `pricing.ts`.** Los 16 tests unitarios cubren la lógica de cálculo. No existen tests de integración para los Route Handlers ni tests de componentes de UI. La validación de los endpoints se hizo manualmente con `curl` durante el desarrollo.

**Sin auditoría de cambios.** No existe un log de quién modificó qué y cuándo más allá de los campos `created_at`/`updated_at`. No hay tabla de auditoría ni event sourcing.

**Sin recuperación de contraseña.** No existe flujo de "olvidé mi contraseña". Un admin puede resetear la contraseña de otro usuario desde la gestión de usuarios, pero no hay mecanismo de autorrestablecimiento.

**Sin carga de archivos.** El sistema no soporta adjuntar documentos ni imágenes a solicitudes o camiones.

**Coordenadas ingresadas manualmente.** El formulario de creación de solicitudes requiere que el operador escriba latitud y longitud. No hay geocoder integrado ni selector visual en el mapa de creación (el mapa solo está disponible para ver la ruta de una solicitud ya creada).

**Imágenes de marcadores Leaflet desde CDN.** Los íconos de los marcadores del mapa apuntan a `unpkg.com/leaflet@1.9.4/dist/images/`. Si el CDN no responde, los marcadores se renderizarán sin ícono pero el mapa seguirá funcional.

**Pool de conexiones sin TLS.** La `DATABASE_URL` no incluye `?sslmode=require`. Para un despliegue en nube (RDS, Cloud SQL, etc.) debería agregarse `?sslmode=require` o equivalente.
