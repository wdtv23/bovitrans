# BACKLOG — MVP BoviTrans

> Plataforma logística para digitalizar y optimizar el transporte terrestre de ganado vacuno.
> Documento de Ingeniería de Requerimientos (Fase 1). Rol asumido: **Product Owner + Arquitecto de Software**.

---

## 0. Glosario y supuestos del dominio

| Término | Definición |
|---|---|
| **Solicitud de transporte** | Pedido de un cliente para mover N cabezas de ganado de un origen a un destino. |
| **Cabeza de ganado** | Unidad de carga (una vaca). Determina la ocupación del camión. |
| **Camión / Vehículo** | Activo de flota con patente, capacidad máxima de carga y coeficiente de consumo. |
| **Coeficiente de consumo** | Litros de combustible por kilómetro recorrido (`L/Km`). Atributo inalterable del camión. |
| **Asignación** | Vínculo entre una solicitud y un camión, que dispara el cálculo de costo y la validación de capacidad. |
| **Precio de combustible** | Parámetro global del sistema (Gs./litro), configurable. |
| **Usuario** | Persona que opera el sistema. Posee credenciales (usuario + contraseña) y un rol. Toda carga de flota/solicitud queda atribuida a un usuario. |
| **Rol** | Nivel de permisos del usuario: `admin` (gestiona usuarios) u `operador` (opera flota y solicitudes). |
| **Estado de solicitud** | Etapa del ciclo de vida: `pending` → `assigned` → `completed`, o `cancelled`. Gobierna transiciones válidas. |

**Fórmula núcleo:**
```
Costo Combustible = Distancia (Km) × Consumo del Vehículo (L/Km) × Precio Combustible (Gs./L)
```

**Supuestos (decisiones de PO):**
- S1. El MVP es **multiusuario con autenticación**. Existen dos roles: **admin** (gestiona usuarios) y **operador** (opera flota y solicitudes). Toda carga de flota o solicitud queda **atribuida** al usuario autenticado (`created_by`). El "cliente" sigue siendo un dato del solicitante dentro de la solicitud, no un usuario con login.
- S1b. El sistema se inicializa con un usuario **admin por defecto** (`admin` / `admin123`) creado en el seed, para permitir el primer acceso. La contraseña se almacena **siempre hasheada** (bcrypt/argon2), nunca en texto plano, y el sistema sugiere cambiarla en el primer ingreso.
- S2. La distancia se obtiene del servicio de ruteo del mapa (OpenStreetMap/OSRM/Leaflet Routing). Si el servicio falla, se permite ingreso/edición manual de km como *fallback*.
- S3. El precio de combustible es un único valor global parametrizable (no varía por tipo de combustible en el MVP).
- S4. La capacidad y el consumo son atributos **inmutables** una vez creado el camión (se desactiva el camión y se crea otro si cambian).
- S5. La moneda es Guaraní (Gs.). Configurable a futuro, fija en el MVP.

---

## 1. Mapa de Épicas

| ID | Épica | Objetivo de negocio |
|---|---|---|
| **EP-01** | Gestión de Flota | Que el operador mantenga el catálogo de camiones disponibles con sus características críticas. |
| **EP-02** | Gestión de Solicitudes de Transporte | Que las solicitudes entrantes se registren con todos los datos necesarios para operarlas. |
| **EP-03** | Panel Principal y Visualización de Rutas | Dar al operador una vista central con mapa, ruta y distancia para decidir. |
| **EP-04** | Motor de Asignación y Cálculo Logístico | Asignar camión a solicitud, calcular costo de combustible y validar capacidad. |
| **EP-05** | Parametrización del Sistema | Configurar variables de negocio (precio de combustible). |
| **EP-06** | Plataforma e Infraestructura (enabler) | Base relacional consistente, API REST y entorno dockerizado reproducible. |
| **EP-07** | Gestión de Usuarios y Autenticación | Controlar el acceso y atribuir cada carga de flota/solicitud a un usuario identificado. |

---

## EP-01 · Gestión de Flota

### US-01.1 — Registrar un camión
**Como** operador logístico, **quiero** registrar un camión con su patente, capacidad máxima y consumo, **para** tenerlo disponible al momento de asignar viajes.

