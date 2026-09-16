import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import EmbedApp from './embed/EmbedApp';
import { isEmbedded } from './embed/embedBridge';
import './index.css';

// /?embed=1 inside the Chrome extension's iframe renders only the dialer panel.
const Root = isEmbedded() ? EmbedApp : App;

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>,
);
