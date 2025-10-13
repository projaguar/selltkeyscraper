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

interface SourcingConfig {
  minAmount: string;
  maxAmount: string;
  keywords: string;
  includeNaver: boolean;
  includeAuction: boolean;
  includeBest: boolean;
  includeNew: boolean;
}

interface SourcingResponse {
  success: boolean;
  message: string;
  data?: any;
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
  startSourcing: (config: SourcingConfig) => Promise<SourcingResponse>;
  stopSourcing: () => Promise<SourcingResponse>;
  getSourcingProgress: () => Promise<{
    isRunning: boolean;
    config: SourcingConfig | null;
    progress: string;
    status: string;
    currentKeyword: string;
    currentKeywordIndex: number;
    totalKeywords: number;
    logs: string[];
  }>;
}

declare global {
  interface Window {
    electron: ElectronAPI;
    api: Api;
  }
}
