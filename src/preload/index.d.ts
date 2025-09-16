import { ElectronAPI } from '@electron-toolkit/preload';

interface LoginResponse {
  result: boolean;
  usernum: string;
  msg: string;
}

interface CollectionResponse {
  success: boolean;
  message: string;
}

interface KeywordData {
  keyword: string;
  searchVolume: number;
  competition: string;
  trend: string;
}

interface Api {
  login: (userId: string, password: string) => Promise<LoginResponse>;
  getSavedCredentials: () => Promise<{
    email: string;
    password: string;
    rememberMe: boolean;
  } | null>;
  saveCredentials: (credentials: { email: string; password: string; rememberMe: boolean }) => Promise<boolean>;
  clearCredentials: () => Promise<boolean>;
  startCollection: (usernum: string) => Promise<CollectionResponse>;
  stopCollection: () => Promise<CollectionResponse>;
  getCollectionProgress: () => Promise<{
    isRunning: boolean;
    usernum: string | null;
    current: number;
    total: number;
    currentStore: string;
    status: string;
    waitTime?: number;
    progress: string;
  }>;
  checkNaverLoginStatus: () => Promise<boolean>;
  openNaverLoginPage: () => Promise<{ success: boolean; message: string }>;
  fetchKeywords: (userNum: string) => Promise<{ result: boolean; payload: string[]; message?: string }>;
}

declare global {
  interface Window {
    electron: ElectronAPI;
    api: Api;
  }
}
