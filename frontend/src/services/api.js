import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || '/api';
const LOGIN_PATH = `${import.meta.env.BASE_URL}login`.replace(/\/{2,}/g, '/');

/** In-memory access token (not localStorage) — backs up httpOnly cookies on cross-origin deploys. */
let memoryAccessToken = null;

export function clearMemoryAccessToken() {
  memoryAccessToken = null;
}

export function setMemoryAccessToken(token) {
  memoryAccessToken = token || null;
}

const api = axios.create({
  baseURL: API_URL,
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config) => {
  if (memoryAccessToken) {
    config.headers.Authorization = `Bearer ${memoryAccessToken}`;
  }
  return config;
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
  (response) => {
    const token = response?.data?.data?.accessToken;
    if (token) memoryAccessToken = token;
    return response;
  },
  async (error) => {
    const originalRequest = error.config;
    const status = error.response?.status;

    if (status === 429) {
      return Promise.reject(error);
    }

    if (status === 401 && originalRequest && !originalRequest._retry) {
      if (isAuthEndpoint(originalRequest.url)) {
        clearMemoryAccessToken();
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
        const { data } = await axios.post(`${API_URL}/auth/refresh`, {}, { withCredentials: true });
        if (data?.data?.accessToken) memoryAccessToken = data.data.accessToken;
        processQueue(null);
        return api(originalRequest);
      } catch (refreshError) {
        processQueue(refreshError);
        clearMemoryAccessToken();
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
