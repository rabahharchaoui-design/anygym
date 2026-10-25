import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import { App } from './App';
import { startDb } from './db/bootstrap';
import { restoreMirrors } from './lib/durable';
import { DRAFTS_KEY, hydrateDrafts } from './lib/drafts';
import { registerAppUpdates } from './pwa';
import './styles/tokens.css';
import './styles/base.css';
import './styles/transitions.css';

// iOS Safari only applies :active styles when a touch listener exists.
document.addEventListener('touchstart', () => {}, { passive: true });

registerAppUpdates();

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root');
const mount = root;

// Live workout state written just before an app kill is put back first (lib/durable.ts), so
// nothing reads a stale draft or rest timer. If localStorage still refuses them, the drafts are
// taken straight from IndexedDB (PLAN 1.7i). Without storage the shell still starts.
void restoreMirrors(undefined, undefined, { [DRAFTS_KEY]: (v) => hydrateDrafts(v) })
  .catch(() => [])
  .then(() =>
    createRoot(mount).render(
      <StrictMode>
        <HashRouter>
          <App />
        </HashRouter>
      </StrictMode>,
    ),
  );

// After first paint: open the database and create the first gym if needed.
// Storage can be unavailable (e.g. some private modes); the shell still works.
startDb().catch((err: unknown) => console.warn('AnyGym storage unavailable', err));
