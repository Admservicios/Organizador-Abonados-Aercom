import { ServerGate } from './components/ServerGate';
import { isServerMode } from './lib/serverClient';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { createBrowserRouter, createHashRouter, RouterProvider } from 'react-router-dom';
import { UnsavedChangesProvider } from './components/UnsavedChanges';
import App from './app/App';
import './styles.css';
import { startOfflineApp } from './lib/offlineApp';

if (!isServerMode()) startOfflineApp();

const createRouter = import.meta.env.PROD ? createHashRouter : createBrowserRouter;
const router = createRouter([
  {
    path: '*',
    element: (
      <ServerGate>
        <UnsavedChangesProvider>
          <App />
        </UnsavedChangesProvider>
      </ServerGate>
    ),
  },
]);
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>,
);
