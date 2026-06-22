const configuredApiBaseUrl = import.meta.env.VITE_API_BASE_URL;

export const API_BASE_URL = configuredApiBaseUrl || (import.meta.env.DEV ? 'http://localhost:4000/api' : '');

export const endpoints = {
  register: '/auth/register',
  signup: '/auth/signup',
  login: '/auth/login',
  refresh: '/auth/refresh',
  linkTelegram: '/auth/link-telegram',
  linkWhatsapp: '/auth/link-whatsapp',
  unlinkTelegram: '/auth/unlink-telegram',
  unlinkWhatsapp: '/auth/unlink-whatsapp',
  dashboard: '/dashboard',
  dashboardConfig: '/dashboard/config',
  dashboardBudgets: '/dashboard/budgets',
  googleDriveStatus: '/google-drive/status',
  googleDriveConnectUrl: '/google-drive/connect-url',
  organizationsTeam: '/organizations/team',
  organizationsRegenerateJoinCode: '/organizations/team/join-code/regenerate',
  organizationsTeamMembers: '/organizations/team/members',
  organizationsSettings: '/organizations',
  insights: '/insights',
  transactions: '/transactions',
  transactionsSearch: '/transactions/search',
  transactionsGoogleSheets: '/transactions/google-sheets',
  performance: '/performance',
  ragAnswer: '/rag/answer'
};
