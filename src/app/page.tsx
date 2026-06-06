import Link from 'next/link'
import { getSession } from '@/lib/auth'
import LogoutButton from '@/app/components/LogoutButton'

export default async function Home() {
  const session = await getSession()

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Barra de navegación */}
      <nav className="bg-white border-b border-gray-100 px-6 py-3 flex items-center justify-between">
        <span className="font-bold text-gray-900">BoviTrans</span>
        <div className="flex items-center gap-4 text-sm">
          {session?.role === 'admin' && (
            <Link href="/users" className="text-blue-600 hover:text-blue-700 font-medium transition-colors">
              Usuarios
            </Link>
          )}
          <span className="text-gray-400">|</span>
          <span className="text-gray-500">{session?.username}</span>
          <LogoutButton />
        </div>
      </nav>

      {/* Contenido principal */}
      <main className="max-w-4xl mx-auto px-4 py-10">
        <h1 className="text-2xl font-bold text-gray-900">Panel principal</h1>
        <p className="mt-1 text-gray-500 text-sm">
          Bienvenido/a, <strong>{session?.username}</strong>
          {' '}·{' '}
          <span className="capitalize">{session?.role}</span>
        </p>
      </main>
    </div>
  )
}
