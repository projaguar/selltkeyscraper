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
}

export default AntiDetectionUtils;
