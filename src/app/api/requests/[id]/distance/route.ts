import { NextResponse } from 'next/server'
import { z } from 'zod'
import pool from '@/lib/db'
import { requireAuth } from '@/lib/api-guard'

const DistanceSchema = z.object({
  distance_km: z
    .number({ invalid_type_error: 'Debe ser un número' })
    .positive('La distancia debe ser mayor a 0')
    .finite(),
})

type RequestRow = { status: string }

// Permite actualizar distance_km en solicitudes pendientes o asignadas.
// Las completadas/canceladas son inmutables.
export async function PATCH(
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
  try {
    body = await request.json()
  } catch {
    return NextResponse.json(
      { error: { code: 'BAD_REQUEST', message: 'Cuerpo inválido' } },
      { status: 400 },
    )
  }

  const parsed = DistanceSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: 'VALIDATION_ERROR', message: parsed.error.errors[0]?.message ?? 'Valor inválido' } },
      { status: 400 },
    )
  }

  const currentResult = await pool.query<RequestRow>(
    'SELECT status FROM transport_requests WHERE id = $1',
    [id],
  )
  const current = currentResult.rows[0]
  if (!current) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'Solicitud no encontrada' } },
      { status: 404 },
    )
  }
  if (current.status === 'completed' || current.status === 'cancelled') {
    return NextResponse.json(
      {
        error: {
          code: 'INVALID_STATE',
          message: `No se puede actualizar la distancia de una solicitud en estado "${current.status}"`,
        },
      },
      { status: 422 },
    )
  }

  try {
    const result = await pool.query(
      `UPDATE transport_requests
       SET distance_km = $1, updated_at = now()
       WHERE id = $2
       RETURNING id, distance_km, status`,
      [parsed.data.distance_km, id],
    )
    console.info(`[requests/:id/distance:PATCH] id=${id} distance_km=${parsed.data.distance_km}`)
    return NextResponse.json({ request: result.rows[0] })
  } catch (err) {
    console.error('[requests/:id/distance:PATCH]', err)
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Error interno del servidor' } },
      { status: 500 },
    )
  }
}