**Criterios de aceptación**
- **Dado** que estoy en el módulo de flota, **cuando** ingreso patente, capacidad (entero > 0) y consumo (decimal > 0) válidos, **entonces** el camión se persiste y aparece en el listado.
- **Dado** que ingreso una patente que ya existe, **cuando** intento guardar, **entonces** el sistema rechaza la operación con un error claro (409/validación) y no crea duplicados.
- **Dado** que dejo capacidad o consumo en cero o negativo, **cuando** intento guardar, **entonces** la validación impide el guardado y muestra el mensaje correspondiente por campo.
- **Dado** que estoy autenticado, **cuando** registro un camión, **entonces** el registro queda atribuido a mi usuario (`created_by`) y la fecha de carga.

**Tareas técnicas**
- [x] T-01.1.1 — Tabla `trucks` con constraint `UNIQUE(plate)`, `CHECK(capacity > 0)`, `CHECK(consumption_l_per_km > 0)` y FK `created_by → users(id)`.
- [x] T-01.1.2 — `POST /api/trucks` con validación de payload (zod) y manejo de 201/400/409.
- [x] T-01.1.3 — Formulario de alta con validación client-side y feedback inline.
- [x] T-01.1.4 — Tests de API: alta válida, patente duplicada, valores inválidos.

### US-01.2 — Listar y consultar camiones
**Como** operador, **quiero** ver el listado de camiones con su estado, **para** conocer la flota disponible.

**Criterios de aceptación**
- **Dado** que existen camiones, **cuando** abro el módulo, **entonces** veo patente, capacidad, consumo y estado (activo/inactivo).
- **Dado** que no hay camiones, **cuando** abro el módulo, **entonces** veo un *empty state* con CTA para registrar el primero.

**Tareas técnicas**
- [x] T-01.2.1 — `GET /api/trucks` (con filtro `?status=active`).
- [x] T-01.2.2 — Tabla/listado responsivo con estados visuales.

### US-01.3 — Desactivar un camión
**Como** operador, **quiero** desactivar un camión fuera de servicio, **para** que no aparezca como asignable sin perder su historial.

**Criterios de aceptación**
- **Dado** un camión activo, **cuando** lo desactivo, **entonces** deja de aparecer en el selector de asignación pero se conserva en BD (soft-state).
- **Dado** un camión con asignaciones históricas, **cuando** lo desactivo, **entonces** sus asignaciones previas permanecen intactas.

**Tareas técnicas**
- [x] T-01.3.1 — Columna `status` (`active`/`inactive`) en `trucks`.
- [x] T-01.3.2 — `PATCH /api/trucks/:id/status`.
- [x] T-01.3.3 — Excluir inactivos del selector de asignación (EP-04).

---

## EP-02 · Gestión de Solicitudes de Transporte

### US-02.1 — Registrar una solicitud de transporte
**Como** operador, **quiero** registrar una solicitud con el solicitante, la cantidad de cabezas y los puntos de origen y destino, **para** sumarla a la cola de viajes a coordinar.

**Criterios de aceptación**
- **Dado** que completo solicitante, cantidad de cabezas (entero > 0), origen y destino (con coordenadas), **cuando** guardo, **entonces** la solicitud se crea en estado `pending`.
- **Dado** que selecciono origen y destino en el mapa, **cuando** confirmo, **entonces** se almacenan lat/lng de ambos puntos.
- **Dado** que la cantidad de cabezas es 0 o vacía, **cuando** intento guardar, **entonces** la validación lo impide.
- **Dado** que estoy autenticado, **cuando** registro una solicitud, **entonces** queda atribuida a mi usuario (`created_by`) y la fecha de carga.

**Tareas técnicas**
- [x] T-02.1.1 — Tabla `transport_requests` (solicitante, `head_count`, origen lat/lng + label, destino lat/lng + label, `status`, `created_at`, FK `created_by → users(id)`).
- [x] T-02.1.2 — `POST /api/requests` con validación.
- [x] T-02.1.3 — Selector de puntos en mapa (geocoding/búsqueda + click).
- [x] T-02.1.4 — Tests de API.

### US-02.2 — Visualizar solicitudes en el panel
**Como** operador, **quiero** ver todas las solicitudes entrantes como tarjetas/registros, **para** priorizar y operar.

**Criterios de aceptación**
- **Dado** que hay solicitudes, **cuando** abro el panel, **entonces** cada tarjeta muestra solicitante, cantidad de cabezas, origen→destino y estado.
- **Dado** que selecciono una solicitud, **cuando** hago clic, **entonces** se traza su ruta en el mapa.

