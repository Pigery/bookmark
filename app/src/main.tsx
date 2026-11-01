import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App';

const box = document.getElementById('root');
if (box) {
  createRoot(box).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
