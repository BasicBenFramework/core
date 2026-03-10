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
  const { navigate, view } = useApp()

  const docLinks = [
    { view: 'gettingStarted', label: 'Getting Started' },
    { view: 'routing', label: 'Routing' },
    { view: 'database', label: 'Database' },
    { view: 'authentication', label: 'Authentication' },
    { view: 'validation', label: 'Validation' },
    { view: 'testing', label: 'Testing' },
  ]

  return (
    <div className="flex gap-8">
      <aside className="hidden md:block w-48 flex-shrink-0">
        <nav className="sticky top-20 space-y-1">
          {docLinks.map(link => (
            <SidebarLink
              key={link.view}
              onClick={() => navigate(link.view)}
              active={view === link.view}
            >
              {link.label}
            </SidebarLink>
          ))}
        </nav>
      </aside>
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  )
}
