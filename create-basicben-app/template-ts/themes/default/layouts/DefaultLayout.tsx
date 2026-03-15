import React from 'react'

interface DefaultLayoutProps {
  children: React.ReactNode
  siteName?: string
  siteDescription?: string
}

export default function DefaultLayout({
  children,
  siteName = 'My Blog',
  siteDescription = ''
}: DefaultLayoutProps) {
  return (
    <div className="theme-layout">
      {/* Header */}
      <header className="theme-header">
        <div className="theme-header-inner">
          <a href="/" className="theme-logo">
            {siteName}
          </a>
          <nav>
            <ul className="theme-nav">
              <li><a href="/">Home</a></li>
              <li><a href="/blog">Blog</a></li>
              <li><a href="/about">About</a></li>
            </ul>
          </nav>
        </div>
      </header>

      {/* Main Content */}
      <main className="theme-main">
        <div className="theme-container">
          {children}
        </div>
      </main>

      {/* Footer */}
      <footer className="theme-footer">
        <div className="theme-container">
          <p>&copy; {new Date().getFullYear()} {siteName}. All rights reserved.</p>
          {siteDescription && <p className="theme-text-muted">{siteDescription}</p>}
        </div>
      </footer>
    </div>
  )
}