**Tareas técnicas**
- [x] T-02.2.1 — `GET /api/requests` con filtros por estado.
- [x] T-02.2.2 — Componente *card* de solicitud + estado de selección.

### US-02.3 — Gestionar el ciclo de vida de una solicitud
**Como** operador, **quiero** avanzar o cancelar una solicitud según su estado y editar las solicitudes esten en pending, **para** reflejar el progreso real del viaje y evitar estados inconsistentes.

**Máquina de estados:**
```
pending ──asignar camión──▶ assigned ──confirmar viaje──▶ completed
   │                            │
   └──────cancelar──────────────┴────cancelar (si no completada)──▶ cancelled
```

**Criterios de aceptación**
- **Dado** una solicitud `pending`, **cuando** le asigno un camión, **entonces** pasa a `assigned`.
- **Dado** una solicitud `assigned`, **cuando** marco el viaje como realizado, **entonces** pasa a `completed` y libera el camión.
- **Dado** una solicitud `pending` o `assigned`, **cuando** la cancelo, **entonces** pasa a `cancelled` (y si tenía camión, lo libera).
- **Dado** una solicitud `completed` o `cancelled`, **cuando** intento cambiar su estado, **entonces** el sistema rechaza la transición inválida (`422`).

**Tareas técnicas**
- [x] T-02.3.1 — Enum/CHECK de estado: `pending`, `assigned`, `completed`, `cancelled`.
- [x] T-02.3.2 — Validación de transiciones válidas en el servicio (rechazar saltos ilegales).
- [x] T-02.3.3 — `PATCH /api/requests/:id/status`.
- [x] T-02.3.4 — UI con acciones contextuales según estado actual.
- [x] T-02.3.5 — Tests de transiciones válidas e inválidas.

---

## EP-03 · Panel Principal y Visualización de Rutas

### US-03.1 — Trazar la ruta y calcular distancia
**Como** operador, **quiero** ver la ruta entre origen y destino en el mapa con los kilómetros totales, **para** dimensionar el viaje.

**Criterios de aceptación**
- **Dado** una solicitud con origen y destino, **cuando** la selecciono, **entonces** el mapa traza la ruta y muestra la distancia total en km.
- **Dado** que el servicio de ruteo no responde, **cuando** falla, **entonces** se informa el error y se permite ingresar la distancia manualmente.

**Tareas técnicas**
- [ ] T-03.1.1 — Integrar Leaflet + capa OpenStreetMap.
- [ ] T-03.1.2 — Integrar servicio de ruteo (OSRM público o Leaflet Routing Machine).
- [ ] T-03.1.3 — Persistir `distance_km` en la solicitud al calcularse.
- [ ] T-03.1.4 — *Fallback* de distancia manual.

### US-03.2 — Proyección dinámica de costo según camión candidato
**Como** operador, **quiero** que al pre-seleccionar un camión se proyecte el costo de combustible en tiempo real, **para** comparar opciones antes de confirmar.

**Criterios de aceptación**
- **Dado** una solicitud con distancia conocida, **cuando** elijo un camión candidato en el selector, **entonces** se muestra el costo proyectado sin persistir aún la asignación.
- **Dado** que cambio el camión candidato, **cuando** lo cambio, **entonces** el costo se recalcula al instante.

**Tareas técnicas**
- [ ] T-03.2.1 — Hook/cliente de cálculo en frontend (función pura reutilizable con backend).
- [ ] T-03.2.2 — UI de proyección (costo + km + consumo) en el panel de detalle.

---

## EP-04 · Motor de Asignación y Cálculo Logístico (núcleo del MVP)

### US-04.1 — Asignar un camión y calcular el costo de combustible
**Como** operador, **quiero** asignar un camión a una solicitud y obtener el costo de combustible calculado, **para** confirmar un viaje financieramente viable.

**Criterios de aceptación**
- **Dado** una solicitud con distancia y un camión activo, **cuando** confirmo la asignación, **entonces** el sistema calcula `costo = distancia × consumo × precio` y lo persiste con la asignación.
- **Dado** que la solicitud queda asignada, **cuando** se confirma, **entonces** su estado pasa a `assigned`.
- **Dado** un cálculo realizado, **cuando** se persiste, **entonces** se guardan los valores usados (distancia, consumo, precio vigente) para trazabilidad histórica.

