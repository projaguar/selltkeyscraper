import { Page } from 'puppeteer';

/**
 * 네이버 블럭 화면 감지 유틸리티
 */
export class BlockDetectionUtils {
  /**
   * 현재 페이지가 블럭 페이지인지 확인
   * @param page Puppeteer Page 객체
   * @returns 블럭 페이지 여부
   */
  static async isBlockedPage(page: Page): Promise<boolean> {
    try {
      const isBlocked = await page.evaluate(() => {
        // 1. 블럭 메시지 텍스트 확인
        const blockMessages = [
          '쇼핑 서비스 접속이 일시적으로 제한되었습니다',
          '접속이 일시적으로 제한',
          '비정상적인 접근이 감지',
          '시스템을 통해 아래와 같은 비정상적인 접근',
        ];

        const bodyText = document.body.innerText || '';
        const hasBlockMessage = blockMessages.some((msg) => bodyText.includes(msg));

        // 2. 에러 페이지 클래스 확인
        const hasErrorClass = document.querySelector('.content_error') !== null;

        // 3. 페이지 제목 확인
        const title = document.title || '';
        const isSimpleTitle = title === '네이버쇼핑' || title.length < 10;

        // 4. 블럭 페이지 특징적인 링크 확인
        const hasHelpLinks =
          document.querySelector('a[href*="help.naver.com"]') !== null ||
          document.querySelector('a[href*="help.pay.naver.com"]') !== null;

        // 블럭 조건: 메시지가 있거나, 에러 클래스가 있거나, 단순한 title + 헬프 링크
        return hasBlockMessage || hasErrorClass || (isSimpleTitle && hasHelpLinks);
      });

      if (isBlocked) {
        console.warn('[BlockDetectionUtils] 블럭 페이지 감지!');
      }

      return isBlocked;
    } catch (error) {
      console.error('[BlockDetectionUtils] 블럭 체크 오류:', error);
      return false; // 오류 시 블럭되지 않은 것으로 간주
    }
  }

  /**
   * 블럭 페이지인 경우 예외를 던지고, 아닌 경우 정상 진행
   * @param page Puppeteer Page 객체
   * @param customMessage 커스텀 예외 메시지
   * @throws Error 블럭 페이지인 경우
   */
  static async checkBlockAndThrow(page: Page, customMessage?: string): Promise<void> {
    const isBlocked = await this.isBlockedPage(page);

    if (isBlocked) {
      const message = customMessage || '페이지가 블럭되었습니다. 잠시 후 다시 시도해주세요.';
      throw new Error(message);
    }
  }

  /**
   * 블럭 페이지 상태 정보 가져오기
   * @param page Puppeteer Page 객체
   * @returns 블럭 상태 정보
   */
  static async getBlockStatus(page: Page): Promise<{
    isBlocked: boolean;
    url: string;
    title: string;
    hasBlockMessage: boolean;
    hasErrorClass: boolean;
    hasHelpLinks: boolean;
    blockMessages: string[];
  }> {
    try {
      const url = page.url();
      const isBlocked = await this.isBlockedPage(page);

      const status = await page.evaluate(() => {
        const blockMessages = [
          '쇼핑 서비스 접속이 일시적으로 제한되었습니다',
          '접속이 일시적으로 제한',
          '비정상적인 접근이 감지',
          '시스템을 통해 아래와 같은 비정상적인 접근',
        ];

        const bodyText = document.body.innerText || '';
        const foundMessages = blockMessages.filter((msg) => bodyText.includes(msg));

        const hasErrorClass = document.querySelector('.content_error') !== null;
        const hasHelpLinks =
          document.querySelector('a[href*="help.naver.com"]') !== null ||
          document.querySelector('a[href*="help.pay.naver.com"]') !== null;

        return {
          title: document.title || '',
          hasBlockMessage: foundMessages.length > 0,
          hasErrorClass,
          hasHelpLinks,
          blockMessages: foundMessages,
        };
      });

      return {
        isBlocked,
        url,
        title: status.title,
        hasBlockMessage: status.hasBlockMessage,
        hasErrorClass: status.hasErrorClass,
        hasHelpLinks: status.hasHelpLinks,
        blockMessages: status.blockMessages,
      };
    } catch (error) {
      console.error('[BlockDetectionUtils] 블럭 상태 확인 중 오류:', error);
      return {
        isBlocked: false,
        url: page.url(),
        title: '',
        hasBlockMessage: false,
        hasErrorClass: false,
        hasHelpLinks: false,
        blockMessages: [],
      };
    }
  }
}

/**
 * 블럭 페이지 확인 및 예외 던지기 헬퍼 함수
 * @param page Puppeteer Page 객체
 * @param customMessage 커스텀 예외 메시지
 * @throws Error 블럭 페이지인 경우
 */
export async function checkBlockAndThrow(page: Page, customMessage?: string): Promise<void> {
  await BlockDetectionUtils.checkBlockAndThrow(page, customMessage);
}

/**
 * 블럭 페이지인지 간단히 확인
 * @param page Puppeteer Page 객체
 * @returns 블럭 페이지 여부
 */
export async function isBlockedPage(page: Page): Promise<boolean> {
  return await BlockDetectionUtils.isBlockedPage(page);
}
