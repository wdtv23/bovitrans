# BoviTrans

Plataforma logística para digitalizar y optimizar el **transporte terrestre de ganado vacuno** en Paraguay. Unifica a operadores logísticos con clientes que necesitan mover animales entre dos puntos, calculando rutas, distancias y costos de combustible, y validando la capacidad de los camiones.

> MVP — Prueba técnica senior (desarrollo asistido por IA).

---

## Stack

- **Next.js** (App Router) — frontend + API REST
- **PostgreSQL 16** — base de datos relacional
- **Docker / Docker Compose** — orquestación de app + base
- **Leaflet + OpenStreetMap** — mapas y trazado de rutas

---

## Requisitos previos

- [Docker](https://docs.docker.com/get-docker/) y Docker Compose v2

---

## Arranque rápido (Docker)

```bash
# 1. Clonar el repositorio
git clone <URL_DEL_REPO>
cd bovitrans

# 2. Crear el archivo de entorno a partir de la plantilla
cp .env.example .env

# 3. (Recomendado) Generar un secreto propio y reemplazar AUTH_SECRET en .env
openssl rand -base64 32

# 4. Levantar toda la plataforma
docker compose up --build
```

La aplicación queda disponible en **http://localhost:3000**
La base de datos escucha en **localhost:5432** (solo para inspección).

---

## Credenciales semilla

El sistema se inicializa con usuarios de ejemplo (contraseñas hasheadas con bcrypt):

| Usuario     | Contraseña    | Rol      |
|-------------|---------------|----------|
| `admin`     | `admin123`    | admin    |
| `operador1` | `operador123` | operador |
| `operador2` | `operador123` | operador |

> Cambiá la contraseña del admin después del primer ingreso.

El seed incluye además 5 camiones, 5 solicitudes (en distintos estados) y asignaciones de ejemplo entre ciudades reales de Paraguay (Asunción, Ciudad del Este, Encarnación, Concepción, Coronel Oviedo).

---

## Comandos útiles

```bash
# Detener los contenedores
docker compose down

# Detener y BORRAR la base (reinicia el seed desde cero).
# Necesario cada vez que cambies db/init.sql, porque init.sql solo
# corre en la PRIMERA creación del volumen.
docker compose down -v

# Ver logs de un servicio
docker compose logs -f app
docker compose logs -f db
```

---

## Variables de entorno

Ver `.env.example`. Las principales:

| Variable            | Descripción                                  |
|---------------------|----------------------------------------------|
| `POSTGRES_USER`     | Usuario de la base                           |
| `POSTGRES_PASSWORD` | Contraseña de la base                        |
| `POSTGRES_DB`       | Nombre de la base                            |
| `DATABASE_URL`      | Cadena de conexión que usa la app            |
| `AUTH_SECRET`       | Secreto para firmar sesiones/JWT             |
| `APP_PORT`          | Puerto de la app (default 3000)              |
| `DB_PORT`           | Puerto expuesto de la base (default 5432)    |

---

## Estructura del proyecto

```
.
├── BACKLOG.md              # Fase 1: épicas, US, criterios y tareas
├── DOCUMENTACION.md        # Fase 4: arquitectura y decisiones de diseño
├── docker-compose.yml      # Orquestación app + db
├── Dockerfile              # Imagen multi-stage de Next.js
├── .env.example            # Plantilla de variables de entorno
├── .claude/
│   └── custom_instructions.md   # Configuración de IA (analista/arquitecto)
├── db/
│   └── init.sql            # DDL + datos semilla
└── src/                    # Aplicación Next.js (App Router)
```

---

## Modelo de datos (resumen)

`users` (autenticación y atribución) · `trucks` (flota) · `transport_requests` (solicitudes, con ciclo de vida) · `assignments` (cálculo de costo con *snapshot* histórico) · `settings` (precio de combustible parametrizable).

La integridad clave (no doble-booking de camiones) se garantiza a nivel de base con índices parciales únicos. Ver `db/init.sql` y `DOCUMENTACION.md` para el detalle.
