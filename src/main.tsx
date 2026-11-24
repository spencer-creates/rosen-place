import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { navConfig } from './nav/config'
import { validateNavConfig } from './nav/model'

validateNavConfig(navConfig)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
