import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import { App } from './App';
import { startDb } from './db/bootstrap';
import { restoreMirrors } from './lib/durable';
import { DRAFTS_KEY, hydrateDrafts } from './lib/drafts';
import { REST_KEY, hydrateRest } from './lib/rest';
import { EXTRA_SETS_KEY, hydrateExtraSets } from './lib/extraSets';
import { registerAppUpdates } from './pwa';
import { AppErrorBoundary } from './components/AppErrorBoundary';
import { StartupError } from './components/StartupError';
import { installReporting } from './lib/reporting/capture';
import './styles/tokens.css';
import './styles/base.css';
import './styles/transitions.css';

// iOS Safari only applies :active styles when a touch listener exists.
document.addEventListener('touchstart', () => {}, { passive: true });

// SPEC 24: crash capture and the report queue, before anything else can fail.
installReporting();

registerAppUpdates();

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root');
const mount = root;

// Live workout state written just before an app kill is put back first (lib/durable.ts), so
// nothing reads a stale draft or rest timer. If localStorage still refuses them, they are taken
// straight from IndexedDB (PLAN 1.7i, 1.7k). If that read fails, localStorage may hold older values
// than IndexedDB: the app is not shown (nothing obsolete is ever presented as current); a plain
// error with Try again reads it again (PLAN 1.7k).
const hydrators = {
  [DRAFTS_KEY]: (v: string | null) => hydrateDrafts(v),
  [REST_KEY]: (v: string | null) => hydrateRest(v),
  [EXTRA_SETS_KEY]: (v: string | null) => hydrateExtraSets(v),
};
const reactRoot = createRoot(mount);
const showApp = () =>
  reactRoot.render(
    <StrictMode>
      <AppErrorBoundary>
        <HashRouter>
          <App />
        </HashRouter>
      </AppErrorBoundary>
    </StrictMode>,
  );
const restore = () => restoreMirrors(undefined, undefined, hydrators).then(showApp);
void restore().catch(() => reactRoot.render(<StartupError onRetry={restore} />));

// After first paint: open the database and create the first gym if needed.
// Storage can be unavailable (e.g. some private modes); the shell still works.
startDb().catch((err: unknown) => console.warn('AnyGym storage unavailable', err));
