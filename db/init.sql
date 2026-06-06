-- =============================================================================
-- BoviTrans — Inicialización de Base de Datos (PostgreSQL)
-- Se ejecuta automáticamente al levantar el contenedor de la base
-- (montado en /docker-entrypoint-initdb.d/).
--
-- Contenido:
--   1. Esquema (DDL): tablas, restricciones, índices y triggers.
--   2. Datos semilla (seed): admin por defecto, usuarios, parámetros,
--      flota y solicitudes/asignaciones de ejemplo con ciudades reales de PY.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- Función utilitaria: mantener updated_at automáticamente.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- 1. TABLA users — autenticación y atribución
-- =============================================================================
CREATE TABLE users (
    id            INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    username      VARCHAR(50)  NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,                 -- bcrypt/argon2, nunca texto plano
    role          VARCHAR(20)  NOT NULL DEFAULT 'operador',
    is_active     BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),

    CONSTRAINT chk_users_role CHECK (role IN ('admin', 'operador'))
);

CREATE TRIGGER trg_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- =============================================================================
-- 2. TABLA trucks — flota de camiones (atributos críticos inmutables)
-- =============================================================================
CREATE TABLE trucks (
    id                   INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    plate                VARCHAR(20)   NOT NULL UNIQUE,
    capacity             INTEGER       NOT NULL,          -- cabezas de ganado
    consumption_l_per_km NUMERIC(6,3)  NOT NULL,          -- litros por km
    status               VARCHAR(20)   NOT NULL DEFAULT 'active',
    created_by           INTEGER       NOT NULL,
    created_at           TIMESTAMPTZ   NOT NULL DEFAULT now(),
    updated_at           TIMESTAMPTZ   NOT NULL DEFAULT now(),

    CONSTRAINT chk_trucks_capacity    CHECK (capacity > 0),
    CONSTRAINT chk_trucks_consumption CHECK (consumption_l_per_km > 0),
    CONSTRAINT chk_trucks_status      CHECK (status IN ('active', 'inactive')),
    CONSTRAINT fk_trucks_created_by   FOREIGN KEY (created_by)
        REFERENCES users(id) ON DELETE RESTRICT
);

CREATE INDEX idx_trucks_status ON trucks(status);

CREATE TRIGGER trg_trucks_updated_at
    BEFORE UPDATE ON trucks
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- =============================================================================
-- 3. TABLA transport_requests — solicitudes de transporte
-- =============================================================================
CREATE TABLE transport_requests (
    id             INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    requester_name VARCHAR(150)  NOT NULL,
    head_count     INTEGER       NOT NULL,                -- cabezas a mover
    origin_label   VARCHAR(150)  NOT NULL,
    origin_lat     NUMERIC(9,6)  NOT NULL,
    origin_lng     NUMERIC(9,6)  NOT NULL,
    dest_label     VARCHAR(150)  NOT NULL,
    dest_lat       NUMERIC(9,6)  NOT NULL,
    dest_lng       NUMERIC(9,6)  NOT NULL,
    distance_km    NUMERIC(10,2),                         -- se completa al rutear
    status         VARCHAR(20)   NOT NULL DEFAULT 'pending',
    created_by     INTEGER       NOT NULL,
    created_at     TIMESTAMPTZ   NOT NULL DEFAULT now(),
    updated_at     TIMESTAMPTZ   NOT NULL DEFAULT now(),

    CONSTRAINT chk_requests_head_count CHECK (head_count > 0),
    CONSTRAINT chk_requests_distance   CHECK (distance_km IS NULL OR distance_km >= 0),
    CONSTRAINT chk_requests_status
        CHECK (status IN ('pending', 'assigned', 'completed', 'cancelled')),
    CONSTRAINT chk_requests_lat CHECK (origin_lat BETWEEN -90 AND 90 AND dest_lat BETWEEN -90 AND 90),
    CONSTRAINT chk_requests_lng CHECK (origin_lng BETWEEN -180 AND 180 AND dest_lng BETWEEN -180 AND 180),
    CONSTRAINT fk_requests_created_by FOREIGN KEY (created_by)
        REFERENCES users(id) ON DELETE RESTRICT
);

CREATE INDEX idx_requests_status     ON transport_requests(status);
CREATE INDEX idx_requests_created_by ON transport_requests(created_by);

