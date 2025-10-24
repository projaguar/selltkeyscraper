/**
 * 크롤링 감지 회피 유틸리티
 * 네이버 및 기타 사이트의 크롤링 감지를 우회하기 위한 다양한 기법들을 제공
 */

import { Page } from 'puppeteer';

export interface AntiDetectionConfig {
  enableCookieCleanup: boolean;
  enableSessionCleanup: boolean;
  enableLocalStorageCleanup: boolean;
  enableRandomDelay: boolean;
  enableUserAgentRotation: boolean;
  enableMouseMovement: boolean;
  enableScrollSimulation: boolean;
  minDelay: number;
  maxDelay: number;
}

export class AntiDetectionUtils {
  private static defaultConfig: AntiDetectionConfig = {
    enableCookieCleanup: true,
    enableSessionCleanup: true,
    enableLocalStorageCleanup: true,
    enableRandomDelay: true,
    enableUserAgentRotation: true,
    enableMouseMovement: true,
    enableScrollSimulation: true,
    minDelay: 1000,
    maxDelay: 3000,
  };

  /**
   * 자연스러운 딜레이 (사람의 행동 패턴 시뮬레이션)
   */
  static async naturalDelay(minMs: number = 1000, maxMs: number = 3000): Promise<void> {
    const delay = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
    console.log(`[AntiDetection] 자연스러운 딜레이: ${delay}ms`);
    await new Promise((resolve) => setTimeout(resolve, delay));
  }

  /**
   * 랜덤 User-Agent 생성
   */
  static getRandomUserAgent(): string {
    const userAgents = [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:121.0) Gecko/20100101 Firefox/121.0',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Edge/120.0.0.0',
    ];