**Tareas técnicas**
- [ ] T-04.1.1 — Tabla `assignments` (`request_id`, `truck_id`, `distance_km`, `consumption_snapshot`, `fuel_price_snapshot`, `total_fuel_cost`, `trips_required`, `assigned_by → users(id)`, `created_at`).
- [ ] T-04.1.2 — Servicio de cálculo **server-side** (fuente de verdad; el front solo proyecta).
- [ ] T-04.1.3 — `POST /api/requests/:id/assign`.
- [ ] T-04.1.4 — Snapshot de parámetros para no alterar costos históricos al cambiar el precio.
- [ ] T-04.1.5 — Tests unitarios de la fórmula (incluye decimales y redondeo).

### US-04.2 — Alertar exceso de capacidad y sugerir solución
**Como** operador, **quiero** ser alertado cuando las cabezas superan la capacidad del camión, **para** decidir entre múltiples viajes o cambiar de vehículo.

**Criterios de aceptación**
- **Dado** una solicitud de N cabezas y un camión de capacidad C, **cuando** `N > C`, **entonces** el sistema muestra una alerta clara e indica los viajes necesarios `ceil(N / C)`.
- **Dado** un exceso de capacidad, **cuando** se muestra la alerta, **entonces** se ofrece de forma elegante: (a) recalcular costo para múltiples viajes, o (b) cambiar de camión.
- **Dado** `N ≤ C`, **cuando** asigno, **entonces** no se muestra alerta y `trips_required = 1`.
- **Dado** múltiples viajes, **cuando** se acepta esa opción, **entonces** el costo se ajusta (`costo × trips_required` o según política definida y documentada).

**Tareas técnicas**
- [ ] T-04.2.1 — Lógica `trips_required = ceil(head_count / capacity)` en el servicio.
- [ ] T-04.2.2 — Componente de alerta no intrusivo con acciones (múltiples viajes / cambiar camión).
- [ ] T-04.2.3 — Documentar política de costeo de múltiples viajes en `DOCUMENTACION.md`.
- [ ] T-04.2.4 — Tests: `N=C`, `N<C`, `N>C`, `N` múltiplo y no múltiplo de `C`.

### US-04.3 — Evitar doble asignación de un camión
**Como** operador, **quiero** que un camión ocupado en un viaje activo no pueda asignarse a otra solicitud al mismo tiempo, **para** evitar conflictos de disponibilidad (doble-booking).

**Criterios de aceptación**
- **Dado** un camión ya asignado a una solicitud `assigned` (viaje activo), **cuando** intento asignarlo a otra, **entonces** el sistema lo impide e informa que el camión no está disponible.
- **Dado** un camión cuya solicitud pasó a `completed` o `cancelled`, **cuando** intento asignarlo, **entonces** vuelve a estar disponible.
- **Dado** el selector de asignación, **cuando** lo abro, **entonces** los camiones ocupados aparecen marcados como no disponibles (o filtrados).

**Tareas técnicas**
- [ ] T-04.3.1 — Consulta de disponibilidad: camión sin asignación en estado activo.
- [ ] T-04.3.2 — Validación server-side al asignar (rechazo `409`/`422` si ocupado).
- [ ] T-04.3.3 — Reflejar disponibilidad en el selector de camión del panel.
- [ ] T-04.3.4 — Tests: asignar camión libre, intentar asignar ocupado, liberar al completar/cancelar.

---

## EP-05 · Parametrización del Sistema

### US-05.1 — Configurar el precio de combustible
**Como** operador, **quiero** configurar el precio por litro, **para** que los cálculos reflejen el valor vigente.

**Criterios de aceptación**
- **Dado** un precio actual, **cuando** lo actualizo a un valor > 0, **entonces** las **nuevas** asignaciones lo usan, sin alterar las históricas (por el snapshot de US-04.1).
- **Dado** un valor inválido (≤ 0 o no numérico), **cuando** intento guardar, **entonces** se rechaza.

**Tareas técnicas**
- [x] T-05.1.1 — Tabla `settings` (clave/valor) o tabla `fuel_price` con vigencia.
- [x] T-05.1.2 — `GET`/`PUT /api/settings/fuel-price`.
- [x] T-05.1.3 — UI de configuración.