CREATE TRIGGER trg_requests_updated_at
    BEFORE UPDATE ON transport_requests
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- =============================================================================
-- 4. TABLA assignments — asignación camión↔solicitud con snapshot de cálculo
--    El snapshot (distancia/consumo/precio) preserva el costo histórico aunque
--    cambien el precio global o se desactive el camión.
-- =============================================================================
CREATE TABLE assignments (
    id                   INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    request_id           INTEGER       NOT NULL,
    truck_id             INTEGER       NOT NULL,
    distance_km          NUMERIC(10,2) NOT NULL,
    consumption_snapshot NUMERIC(6,3)  NOT NULL,          -- L/km del camión al asignar
    fuel_price_snapshot  NUMERIC(12,2) NOT NULL,          -- Gs./L vigente al asignar
    trips_required       INTEGER       NOT NULL DEFAULT 1,
    total_fuel_cost      NUMERIC(14,2) NOT NULL,          -- Gs.
    is_active            BOOLEAN       NOT NULL DEFAULT TRUE, -- viaje en curso
    assigned_by          INTEGER       NOT NULL,
    created_at           TIMESTAMPTZ   NOT NULL DEFAULT now(),

    CONSTRAINT chk_assign_distance CHECK (distance_km >= 0),
    CONSTRAINT chk_assign_trips    CHECK (trips_required >= 1),
    CONSTRAINT chk_assign_cost     CHECK (total_fuel_cost >= 0),
    CONSTRAINT fk_assign_request FOREIGN KEY (request_id)
        REFERENCES transport_requests(id) ON DELETE RESTRICT,
    CONSTRAINT fk_assign_truck FOREIGN KEY (truck_id)
        REFERENCES trucks(id) ON DELETE RESTRICT,
    CONSTRAINT fk_assign_assigned_by FOREIGN KEY (assigned_by)
        REFERENCES users(id) ON DELETE RESTRICT
);

CREATE INDEX idx_assign_request     ON assignments(request_id);
CREATE INDEX idx_assign_truck       ON assignments(truck_id);
CREATE INDEX idx_assign_assigned_by ON assignments(assigned_by);

-- Regla de integridad clave: un camión solo puede tener UNA asignación activa
-- a la vez (evita doble-booking). Aplicado a nivel de base con índice parcial.
CREATE UNIQUE INDEX uq_active_assignment_per_truck
    ON assignments(truck_id) WHERE is_active;

-- Y una solicitud solo puede tener una asignación activa a la vez.
CREATE UNIQUE INDEX uq_active_assignment_per_request
    ON assignments(request_id) WHERE is_active;

