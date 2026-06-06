import { NextResponse } from 'next/server'
import { z } from 'zod'
import pool from '@/lib/db'
import { requireAuth } from '@/lib/api-guard'

const StatusSchema = z.object({
  status: z.enum(['active', 'inactive']),
})

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
      { error: { code: 'NOT_FOUND', message: 'Camión no encontrado' } },
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
      { error: { code: 'VALIDATION_ERROR', message: 'Estado inválido. Use "active" o "inactive"' } },
      { status: 400 },
    )
  }

  try {
    const result = await pool.query(
      `UPDATE trucks SET status = $1, updated_at = now()
       WHERE id = $2
       RETURNING id, plate, capacity, consumption_l_per_km, status, created_at`,
      [parsed.data.status, id],
    )
    if (!result.rows[0]) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'Camión no encontrado' } },
        { status: 404 },
      )
    }
    console.info(`[trucks/:id/status:PATCH] id=${id} status="${parsed.data.status}"`)
    return NextResponse.json({ truck: result.rows[0] })
  } catch (err) {
    console.error('[trucks/:id/status:PATCH]', err)
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Error interno del servidor' } },
      { status: 500 },
    )
  }
}
