import React, { lazy, Suspense } from 'react';
import ReactDOM from 'react-dom/client';
import { isEmbedded } from './embed/embedBridge';
import './index.css';

// /?embed=1 inside the Chrome extension's iframe renders only the dialer panel.
// Loaded lazily so the embed never loads the standalone app's code, which includes the Telnyx
// WebRTC SDK: in embed mode the extension's offscreen document owns the mic and all call audio.
const Root = isEmbedded() ? lazy(() => import('./embed/EmbedApp')) : lazy(() => import('./App'));

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Suspense fallback={null}>
      <Root />
    </Suspense>
  </React.StrictMode>,
);
