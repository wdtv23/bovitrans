import { NextResponse } from 'next/server'
import { z } from 'zod'
import pool from '@/lib/db'
import { requireAuth } from '@/lib/api-guard'

const UpdateSchema = z.object({
  requester_name: z.string().min(1, 'Requerido').max(150).optional(),
  head_count: z
    .number({ invalid_type_error: 'Debe ser un número' })
    .int('Debe ser entero')
    .positive('Debe ser mayor a 0')
    .optional(),
  origin_label: z.string().min(1, 'Requerido').max(150).optional(),
  origin_lat:   z.number().min(-90).max(90).optional(),
  origin_lng:   z.number().min(-180).max(180).optional(),
  dest_label:   z.string().min(1, 'Requerido').max(150).optional(),
  dest_lat:     z.number().min(-90).max(90).optional(),
  dest_lng:     z.number().min(-180).max(180).optional(),
}).refine(data => Object.keys(data).length > 0, { message: 'Sin campos para actualizar' })

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

  const parsed = UpdateSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Datos inválidos',
          fields: parsed.error.flatten().fieldErrors,
        },
      },
      { status: 400 },
    )
  }

  // Solo se pueden editar solicitudes en estado pending
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
  if (current.status !== 'pending') {
    return NextResponse.json(
      {
        error: {
          code: 'INVALID_STATE',
          message: `Solo se pueden editar solicitudes pendientes (estado actual: "${current.status}")`,
        },
      },
      { status: 422 },
    )
  }

  const data = parsed.data
  const fields = Object.keys(data) as (keyof typeof data)[]
  const setClauses = fields.map((f, i) => `${f} = $${i + 1}`).join(', ')
  const values = fields.map(f => data[f])

  try {
    const result = await pool.query(
      `UPDATE transport_requests
       SET ${setClauses}, updated_at = now()
       WHERE id = $${fields.length + 1}
       RETURNING id, requester_name, head_count,
                 origin_label, origin_lat, origin_lng,
                 dest_label, dest_lat, dest_lng,
                 distance_km, status, created_at`,
      [...values, id],
    )
    console.info(`[requests/:id:PATCH] id=${id} fields=${fields.join(',')}`)
    return NextResponse.json({ request: result.rows[0] })
  } catch (err) {
    console.error('[requests/:id:PATCH]', err)
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Error interno del servidor' } },
      { status: 500 },
    )
  }
}
