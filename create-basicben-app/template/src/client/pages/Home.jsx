import { useTheme } from '../components/ThemeContext'
import { Card } from '../components/Card'
import { Button } from '../components/Button'
import { Avatar } from '../components/Avatar'

export function Home({ user, navigate }) {
  const { t } = useTheme()

  return (
    <div className="space-y-12 py-8">
      <section className="text-center">
        <p className={`text-xs ${t.subtle} mb-3 tracking-wide uppercase`}>Now in beta</p>
        <h1 className="text-4xl sm:text-5xl font-bold tracking-tight mb-3">
          Build faster with <span className="underline decoration-2 underline-offset-4">BasicBen</span>
        </h1>
        <p className={`${t.muted} max-w-md mx-auto mb-6`}>Full-stack React framework. Minimal dependencies.</p>
        <div className="flex flex-col items-center gap-4">
          <div className={`px-4 py-3 rounded-lg ${t.card} border ${t.border} font-mono text-sm`}>
            <span className={t.muted}>$</span> npx create-basicben-app my-app
          </div>
          <Button onClick={() => navigate('gettingStarted')}>Getting Started</Button>
        </div>
      </section>

      <section className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {[['⚡', 'Vite', 'Fast builds'], ['🔐', 'Auth', 'JWT ready'], ['🗄️', 'Database', 'SQL built-in'], ['🪶', 'Tiny', '3.7k lines']].map(([icon, title, desc]) => (
          <Card key={title} className="hover:border-opacity-50">
            <span className="text-lg">{icon}</span>
            <p className="font-medium text-sm mt-2">{title}</p>
            <p className={`text-xs ${t.subtle} mt-0.5`}>{desc}</p>
          </Card>
        ))}
      </section>

      {user && (
        <Card>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Avatar name={user.name} />
              <div>
                <p className="font-medium text-sm">{user.name}</p>
                <p className={`text-xs ${t.subtle}`}>{user.email}</p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => navigate('posts')} className="text-xs px-3 py-1.5">My Posts</Button>
              <Button variant="secondary" onClick={() => navigate('profile')} className="text-xs px-3 py-1.5">Profile</Button>
            </div>
          </div>
        </Card>
      )}

      <p className={`text-center text-xs ${t.subtle}`}>BasicBen v0.1.0</p>
    </div>
  )
}
