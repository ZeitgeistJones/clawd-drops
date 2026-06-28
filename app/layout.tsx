import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Clawd Drops',
  description: 'AI video pipeline. One goal. Frame-perfect drop.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, padding: 0, background: '#0a0a0f' }}>
        {children}
      </body>
    </html>
  )
}
