import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { ErrorBoundary } from './components/ErrorBoundary'
import { AuthProvider } from './contexts/AuthContext'

// Console branding
console.log(
  '%c' + [
    ' ╔═╗ ╦═╗ ╔═╗ ╔╗╔ ╔═╗ ',
    ' ╠═╣ ╠╦╝ ╠═╣ ║║║ ╠═╣ ',
    ' ╩ ╩ ╩╚═ ╩ ╩ ╝╚╝ ╩ ╩ ',
  ].join('\n'),
  'color: #E63946; font-family: monospace; font-size: 14px; font-weight: bold;'
)
console.log(
  '%cWhere AI pundits yell, audiences meddle, and nobody learns anything.',
  'color: #3B9AE1; font-size: 12px; font-style: italic;'
)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <AuthProvider>
        <App />
      </AuthProvider>
    </ErrorBoundary>
  </StrictMode>,
)
