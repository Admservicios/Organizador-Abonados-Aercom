import { ServerGate } from './components/ServerGate';
import { isServerMode } from './lib/serverClient';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, HashRouter } from 'react-router-dom';
import App from './app/App';
import './styles.css';
import { startOfflineApp } from './lib/offlineApp';

if (!isServerMode()) startOfflineApp();

const Router = import.meta.env.PROD ? HashRouter : BrowserRouter;
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Router>
      <ServerGate>
        <App />
      </ServerGate>
    </Router>
  </React.StrictMode>,
);
