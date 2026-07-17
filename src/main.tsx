import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import './index.css'
import App from './App.tsx'

// Installs the workbox service worker so the precached app shell and assets
// are available with no network — without this call, vite-plugin-pwa still
// builds sw.js/manifest but nothing ever registers it, so "Add to Home
// Screen" behaves like a plain bookmark (network required every launch).
registerSW({ immediate: true })

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
