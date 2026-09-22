import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { ErrorBoundary } from './components/common/ErrorBoundary';
import './styles/global.scss';

const container = document.getElementById('root');

if (!container) {
  throw new Error(
    'The root element is missing from index.html, so the workbench cannot be mounted. ' +
      'Restore the div with id="root" in src/renderer/index.html.'
  );
}

createRoot(container).render(
  <StrictMode>
    <ErrorBoundary region="workbench">
      <App />
    </ErrorBoundary>
  </StrictMode>
);
