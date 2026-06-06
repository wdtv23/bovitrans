import Link from 'next/link'
import { getSession } from '@/lib/auth'
import LogoutButton from './LogoutButton'

export default async function NavBar() {
  const session = await getSession()

  return (
    <nav className="bg-white border-b border-gray-100 px-6 py-3 flex items-center justify-between">
      <div className="flex items-center gap-6">
        <Link href="/" className="font-bold text-gray-900 hover:text-blue-600 transition-colors">
          BoviTrans
        </Link>
        <Link href="/trucks" className="text-sm text-gray-600 hover:text-gray-900 transition-colors">
          Flota
        </Link>
        <Link href="/requests" className="text-sm text-gray-600 hover:text-gray-900 transition-colors">
          Solicitudes
        </Link>
        <Link href="/settings" className="text-sm text-gray-600 hover:text-gray-900 transition-colors">
          Configuración
        </Link>
        {session?.role === 'admin' && (
          <Link href="/users" className="text-sm text-gray-600 hover:text-gray-900 transition-colors">
            Usuarios
          </Link>
        )}
      </div>
      <div className="flex items-center gap-3 text-sm">
        <span className="text-gray-400">{session?.username}</span>
        <span className="text-gray-200 select-none">|</span>
        <LogoutButton />
      </div>
    </nav>
  )
}
