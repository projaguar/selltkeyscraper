/**
 * Puppeteer 브라우저 관리 서비스
 * 여러 서비스에서 공통으로 사용하는 브라우저 인스턴스 관리
 */

import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { Browser, Page } from 'puppeteer';
import { execSync } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';

export interface BrowserConfig {
  headless?: boolean;
  width?: number;
  height?: number;
  userDataDir?: string;
}

export class BrowserService {
  private static instance: BrowserService;
  private browser: Browser | null = null;
  private currentPage: Page | null = null;
  private isInitialized: boolean = false;
  private isInitializing: boolean = false; // 초기화 중인지 확인
  private readonly pageBrandStyleId = '__selltkeyscraper_brand__';
  private readonly pageBrandCss = `
@keyframes selltkeyscraper-brand-pulse {
  0% {
    opacity: 0.35;
    box-shadow: inset 0 0 8px rgba(220, 53, 69, 0.4);
  }
  50% {
    opacity: 1;
    box-shadow: inset 0 0 18px rgba(220, 53, 69, 0.75);
  }
  100% {
    opacity: 0.35;
    box-shadow: inset 0 0 8px rgba(220, 53, 69, 0.4);
  }
}

html::after {
  content: "";
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  pointer-events: none;
  border: 4px solid rgba(220, 53, 69, 0.9);
  box-shadow: inset 0 0 12px rgba(220, 53, 69, 0.6);
  z-index: 2147483647;
  animation: selltkeyscraper-brand-pulse 2.8s ease-in-out infinite;
}
`;

  private constructor() {
    // 싱글톤 패턴을 위한 private 생성자
    // Stealth 플러그인 적용
    puppeteer.use(StealthPlugin());
    console.log('[BrowserService] Stealth 플러그인 적용된 Puppeteer 모드로 초기화');
  }

  /**
   * 싱글톤 인스턴스 반환
   */
  static getInstance(): BrowserService {
    if (!BrowserService.instance) {
      BrowserService.instance = new BrowserService();
    }
    return BrowserService.instance;
  }

  /**
   * Windows에서 Chrome 브라우저 경로 찾기
   */
  private findChromePath(): string | null {
    const platform = process.platform;

    if (platform === 'win32') {
      const possiblePaths = [
        // 일반적인 Chrome 설치 경로들
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
        path.join(process.env.LOCALAPPDATA || '', 'Google\\Chrome\\Application\\chrome.exe'),
        path.join(process.env.PROGRAMFILES || '', 'Google\\Chrome\\Application\\chrome.exe'),
        path.join(process.env['PROGRAMFILES(X86)'] || '', 'Google\\Chrome\\Application\\chrome.exe'),
      ];

      // 각 경로를 확인하여 존재하는 Chrome 실행 파일 찾기
      for (const chromePath of possiblePaths) {
        if (fs.existsSync(chromePath)) {
          console.log('[BrowserService] Chrome 경로 발견:', chromePath);
          return chromePath;
        }
      }

      // 레지스트리에서 Chrome 경로 찾기 (Windows)
      try {
        const regQuery =
          'reg query "HKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths\\chrome.exe" /ve';
        const result = execSync(regQuery, { encoding: 'utf8', timeout: 5000 });
        const match = result.match(/REG_SZ\s+(.+)/);
        if (match && match[1]) {
          const chromePath = match[1].trim();
          if (fs.existsSync(chromePath)) {
            console.log('[BrowserService] 레지스트리에서 Chrome 경로 발견:', chromePath);
            return chromePath;
          }
        }
      } catch (error) {
        console.log('[BrowserService] 레지스트리에서 Chrome 경로를 찾을 수 없습니다:', error);
      }

      console.warn('[BrowserService] Windows에서 Chrome을 찾을 수 없습니다. 기본 경로를 사용합니다.');
      return null;
    }

    return null; // Windows가 아닌 경우 기본 경로 사용
  }

