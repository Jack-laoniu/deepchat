import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { Gallery } from './chars/Gallery';
import './index.css';
import { AppGuard } from './ui/RoundGuard';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AppGuard>{location.hash === '#gallery' ? <Gallery /> : <App />}</AppGuard>
  </React.StrictMode>,
);
