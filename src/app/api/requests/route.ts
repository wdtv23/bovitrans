import { NextResponse } from 'next/server'
import { z } from 'zod'
import pool from '@/lib/db'
import { requireAuth } from '@/lib/api-guard'

const CreateSchema = z.object({
  requester_name: z.string().min(1, 'Requerido').max(150),
  head_count: z
    .number({ invalid_type_error: 'Debe ser un número' })
    .int('Debe ser entero')
    .positive('Debe ser mayor a 0'),
  origin_label: z.string().min(1, 'Requerido').max(150),
  origin_lat:   z.number().min(-90).max(90),
  origin_lng:   z.number().min(-180).max(180),
  dest_label:   z.string().min(1, 'Requerido').max(150),
  dest_lat:     z.number().min(-90).max(90),
  dest_lng:     z.number().min(-180).max(180),
})

export async function GET(request: Request) {
  const guard = await requireAuth()
  if (!guard.ok) return guard.response

  const { searchParams } = new URL(request.url)
  const statusFilter = searchParams.get('status')

  const VALID_STATUSES = ['pending', 'assigned', 'completed', 'cancelled']
  const values: unknown[] = []
  let where = ''

  if (statusFilter && VALID_STATUSES.includes(statusFilter)) {
    where = 'WHERE r.status = $1'
    values.push(statusFilter)
  }

  try {
    const result = await pool.query(
      `SELECT r.id, r.requester_name, r.head_count,
              r.origin_label, r.origin_lat, r.origin_lng,
              r.dest_label, r.dest_lat, r.dest_lng,
              r.distance_km, r.status, r.created_at,
              u.username AS created_by_username
       FROM transport_requests r
       JOIN users u ON r.created_by = u.id
       ${where}
       ORDER BY r.created_at DESC`,
      values,
    )
    return NextResponse.json({ requests: result.rows })
  } catch (err) {
    console.error('[requests:GET]', err)
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Error interno del servidor' } },
      { status: 500 },
    )
  }
}

export async function POST(request: Request) {
  const guard = await requireAuth()
  if (!guard.ok) return guard.response

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json(
      { error: { code: 'BAD_REQUEST', message: 'Cuerpo inválido' } },
      { status: 400 },
    )
  }

  const parsed = CreateSchema.safeParse(body)
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

  const {
    requester_name, head_count,
    origin_label, origin_lat, origin_lng,
    dest_label, dest_lat, dest_lng,
  } = parsed.data
  const createdBy = parseInt(guard.session.sub, 10)

  try {
    const result = await pool.query(
      `INSERT INTO transport_requests
         (requester_name, head_count,
          origin_label, origin_lat, origin_lng,
          dest_label, dest_lat, dest_lng,
          created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       RETURNING id, requester_name, head_count,
                 origin_label, origin_lat, origin_lng,
                 dest_label, dest_lat, dest_lng,
                 distance_km, status, created_at`,
      [requester_name, head_count,
       origin_label, origin_lat, origin_lng,
       dest_label, dest_lat, dest_lng,
       createdBy],
    )
    console.info(`[requests:POST] id=${result.rows[0].id} user_id=${createdBy}`)
    return NextResponse.json({ request: result.rows[0] }, { status: 201 })
  } catch (err) {
    console.error('[requests:POST]', err)
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Error interno del servidor' } },
      { status: 500 },
    )
  }
}
