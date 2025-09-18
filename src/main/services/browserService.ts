/**
 * Puppeteer 브라우저 관리 서비스
 * 여러 서비스에서 공통으로 사용하는 브라우저 인스턴스 관리
 */

import puppeteer, { Browser, Page } from 'puppeteer';
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

  private constructor() {
    // 싱글톤 패턴을 위한 private 생성자
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
        headless: false,
        width: 1366, // 일반적인 데스크톱 해상도
        height: 768,
        userDataDir: undefined,
        ...config,
      };

      // Windows에서 Chrome 경로 찾기
      const chromePath = this.findChromePath();
      const launchOptions: any = {
        headless: defaultConfig.headless,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--no-zygote',
          '--disable-gpu',
          `--window-size=${defaultConfig.width},${defaultConfig.height}`,
          '--disable-web-security',
          '--disable-features=VizDisplayCompositor',
          '--start-maximized', // 브라우저를 최대화된 상태로 시작
          '--disable-blink-features=AutomationControlled', // 자동화 감지 방지
          '--disable-extensions-except', // 확장 프로그램 비활성화
          '--disable-plugins-discovery', // 플러그인 자동 감지 비활성화
        ],
        userDataDir: defaultConfig.userDataDir,
        defaultViewport: null, // 기본 뷰포트 설정 비활성화
      };

      // Windows에서 Chrome 경로가 발견되면 사용
      if (chromePath) {
        launchOptions.executablePath = chromePath;
        console.log('[BrowserService] Chrome 실행 경로 설정:', chromePath);
      } else {
        console.log('[BrowserService] 기본 Chrome 경로 사용');
      }

      this.browser = await puppeteer.launch(launchOptions);

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
      return emptyPage;
    }

    // 빈 탭이 없으면 새로 생성
    const page = await this.browser.newPage();

    // 일반적인 브라우저처럼 보이도록 User-Agent 설정
    await page.setUserAgent(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    );

    // 뷰포트를 고정하지 않고 브라우저 기본 크기 사용
    await page.setDefaultNavigationTimeout(30000);

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
        } catch (_error) {
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
      await page.goto('https://www.naver.com', {
        waitUntil: 'domcontentloaded',
        timeout: 10000,
      });

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
        } catch (_error) {
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
}

// 싱글톤 인스턴스 export
export const browserService = BrowserService.getInstance();