-- =============================================================================
-- 5. TABLA settings — parámetros globales (clave/valor)
-- =============================================================================
CREATE TABLE settings (
    key        VARCHAR(60)  PRIMARY KEY,
    value      TEXT         NOT NULL,
    updated_at TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_settings_updated_at
    BEFORE UPDATE ON settings
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- =============================================================================
-- =========================  DATOS SEMILLA (SEED)  ============================
-- =============================================================================

-- 5.1 Usuarios -----------------------------------------------------------------
-- Contraseñas hasheadas con bcrypt (cost 10):
--   admin     -> admin123
--   operador1 -> operador123
--   operador2 -> operador123
INSERT INTO users (username, password_hash, role) VALUES
('admin',     '$2b$10$2VfJXixIoWj6QKcZSMkDxu3WZ4D7iXoaQd2cG/8n3zYcXSPZ7xg7S', 'admin'),
('operador1', '$2b$10$vIKb4BZ3UjoiEYFnNWHi4uApzsJpkrUDG7WPoenwfFulf/1Q/ZM1.', 'operador'),
('operador2', '$2b$10$vIKb4BZ3UjoiEYFnNWHi4uApzsJpkrUDG7WPoenwfFulf/1Q/ZM1.', 'operador');

-- 5.2 Parámetros globales ------------------------------------------------------
-- Precio de combustible (diésel) en Guaraníes por litro.
INSERT INTO settings (key, value) VALUES
('fuel_price_per_liter', '7400');

-- 5.3 Flota --------------------------------------------------------------------
INSERT INTO trucks (plate, capacity, consumption_l_per_km, status, created_by) VALUES
('ABCD 123', 40, 0.420, 'active',   (SELECT id FROM users WHERE username = 'admin')),
('EFGH 456', 30, 0.380, 'active',   (SELECT id FROM users WHERE username = 'operador1')),
('IJKL 789', 55, 0.510, 'active',   (SELECT id FROM users WHERE username = 'admin')),
('MNOP 012', 25, 0.350, 'active',   (SELECT id FROM users WHERE username = 'operador1')),
('QRST 345', 48, 0.460, 'inactive', (SELECT id FROM users WHERE username = 'admin'));

-- 5.4 Solicitudes de transporte (ciudades reales de Paraguay) ------------------
-- Coordenadas aproximadas:
--   Asunción        -25.2637, -57.5759
--   Ciudad del Este -25.5097, -54.6111
--   Encarnación     -27.3306, -55.8667
--   Concepción      -23.4064, -57.4344
--   Coronel Oviedo  -25.4486, -56.4406

-- R1: pendiente (sin camión)
INSERT INTO transport_requests
(requester_name, head_count, origin_label, origin_lat, origin_lng, dest_label, dest_lat, dest_lng, distance_km, status, created_by) VALUES
('Estancia San Jorge', 35, 'Asunción', -25.2637, -57.5759, 'Coronel Oviedo', -25.4486, -56.4406, 132.00, 'pending',
    (SELECT id FROM users WHERE username = 'operador1'));

-- R2: asignada (camión ABCD 123, viaje en curso)
INSERT INTO transport_requests
(requester_name, head_count, origin_label, origin_lat, origin_lng, dest_label, dest_lat, dest_lng, distance_km, status, created_by) VALUES
('Agroganadera del Este', 38, 'Asunción', -25.2637, -57.5759, 'Ciudad del Este', -25.5097, -54.6111, 327.00, 'assigned',
    (SELECT id FROM users WHERE username = 'operador1'));

-- R3: pendiente — excede la capacidad de varios camiones (caso de múltiples viajes)
INSERT INTO transport_requests
(requester_name, head_count, origin_label, origin_lat, origin_lng, dest_label, dest_lat, dest_lng, distance_km, status, created_by) VALUES
('Frigorífico Norte', 60, 'Concepción', -23.4064, -57.4344, 'Asunción', -25.2637, -57.5759, 418.00, 'pending',
    (SELECT id FROM users WHERE username = 'operador2'));

-- R4: completada (camión EFGH 456, viaje finalizado -> camión liberado)
INSERT INTO transport_requests
(requester_name, head_count, origin_label, origin_lat, origin_lng, dest_label, dest_lat, dest_lng, distance_km, status, created_by) VALUES
('Cabaña La Esperanza', 28, 'Encarnación', -27.3306, -55.8667, 'Asunción', -25.2637, -57.5759, 370.00, 'completed',
    (SELECT id FROM users WHERE username = 'operador2'));

-- R5: cancelada
INSERT INTO transport_requests
(requester_name, head_count, origin_label, origin_lat, origin_lng, dest_label, dest_lat, dest_lng, distance_km, status, created_by) VALUES
('Ganadera del Sur', 20, 'Coronel Oviedo', -25.4486, -56.4406, 'Encarnación', -27.3306, -55.8667, 289.00, 'cancelled',
    (SELECT id FROM users WHERE username = 'operador1'));

-- 5.5 Asignaciones -------------------------------------------------------------
-- A1: R2 -> ABCD 123 (activa). Costo = 327.00 × 0.420 × 7400 = 1.016.316,00 Gs.
INSERT INTO assignments
(request_id, truck_id, distance_km, consumption_snapshot, fuel_price_snapshot, trips_required, total_fuel_cost, is_active, assigned_by) VALUES
((SELECT id FROM transport_requests WHERE requester_name = 'Agroganadera del Este'),
 (SELECT id FROM trucks WHERE plate = 'ABCD 123'),
 327.00, 0.420, 7400, 1, 1016316.00, TRUE,
 (SELECT id FROM users WHERE username = 'admin'));

-- A2: R4 -> EFGH 456 (inactiva, viaje completado). Costo = 370.00 × 0.380 × 7400 = 1.040.440,00 Gs.
INSERT INTO assignments
(request_id, truck_id, distance_km, consumption_snapshot, fuel_price_snapshot, trips_required, total_fuel_cost, is_active, assigned_by) VALUES
((SELECT id FROM transport_requests WHERE requester_name = 'Cabaña La Esperanza'),
 (SELECT id FROM trucks WHERE plate = 'EFGH 456'),
 370.00, 0.380, 7400, 1, 1040440.00, FALSE,
 (SELECT id FROM users WHERE username = 'operador2'));

COMMIT;
