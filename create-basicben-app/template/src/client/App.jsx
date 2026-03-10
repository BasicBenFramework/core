import { createClientApp } from '@basicbenframework/core/client'
import { AppLayout } from './layouts/AppLayout'
import { AuthLayout } from './layouts/AuthLayout'
import { DocsLayout } from './layouts/DocsLayout'
import { Home } from './pages/Home'
import { Auth } from './pages/Auth'
import { Feed } from './pages/Feed'
import { FeedPost } from './pages/FeedPost'
import { Posts } from './pages/Posts'
import { PostForm } from './pages/PostForm'
import { Profile } from './pages/Profile'
import { GettingStarted } from './pages/GettingStarted'
import { Database } from './pages/Database'
import { Routing } from './pages/Routing'
import { Authentication } from './pages/Authentication'
import { Validation } from './pages/Validation'
import { Testing } from './pages/Testing'

export default createClientApp({
  layout: AppLayout,
  routes: {
    '/': Home,
    '/login': { component: Auth, layout: AuthLayout, guest: true },
    '/register': { component: Auth, layout: AuthLayout, guest: true },
    '/feed': Feed,
    '/feed/:id': FeedPost,
    '/posts': { component: Posts, auth: true },
    '/posts/new': { component: PostForm, auth: true },
    '/posts/:id/edit': { component: PostForm, auth: true },
    '/profile': { component: Profile, auth: true },
    '/docs': { component: GettingStarted, layout: DocsLayout },
    '/docs/routing': { component: Routing, layout: DocsLayout },
    '/docs/database': { component: Database, layout: DocsLayout },
    '/docs/authentication': { component: Authentication, layout: DocsLayout },
    '/docs/validation': { component: Validation, layout: DocsLayout },
    '/docs/testing': { component: Testing, layout: DocsLayout },
  }
})
