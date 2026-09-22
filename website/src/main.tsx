import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App } from './App';

import './styles/base.css';
import './styles/components.css';
import './styles/demo.css';
import './styles/motion.css';
import './styles/pages.css';

const container = document.getElementById('root');

if (!container) {
  throw new Error('The #root element is missing from index.html, so the site cannot be mounted.');
}

createRoot(container).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>
);
