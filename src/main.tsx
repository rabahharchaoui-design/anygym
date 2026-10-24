import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import { registerSW } from 'virtual:pwa-register';
import { App } from './App';
import './styles/tokens.css';
import './styles/base.css';

// iOS Safari only applies :active styles when a touch listener exists.
document.addEventListener('touchstart', () => {}, { passive: true });

registerSW({ immediate: true });

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root');

createRoot(root).render(
  <StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </StrictMode>,
);
