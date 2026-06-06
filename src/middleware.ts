import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { jwtVerify } from 'jose'
import { COOKIE_NAME } from '@/lib/auth'

// La verificación de JWT corre en el Edge Runtime (sin acceso a pg).
// jose es edge-compatible; por eso el secreto se codifica aquí en lugar
// de importarlo desde auth.ts para evitar que el bundler tire del import
// de 'next/headers' (que no es edge-safe).
function secret() {
  return new TextEncoder().encode(
    process.env.AUTH_SECRET ?? 'change-me-in-production',
  )
}

const PUBLIC = ['/login', '/api/auth/login', '/api/auth/logout']

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Rutas públicas: pasar sin verificar
  if (PUBLIC.some((p) => pathname === p || pathname.startsWith(p + '/'))) {
    // Si ya tiene sesión válida y visita /login → redirigir al panel
    if (pathname.startsWith('/login')) {
      const token = request.cookies.get(COOKIE_NAME)?.value
      if (token) {
        try {
          await jwtVerify(token, secret())
          return NextResponse.redirect(new URL('/', request.url))
        } catch {
          // Token inválido o expirado: mostrar login normalmente
        }
      }
    }
    return NextResponse.next()
  }

  const token = request.cookies.get(COOKIE_NAME)?.value

  if (!token) {
    return unauthenticated(request)
  }

  try {
    await jwtVerify(token, secret())
    return NextResponse.next()
  } catch {
    return unauthenticated(request)
  }
}

function unauthenticated(request: NextRequest) {
  const { pathname } = request.nextUrl
  if (pathname.startsWith('/api/')) {
    return NextResponse.json(
      { error: { code: 'UNAUTHORIZED', message: 'No autenticado' } },
      { status: 401 },
    )
  }
  return NextResponse.redirect(new URL('/login', request.url))
}

export const config = {
  // Excluir archivos estáticos de Next.js y favicon
  matcher: ['/((?!_next/static|_next/image|favicon\\.ico).*)'],
}
