import { app, shell, BrowserWindow, ipcMain } from 'electron';
import { join } from 'path';
import { electronApp, optimizer, is } from '@electron-toolkit/utils';
// import icon from '../../resources/icon.png?asset';
import icon from '../../resources/logo_selltkey_red.png?asset';
import axios from 'axios';
import { browserService, collectionService, sourcingService } from './services';

function createWindow(): void {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 1100,
    show: false,
    autoHideMenuBar: true,
    titleBarStyle: 'hidden',
    icon: icon,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
    },
  });

  mainWindow.on('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url);
    return { action: 'deny' };
  });

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL']);
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
  }
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  // Set app user model id for windows
  electronApp.setAppUserModelId('com.electron');

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window);
  });

  // IPC test
  ipcMain.on('ping', () => console.log('pong'));

  // 로그인 API
  ipcMain.handle('login', async (_, userId: string, password: string) => {
    try {
      const response = await axios.request({
        url: 'https://selltkey.com/scb/api/getLoginInfo.asp',
        method: 'POST',
        data: {
          userid: userId,
          userpwd: password,
          version: '1.0.0',
        },
      });
      return response.data;
    } catch (error) {
      console.error('Main process API 호출 오류:', error);
      throw error;
    }
  });

  // 저장된 로그인 정보 가져오기
  ipcMain.handle('get-saved-credentials', async () => {
    try {
      const userDataPath = app.getPath('userData');
      const { readFileSync, existsSync } = await import('fs');
      const { join } = await import('path');
      const credentialsPath = join(userDataPath, 'credentials.json');

      if (existsSync(credentialsPath)) {
        const data = readFileSync(credentialsPath, 'utf8');
        return JSON.parse(data);
      }
      return null;
    } catch (error) {
      console.error('저장된 인증 정보 읽기 오류:', error);
      return null;
    }
  });

  // 로그인 정보 저장
  ipcMain.handle('save-credentials', async (_, credentials) => {
    try {
      const userDataPath = app.getPath('userData');
      const { writeFileSync } = await import('fs');
      const { join } = await import('path');
      const credentialsPath = join(userDataPath, 'credentials.json');

      writeFileSync(credentialsPath, JSON.stringify(credentials, null, 2));
      return true;
    } catch (error) {
      console.error('인증 정보 저장 오류:', error);
      return false;
    }
  });

  // 로그인 정보 삭제
  ipcMain.handle('clear-credentials', async () => {
    try {
      const userDataPath = app.getPath('userData');
      const { unlinkSync, existsSync } = await import('fs');
      const { join } = await import('path');
      const credentialsPath = join(userDataPath, 'credentials.json');

      if (existsSync(credentialsPath)) {
        unlinkSync(credentialsPath);
      }
      return true;
    } catch (error) {
      console.error('인증 정보 삭제 오류:', error);
      return false;
    }
  });

  // 수집 시작
  ipcMain.handle('start-collection', async (_, usernum: string) => {
    try {
      console.log('수집 시작 요청 받음:', usernum);
      const result = await collectionService.startCollection(usernum);
      return result;
    } catch (error) {
      console.error('수집 시작 오류:', error);
      return { success: false, message: '수집 시작에 실패했습니다.' };
    }
  });

  // 수집 중지
  ipcMain.handle('stop-collection', async () => {
    try {
      console.log('수집 중지 요청 받음');
      const result = await collectionService.stopCollection();
      return result;
    } catch (error) {
      console.error('수집 중지 오류:', error);
      return { success: false, message: '수집 중지에 실패했습니다.' };
    }
  });

  // 수집 진행상황 조회
  ipcMain.handle('get-collection-progress', async () => {
    try {
      return collectionService.getProgress();
    } catch (error) {
      console.error('수집 진행상황 조회 오류:', error);
      return {
        isRunning: false,
        usernum: null,
        current: 0,
        total: 0,
        currentStore: '',
        status: '오류 발생',
        waitTime: undefined,
        progress: '오류 발생',
      };
    }
  });

  // 네이버 로그인 상태 확인
  ipcMain.handle('check-naver-login-status', async () => {
    try {
      console.log('네이버 로그인 상태 확인 요청');
      const isLoggedIn = await browserService.checkNaverLoginStatus();
      return isLoggedIn;
    } catch (error) {
      console.error('네이버 로그인 상태 확인 오류:', error);
      return false;
    }
  });

  // 네이버 로그인 페이지 열기
  ipcMain.handle('open-naver-login-page', async () => {
    try {
      console.log('네이버 로그인 페이지 열기 요청');
      await browserService.openNaverLoginPage();
      return { success: true, message: '네이버 로그인 페이지가 열렸습니다.' };
    } catch (error) {
      console.error('네이버 로그인 페이지 열기 오류:', error);
      return { success: false, message: '네이버 로그인 페이지를 열 수 없습니다.' };
    }
  });

  // 키워드 가져오기
  ipcMain.handle('fetch-keywords', async (_, userNum: string) => {
    try {
      console.log('키워드 가져오기 요청:', userNum);
      const response = await axios.get(`https://selltkey.com/scb/api/getRecommandKeyword.asp?usernum=${userNum}`);
      const keywords = response.data.result.split(',');

      return {
        result: true,
        payload: keywords,
      };
    } catch (error) {
      console.error('키워드 가져오기 실패:', error);
      return {
        result: false,
        message: error.message,
        payload: [],
      };
    }
  });

  // 소싱 시작
  ipcMain.handle('start-sourcing', async (_, config) => {
    try {
      console.log('소싱 시작 요청 받음:', config);
      const result = await sourcingService.startSourcing(config);
      return result;
    } catch (error) {
      console.error('소싱 시작 오류:', error);
      return { success: false, message: '소싱 시작에 실패했습니다.' };
    }
  });

  // 소싱 중지
  ipcMain.handle('stop-sourcing', async () => {
    try {
      console.log('소싱 중지 요청 받음');
      const result = await sourcingService.stopSourcing();
      return result;
    } catch (error) {
      console.error('소싱 중지 오류:', error);
      return { success: false, message: '소싱 중지에 실패했습니다.' };
    }
  });

  // 소싱 진행상황 조회
  ipcMain.handle('get-sourcing-progress', async () => {
    try {
      return sourcingService.getProgress();
    } catch (error) {
      console.error('소싱 진행상황 조회 오류:', error);
      return {
        isRunning: false,
        config: null,
        progress: '오류 발생',
      };
    }
  });

  // 캡챠 상태 관리
  let isWaitingForCaptcha = false;

  ipcMain.handle('set-captcha-waiting', async (_, waiting: boolean) => {
    isWaitingForCaptcha = waiting;
    console.log('[IPC] 캡챠 대기 상태 변경:', waiting);
    return { success: true };
  });

  ipcMain.handle('get-captcha-waiting', async () => {
    return isWaitingForCaptcha;
  });

  // 상품 데이터 전송 (CORS 우회용)
  ipcMain.handle('send-product-data', async (_, requestData) => {
    try {
      console.log('[IPC] 상품 데이터 전송 요청:', requestData);

      const url = 'https://selltkey.com/scb/api/setSearchResultDirect.asp';
      const response = await axios.post(url, requestData);

      console.log('[IPC] 상품 데이터 전송 결과:', response.data);
      return response.data;
    } catch (error) {
      console.error('[IPC] 상품 데이터 전송 오류:', error);
      return { success: false, message: '데이터 전송 중 오류 발생' };
    }
  });

  createWindow();

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// 앱 종료 시 백그라운드 작업들 정리
app.on('before-quit', async () => {
  console.log('[App] 앱 종료 전 백그라운드 작업 정리 중...');

  try {
    // 수집 작업 중지
    if (collectionService.isCollectionRunning()) {
      console.log('[App] 수집 작업 중지 중...');
      await collectionService.stopCollection();
    }

    // 소싱 작업 중지
    const sourcingProgress = sourcingService.getProgress();
    if (sourcingProgress.isRunning) {
      console.log('[App] 소싱 작업 중지 중...');
      await sourcingService.stopSourcing();
    }

    // 브라우저 서비스 정리
    console.log('[App] 브라우저 서비스 정리 중...');
    await browserService.cleanup();

    console.log('[App] 모든 백그라운드 작업 정리 완료');
  } catch (error) {
    console.error('[App] 백그라운드 작업 정리 중 오류:', error);
  }
});

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.
