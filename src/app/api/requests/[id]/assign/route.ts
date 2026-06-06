import { NextResponse } from 'next/server'
import { z } from 'zod'
import pool from '@/lib/db'
import { requireAuth } from '@/lib/api-guard'
import { calculatePricing } from '@/lib/pricing'

const AssignSchema = z.object({
  truck_id:              z.number({ invalid_type_error: 'Requerido' }).int().positive(),
  force_multiple_trips:  z.boolean().optional().default(false),
})

type ReqRow   = { id: number; status: string; head_count: number; distance_km: string | null }
type TruckRow = { id: number; capacity: number; consumption_l_per_km: string; status: string }

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requireAuth()
  if (!guard.ok) return guard.response

  const { id: rawId } = await params
  const id = parseInt(rawId, 10)
  if (isNaN(id)) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'Solicitud no encontrada' } },
      { status: 404 },
    )
  }

  let body: unknown
  try { body = await request.json() }
  catch {
    return NextResponse.json(
      { error: { code: 'BAD_REQUEST', message: 'Cuerpo inválido' } },
      { status: 400 },
    )
  }

  const parsed = AssignSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: 'VALIDATION_ERROR', message: parsed.error.errors[0]?.message ?? 'Datos inválidos' } },
      { status: 400 },
    )
  }

  const { truck_id: truckId, force_multiple_trips: force } = parsed.data
  const assignedBy = parseInt(guard.session.sub, 10)

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    // Lock request to prevent concurrent assigns
    const reqResult = await client.query<ReqRow>(
      `SELECT id, status, head_count, distance_km
       FROM transport_requests WHERE id = $1 FOR UPDATE`,
      [id],
    )
    const req = reqResult.rows[0]
    if (!req) {
      await client.query('ROLLBACK')
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'Solicitud no encontrada' } },
        { status: 404 },
      )
    }
    if (req.status !== 'pending') {
      await client.query('ROLLBACK')
      return NextResponse.json(
        {
          error: {
            code: 'INVALID_STATE',
            message: `Solo se pueden asignar solicitudes pendientes (estado actual: "${req.status}")`,
          },
        },
        { status: 422 },
      )
    }
    if (!req.distance_km) {
      await client.query('ROLLBACK')
      return NextResponse.json(
        {
          error: {
            code: 'MISSING_DISTANCE',
            message: 'La solicitud no tiene distancia calculada. Usá "Ver ruta" para obtenerla antes de asignar.',
          },
        },
        { status: 422 },
      )
    }

    // Lock truck row
    const truckResult = await client.query<TruckRow>(
      `SELECT id, capacity, consumption_l_per_km, status
       FROM trucks WHERE id = $1 FOR UPDATE`,
      [truckId],
    )
    const truck = truckResult.rows[0]
    if (!truck) {
      await client.query('ROLLBACK')
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'Camión no encontrado' } },
        { status: 404 },
      )
    }
    if (truck.status !== 'active') {
      await client.query('ROLLBACK')
      return NextResponse.json(
        { error: { code: 'TRUCK_INACTIVE', message: 'El camión no está activo' } },
        { status: 422 },
      )
    }

    // Double-booking check (safety net; DB unique index also enforces this)
    const occupiedResult = await client.query(
      'SELECT id FROM assignments WHERE truck_id = $1 AND is_active = TRUE',
      [truckId],
    )
    if (occupiedResult.rows.length > 0) {
      await client.query('ROLLBACK')
      return NextResponse.json(
        {
          error: {
            code: 'TRUCK_OCCUPIED',
            message: 'El camión ya tiene un viaje activo y no puede asignarse a otra solicitud.',
          },
        },
        { status: 409 },
      )
    }

    // Fuel price from settings
    const priceResult = await client.query<{ value: string }>(
      "SELECT value FROM settings WHERE key = 'fuel_price_per_liter'",
    )
    const fuelPrice = Number(priceResult.rows[0]?.value ?? 7400)

    // Server-side pricing calculation (fuente de verdad)
    const pricing = calculatePricing({
      distanceKm:        Number(req.distance_km),
      consumptionLPerKm: Number(truck.consumption_l_per_km),
      fuelPricePerLiter: fuelPrice,
      headCount:         req.head_count,
      truckCapacity:     truck.capacity,
    })

    // Capacity check: if exceeded and not explicitly confirmed, return 422
    if (pricing.tripsRequired > 1 && !force) {
      await client.query('ROLLBACK')
      return NextResponse.json(
        {
          error: {
            code: 'CAPACITY_EXCEEDED',
            message: `Las ${req.head_count} cabezas superan la capacidad de ${truck.capacity} del camión. Se necesitan ${pricing.tripsRequired} viajes.`,
            data: {
              trips_required:    pricing.tripsRequired,
              fuel_cost_per_trip: Math.round(pricing.fuelCostPerTrip),
              total_fuel_cost:   Math.round(pricing.totalFuelCost),
              head_count:        req.head_count,
              truck_capacity:    truck.capacity,
            },
          },
        },
        { status: 422 },
      )
    }

    // Persist assignment with full snapshot
    const assignResult = await client.query(
      `INSERT INTO assignments
         (request_id, truck_id, distance_km, consumption_snapshot,
          fuel_price_snapshot, trips_required, total_fuel_cost, assigned_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       RETURNING id, request_id, truck_id, distance_km, consumption_snapshot,
                 fuel_price_snapshot, trips_required, total_fuel_cost,
                 is_active, created_at`,
      [
        id, truckId, req.distance_km,
        truck.consumption_l_per_km, fuelPrice,
        pricing.tripsRequired, Math.round(pricing.totalFuelCost),
        assignedBy,
      ],
    )

    // Transition request to assigned
    const updatedReqResult = await client.query(
      `UPDATE transport_requests
       SET status = 'assigned', updated_at = now()
       WHERE id = $1
       RETURNING id, status, requester_name, head_count,
                 origin_label, dest_label, distance_km`,
      [id],
    )

    await client.query('COMMIT')

    console.info(
      `[assign:POST] request_id=${id} truck_id=${truckId} ` +
      `trips=${pricing.tripsRequired} cost=${Math.round(pricing.totalFuelCost)} user_id=${assignedBy}`,
    )
    return NextResponse.json(
      { assignment: assignResult.rows[0], request: updatedReqResult.rows[0] },
      { status: 201 },
    )
  } catch (err) {
    try { await client.query('ROLLBACK') } catch { /* ignore rollback error */ }
    // DB-level double-booking catch (unique index uq_active_assignment_per_truck)
    if (err && typeof err === 'object' && 'code' in err && err.code === '23505') {
      return NextResponse.json(
        {
          error: {
            code: 'TRUCK_OCCUPIED',
            message: 'El camión ya tiene un viaje activo y no puede asignarse a otra solicitud.',
          },
        },
        { status: 409 },
      )
    }
    console.error('[assign:POST]', err)
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Error interno del servidor' } },
      { status: 500 },
    )
  } finally {
    client.release()
  }
}
