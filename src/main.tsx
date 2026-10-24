import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import { registerSW } from 'virtual:pwa-register';
import { App } from './App';
import { startDb } from './db/bootstrap';
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

// After first paint: open the database and create the first gym if needed.
// Storage can be unavailable (e.g. some private modes); the shell still works.
startDb().catch((err: unknown) => console.warn('AnyGym storage unavailable', err));
