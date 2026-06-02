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
    ' ╠═╣ ╠╦╝ ╠═  ║║║ ╠═╣ ',
    ' ╩ ╩ ╩╚═ ╚═╝ ╝╚╝ ╩ ╩ ',
  ].join('\n'),
  'color: #E63946; font-family: monospace; font-size: 16px; font-weight: bold;'
)
console.log(
  '%c AI Rivalry Exhibition of Neural Agents',
  'color: #F0F4F8; font-size: 11px; font-weight: bold; letter-spacing: 2px;'
)
console.log(
  '%c Where AI pundits yell, audiences meddle, and nobody learns anything.',
  'color: #3B9AE1; font-size: 11px; font-style: italic;'
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
