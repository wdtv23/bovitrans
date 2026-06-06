import { getSession } from '@/lib/auth'
import { redirect } from 'next/navigation'
import NavBar from '@/app/components/NavBar'
import TrucksClient from './TrucksClient'

export default async function TrucksPage() {
  const session = await getSession()
  if (!session) redirect('/login')

  return (
    <div className="min-h-screen bg-gray-50">
      <NavBar />
      <TrucksClient />
    </div>
  )
}
