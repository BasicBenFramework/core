import { createContext } from 'react'

export const RouterContext = createContext(null)
export const AuthContext = createContext(null)

/** The page's useHead() override, held by createClientApp. Internal. */
export const HeadContext = createContext(null)
