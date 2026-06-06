import { NextResponse } from 'next/server'
import { z } from 'zod'
import pool from '@/lib/db'
import { requireAuth } from '@/lib/api-guard'

// Transiciones válidas desde este endpoint.
// pending → assigned se hace exclusivamente a través de POST /api/requests/:id/assign (EP-04).
const VALID_TRANSITIONS: Record<string, string[]> = {
  pending:   ['cancelled'],
  assigned:  ['completed', 'cancelled'],
  completed: [],
  cancelled: [],
}

const StatusSchema = z.object({
  status: z.enum(['pending', 'assigned', 'completed', 'cancelled']),
})

type RequestRow = { status: string }

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

  const parsed = StatusSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: 'VALIDATION_ERROR', message: 'Estado inválido' } },
      { status: 400 },
    )
  }

  const newStatus = parsed.data.status

  // Leer estado actual
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

  // Validar transición
  if (!VALID_TRANSITIONS[current.status]?.includes(newStatus)) {
    return NextResponse.json(
      {
        error: {
          code: 'INVALID_TRANSITION',
          message: `No se puede pasar de "${current.status}" a "${newStatus}"`,
        },
      },
      { status: 422 },
    )
  }

  try {
    const result = await pool.query(
      `UPDATE transport_requests
       SET status = $1, updated_at = now()
       WHERE id = $2
       RETURNING id, requester_name, head_count,
                 origin_label, dest_label, distance_km,
                 status, created_at`,
      [newStatus, id],
    )
    console.info(`[requests/:id/status:PATCH] id=${id} ${current.status}→${newStatus}`)
    return NextResponse.json({ request: result.rows[0] })
  } catch (err) {
    console.error('[requests/:id/status:PATCH]', err)
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Error interno del servidor' } },
      { status: 500 },
    )
  }
}
