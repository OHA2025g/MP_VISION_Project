import axios from 'axios';

// Empty REACT_APP_BACKEND_URL → same-origin `/api` (nginx should proxy to FastAPI). Avoids CORS when UI and API share one hostname.
const rawBase = (process.env.REACT_APP_BACKEND_URL || '').trim().replace(/\/$/, '');
const api = axios.create({
  baseURL: rawBase ? `${rawBase}/api` : '/api',
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' }
});

export default api;
