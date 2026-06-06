import { NextResponse } from 'next/server'
import pool from '@/lib/db'

export async function GET() {
  try {
    const result = await pool.query<{ now: string }>('SELECT now()')
    return NextResponse.json({ status: 'ok', db_time: result.rows[0].now })
  } catch (err) {
    console.error('[health] db error', err)
    return NextResponse.json(
      { error: { code: 'DB_UNAVAILABLE', message: 'Base de datos no disponible' } },
      { status: 500 },
    )
  }
}
