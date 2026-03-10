import { useTheme } from '../components/ThemeContext'
import { useApp } from '../contexts/AppContext'
import { DarkModeToggle } from '../components/Nav/DarkModeToggle'
import { Logo } from '../components/Logo'

export function AuthLayout({ children }) {
  const { t, dark, setDark } = useTheme()
  const { navigate } = useApp()

  return (
    <div className="max-w-3xl mx-auto px-6">
      <nav className={`flex items-center justify-between h-14 border-b ${t.border}`}>
        <button onClick={() => navigate('home')} className="flex items-center gap-2 font-semibold hover:opacity-70 transition">
          <Logo className="w-6 h-6" />
          <span>BasicBen</span>
        </button>
        <DarkModeToggle dark={dark} setDark={setDark} />
      </nav>
      <main className="py-8 flex items-center justify-center min-h-[calc(100vh-3.5rem)]">
        {children}
      </main>
    </div>
  )
}
