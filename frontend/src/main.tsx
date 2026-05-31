import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import { initWallet } from './wallet.ts'
import './index.css'
 
initWallet().then(() => {
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  )
})
