import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || '/api';
const LOGIN_PATH = `${import.meta.env.BASE_URL}login`.replace(/\/{2,}/g, '/');

const api = axios.create({
  baseURL: API_URL,
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
});

let isRefreshing = false;
let failedQueue = [];

const processQueue = (error) => {
  failedQueue.forEach((prom) => {
    if (error) prom.reject(error);
    else prom.resolve();
  });
  failedQueue = [];
};

const isAuthEndpoint = (url = '') => url.includes('/auth/login') || url.includes('/auth/refresh');

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    const status = error.response?.status;

    if (status === 429) {
      return Promise.reject(error);
    }

    if (status === 401 && originalRequest && !originalRequest._retry) {
      if (isAuthEndpoint(originalRequest.url)) {
        if (!window.location.pathname.includes('/login')) {
          window.location.href = LOGIN_PATH;
        }
        return Promise.reject(error);
      }

      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        }).then(() => api(originalRequest));
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        await axios.post(`${API_URL}/auth/refresh`, {}, { withCredentials: true });
        processQueue(null);
        return api(originalRequest);
      } catch (refreshError) {
        processQueue(refreshError);
        if (refreshError.response?.status === 401) {
          if (!window.location.pathname.includes('/login')) {
            window.location.href = LOGIN_PATH;
          }
        }
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  }
);

export default api;
