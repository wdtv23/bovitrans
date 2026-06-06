import { NextResponse } from 'next/server'
import { z } from 'zod'
import pool from '@/lib/db'
import { requireAuth } from '@/lib/api-guard'

const FUEL_KEY = 'fuel_price_per_liter'

const UpdateSchema = z.object({
  value: z
    .number({ invalid_type_error: 'Debe ser un número' })
    .positive('El precio debe ser mayor a 0'),
})

type SettingRow = { value: string; updated_at: string }

export async function GET() {
  const guard = await requireAuth()
  if (!guard.ok) return guard.response

  try {
    const result = await pool.query<SettingRow>(
      'SELECT value, updated_at FROM settings WHERE key = $1',
      [FUEL_KEY],
    )
    const row = result.rows[0]
    if (!row) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'Parámetro no encontrado' } },
        { status: 404 },
      )
    }
    return NextResponse.json({
      key: FUEL_KEY,
      value: Number(row.value),
      updated_at: row.updated_at,
    })
  } catch (err) {
    console.error('[settings/fuel-price:GET]', err)
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Error interno del servidor' } },
      { status: 500 },
    )
  }
}

export async function PUT(request: Request) {
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

  const parsed = UpdateSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: {
          code: 'VALIDATION_ERROR',
          message: parsed.error.errors[0]?.message ?? 'Valor inválido',
        },
      },
      { status: 400 },
    )
  }

  const newValue = parsed.data.value

  try {
    const result = await pool.query<SettingRow>(
      `INSERT INTO settings (key, value, updated_at)
       VALUES ($1, $2, now())
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()
       RETURNING value, updated_at`,
      [FUEL_KEY, String(newValue)],
    )
    console.info(`[settings/fuel-price:PUT] nuevo valor=${newValue} user_id=${guard.session.sub}`)
    return NextResponse.json({
      key: FUEL_KEY,
      value: Number(result.rows[0].value),
      updated_at: result.rows[0].updated_at,
    })
  } catch (err) {
    console.error('[settings/fuel-price:PUT]', err)
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Error interno del servidor' } },
      { status: 500 },
    )
  }
}
