import { getSession } from '@/lib/auth'
import NavBar from '@/app/components/NavBar'

export default async function Home() {
  const session = await getSession()

  return (
    <div className="min-h-screen bg-gray-50">
      <NavBar />
      <main className="max-w-5xl mx-auto px-4 py-10">
        <h1 className="text-2xl font-bold text-gray-900">Panel principal</h1>
        <p className="mt-1 text-gray-500 text-sm">
          Bienvenido/a, <strong>{session?.username}</strong>
          {' · '}
          <span className="capitalize">{session?.role}</span>
        </p>
      </main>
    </div>
  )
}
