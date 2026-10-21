import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { Gallery } from './chars/Gallery';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>{location.hash === '#gallery' ? <Gallery /> : <App />}</React.StrictMode>,
);
