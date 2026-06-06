import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import NavBar from '@/app/components/NavBar'
import SettingsClient from './SettingsClient'

export default async function SettingsPage() {
  const session = await getSession()
  if (!session) redirect('/login')

  return (
    <div className="min-h-screen bg-gray-50">
      <NavBar />
      <main className="max-w-2xl mx-auto px-6 py-8">
        <SettingsClient />
      </main>
    </div>
  )
}
