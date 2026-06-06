import { NextResponse } from 'next/server'
import { z } from 'zod'
import pool from '@/lib/db'
import { requireAuth } from '@/lib/api-guard'

const CreateSchema = z.object({
  plate: z
    .string()
    .min(1, 'Requerida')
    .max(20, 'Máximo 20 caracteres')
    .transform((s) => s.trim().toUpperCase()),
  capacity: z
    .number({ invalid_type_error: 'Debe ser un número' })
    .int('Debe ser entero')
    .positive('Debe ser mayor a 0'),
  consumption_l_per_km: z
    .number({ invalid_type_error: 'Debe ser un número' })
    .positive('Debe ser mayor a 0'),
})

export async function GET(request: Request) {
  const guard = await requireAuth()
  if (!guard.ok) return guard.response

  const { searchParams } = new URL(request.url)
  const statusFilter = searchParams.get('status')

  const values: unknown[] = []
  let where = ''

  if (statusFilter === 'active' || statusFilter === 'inactive') {
    where = 'WHERE t.status = $1'
    values.push(statusFilter)
  }

  try {
    const result = await pool.query(
      `SELECT t.id, t.plate, t.capacity, t.consumption_l_per_km,
              t.status, t.created_at, u.username AS created_by_username
       FROM trucks t
       JOIN users u ON t.created_by = u.id
       ${where}
       ORDER BY t.created_at DESC`,
      values,
    )
    return NextResponse.json({ trucks: result.rows })
  } catch (err) {
    console.error('[trucks:GET]', err)
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

  const { plate, capacity, consumption_l_per_km } = parsed.data
  const createdBy = parseInt(guard.session.sub, 10)

  try {
    const result = await pool.query(
      `INSERT INTO trucks (plate, capacity, consumption_l_per_km, created_by)
       VALUES ($1, $2, $3, $4)
       RETURNING id, plate, capacity, consumption_l_per_km, status, created_at`,
      [plate, capacity, consumption_l_per_km, createdBy],
    )
    console.info(`[trucks:POST] plate="${plate}" user_id=${createdBy}`)
    return NextResponse.json({ truck: result.rows[0] }, { status: 201 })
  } catch (err) {
    if (err && typeof err === 'object' && 'code' in err && err.code === '23505') {
      return NextResponse.json(
        { error: { code: 'CONFLICT', message: 'Ya existe un camión con esa patente' } },
        { status: 409 },
      )
    }
    console.error('[trucks:POST]', err)
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Error interno del servidor' } },
      { status: 500 },
    )
  }
}
