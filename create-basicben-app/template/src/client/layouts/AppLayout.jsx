import { useState } from 'react'
import { useTheme } from '../components/ThemeContext'
import { useApp } from '../contexts/AppContext'
import { DesktopNav } from '../components/Nav/DesktopNav'
import { MobileNav } from '../components/Nav/MobileNav'
import { DarkModeToggle } from '../components/Nav/DarkModeToggle'

export function AppLayout({ children }) {
  const { t, dark, setDark } = useTheme()
  const { user, navigate, logout } = useApp()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  return (
    <div className="max-w-3xl mx-auto px-6">
      <nav className={`flex items-center justify-between h-14 border-b ${t.border}`}>
        <button onClick={() => navigate('home')} className="font-semibold hover:opacity-70 transition">BasicBen</button>
        <DesktopNav user={user} navigate={navigate} logout={logout} />

        {/* Mobile Navigation Trigger */}
        <div className="flex sm:hidden items-center gap-2">
          <DarkModeToggle dark={dark} setDark={setDark} />
          <button
            onClick={() => setMobileMenuOpen(true)}
            className={`p-2 rounded-lg ${t.card} transition`}
            aria-label="Open menu"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
        </div>
      </nav>

      <main className="py-8">{children}</main>

      {mobileMenuOpen && (
        <MobileNav
          user={user}
          navigate={navigate}
          onClose={() => setMobileMenuOpen(false)}
          logout={logout}
        />
      )}
    </div>
  )
}