    return userAgents[Math.floor(Math.random() * userAgents.length)];
  }

  /**
   * 쿠키 정리 (크롤링 감지 방지, 로그인 쿠키는 보존)
   */
  static async cleanupCookies(page: Page, domain?: string): Promise<void> {
    try {
      console.log('[AntiDetection] 쿠키 정리 시작 (로그인 쿠키 보존)');

      const cookies = await page.cookies();
      console.log(`[AntiDetection] 현재 쿠키 개수: ${cookies.length}`);

      // 로그인 관련 쿠키는 보존하고 나머지만 삭제
      const loginCookieNames = [
        'NID_AUT',
        'NID_SES',
        'NID_JKL',
        'NID_INFO',
        'NID_SI',
        'NID_CC',
        'NID_CCK',
        'NID_AUT_',
        'NID_SES_',
        'NID_JKL_',
        'NID_INFO_',
        'NID_SI_',
        'NID_CC_',
        'NID_CCK_',
        'naver_login',
        'naver_session',
        'naver_user',
        'naver_auth',
        'login',
        'session',
        'auth',
        'user',
        'token',
        'jwt',
      ];

      // 특정 도메인의 쿠키만 삭제하거나 모든 쿠키 삭제
      if (domain) {
        const domainCookies = cookies.filter(
          (cookie) => cookie.domain.includes(domain) || cookie.domain.includes('.' + domain),
        );

        // 로그인 관련 쿠키 제외
        const cookiesToDelete = domainCookies.filter(
          (cookie) =>
            !loginCookieNames.some((loginName) => cookie.name.toLowerCase().includes(loginName.toLowerCase())),
        );

        for (const cookie of cookiesToDelete) {
          await page.deleteCookie({
            name: cookie.name,
            domain: cookie.domain,
            path: cookie.path,
          });
        }

        console.log(
          `[AntiDetection] ${domain} 도메인 쿠키 ${cookiesToDelete.length}개 삭제 완료 (로그인 쿠키 ${domainCookies.length - cookiesToDelete.length}개 보존)`,
        );
      } else {
        // 로그인 관련 쿠키 제외하고 삭제
        const cookiesToDelete = cookies.filter(
          (cookie) =>
            !loginCookieNames.some((loginName) => cookie.name.toLowerCase().includes(loginName.toLowerCase())),
        );

        for (const cookie of cookiesToDelete) {
          await page.deleteCookie({
            name: cookie.name,
            domain: cookie.domain,
            path: cookie.path,
          });
        }

        console.log(
          `[AntiDetection] 쿠키 ${cookiesToDelete.length}개 삭제 완료 (로그인 쿠키 ${cookies.length - cookiesToDelete.length}개 보존)`,
        );
      }
    } catch (error) {
      console.error('[AntiDetection] 쿠키 정리 오류:', error);
    }
  }

  /**
   * 로컬스토리지 정리 (로그인 관련 데이터는 보존)
   */
  static async cleanupLocalStorage(page: Page): Promise<void> {
    try {
      console.log('[AntiDetection] 로컬스토리지 정리 시작 (로그인 데이터 보존)');

      await page.evaluate(() => {
        // 로그인 관련 키는 보존하고 나머지만 삭제
        const loginKeys = [
          'naver_login',
          'naver_session',
          'naver_user',
          'naver_auth',
          'login',
          'session',
          'auth',
          'user',
          'token',
          'jwt',
          'NID_AUT',
          'NID_SES',
          'NID_JKL',
          'NID_INFO',
          'NID_SI',
          'NID_CC',
          'NID_CCK',
        ];

        // 로컬스토리지에서 로그인 관련 키 제외하고 삭제
        const keysToRemove = [];
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key && !loginKeys.some((loginKey) => key.toLowerCase().includes(loginKey.toLowerCase()))) {
            keysToRemove.push(key);
          }
        }
        keysToRemove.forEach((key) => localStorage.removeItem(key));

        // 세션스토리지에서도 로그인 관련 키 제외하고 삭제
        const sessionKeysToRemove = [];
        for (let i = 0; i < sessionStorage.length; i++) {
          const key = sessionStorage.key(i);
          if (key && !loginKeys.some((loginKey) => key.toLowerCase().includes(loginKey.toLowerCase()))) {
            sessionKeysToRemove.push(key);
          }
        }
        sessionKeysToRemove.forEach((key) => sessionStorage.removeItem(key));

        // IndexedDB는 로그인 관련이 아닌 경우에만 정리
        if ('indexedDB' in window) {
          indexedDB
            .databases?.()
            .then((databases) => {
              databases.forEach((db) => {
                if (db.name && !loginKeys.some((loginKey) => db.name.toLowerCase().includes(loginKey.toLowerCase()))) {
                  indexedDB.deleteDatabase(db.name);
                }
              });
            })
            .catch(() => {
              // IndexedDB 정리 실패는 무시
            });
        }
      });

      console.log('[AntiDetection] 로컬스토리지 정리 완료 (로그인 데이터 보존)');
    } catch (error) {
      console.error('[AntiDetection] 로컬스토리지 정리 오류:', error);
    }
  }

  /**
   * 브라우저 세션 정리 (쿠키, 로컬스토리지, 캐시 등)
   */
  static async cleanupSession(page: Page, config: Partial<AntiDetectionConfig> = {}): Promise<void> {
    const finalConfig = { ...this.defaultConfig, ...config };

    try {
      console.log('[AntiDetection] 브라우저 세션 정리 시작');

      if (finalConfig.enableCookieCleanup) {
        await this.cleanupCookies(page);
      }

      if (finalConfig.enableLocalStorageCleanup) {
        await this.cleanupLocalStorage(page);
      }

      // 추가적인 브라우저 데이터 정리
      await page.evaluate(() => {
        // 웹 스토리지 정리
        if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
          navigator.serviceWorker.getRegistrations().then((registrations) => {
            registrations.forEach((registration) => {
              registration.unregister();
            });
          });
        }

        // 캐시 정리
        if ('caches' in window) {
          caches.keys().then((cacheNames) => {
            cacheNames.forEach((cacheName) => {
              caches.delete(cacheName);
            });
          });
        }
      });

      console.log('[AntiDetection] 브라우저 세션 정리 완료');
    } catch (error) {
      console.error('[AntiDetection] 브라우저 세션 정리 오류:', error);
    }
  }

  /**
   * 자연스러운 마우스 움직임 시뮬레이션
   */
  static async simulateMouseMovement(page: Page): Promise<void> {
    try {
      console.log('[AntiDetection] 마우스 움직임 시뮬레이션 시작');

      await page.evaluate(() => {
        // 랜덤한 마우스 움직임 생성
        const moveCount = Math.floor(Math.random() * 3) + 2; // 2-4번 움직임

        for (let i = 0; i < moveCount; i++) {
          setTimeout(() => {
            const event = new MouseEvent('mousemove', {
              clientX: Math.random() * window.innerWidth,
              clientY: Math.random() * window.innerHeight,
              bubbles: true,
            });
            document.dispatchEvent(event);
          }, i * 200);
        }
      });

      await this.naturalDelay(500, 1000);
      console.log('[AntiDetection] 마우스 움직임 시뮬레이션 완료');
    } catch (error) {
      console.error('[AntiDetection] 마우스 움직임 시뮬레이션 오류:', error);
    }
  }

  /**
   * 자연스러운 스크롤 시뮬레이션
   */
  static async simulateScroll(page: Page): Promise<void> {
    try {
      console.log('[AntiDetection] 스크롤 시뮬레이션 시작');

      const scrollSteps = Math.floor(Math.random() * 3) + 2; // 2-4번 스크롤

      for (let i = 0; i < scrollSteps; i++) {
        const scrollY = Math.random() * 500 + 100; // 100-600px 스크롤

        await page.evaluate((y) => {
          window.scrollTo({
            top: y,
            behavior: 'smooth',
          });
        }, scrollY);

        await this.naturalDelay(300, 800);
      }

      // 원래 위치로 돌아가기
      await page.evaluate(() => {
        window.scrollTo({
          top: 0,
          behavior: 'smooth',
        });
      });

      console.log('[AntiDetection] 스크롤 시뮬레이션 완료');
    } catch (error) {
      console.error('[AntiDetection] 스크롤 시뮬레이션 오류:', error);
    }
  }

  /**
   * 종합적인 크롤링 회피 작업 수행
   */
  static async performAntiDetectionCleanup(page: Page, config: Partial<AntiDetectionConfig> = {}): Promise<void> {
    const finalConfig = { ...this.defaultConfig, ...config };

    try {
      console.log('[AntiDetection] 종합 크롤링 회피 작업 시작');

      // 1. 자연스러운 딜레이
      if (finalConfig.enableRandomDelay) {
        await this.naturalDelay(finalConfig.minDelay, finalConfig.maxDelay);
      }

      // 2. 마우스 움직임 시뮬레이션
      if (finalConfig.enableMouseMovement) {
        await this.simulateMouseMovement(page);
      }

      // 3. 스크롤 시뮬레이션
      if (finalConfig.enableScrollSimulation) {
        await this.simulateScroll(page);
      }

      // 4. 세션 정리
      await this.cleanupSession(page, finalConfig);

      // 5. 최종 딜레이
      await this.naturalDelay(500, 1500);

      console.log('[AntiDetection] 종합 크롤링 회피 작업 완료');
    } catch (error) {
      console.error('[AntiDetection] 크롤링 회피 작업 오류:', error);
    }
  }

  /**
   * User-Agent 설정
   */
  static async setRandomUserAgent(page: Page): Promise<void> {
    try {
      const userAgent = this.getRandomUserAgent();
      await page.setUserAgent(userAgent);
      console.log(`[AntiDetection] User-Agent 설정: ${userAgent.substring(0, 50)}...`);
    } catch (error) {
      console.error('[AntiDetection] User-Agent 설정 오류:', error);
    }
  }

  /**
   * 페이지 로딩 후 자연스러운 대기
   */
  static async waitForNaturalLoad(page: Page): Promise<void> {
    try {
      // 페이지 로딩 완료 대기
      await page.waitForFunction(() => document.readyState === 'complete');

      // 추가 자연스러운 대기
      await this.naturalDelay(1000, 2000);
    } catch (error) {
      console.error('[AntiDetection] 자연스러운 로딩 대기 오류:', error);
      // 폴백: 기본 대기
      await this.naturalDelay(2000, 3000);
    }
  }

  /**
   * 탭 전환 시 크롤링 회피 작업
   */
  static async handleTabSwitch(page: Page, config: Partial<AntiDetectionConfig> = {}): Promise<void> {
    try {
      console.log('[AntiDetection] 탭 전환 시 크롤링 회피 작업 시작');

      // 현재 탭에서 정리 작업
      await this.performAntiDetectionCleanup(page, config);

      // 새 탭으로 전환 후 추가 정리
      const finalConfig = { ...this.defaultConfig, ...config };
      if (finalConfig.enableCookieCleanup) {
        await this.cleanupCookies(page, 'naver.com');
      }

      console.log('[AntiDetection] 탭 전환 시 크롤링 회피 작업 완료');
    } catch (error) {
      console.error('[AntiDetection] 탭 전환 시 크롤링 회피 작업 오류:', error);
    }
  }

  /**
   * 랜덤 링크 클릭 후 백 (자연스러운 사용자 행동 시뮬레이션)
   * 새창으로 뜨는 링크는 제외하고 3초 이내로 완료
   */
  static async simulateRandomLinkClick(page: Page): Promise<void> {
    try {
      console.log('[AntiDetection] 랜덤 링크 클릭 시뮬레이션 시작');

      // 현재 URL 저장 (백을 위해)
      const currentUrl = page.url();

      // 새창으로 뜨지 않는 링크들 찾기
      const clickableLinks = await page.evaluate(() => {
        const links = Array.from(document.querySelectorAll('a[href]'));
        const validLinks: Array<{ href: string; text: string; selector: string }> = [];

        links.forEach((link: HTMLAnchorElement, index: number) => {
          const href = link.href;
          const text = link.textContent?.trim() || '';

          // 새창으로 뜨는 링크 제외
          const isNewWindow =
            link.target === '_blank' ||
            link.target === '_new' ||
            link.getAttribute('onclick')?.includes('window.open') ||
            link.getAttribute('onclick')?.includes('_blank');

          // 유효한 링크인지 확인
          const isValidLink =
            href &&
            href !== '#' &&
            href !== 'javascript:void(0)' &&
            href !== 'javascript:;' &&
            !href.startsWith('mailto:') &&
            !href.startsWith('tel:') &&
            !isNewWindow &&
            text.length > 0;

          if (isValidLink) {
            // 더 구체적인 셀렉터 생성
            const selector = `a:nth-of-type(${index + 1})[href="${href}"]`;
            validLinks.push({ href, text, selector });
          }
        });

        return validLinks;
      });

      if (clickableLinks.length === 0) {
        console.log('[AntiDetection] 클릭 가능한 링크가 없습니다.');
        return;
      }

      // 랜덤하게 링크 선택
      const randomIndex = Math.floor(Math.random() * clickableLinks.length);
      const selectedLink = clickableLinks[randomIndex];

      console.log(`[AntiDetection] 선택된 링크: ${selectedLink.text} (${selectedLink.href})`);
      console.log(`[AntiDetection] 사용할 셀렉터: ${selectedLink.selector}`);

      // 링크 클릭 전 URL 저장
      const beforeUrl = page.url();
      console.log(`[AntiDetection] 클릭 전 URL: ${beforeUrl}`);

      // 여러 방법으로 링크 클릭 시도
      try {
        // 방법 1: href로 클릭
        await page.click(`a[href="${selectedLink.href}"]`);
        console.log(`[AntiDetection] href로 링크 클릭 완료`);
      } catch (error) {
        console.log(`[AntiDetection] href 클릭 실패, 셀렉터로 재시도: ${error}`);
        try {
          // 방법 2: 셀렉터로 클릭
          await page.click(selectedLink.selector);
          console.log(`[AntiDetection] 셀렉터로 링크 클릭 완료`);
        } catch (error2) {
          console.log(`[AntiDetection] 셀렉터 클릭 실패, evaluate로 재시도: ${error2}`);
          // 방법 3: evaluate로 직접 클릭
          await page.evaluate((href) => {
            const link = document.querySelector(`a[href="${href}"]`) as HTMLAnchorElement;
            if (link) {
              link.click();
            }
          }, selectedLink.href);
          console.log(`[AntiDetection] evaluate로 링크 클릭 완료`);
        }
      }

      // 페이지 이동 대기 (최대 3초)
      try {
        await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 3000 });
        const afterUrl = page.url();
        console.log(`[AntiDetection] 클릭 후 URL: ${afterUrl}`);

        if (beforeUrl === afterUrl) {
          console.log(`[AntiDetection] 페이지 이동이 감지되지 않았습니다. 강제로 페이지 이동 시도`);
          await page.goto(selectedLink.href, { waitUntil: 'domcontentloaded', timeout: 3000 });
        }
      } catch (error) {
        console.log('[AntiDetection] 페이지 이동 대기 시간 초과, 강제 이동 시도');
        try {
          await page.goto(selectedLink.href, { waitUntil: 'domcontentloaded', timeout: 3000 });
        } catch (gotoError) {
          console.error('[AntiDetection] 강제 페이지 이동 실패:', gotoError);
        }
      }

      // 잠시 대기 (0.5-1초)
      const waitTime = Math.floor(Math.random() * 500) + 500;
      await new Promise((resolve) => setTimeout(resolve, waitTime));

      // 백 버튼 클릭
      await page.goBack({ waitUntil: 'domcontentloaded', timeout: 2000 });

      // 원래 페이지로 돌아왔는지 확인
      const backUrl = page.url();
      if (backUrl === currentUrl) {
        console.log('[AntiDetection] 랜덤 링크 클릭 시뮬레이션 완료');
      } else {
        console.log('[AntiDetection] 백 후 URL이 다릅니다. 원래 페이지로 이동');
        await page.goto(currentUrl, { waitUntil: 'domcontentloaded', timeout: 2000 });
      }
    } catch (error) {
      console.error('[AntiDetection] 랜덤 링크 클릭 시뮬레이션 오류:', error);

      // 오류 발생 시 원래 페이지로 돌아가기 시도
      try {
        const currentUrl = page.url();
        await page.goto(currentUrl, { waitUntil: 'domcontentloaded', timeout: 2000 });
      } catch (backError) {
        console.error('[AntiDetection] 원래 페이지로 돌아가기 실패:', backError);
      }
    }
  }

  /**
   * 봇 디텍션 데이터 정리 (세션, 쿠키, 로컬스토리지에서 봇 감지 관련 데이터 제거)
   */
  static async cleanupBotDetectionData(page: Page): Promise<void> {
    try {
      console.log('[AntiDetection] 봇 디텍션 데이터 정리 시작');

      // 1. 쿠키에서 봇 감지 관련 데이터 제거
      await page.evaluate(() => {
        const cookiesToRemove = [
          // 일반적인 봇 감지 쿠키들
          'bot_detection',
          'automation_detected',
          'crawler_detected',
          'scraper_detected',
          'selenium_detected',
          'puppeteer_detected',
          'headless_detected',
          'webdriver_detected',
          'automation_flag',
          'bot_flag',
          'crawler_flag',
          'scraper_flag',
          'selenium_flag',
          'puppeteer_flag',
          'headless_flag',
          'webdriver_flag',
          // 추가 봇 감지 관련 쿠키들
          'anti_bot',
          'bot_check',
          'crawler_check',
          'automation_check',
          'selenium_check',
          'puppeteer_check',
          'headless_check',
          'webdriver_check',
          // 타임스탬프 기반 봇 감지
          'visit_timestamp',
          'page_load_time',
          'interaction_time',
          'mouse_movement',
          'scroll_behavior',
          'click_pattern',
          'typing_speed',
          'human_behavior',
          // 세션 기반 봇 감지
          'session_fingerprint',
          'browser_fingerprint',
          'device_fingerprint',
          'user_fingerprint',
          'behavioral_fingerprint',
          'interaction_fingerprint',
          'navigation_fingerprint',
          'timing_fingerprint',
          // 추가 감지 메커니즘
          'captcha_attempts',
          'failed_attempts',
          'suspicious_activity',
          'unusual_behavior',
          'automation_signature',
          'bot_signature',
          'crawler_signature',
          'scraper_signature',
          'selenium_signature',
          'puppeteer_signature',
          'headless_signature',
          'webdriver_signature',
        ];

        cookiesToRemove.forEach((cookieName) => {
          document.cookie = `${cookieName}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;`;
          document.cookie = `${cookieName}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; domain=${window.location.hostname};`;
          document.cookie = `${cookieName}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; domain=.${window.location.hostname};`;
        });

        console.log('[AntiDetection] 봇 감지 관련 쿠키 제거 완료');
      });

      // 2. 로컬스토리지에서 봇 감지 관련 데이터 제거
      await page.evaluate(() => {
        const storageKeysToRemove = [
          // 일반적인 봇 감지 키들
          'bot_detection',
          'automation_detected',
          'crawler_detected',
          'scraper_detected',
          'selenium_detected',
          'puppeteer_detected',
          'headless_detected',
          'webdriver_detected',
          'automation_flag',
          'bot_flag',
          'crawler_flag',
          'scraper_flag',
          'selenium_flag',
          'puppeteer_flag',
          'headless_flag',
          'webdriver_flag',
          // 추가 봇 감지 관련 키들
          'anti_bot',
          'bot_check',
          'crawler_check',
          'automation_check',
          'selenium_check',
          'puppeteer_check',
          'headless_check',
          'webdriver_check',
          // 행동 패턴 관련
          'visit_timestamp',
          'page_load_time',
          'interaction_time',
          'mouse_movement',
          'scroll_behavior',
          'click_pattern',
          'typing_speed',
          'human_behavior',
          // 지문 관련
          'session_fingerprint',
          'browser_fingerprint',
          'device_fingerprint',
          'user_fingerprint',
          'behavioral_fingerprint',
          'interaction_fingerprint',
          'navigation_fingerprint',
          'timing_fingerprint',
          // 추가 감지 메커니즘
          'captcha_attempts',
          'failed_attempts',
          'suspicious_activity',
          'unusual_behavior',
          'automation_signature',
          'bot_signature',
          'crawler_signature',
          'scraper_signature',
          'selenium_signature',
          'puppeteer_signature',
          'headless_signature',
          'webdriver_signature',
        ];

        storageKeysToRemove.forEach((key) => {
          localStorage.removeItem(key);
          sessionStorage.removeItem(key);
        });

        console.log('[AntiDetection] 봇 감지 관련 로컬스토리지 데이터 제거 완료');
      });

      // 3. 세션스토리지에서 봇 감지 관련 데이터 제거
      await page.evaluate(() => {
        const sessionKeysToRemove = [
          'bot_detection',
          'automation_detected',
          'crawler_detected',
          'scraper_detected',
          'selenium_detected',
          'puppeteer_detected',
          'headless_detected',
          'webdriver_detected',
          'automation_flag',
          'bot_flag',
          'crawler_flag',
          'scraper_flag',
          'selenium_flag',
          'puppeteer_flag',
          'headless_flag',
          'webdriver_flag',
          'anti_bot',
          'bot_check',
          'crawler_check',
          'automation_check',
          'selenium_check',
          'puppeteer_check',
          'headless_check',
          'webdriver_check',
          'visit_timestamp',
          'page_load_time',
          'interaction_time',
          'mouse_movement',
          'scroll_behavior',
          'click_pattern',
          'typing_speed',
          'human_behavior',
          'session_fingerprint',
          'browser_fingerprint',
          'device_fingerprint',
          'user_fingerprint',
          'behavioral_fingerprint',
          'interaction_fingerprint',
          'navigation_fingerprint',
          'timing_fingerprint',
          'captcha_attempts',
          'failed_attempts',
          'suspicious_activity',
          'unusual_behavior',
          'automation_signature',
          'bot_signature',
          'crawler_signature',
          'scraper_signature',
          'selenium_signature',
          'puppeteer_signature',
          'headless_signature',
          'webdriver_signature',
        ];

        sessionKeysToRemove.forEach((key) => {
          sessionStorage.removeItem(key);
        });

        console.log('[AntiDetection] 봇 감지 관련 세션스토리지 데이터 제거 완료');
      });

      // 4. IndexedDB에서 봇 감지 관련 데이터 제거
      await page.evaluate(() => {
        const dbNames = ['bot_detection', 'automation_data', 'crawler_data', 'scraper_data'];

        dbNames.forEach((dbName) => {
          try {
            const deleteRequest = indexedDB.deleteDatabase(dbName);
            deleteRequest.onsuccess = () => {
              console.log(`[AntiDetection] IndexedDB ${dbName} 삭제 완료`);
            };
            deleteRequest.onerror = () => {
              console.log(`[AntiDetection] IndexedDB ${dbName} 삭제 실패`);
            };
          } catch (error) {
            console.log(`[AntiDetection] IndexedDB ${dbName} 삭제 중 오류:`, error);
          }
        });
      });

      // 5. 웹 워커에서 봇 감지 관련 데이터 제거
      await page.evaluate(() => {
        // 웹 워커 관련 전역 변수들 정리
        if (typeof window !== 'undefined') {
          const workerKeys = [
            'botDetectionWorker',
            'automationWorker',
            'crawlerWorker',
            'scraperWorker',
            'seleniumWorker',
            'puppeteerWorker',
            'headlessWorker',
            'webdriverWorker',
          ];

          workerKeys.forEach((key) => {
            if (window[key as any]) {
              try {
                const worker = window[key as any] as unknown as Worker;
                if (worker && typeof worker.terminate === 'function') {
                  worker.terminate();
                }
                delete window[key as any];
              } catch (error) {
                console.log(`[AntiDetection] 웹 워커 ${key} 정리 중 오류:`, error);
              }
            }
          });
        }
      });

      // 6. 추가적인 봇 감지 관련 전역 변수들 정리
      await page.evaluate(() => {
        const globalKeysToRemove = [
          'botDetection',
          'automationDetection',
          'crawlerDetection',
          'scraperDetection',
          'seleniumDetection',
          'puppeteerDetection',
          'headlessDetection',
          'webdriverDetection',
          'antiBot',
          'botCheck',
          'crawlerCheck',
          'automationCheck',
          'seleniumCheck',
          'puppeteerCheck',
          'headlessCheck',
          'webdriverCheck',
          'visitTimestamp',
          'pageLoadTime',
          'interactionTime',
          'mouseMovement',
          'scrollBehavior',
          'clickPattern',
          'typingSpeed',
          'humanBehavior',
          'sessionFingerprint',
          'browserFingerprint',
          'deviceFingerprint',
          'userFingerprint',
          'behavioralFingerprint',
          'interactionFingerprint',
          'navigationFingerprint',
          'timingFingerprint',
          'captchaAttempts',
          'failedAttempts',
          'suspiciousActivity',
          'unusualBehavior',
          'automationSignature',
          'botSignature',
          'crawlerSignature',
          'scraperSignature',
          'seleniumSignature',
          'puppeteerSignature',
          'headlessSignature',
          'webdriverSignature',
        ];

        globalKeysToRemove.forEach((key) => {
          if (typeof window !== 'undefined' && window[key as any]) {
            try {
              delete window[key as any];
            } catch (error) {
              console.log(`[AntiDetection] 전역 변수 ${key} 정리 중 오류:`, error);
            }
          }
        });

        console.log('[AntiDetection] 봇 감지 관련 전역 변수 정리 완료');
      });

      console.log('[AntiDetection] 봇 디텍션 데이터 정리 완료');
    } catch (error) {
      console.error('[AntiDetection] 봇 디텍션 데이터 정리 중 오류:', error);
    }
  }
}

export default AntiDetectionUtils;
