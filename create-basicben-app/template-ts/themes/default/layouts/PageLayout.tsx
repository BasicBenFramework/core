import React from 'react'
import type { Page } from '../../../../src/types'

interface PageLayoutProps {
  page: Page
  siteName?: string
}

export default function PageLayout({
  page,
  siteName = 'My Blog'
}: PageLayoutProps) {
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
        <div className="theme-container theme-content">
          <article className="theme-page">
            <header className="theme-post-header">
              <h1 className="theme-post-title">{page.title}</h1>
            </header>

            {page.content && (
              <div
                className="theme-post-content"
                dangerouslySetInnerHTML={{ __html: page.content }}
              />
            )}
          </article>
        </div>
      </main>

      {/* Footer */}
      <footer className="theme-footer">
        <div className="theme-container">
          <p>&copy; {new Date().getFullYear()} {siteName}. All rights reserved.</p>
        </div>
      </footer>
    </div>
  )
}