---

## EP-06 · Plataforma e Infraestructura (Enabler)

### US-06.1 — Levantar todo el entorno con un comando
**Como** desarrollador/revisor, **quiero** ejecutar `docker-compose up --build` y tener app + base de datos funcionando, **para** evaluar el proyecto sin fricción.

**Criterios de aceptación**
- **Dado** el repo clonado, **cuando** ejecuto `docker-compose up --build`, **entonces** se levantan los contenedores de Next.js y PostgreSQL.
- **Dado** el arranque, **cuando** inicia la base, **entonces** se ejecuta `init.sql` creando tablas y datos semilla.
- **Dado** un reinicio de contenedores, **cuando** vuelvo a levantar, **entonces** los datos persisten vía volumen.

**Tareas técnicas**
- [ ] T-06.1.1 — `docker-compose.yml` con servicios `app` y `db` + red interna.
- [ ] T-06.1.2 — Variables de entorno (`.env.example`) para conexión y precio inicial.
- [ ] T-06.1.3 — `init.sql` con DDL + seed realista de Paraguay: admin por defecto, 4-6 camiones con patentes/capacidades/consumos variados, y solicitudes de ejemplo entre ciudades reales con coordenadas aproximadas — Asunción (-25.2637, -57.5759), Ciudad del Este (-25.5097, -54.6111), Encarnación (-27.3306, -55.8667), Concepción (-23.4064, -57.4344), Coronel Oviedo (-25.4486, -56.4406). Esto hace creíble el demo de mapa/ruteo.
- [ ] T-06.1.4 — Volumen persistente para PostgreSQL.
- [ ] T-06.1.5 — `Dockerfile` multi-stage para Next.js.

### US-06.2 — Base de datos consistente
**Como** arquitecto, **quiero** un modelo relacional con llaves e integridad referencial, **para** evitar datos inconsistentes.

**Criterios de aceptación**
- **Dado** una asignación, **cuando** se inserta, **entonces** debe referenciar un `request_id` y `truck_id` existentes (FK).
- **Dado** la eliminación lógica de camiones, **cuando** ocurre, **entonces** no se rompen asignaciones históricas (sin `CASCADE` destructivo).

**Tareas técnicas**
- [ ] T-06.2.1 — FKs, índices en columnas de búsqueda (`status`, `request_id`, `truck_id`).
- [ ] T-06.2.2 — Constraints de dominio (CHECK) y unicidad.

---

## EP-07 · Gestión de Usuarios y Autenticación

> **Objetivo:** controlar el acceso al sistema y atribuir cada carga (flota/solicitud) a un usuario identificado, dando trazabilidad de "quién hizo qué".

### US-07.1 — Iniciar y cerrar sesión
**Como** usuario del sistema, **quiero** autenticarme con usuario y contraseña, **para** acceder de forma segura a las funciones según mi rol.

**Criterios de aceptación**
- **Dado** que el sistema está recién inicializado, **cuando** ingreso con `admin` / `admin123`, **entonces** accedo con rol `admin`.
- **Dado** credenciales válidas, **cuando** inicio sesión, **entonces** se establece una sesión autenticada y se me redirige al panel.
- **Dado** credenciales inválidas, **cuando** intento ingresar, **entonces** recibo un error genérico (sin revelar si el usuario existe) y no se crea sesión.
- **Dado** una sesión activa, **cuando** cierro sesión, **entonces** la sesión se invalida y rutas protegidas dejan de ser accesibles.

**Tareas técnicas**
- [ ] T-07.1.1 — Tabla `users` (`id`, `username UNIQUE`, `password_hash`, `role`, `is_active`, `created_at`).
- [ ] T-07.1.2 — Hashing de contraseñas con bcrypt/argon2 (nunca texto plano).
- [ ] T-07.1.3 — `POST /api/auth/login` y `POST /api/auth/logout`; sesión vía cookie httpOnly o JWT.
- [ ] T-07.1.4 — Middleware de protección de rutas/endpoints; redirección de no autenticados.
- [ ] T-07.1.5 — Seed del admin por defecto con contraseña ya hasheada en `init.sql`.
- [ ] T-07.1.6 — Tests: login OK, login inválido, acceso a ruta protegida sin sesión.

### US-07.2 — Administrar usuarios (CRUD)
**Como** admin, **quiero** crear, listar, editar y desactivar usuarios, **para** controlar quién puede operar el sistema.

