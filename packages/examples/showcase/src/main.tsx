import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';

const loading = document.getElementById('loading');
if (loading) loading.style.display = 'none';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
