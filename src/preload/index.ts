import { contextBridge, ipcRenderer } from 'electron';
import { electronAPI } from '@electron-toolkit/preload';

// Custom APIs for renderer
const api = {
  login: (userId: string, password: string) => ipcRenderer.invoke('login', userId, password),
  getSavedCredentials: () => ipcRenderer.invoke('get-saved-credentials'),
  saveCredentials: (credentials: { email: string; password: string; rememberMe: boolean }) =>
    ipcRenderer.invoke('save-credentials', credentials),
  clearCredentials: () => ipcRenderer.invoke('clear-credentials'),
  startCollection: (usernum: string) => ipcRenderer.invoke('start-collection', usernum),
  stopCollection: () => ipcRenderer.invoke('stop-collection'),
  getCollectionProgress: () => ipcRenderer.invoke('get-collection-progress'),
  checkNaverLoginStatus: () => ipcRenderer.invoke('check-naver-login-status'),
  openNaverLoginPage: () => ipcRenderer.invoke('open-naver-login-page'),
  fetchKeywords: (userNum: string) => ipcRenderer.invoke('fetch-keywords', userNum),
};

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI);
    contextBridge.exposeInMainWorld('api', api);
  } catch (error) {
    console.error(error);
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI;
  // @ts-ignore (define in dts)
  window.api = api;
}
