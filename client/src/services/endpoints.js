const configuredApiBaseUrl = import.meta.env.VITE_API_BASE_URL;

export const API_BASE_URL = configuredApiBaseUrl || (import.meta.env.DEV ? 'http://localhost:4000/api' : '');

export const endpoints = {
  register: '/auth/register',
  signup: '/auth/signup',
  login: '/auth/login',
  linkTelegram: '/auth/link-telegram'
};
