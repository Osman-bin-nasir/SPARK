import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { Analytics } from '@vercel/analytics/react';
import './index.css';
import App from './App.jsx';
import ErrorBoundary from './components/error-boundary';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <ErrorBoundary><App /></ErrorBoundary>
      <Analytics />
    </BrowserRouter>
  </StrictMode>
);
