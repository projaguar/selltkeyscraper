import { Page } from 'puppeteer';

/**
 * 네이버 캡챠 화면 감지 및 해결 대기 유틸리티
 */
export class CaptchaUtils {
  static async handleCaptcha(page: Page): Promise<void> {
    const isCaptcha = await CaptchaUtils.isCaptchaPage(page);

    if (isCaptcha) {
      const resolved = await CaptchaUtils.waitForCaptchaResolution(page);
      if (!resolved) {
        throw new Error('캡챠 해결 실패');
      }
    }
  }

  /**
   * 현재 페이지가 네이버 캡챠 화면인지 확인
   * @param page Puppeteer Page 객체
   * @returns 캡챠 화면 여부
   */
  static async isCaptchaPage(page: Page): Promise<boolean> {
    try {
      // 1. URL 확인 (캡챠 관련 URL 패턴)
      const currentUrl = page.url();
      if (currentUrl.includes('captcha') || currentUrl.includes('challenge')) {
        return true;
      }

      // 2. 캡챠 관련 스크립트 태그 확인
      const captchaScript = await page.$('script[src*="wtm_captcha.js"]');
      if (captchaScript) {
        return true;
      }

      // 3. 캡챠 컨테이너 요소 확인
      const captchaContainer = await page.$('#app');
      if (captchaContainer) {
        // WtmCaptcha 객체 존재 확인
        const hasCaptchaObject = await page.evaluate(() => {
          return typeof (window as any).WtmCaptcha !== 'undefined';
        });

        if (hasCaptchaObject) {
          return true;
        }
      }

      // 4. 캡챠 관련 텍스트 확인
      const captchaTexts = ['캡챠', 'captcha', '보안문자', '자동입력방지'];
      const pageContent = await page.content();

      for (const text of captchaTexts) {
        if (pageContent.toLowerCase().includes(text.toLowerCase())) {
          return true;
        }
      }

      return false;
    } catch (error) {
      console.error('[CaptchaUtils] 캡챠 화면 감지 중 오류:', error);
      return false;
    }
  }

  /**
   * 캡챠 화면이 아닌 경우 현재 페이지 반환
   * 캡챠 화면인 경우 사용자가 해결할 때까지 대기
   * @param page Puppeteer Page 객체
   * @param maxWaitTime 최대 대기 시간 (밀리초, 기본값: 24시간)
   * @returns 캡챠 해결 후 페이지 또는 원본 페이지
   */
  static async handleCaptchaIfPresent(
    page: Page,
    maxWaitTime: number = 24 * 60 * 60 * 1000, // 24시간
  ): Promise<{ isCaptcha: boolean; resolved: boolean; message: string }> {
    try {
      console.log('[CaptchaUtils] 캡챠 화면 확인 중...');

      const isCaptcha = await this.isCaptchaPage(page);

      if (!isCaptcha) {
        console.log('[CaptchaUtils] 캡챠 화면이 아닙니다. 정상 진행합니다.');
        return {
          isCaptcha: false,
          resolved: true,
          message: '캡챠 화면이 아닙니다.',
        };
      }

      console.log('[CaptchaUtils] 🚨 캡챠 화면이 감지되었습니다!');
      console.log('[CaptchaUtils] 사용자가 캡챠를 해결할 때까지 대기 중...');
      console.log('[CaptchaUtils] 현재 URL:', page.url());

      // 캡챠 해결 대기
      const startTime = Date.now();
      const checkInterval = 2000; // 2초마다 확인

      while (Date.now() - startTime < maxWaitTime) {
        // 캡챠가 해결되었는지 확인
        const stillCaptcha = await this.isCaptchaPage(page);

        if (!stillCaptcha) {
          console.log('[CaptchaUtils] ✅ 캡챠가 해결되었습니다!');
          return {
            isCaptcha: true,
            resolved: true,
            message: '캡챠가 성공적으로 해결되었습니다.',
          };
        }

        // 현재 URL 확인 (페이지 이동 여부)
        const currentUrl = page.url();
        console.log(
          `[CaptchaUtils] 대기 중... (${Math.floor((Date.now() - startTime) / 1000)}초) - URL: ${currentUrl}`,
        );

        // 잠시 대기
        await new Promise((resolve) => setTimeout(resolve, checkInterval));
      }

      console.log('[CaptchaUtils] ⏰ 캡챠 해결 시간 초과');
      return {
        isCaptcha: true,
        resolved: false,
        message: `캡챠 해결 시간 초과 (${maxWaitTime / 1000}초)`,
      };
    } catch (error) {
      console.error('[CaptchaUtils] 캡챠 처리 중 오류:', error);
      return {
        isCaptcha: false,
        resolved: false,
        message: `캡챠 처리 중 오류 발생: ${error}`,
      };
    }
  }

  /**
   * 캡챠 화면 감지 및 대기 (간단한 버전)
   * @param page Puppeteer Page 객체
   * @returns 캡챠 해결 여부
   */
  static async waitForCaptchaResolution(page: Page): Promise<boolean> {
    const result = await this.handleCaptchaIfPresent(page);
    return result.resolved;
  }

  /**
   * 현재 페이지의 캡챠 상태 정보 가져오기
   * @param page Puppeteer Page 객체
   * @returns 캡챠 상태 정보
   */
  static async getCaptchaStatus(page: Page): Promise<{
    isCaptcha: boolean;
    url: string;
    hasCaptchaScript: boolean;
    hasCaptchaContainer: boolean;
    captchaTexts: string[];
  }> {
    try {
      const url = page.url();
      const isCaptcha = await this.isCaptchaPage(page);

      const hasCaptchaScript = !!(await page.$('script[src*="wtm_captcha.js"]'));
      const hasCaptchaContainer = !!(await page.$('#app'));

      const pageContent = await page.content();
      const captchaTexts = ['캡챠', 'captcha', '보안문자', '자동입력방지'].filter((text) =>
        pageContent.toLowerCase().includes(text.toLowerCase()),
      );

      return {
        isCaptcha,
        url,
        hasCaptchaScript,
        hasCaptchaContainer,
        captchaTexts,
      };
    } catch (error) {
      console.error('[CaptchaUtils] 캡챠 상태 확인 중 오류:', error);
      return {
        isCaptcha: false,
        url: page.url(),
        hasCaptchaScript: false,
        hasCaptchaContainer: false,
        captchaTexts: [],
      };
    }
  }
}

/**
 * 캡챠 화면 감지 및 대기 헬퍼 함수
 * @param page Puppeteer Page 객체
 * @param maxWaitTime 최대 대기 시간 (밀리초, 기본값: 24시간)
 * @returns 캡챠 해결 여부
 */
export async function handleCaptcha(page: Page, maxWaitTime: number = 24 * 60 * 60 * 1000): Promise<boolean> {
  const result = await CaptchaUtils.handleCaptchaIfPresent(page, maxWaitTime);
  return result.resolved;
}

/**
 * 캡챠 화면인지 간단히 확인
 * @param page Puppeteer Page 객체
 * @returns 캡챠 화면 여부
 */
export async function isCaptchaPage(page: Page): Promise<boolean> {
  return await CaptchaUtils.isCaptchaPage(page);
}
