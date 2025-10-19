import { Page } from 'puppeteer';
import axios from 'axios';
import { spawn } from 'child_process';
import { join } from 'path';
/**
 * 네이버 캡챠 화면 감지 및 해결 대기 유틸리티
 */
export class CaptchaUtils {
  static async handleCaptcha(
    page: Page,
    userNum: string,
    onCaptchaDetected?: () => void,
    onCaptchaResolved?: () => void,
  ): Promise<void> {
    const isCaptcha = await CaptchaUtils.isCaptchaPage(page);

    if (isCaptcha) {
      if (onCaptchaDetected) {
        onCaptchaDetected();
      }

      // MP3 파일 재생
      CaptchaUtils.playNotificationSound();

      // 캡챠 정보 전송
      await CaptchaUtils.sendCaptchaInfo(userNum);

      const result = await CaptchaUtils.handleCaptchaIfPresent(page, 24 * 60 * 60 * 1000);
      if (!result.resolved) {
        throw new Error('캡챠 해결 실패');
      }
      if (onCaptchaResolved) {
        onCaptchaResolved();
      }
    }
  }

  static async playNotificationSound(): Promise<void> {
    try {
      // resources 폴더의 MP3 파일 경로
      const mp3Path = join(__dirname, '../../resources/navercaptcha.mp3');
      console.log('[CaptchaUtils] MP3 재생 중:', mp3Path);

      // macOS에서 afplay 사용하여 MP3 재생
      const player = spawn('afplay', [mp3Path]);

      player.on('error', (error) => {
        console.error('[CaptchaUtils] MP3 재생 오류:', error);
      });

      player.on('close', (code) => {
        console.log('[CaptchaUtils] MP3 재생 완료:', code);
      });
    } catch (error) {
      console.error('[CaptchaUtils] MP3 재생 중 오류:', error);
    }
  }

  static async sendCaptchaInfo(userNum: string): Promise<void> {
    try {
      const url = 'https://selltkey.com/scb/api/setSendError.asp';
      const params = {
        userNum,
        errType: 'NAVER01',
      };

      console.log('[CaptchaUtils] 캡챠 정보 전송 중...', { userNum, errType: 'NAVER01' });

      const response = await axios.get(url, { params });

      console.log('[CaptchaUtils] 캡챠 정보 전송 완료:', response.status);
    } catch (error) {
      console.error('[CaptchaUtils] 캡챠 정보 전송 실패:', error);
    }
  }

