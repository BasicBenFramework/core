import { useTheme } from '../components/ThemeContext'
import { useApp } from '../contexts/AppContext'

function SidebarLink({ onClick, active, children }) {
  const { t } = useTheme()
  return (
    <button
      onClick={onClick}
      className={`block w-full text-left px-3 py-2 rounded-lg text-sm transition ${
        active ? `${t.card} font-medium` : `${t.muted} hover:opacity-70`
      }`}
    >
      {children}
    </button>
  )
}

export function DocsLayout({ children }) {
  const { t } = useTheme()
  const { navigate, viewData } = useApp()

  return (
    <div className="flex gap-8">
      <aside className="hidden md:block w-48 flex-shrink-0">
        <nav className="sticky top-20 space-y-1">
          <SidebarLink onClick={() => navigate('gettingStarted')} active={viewData === 'gettingStarted'}>
            Getting Started
          </SidebarLink>
          <SidebarLink onClick={() => navigate('database')} active={viewData === 'database'}>
            Database
          </SidebarLink>
        </nav>
      </aside>
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  )
}