**Criterios de aceptación**
- **Dado** que soy admin, **cuando** abro la gestión de usuarios, **entonces** veo el listado con username, rol y estado.
- **Dado** que soy admin, **cuando** creo un usuario con username único, rol y contraseña válida, **entonces** se persiste con la contraseña hasheada.
- **Dado** un username ya existente, **cuando** intento crearlo, **entonces** se rechaza (409) sin duplicar.
- **Dado** que soy admin, **cuando** desactivo un usuario, **entonces** no puede iniciar sesión pero se conserva su historial de cargas.
- **Dado** que soy operador (no admin), **cuando** intento acceder a la gestión de usuarios, **entonces** recibo `403 Forbidden`.
- **Dado** el último usuario admin activo, **cuando** intento desactivarlo o quitarle el rol admin, **entonces** el sistema lo impide (no dejar el sistema sin administradores).

**Tareas técnicas**
- [ ] T-07.2.1 — `GET/POST /api/users`, `PATCH /api/users/:id`, `PATCH /api/users/:id/status`.
- [ ] T-07.2.2 — Autorización por rol (guard `admin`) en endpoints y UI.
- [ ] T-07.2.3 — Validación de username único y fortaleza mínima de contraseña.
- [ ] T-07.2.4 — Regla "no dejar el sistema sin admin activo".
- [ ] T-07.2.5 — UI de CRUD de usuarios (solo visible para admin).
- [ ] T-07.2.6 — Tests: CRUD, unicidad, 403 para operador, protección del último admin.

### US-07.3 — Atribución y trazabilidad de cargas
**Como** admin/operador, **quiero** ver quién cargó cada camión y cada solicitud, **para** auditar y dar seguimiento.

**Criterios de aceptación**
- **Dado** un camión o una solicitud, **cuando** lo consulto, **entonces** veo el usuario que lo creó y la fecha de carga.
- **Dado** que un usuario fue desactivado, **cuando** consulto sus cargas históricas, **entonces** la atribución se conserva (sin borrado en cascada).

**Tareas técnicas**
- [ ] T-07.3.1 — Columna `created_by` (FK a `users`) en `trucks`, `transport_requests` y `assignments` (`assigned_by`).
- [ ] T-07.3.2 — Poblar `created_by`/`assigned_by` desde la sesión autenticada en cada alta/asignación.
- [ ] T-07.3.3 — Mostrar autor + fecha en las vistas de flota, solicitudes y detalle de asignación.

---

## Requisitos No Funcionales (RNF)

> Aplican de forma **transversal** a todas las épicas. No son features sueltas; son la barra de calidad del MVP.

**RNF-01 · UI/UX y responsividad.** Interfaz prolija, moderna y responsiva (desktop y mobile). Toda vista de datos debe contemplar tres estados explícitos: **carga** (skeleton/spinner), **vacío** (empty state con CTA) y **error** (mensaje claro + reintento). Jerarquía visual consistente y tarjetas KPI en la parte superior del panel.

**RNF-02 · Contrato de errores de API.** Forma de error uniforme `{ error: { code, message, fields? } }` y uso correcto de códigos HTTP (`200/201`, `400` validación, `401` no autenticado, `403` sin permiso, `404` no encontrado, `409` conflicto, `422` regla de negocio, `500` interno). Ningún error 500 debe filtrar stack traces al cliente.

**RNF-03 · Validación en doble capa.** Validación en cliente (UX inmediata) y en servidor (fuente de verdad). El backend nunca confía en el cliente.

**RNF-04 · Seguridad base.** Contraseñas hasheadas (bcrypt/argon2), sesiones seguras (cookie httpOnly o JWT), protección de rutas/endpoints por autenticación y rol, y secretos vía variables de entorno (nunca hardcodeados).

**RNF-05 · Localización (Paraguay).** Idioma español, formato de moneda en Guaraníes (`Gs. 1.234.567`) y separadores de miles/decimales locales en montos y distancias.

**RNF-06 · Consistencia de datos.** Integridad referencial con FKs, constraints `CHECK`/`UNIQUE`, sin borrado en cascada destructivo sobre históricos, e índices en columnas de filtro.

**RNF-07 · Observabilidad mínima.** Logging básico de errores del servidor y de operaciones clave (login, asignación), suficiente para diagnosticar sin sobre-ingeniería.

