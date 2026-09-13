import axios from 'axios';
import { logClientError } from '../utils/logger.js';

const api = axios.create({ baseURL: '/api' });

// Attach JWT from localStorage to every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Normalise error messages from the backend's { success, error: { message, details } }
api.interceptors.response.use(
  (res) => res,
  (err) => {
    const data = err.response?.data;
    const message = data?.error?.message || err.message || 'Request failed';
    const details = data?.error?.details;
    const reqId = data?.error?.reqId;
    const status = err.response?.status;

    // Log server (5xx) and network errors centrally; skip routine 4xx (validation,
    // auth) which are expected and already surfaced to the user.
    if (!status || status >= 500) {
      logClientError(`API error: ${message}`, {
        context: { url: err.config?.url, method: err.config?.method, status, reqId },
      });
    }

    // Auto-logout on 401 (expired/invalid token)
    if (status === 401 && localStorage.getItem('token')) {
      localStorage.removeItem('token');
      if (!window.location.pathname.endsWith('/login')) window.location.href = '/login';
    }
    return Promise.reject({ message, details, status, reqId });
  }
);

export default api;
