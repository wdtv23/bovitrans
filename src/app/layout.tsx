import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'BoviTrans',
  description: 'Plataforma logística para transporte de ganado vacuno',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  )
}