**Tareas técnicas transversales**
- [ ] RNF-T1 — Componentes base reutilizables de estado (loading/empty/error).
- [ ] RNF-T2 — Helper central de respuestas y errores de API.
- [ ] RNF-T3 — Utilidad de formateo de moneda/números (locale `es-PY`).
- [ ] RNF-T4 — Middleware de auth/rol y manejo centralizado de excepciones.

---

## Fuera de alcance (decisiones conscientes para el MVP)

> Documentar lo que **no** se hace —y por qué— es parte del criterio de ingeniería. Candidatos a fases futuras:

- **Tracking GPS en tiempo real** del camión durante el viaje.
- **Notificaciones** por email/SMS/push.
- **Facturación y pagos** (el costo de combustible es proyección, no cobro).
- **Gestión de choferes** como módulo independiente (asignación de conductor al viaje).
- **Multi-tenancy** (varias empresas logísticas en una misma instancia).
- **Log de auditoría completo** (más allá de la atribución `created_by`): historial de cambios por entidad. Se deja como extensión natural de EP-07 si sobra tiempo.
- **Múltiples tipos/precios de combustible** (hoy un único precio global).

---

## 2. Resumen de modelo de datos (vista previa para Fase 2)

```
users(id PK, username UNIQUE, password_hash, role CHECK in ('admin','operador'),
       is_active BOOL, created_at)

trucks(id PK, plate UNIQUE, capacity INT CHECK>0,
       consumption_l_per_km NUMERIC CHECK>0, status, created_at,
       created_by FK -> users(id))

transport_requests(id PK, requester_name, head_count INT CHECK>0,
       origin_label, origin_lat, origin_lng,
       dest_label, dest_lat, dest_lng,
       distance_km NUMERIC, status, created_at,
       created_by FK -> users(id))

assignments(id PK, request_id FK, truck_id FK,
       distance_km, consumption_snapshot, fuel_price_snapshot,
       trips_required INT, total_fuel_cost NUMERIC, created_at,
       assigned_by FK -> users(id))

settings(key PK, value)   -- p.ej. ('fuel_price_per_liter', '...')
```

> **Nota de integridad:** las FK `created_by`/`assigned_by` usan `ON DELETE RESTRICT` (o desactivación lógica de usuarios) para no perder la trazabilidad histórica.

---

## 3. Orden de implementación sugerido (priorización)

1. **EP-06** (infra mínima: docker + db + esquema base) — desbloquea todo.
2. **EP-07** (usuarios + auth + admin seed) — necesario antes de los CRUDs, porque toda carga se atribuye a un usuario.
3. **EP-01** (flota) y **EP-02** (solicitudes) — CRUDs base en paralelo, ya con `created_by`.
4. **EP-05** (precio) — pequeño, requisito del cálculo.
5. **EP-03** (mapa + distancia + proyección).
6. **EP-04** (asignación + costo + alerta de capacidad) — el corazón del MVP, depende de todo lo anterior.

---

## 4. Árbol de conversación / Prompts utilizados con Claude

> *(Sección requerida por la rúbrica. Aquí se documenta cómo se usó Claude como Analista de Negocios / Arquitecto.)*

**Prompt raíz (rol):** Ver `.claude/custom_instructions.md` — Claude actúa como PO + Arquitecto de BoviTrans.

1. **Desglose conceptual** — "A partir de la descripción de BoviTrans, identificá los módulos, entidades y la regla de negocio núcleo (costo de combustible y validación de capacidad)."
2. **Épicas** — "Convertí los módulos en épicas con objetivo de negocio explícito."
3. **Historias de usuario** — "Por cada épica generá US en formato 'Como/quiero/para', evitando solapamientos."
4. **Criterios de aceptación** — "Para cada US escribí criterios Gherkin (Dado/Cuando/Entonces) cubriendo camino feliz, validaciones y bordes (N>C, N=C, fallo de ruteo, precio histórico)."
5. **Tareas técnicas** — "Derivá tasks de backend (API+SQL), frontend y testing, trazables a cada US."
6. **Supuestos** — "Listá los supuestos de PO que toman decisiones donde la pauta es ambigua (rol único, distancia por ruteo, snapshot de precio)."

> *Pegar aquí el enlace o transcripción del hilo real de Claude para la entrega final.*