  /**
   * 현재 페이지가 네이버 캡챠 화면인지 확인
   * @param page Puppeteer Page 객체
   * @returns 캡챠 화면 여부
   */
  static async isCaptchaPage(page: Page): Promise<boolean> {
    try {
      console.log('[CaptchaUtils] 캡챠 화면 감지 시작...');

      // 1. URL 확인 (캡챠 관련 URL 패턴) - 더 엄격한 검사
      const currentUrl = page.url();
      console.log('[CaptchaUtils] 현재 URL:', currentUrl);

      // 네이버 쇼핑 관련 URL이면 캡챠가 아닐 가능성이 높음
      if (currentUrl.includes('shopping.naver.com') || currentUrl.includes('search.naver.com')) {
        console.log('[CaptchaUtils] 네이버 쇼핑/검색 페이지로 판단, 추가 검사 필요');
      } else if (
        currentUrl.includes('captcha') ||
        currentUrl.includes('challenge') ||
        currentUrl.includes('security')
      ) {
        console.log('[CaptchaUtils] URL에서 캡챠 관련 키워드 발견');
        return true;
      }

      // 2. 캡챠 전용 요소들 확인 (더 구체적인 검사)
      const captchaElements = [
        'iframe[src*="captcha"]',
        'div[id*="captcha"]',
        'div[class*="captcha"]',
        'canvas[id*="captcha"]',
        'img[src*="captcha"]',
      ];

      for (const selector of captchaElements) {
        const element = await page.$(selector);
        if (element) {
          console.log('[CaptchaUtils] 캡챠 전용 요소 발견:', selector);
          return true;
        }
      }

      // 3. 캡챠 관련 스크립트 태그 확인 (더 구체적)
      const captchaScript = await page.$('script[src*="wtm_captcha.js"]');
      if (captchaScript) {
        // 스크립트가 있어도 실제 캡챠 화면인지 추가 확인
        const isCaptchaActive = await page.evaluate(() => {
          const captchaContainer = document.querySelector('#app');
          if (captchaContainer) {
            const captchaVisible = window.getComputedStyle(captchaContainer).display !== 'none';
            const captchaHeight = (captchaContainer as HTMLElement).offsetHeight;
            return captchaVisible && captchaHeight > 100; // 충분한 높이가 있어야 실제 캡챠
          }
          return false;
        });

        if (isCaptchaActive) {
          console.log('[CaptchaUtils] 활성화된 캡챠 스크립트 발견');
          return true;
        }
      }

      // 4. 캡챠 컨테이너 요소 확인 (더 엄격한 검사)
      const captchaContainer = await page.$('#app');
      if (captchaContainer) {
        // WtmCaptcha 객체 존재 확인
        const hasCaptchaObject = await page.evaluate(() => {
          return typeof (window as any).WtmCaptcha !== 'undefined';
        });

        if (hasCaptchaObject) {
          // 객체가 있어도 실제 캡챠가 활성화되어 있는지 확인
          const isCaptchaActive = await page.evaluate(() => {
            const app = document.querySelector('#app');
            if (app) {
              const style = window.getComputedStyle(app);
              const isVisible = style.display !== 'none' && style.visibility !== 'hidden';
              const hasContent = app.textContent && app.textContent.trim().length > 0;
              const hasHeight = (app as HTMLElement).offsetHeight > 200; // 충분한 높이
              return isVisible && hasContent && hasHeight;
            }
            return false;
          });

          if (isCaptchaActive) {
            console.log('[CaptchaUtils] 활성화된 캡챠 컨테이너 발견');
            return true;
          }
        }
      }

      // 5. 캡챠 관련 텍스트 확인 (더 구체적인 검사)
      // 단순히 텍스트가 포함되어 있는지가 아니라, 캡챠 관련 UI 요소가 있는지 확인
      const hasCaptchaUI = await page.evaluate(() => {
        const captchaKeywords = ['캡챠', 'captcha', '보안문자', '자동입력방지'];
        const bodyText = document.body.textContent || '';

        for (const keyword of captchaKeywords) {
          if (bodyText.toLowerCase().includes(keyword.toLowerCase())) {
            // 텍스트가 있더라도 실제 캡챠 UI 요소가 있는지 확인
            const captchaElements = document.querySelectorAll('canvas, iframe[src*="captcha"], div[id*="captcha"]');
            if (captchaElements.length > 0) {
              return true;
            }
          }
        }
        return false;
      });

      if (hasCaptchaUI) {
        console.log('[CaptchaUtils] 캡챠 UI 요소 발견');
        return true;
      }

      console.log('[CaptchaUtils] 캡챠 화면이 아닌 것으로 판단');
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
        console.log('[CaptchaUtils] ✅ 캡챠 화면이 아닙니다. 정상 진행합니다.');
        return {
          isCaptcha: false,
          resolved: true,
          message: '캡챠 화면이 아닙니다.',
        };
      }

      console.log('[CaptchaUtils] 🚨 캡챠 화면이 감지되었습니다!');
      console.log('[CaptchaUtils] 사용자가 캡챠를 해결할 때까지 대기 중...');
      console.log('[CaptchaUtils] 현재 URL:', page.url());

      // 캡챠 상태 정보 상세 출력
      const captchaStatus = await this.getCaptchaStatus(page);
      console.log('[CaptchaUtils] 캡챠 상태 정보:', captchaStatus);

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
    const result = await this.handleCaptchaIfPresent(page, 24 * 60 * 60 * 1000);
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