  /**
   * 브라우저 초기화
   * @param config 브라우저 설정
   */
  async initializeBrowser(config: BrowserConfig = {}): Promise<void> {
    try {
      // 이미 초기화되어 있으면 재사용
      if (this.isInitialized && this.browser) {
        console.log('[BrowserService] 브라우저가 이미 초기화되어 있습니다. 재사용합니다.');
        return;
      }

      // 이미 초기화 중이면 대기
      if (this.isInitializing) {
        console.log('[BrowserService] 브라우저 초기화 중입니다. 대기합니다...');
        // 초기화 완료까지 대기
        while (this.isInitializing) {
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
        return;
      }

      this.isInitializing = true;
      console.log('[BrowserService] 브라우저 초기화 시작... (이전 상태:', this.isInitialized, ')');

      const defaultConfig = {
        headless: false, // 반드시 false로 설정
        width: 1366, // 일반적인 데스크톱 해상도
        height: 768,
        userDataDir: undefined,
        ...config,
      };

      // headless가 true로 설정되어 있으면 강제로 false로 변경
      if (defaultConfig.headless) {
        console.log('[BrowserService] headless 모드가 감지되어 강제로 false로 변경합니다.');
        defaultConfig.headless = false;
      }

      // Windows에서 Chrome 경로 찾기
      const chromePath = this.findChromePath();
      const launchOptions: any = {
        headless: defaultConfig.headless,
        args: [
          // 최소한의 봇 감지 우회 설정만 사용
          '--disable-blink-features=AutomationControlled',
          '--exclude-switches=enable-automation',

          // 일반적인 브라우저 설정
          `--window-size=${defaultConfig.width},${defaultConfig.height}`,
          '--lang=ko-KR',
          '--accept-lang=ko-KR,ko,en-US,en',

          // 안정성을 위한 최소 설정
          '--disable-dev-shm-usage',
          '--no-sandbox',
          '--disable-setuid-sandbox',

          // 네트워크 안정성 향상
          '--disable-background-timer-throttling',
          '--disable-backgrounding-occluded-windows',
          '--disable-renderer-backgrounding',
          '--no-first-run',
          '--no-default-browser-check',

          // 추가 설정들
          '--disable-web-security',
          '--disable-features=VizDisplayCompositor',
          '--disable-extensions',
          '--disable-plugins',
          '--disable-default-apps',
          '--disable-sync',
          '--disable-translate',
          '--safebrowsing-disable-auto-update',
          '--disable-client-side-phishing-detection',
          '--disable-component-update',
          '--disable-domain-reliability',
          '--disable-features=AudioServiceOutOfProcess',
          '--disable-hang-monitor',
          '--disable-prompt-on-repost',
          '--disable-background-networking',
          '--disable-breakpad',
          '--disable-component-extensions-with-background-pages',
          '--disable-features=TranslateUI,BlinkGenPropertyTrees',
          '--disable-ipc-flooding-protection',
          '--disable-sync',
          '--force-color-profile=srgb',
          '--metrics-recording-only',
          '--password-store=basic',
          '--use-mock-keychain',
          '--window-size=1200,800',
        ],
        userDataDir: defaultConfig.userDataDir,
        defaultViewport: null,
        ignoreDefaultArgs: ['--enable-automation'],
        // 한글 로케일 설정
        env: {
          ...process.env,
          LANG: 'ko_KR.UTF-8',
          LC_ALL: 'ko_KR.UTF-8',
          LC_CTYPE: 'ko_KR.UTF-8',
        },
      };

      // Windows에서 Chrome 경로가 발견되면 사용
      if (chromePath) {
        launchOptions.executablePath = chromePath;
        console.log('[BrowserService] Chrome 실행 경로 설정:', chromePath);
      } else {
        console.log('[BrowserService] 기본 Chrome 경로 사용');
      }

      console.log('[BrowserService] 브라우저 실행 옵션:', {
        headless: launchOptions.headless,
        args: launchOptions.args,
        executablePath: launchOptions.executablePath,
      });

      this.browser = await puppeteer.launch(launchOptions);
      const initialPages = await this.browser.pages();
      await Promise.all(initialPages.map((page) => this.applyPageBranding(page)));

      this.isInitialized = true;
      console.log('[BrowserService] 브라우저 초기화 완료');
    } catch (error) {
      console.error('[BrowserService] 브라우저 초기화 오류:', error);

      // Windows에서 Chrome을 찾을 수 없는 경우 특별한 에러 메시지
      if (process.platform === 'win32') {
        const chromePath = this.findChromePath();
        if (!chromePath) {
          throw new Error(
            'Windows에서 Chrome 브라우저를 찾을 수 없습니다. Chrome을 설치하거나 올바른 경로에 있는지 확인해주세요.',
          );
        }
      }

      throw new Error(`브라우저 초기화에 실패했습니다: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      this.isInitializing = false; // 락 해제
    }
  }

  /**
   * 새 페이지 생성 (빈 탭 우선 재사용)
   * @returns Page 인스턴스
   */
  async createPage(): Promise<Page> {
    if (!this.browser) {
      throw new Error('브라우저가 초기화되지 않았습니다.');
    }

    // 기존 빈 탭이 있는지 확인
    const pages = await this.browser.pages();
    const emptyPage = pages.find((page) => {
      const url = page.url();
      return url === 'about:blank' || url === '' || url.includes('about:blank');
    });

    if (emptyPage) {
      console.log('[BrowserService] 기존 빈 탭을 재사용합니다.');
      await this.applyPageBranding(emptyPage);
      return emptyPage;
    }

    // 빈 탭이 없으면 새로 생성
    const page = await this.browser.newPage();

    // 최소한의 설정만 적용
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    );

    await page.setExtraHTTPHeaders({
      'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.8',
    });

    // 핵심적인 봇 감지 우회만 적용
    await page.evaluateOnNewDocument(() => {
      // navigator.webdriver 제거 (가장 중요!)
      Object.defineProperty(navigator, 'webdriver', {
        get: () => undefined,
      });

      // Chrome 자동화 감지 플래그 제거
      const cdcProps = Object.keys(window).filter((key) => key.startsWith('cdc_'));
      cdcProps.forEach((prop) => delete (window as any)[prop]);
    });

    await page.setDefaultNavigationTimeout(30000);
    await this.applyPageBranding(page);

    return page;
  }

  /**
   * 현재 페이지 설정
   * @param page 설정할 페이지
   */
  setCurrentPage(page: Page): void {
    this.currentPage = page;
  }

  /**
   * 현재 페이지 반환
   * @returns 현재 페이지 또는 null
   */
  getCurrentPage(): Page | null {
    return this.currentPage;
  }

  /**
   * 현재 페이지가 유효한지 확인
   * @returns 페이지 유효성
   */
  isCurrentPageValid(): boolean {
    return this.currentPage !== null && !this.currentPage.isClosed();
  }

  /**
   * 네이버 로그인 상태 확인
   * @returns 로그인 여부
   */
  async checkNaverLoginStatus(): Promise<boolean> {
    try {
      if (!this.browser) {
        return false;
      }

      // 현재 페이지가 유효하면 재사용, 없으면 새로 생성
      let page = this.currentPage;
      if (!this.isCurrentPageValid()) {
        page = await this.createPage();
        this.setCurrentPage(page);
        await page.goto('https://www.naver.com', {
          waitUntil: 'domcontentloaded',
          timeout: 10000,
        });
      } else {
        // 기존 페이지에서 네이버로 이동 (새로고침 없이 현재 상태만 확인)
        try {
          const currentUrl = page.url();
          if (!currentUrl.includes('naver.com')) {
            // 네이버가 아니면 네이버로 이동
            await page.goto('https://www.naver.com', {
              waitUntil: 'domcontentloaded',
              timeout: 10000,
            });
          } else {
            // 이미 네이버에 있으면 새로고침하지 않고 현재 상태만 확인
            console.log('[BrowserService] 네이버 페이지 상태 확인 중 (새로고침 없음)');
          }
        } catch {
          // 페이지 접근 오류 시 새로 생성
          console.log('[BrowserService] 페이지 접근 오류, 새 페이지 생성');
          page = await this.createPage();
          this.setCurrentPage(page);
          await page.goto('https://www.naver.com', {
            waitUntil: 'domcontentloaded',
            timeout: 10000,
          });
        }
      }

      // 네이버 로그인 상태 확인 - 다중 조건 체크
      const isLoggedIn = await this.detectNaverLoginStatus(page);

      return isLoggedIn;
    } catch (error) {
      console.error('[BrowserService] 네이버 로그인 상태 확인 오류:', error);
      return false;
    }
  }

  /**
   * 네이버 로그인 상태 감지 (다중 조건 체크)
   * @param page 페이지 인스턴스
   * @returns 로그인 여부
   */
  private async detectNaverLoginStatus(page: any): Promise<boolean> {
    try {
      // 1. URL 체크 - 로그인 페이지가 아니어야 함
      const currentUrl = page.url();
      if (currentUrl.includes('nid.naver.com/nidlogin.login')) {
        return false;
      }

      // 2. 쿠키 체크 - NID_SES 쿠키가 있어야 함
      const cookies = await page.cookies();
      const hasNidSession = cookies.some((cookie: any) => cookie.name === 'NID_SES');

      if (!hasNidSession) {
        return false;
      }

      // 3. HTML 요소 체크 - 로그인 폼이 없어야 함 (submit 방지)
      const hasLoginForm = await page.evaluate(() => {
        const form = document.querySelector('form#frmNIDLogin');
        if (form) {
          // 폼이 있으면 submit 이벤트 방지 (더 강력하게)
          const preventSubmit = (e: Event) => {
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();
            return false;
          };

          // 모든 submit 이벤트 방지
          form.addEventListener('submit', preventSubmit, true);
          form.addEventListener('submit', preventSubmit, false);

          // 폼의 모든 버튼 클릭도 방지
          const buttons = form.querySelectorAll('button, input[type="submit"]');
          buttons.forEach((button) => {
            button.addEventListener('click', preventSubmit, true);
          });

          return true;
        }
        return false;
      });
      if (hasLoginForm) {
        return false;
      }

      // 4. 사용자 정보 표시 요소 체크 (선택적)
      const hasUserInfo = (await page.$('.MyView-module__link_login___HpHMW')) !== null;

      // 5. 페이지 제목 체크 - "NAVER"이어야 함
      const pageTitle = await page.title();
      const isNaverMainPage = pageTitle === 'NAVER';

      console.log('[BrowserService] 로그인 상태 체크:', {
        url: currentUrl,
        hasNidSession,
        hasLoginForm,
        hasUserInfo,
        isNaverMainPage,
      });

      // 최종 판단: URL이 네이버 메인이고, NID 세션이 있고, 로그인 폼이 없으면 로그인됨
      return isNaverMainPage && hasNidSession && !hasLoginForm;
    } catch (error) {
      console.error('[BrowserService] 로그인 상태 감지 오류:', error);
      return false;
    }
  }

  /**
   * 네이버 로그인 페이지로 이동 (단순화)
   * @returns Page 인스턴스
   */
  async openNaverLoginPage(): Promise<Page> {
    try {
      // 브라우저가 이미 초기화되어 있으면 재사용
      if (!this.browser) {
        await this.initializeBrowser();
      }

      // 현재 페이지가 유효하면 재사용, 없으면 새로 생성
      let page = this.currentPage;
      if (!this.isCurrentPageValid()) {
        page = await this.createPage();
        this.setCurrentPage(page);
      }

      // 네이버 메인 페이지로 이동 (로그인 상태 체크 없이)
      console.log('[BrowserService] 네이버 메인 페이지로 이동...');

      try {
        await page.goto('https://www.naver.com', {
          waitUntil: 'domcontentloaded',
          timeout: 30000, // 타임아웃 30초로 증가
        });

        // 페이지 로딩 완료 대기
        await new Promise((resolve) => setTimeout(resolve, 2000));

        console.log('[BrowserService] 네이버 메인 페이지 로딩 완료');
      } catch (error) {
        console.error('[BrowserService] 네이버 페이지 이동 실패:', error);
        throw new Error('네이버 페이지로 이동할 수 없습니다. 네트워크 연결을 확인해주세요.');
      }

      // 잠시 대기 후 로그인 버튼 클릭 시도
      console.log('[BrowserService] 로그인 버튼 클릭 시도...');
      await this.clickNaverLoginButton(page);

      console.log('[BrowserService] 네이버 로그인 페이지 열기 완료');

      return page;
    } catch (error) {
      console.error('[BrowserService] 네이버 로그인 페이지 열기 오류:', error);
      throw new Error('네이버 로그인 페이지를 열 수 없습니다.');
    }
  }

  /**
   * 네이버 로그인 버튼 클릭
   * @param page 페이지 인스턴스
   */
  private async clickNaverLoginButton(page: any): Promise<void> {
    try {
      // 2초 대기 (페이지 로딩 완료 대기)
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // 로그인 버튼 찾기 (여러 선택자 시도)
      const loginSelectors = [
        '.MyView-module__link_login___HpHMW', // 네이버 로그인 버튼 클래스 (우측 상단 초록색)
        'a[href*="nid.naver.com/nidlogin.login"]', // 로그인 링크
        '.btn_login', // 네이버로그인 버튼
        'a[href*="login"]', // 로그인 관련 링크
      ];

      for (const selector of loginSelectors) {
        try {
          const element = await page.$(selector);
          if (element) {
            console.log(`[BrowserService] 로그인 버튼 발견: ${selector}`);
            await element.click();
            console.log('[BrowserService] 로그인 버튼 클릭 완료');

            // 로그인 페이지 로딩 대기
            await new Promise((resolve) => setTimeout(resolve, 3000));

            // 단순하게 아이디 입력창에 포커스만 설정
            try {
              await page.evaluate(() => {
                const idInput = document.querySelector('#id') as HTMLInputElement;
                if (idInput) {
                  idInput.focus();
                  console.log('[BrowserService] 아이디 입력창 포커스 설정 완료');
                }
              });
            } catch (focusError) {
              console.log('[BrowserService] 아이디 입력창 포커스 설정 실패:', focusError.message);
            }

            return;
          }
        } catch {
          // 해당 선택자로 찾지 못함, 다음 선택자 시도
          continue;
        }
      }

      console.log('[BrowserService] 로그인 버튼을 찾을 수 없습니다. 수동으로 로그인해주세요.');
    } catch (error) {
      console.error('[BrowserService] 로그인 버튼 클릭 오류:', error);
    }
  }

  /**
   * 브라우저 정리
   */
  async cleanupBrowser(): Promise<void> {
    try {
      if (this.currentPage) {
        await this.currentPage.close();
        this.currentPage = null;
      }

      if (this.browser) {
        await this.browser.close();
        this.browser = null;
      }

      this.isInitialized = false;
      console.log('[BrowserService] 브라우저 정리 완료');
    } catch (error) {
      console.error('[BrowserService] 브라우저 정리 오류:', error);
    }
  }

  /**
   * 브라우저 정리 (앱 종료용)
   */
  async cleanup(): Promise<void> {
    await this.cleanupBrowser();
  }

  /**
   * 브라우저 인스턴스 반환
   * @returns 브라우저 인스턴스 또는 null
   */
  getBrowser(): Browser | null {
    return this.browser;
  }

  /**
   * 브라우저 상태 확인
   * @returns 브라우저 초기화 여부
   */
  isBrowserReady(): boolean {
    return this.isInitialized && this.browser !== null;
  }

  /**
   * 서비스 시작 전 브라우저 준비 (탭 정리, URL 이동, 로그인 체크)
   * @returns 준비 결과
   */
  async prepareForService(): Promise<{ success: boolean; message: string }> {
    try {
      console.log('[BrowserService] 서비스 준비 시작');

      if (!this.isBrowserReady()) {
        return { success: false, message: '브라우저가 준비되지 않았습니다.' };
      }

      // 1. 브라우저 탭 정리
      const browser = this.getBrowser();
      const pages = await browser!.pages();
      console.log(`[BrowserService] 현재 열린 탭 개수: ${pages.length}개`);

      let currentPage;
      if (pages.length >= 2) {
        // 2개 이상이면 첫 번째 탭으로 전환하고 나머지 탭 닫기
        currentPage = pages[0];
        await currentPage.bringToFront();
        this.setCurrentPage(currentPage);
        await this.applyPageBranding(currentPage);
        console.log(`[BrowserService] 첫 번째 탭으로 전환: ${currentPage.url()}`);

        // 나머지 탭들 닫기
        for (let i = 1; i < pages.length; i++) {
          try {
            await pages[i].close();
            console.log(`[BrowserService] 탭 ${i + 1} 닫기 완료`);
          } catch (error) {
            console.warn(`[BrowserService] 탭 ${i + 1} 닫기 실패:`, error);
          }
        }
      } else if (pages.length === 1) {
        // 1개면 그대로 사용
        currentPage = pages[0];
        this.setCurrentPage(currentPage);
        await this.applyPageBranding(currentPage);
        console.log(`[BrowserService] 기존 페이지 사용: ${currentPage.url()}`);
      } else {
        return { success: false, message: '사용 가능한 페이지가 없습니다.' };
      }

      // 2. www.naver.com으로 이동
      const currentUrl = currentPage.url();
      console.log(`[BrowserService] 현재 URL: ${currentUrl}`);

      if (!currentUrl.startsWith('https://www.naver.com')) {
        console.log('[BrowserService] www.naver.com으로 이동');
        await currentPage.goto('https://www.naver.com', {
          waitUntil: 'domcontentloaded',
          timeout: 30000,
        });
        await new Promise((resolve) => setTimeout(resolve, 1000));
        console.log('[BrowserService] www.naver.com 이동 완료');
      } else {
        console.log('[BrowserService] 이미 www.naver.com에 있음');
      }

      // 3. 봇 디텍션 데이터 정리
      console.log('[BrowserService] 봇 디텍션 데이터 정리 시작');
      try {
        const { AntiDetectionUtils } = await import('../utils/antiDetectionUtils');
        await AntiDetectionUtils.cleanupBotDetectionData(currentPage);
        console.log('[BrowserService] 봇 디텍션 데이터 정리 완료');
      } catch (error) {
        console.error('[BrowserService] 봇 디텍션 데이터 정리 중 오류:', error);
        // 오류가 발생해도 계속 진행
      }

      // 4. 네이버 로그인 상태 확인
      console.log('[BrowserService] 네이버 로그인 상태 확인');
      const isNaverLoggedIn = await this.checkNaverLoginStatus();
      if (!isNaverLoggedIn) {
        return { success: false, message: '네이버 로그인이 필요합니다. 먼저 네이버에 로그인해주세요.' };
      }
      console.log('[BrowserService] 네이버 로그인 상태 확인 완료');

      console.log('[BrowserService] 서비스 준비 완료');
      return { success: true, message: '서비스 준비 완료' };
    } catch (error) {
      console.error('[BrowserService] 서비스 준비 오류:', error);
      return { success: false, message: '서비스 준비 중 오류 발생' };
    }
  }

  private async applyPageBranding(page: Page): Promise<void> {
    const styleId = this.pageBrandStyleId;
    const cssContent = this.pageBrandCss.replace(/`/g, '\\`');
    const injectScript = `
      (() => {
        const styleId = '${styleId}';
        const css = \`${cssContent}\`;
        const ensureStyle = () => {
          if (document.getElementById(styleId)) {
            return;
          }
          const style = document.createElement('style');
          style.id = styleId;
          style.textContent = css;
          const target = document.head || document.documentElement;
          if (target) {
            target.appendChild(style);
          } else {
            document.addEventListener('DOMContentLoaded', () => {
              const laterTarget = document.head || document.documentElement;
              if (laterTarget && !document.getElementById(styleId)) {
                laterTarget.appendChild(style);
              }
            }, { once: true });
          }
        };
        if (document.readyState === 'loading') {
          document.addEventListener('DOMContentLoaded', ensureStyle, { once: true });
        } else {
          ensureStyle();
        }
      })();
    `;
    await page.evaluateOnNewDocument(injectScript);
    try {
      await page.evaluate(injectScript);
    } catch {
      // 페이지 상태에 따라 즉시 실행이 실패할 수 있음 (about:blank 등)
    }
  }
}

// 싱글톤 인스턴스 export
export const browserService = BrowserService.getInstance();
