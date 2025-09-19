/**
 * 벤치마킹 소싱 서비스
 * 경쟁사 상품 분석 및 소싱 비즈니스 로직을 담당
 */

import { browserService } from './browserService';
import {
  findAndTypeNaturallyMultiple,
  executeNaverMainSearch,
  executeShoppingTabSearch,
} from '../utils/naturalInputUtils';

export interface SourcingConfig {
  minAmount: string;
  maxAmount: string;
  keywords: string;
  includeNaver: boolean;
  includeAuction: boolean;
  includeBest: boolean;
  includeNew: boolean;
}

export interface SourcingResult {
  success: boolean;
  message: string;
  data?: any;
}

export class SourcingService {
  private static instance: SourcingService;
  private isRunning: boolean = false;
  private currentConfig: SourcingConfig | null = null;

  private constructor() {
    // 싱글톤 패턴을 위한 private 생성자
  }

  /**
   * 싱글톤 인스턴스 반환
   */
  static getInstance(): SourcingService {
    if (!SourcingService.instance) {
      SourcingService.instance = new SourcingService();
    }
    return SourcingService.instance;
  }

  /**
   * 소싱 시작
   * @param config 소싱 설정
   * @returns SourcingResult
   */
  async startSourcing(config: SourcingConfig): Promise<SourcingResult> {
    try {
      console.log('[SourcingService] 소싱 시작 요청');

      // 설정 검증
      if (!this.validateConfig(config)) {
        return {
          success: false,
          message: '소싱 설정이 올바르지 않습니다.',
        };
      }

      // 이미 실행 중인지 확인
      if (this.isRunning) {
        return {
          success: false,
          message: '이미 소싱이 실행 중입니다.',
        };
      }

      this.isRunning = true;
      this.currentConfig = config;

      console.log('[SourcingService] 소싱 시작');

      // 브라우저 초기화
      await browserService.initializeBrowser();

      // 로그인 상태 확인
      const isLoggedIn = await browserService.checkNaverLoginStatus();
      if (!isLoggedIn) {
        this.isRunning = false;
        return {
          success: false,
          message: '네이버에 로그인되어 있지 않습니다.',
        };
      }

      // 네이버 메인 페이지로 이동
      await this.navigateToNaverMain();

      // 첫 번째 키워드 검색
      const keywords = config.keywords
        .split(',')
        .map((k) => k.trim())
        .filter((k) => k.length > 0);
      if (keywords.length === 0) {
        this.isRunning = false;
        return {
          success: false,
          message: '검색할 키워드가 없습니다.',
        };
      }

      const firstKeyword = keywords[0];
      console.log(`[SourcingService] 첫 번째 키워드 검색: ${firstKeyword}`);

      // 첫 번째 키워드 검색 실행
      const searchResult = await this.searchFirstKeyword(firstKeyword);
      if (!searchResult.success) {
        this.isRunning = false;
        return searchResult;
      }

      // 쇼핑 탭 클릭
      const shoppingResult = await this.clickShoppingTab();
      if (!shoppingResult.success) {
        this.isRunning = false;
        return shoppingResult;
      }

      // 새 탭으로 전환
      const switchResult = await this.switchToNewTab();
      if (!switchResult.success) {
        this.isRunning = false;
        return switchResult;
      }

      // 첫 번째 키워드 데이터 수집
      const firstDataResult = await this.fetchShoppingData(firstKeyword);
      if (!firstDataResult.success) {
        this.isRunning = false;
        return firstDataResult;
      }

      // 나머지 키워드들 처리
      if (keywords.length > 1) {
        const remainingKeywords = keywords.slice(1);
        await this.processRemainingKeywords(remainingKeywords);
      }

      this.isRunning = false;
      return {
        success: true,
        message: '소싱이 완료되었습니다.',
      };
    } catch (error) {
      console.error('[SourcingService] 소싱 시작 오류:', error);
      this.isRunning = false;
      return {
        success: false,
        message: '소싱 시작 중 오류가 발생했습니다.',
      };
    }
  }

  /**
   * 소싱 중지
   * @returns SourcingResult
   */
  async stopSourcing(): Promise<SourcingResult> {
    try {
      console.log('[SourcingService] 소싱 중지 요청');

      if (!this.isRunning) {
        return {
          success: false,
          message: '실행 중인 소싱이 없습니다.',
        };
      }

      this.isRunning = false;
      this.currentConfig = null;

      console.log('[SourcingService] 소싱 중지 완료');
      return {
        success: true,
        message: '소싱이 중지되었습니다.',
      };
    } catch (error) {
      console.error('[SourcingService] 소싱 중지 오류:', error);
      return {
        success: false,
        message: '소싱 중지 중 오류가 발생했습니다.',
      };
    }
  }

  /**
   * 설정 검증
   * @param config 소싱 설정
   * @returns boolean
   */
  private validateConfig(config: SourcingConfig): boolean {
    if (!config) {
      return false;
    }

    // 키워드 검사
    if (!config.keywords || config.keywords.trim() === '') {
      return false;
    }

    // 최소 하나의 플랫폼은 선택되어야 함
    if (!config.includeNaver && !config.includeAuction) {
      return false;
    }

    return true;
  }

  /**
   * 현재 소싱 상태 확인
   * @returns boolean
   */
  isSourcingRunning(): boolean {
    return this.isRunning;
  }

  /**
   * 현재 소싱 설정
   * @returns SourcingConfig | null
   */
  getCurrentConfig(): SourcingConfig | null {
    return this.currentConfig;
  }

  /**
   * 네이버 메인 페이지로 이동
   * @returns SourcingResult
   */
  private async navigateToNaverMain(): Promise<SourcingResult> {
    try {
      console.log('[SourcingService] 네이버 메인 페이지로 이동...');

      const page = browserService.getCurrentPage();
      if (!page || !browserService.isCurrentPageValid()) {
        return {
          success: false,
          message: '페이지를 찾을 수 없습니다.',
        };
      }

      await page.goto('https://www.naver.com', {
        waitUntil: 'domcontentloaded',
        timeout: 30000,
      });

      console.log('[SourcingService] 네이버 메인 페이지 로딩 완료');
      return {
        success: true,
        message: '네이버 메인 페이지로 이동 완료',
      };
    } catch (error) {
      console.error('[SourcingService] 네이버 메인 페이지 이동 오류:', error);
      return {
        success: false,
        message: '네이버 메인 페이지 이동 중 오류가 발생했습니다.',
      };
    }
  }

  /**
   * 첫 번째 키워드 검색
   * @param keyword 검색 키워드
   * @returns SourcingResult
   */
  private async searchFirstKeyword(keyword: string): Promise<SourcingResult> {
    try {
      console.log(`[SourcingService] 첫 번째 키워드 검색 시작: ${keyword}`);

      const page = browserService.getCurrentPage();
      if (!page || !browserService.isCurrentPageValid()) {
        return {
          success: false,
          message: '페이지를 찾을 수 없습니다.',
        };
      }

      // 자연스러운 키워드 입력
      const inputSuccess = await findAndTypeNaturallyMultiple(page, ['#query'], keyword, {
        minDelay: 100,
        maxDelay: 250,
        copyPasteChance: 0.2,
        mistakeChance: 0.1,
        correctionChance: 1.0,
      });

      if (!inputSuccess) {
        return {
          success: false,
          message: '검색창을 찾을 수 없거나 키워드 입력에 실패했습니다.',
        };
      }

      console.log('[SourcingService] 자연스러운 키워드 입력 완료');

      // 자연스러운 검색 실행 (엔터키 65% vs 검색버튼 35%)
      const searchSuccess = await executeNaverMainSearch(page);
      if (!searchSuccess) {
        return {
          success: false,
          message: '검색 실행에 실패했습니다.',
        };
      }

      console.log('[SourcingService] 자연스러운 검색 실행 완료');

      return {
        success: true,
        message: `키워드 "${keyword}" 검색이 완료되었습니다.`,
      };
    } catch (error) {
      console.error('[SourcingService] 첫 번째 키워드 검색 오류:', error);
      return {
        success: false,
        message: '첫 번째 키워드 검색 중 오류가 발생했습니다.',
      };
    }
  }

  /**
   * 쇼핑 탭 클릭 (자연스러운 방식)
   * @returns SourcingResult
   */
  private async clickShoppingTab(): Promise<SourcingResult> {
    try {
      console.log('[SourcingService] 쇼핑 탭 클릭 시작...');

      const page = browserService.getCurrentPage();
      if (!page || !browserService.isCurrentPageValid()) {
        return {
          success: false,
          message: '페이지를 찾을 수 없습니다.',
        };
      }

      // 페이지 로딩 대기
      await new Promise((resolve) => setTimeout(resolve, 3000));

      // 자연스러운 마우스 움직임과 클릭 시뮬레이션
      console.log('[SourcingService] 자연스러운 쇼핑 탭 클릭 시도...');

      const clickResult = await page.evaluate(() => {
        // 1. 모든 링크 요소 찾기
        const allLinks = document.querySelectorAll('a');
        console.log(`전체 링크 수: ${allLinks.length}`);

        // 2. 쇼핑 관련 링크 필터링 (더 정확한 조건)
        const shoppingLinks = Array.from(allLinks).filter((link) => {
          const href = link.getAttribute('href') || '';
          const text = link.textContent?.trim() || '';
          const title = link.getAttribute('title') || '';

          // href에 shopping이 포함되거나, 텍스트가 '쇼핑'인 경우
          const isShoppingHref = href.includes('shopping') || href.includes('where=shopping');
          const isShoppingText = text === '쇼핑' || text.includes('쇼핑');
          const isShoppingTitle = title.includes('쇼핑');

          return isShoppingHref || isShoppingText || isShoppingTitle;
        });

        console.log(`쇼핑 관련 링크 ${shoppingLinks.length}개 발견`);

        // 3. 보이는 링크 중에서 가장 적절한 것 선택
        for (let i = 0; i < shoppingLinks.length; i++) {
          const link = shoppingLinks[i];
          const rect = link.getBoundingClientRect();

          // 링크가 화면에 보이고 클릭 가능한지 확인
          if (
            rect.width > 0 &&
            rect.height > 0 &&
            rect.top >= 0 &&
            rect.left >= 0 &&
            rect.bottom <= window.innerHeight &&
            rect.right <= window.innerWidth
          ) {
            try {
              console.log(`쇼핑 탭 클릭 시도 (${i + 1}/${shoppingLinks.length}): "${link.textContent}" (${link.href})`);

              // 자연스러운 클릭 이벤트 생성
              const clickEvent = new MouseEvent('click', {
                bubbles: true,
                cancelable: true,
                view: window,
                clientX: rect.left + rect.width / 2,
                clientY: rect.top + rect.height / 2,
              });

              // 마우스 이벤트 시뮬레이션
              link.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
              link.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
              link.dispatchEvent(clickEvent);

              console.log('쇼핑 탭 클릭 완료');
              return {
                success: true,
                message: `클릭 성공: "${link.textContent}" (${link.href})`,
                clickedElement: {
                  text: link.textContent,
                  href: link.href,
                  index: i + 1,
                  total: shoppingLinks.length,
                },
              };
            } catch (error) {
              console.log(`클릭 실패: ${error.message}`);
              continue;
            }
          }
        }

        return {
          success: false,
          message: '클릭 가능한 쇼핑 탭을 찾을 수 없습니다.',
          debug: {
            totalLinks: allLinks.length,
            shoppingLinks: shoppingLinks.length,
            shoppingLinksInfo: shoppingLinks.map((link) => ({
              text: link.textContent,
              href: link.href,
              visible: link.getBoundingClientRect().width > 0,
            })),
          },
        };
      });

      if (clickResult.success) {
        console.log('[SourcingService] 자연스러운 쇼핑 탭 클릭 완료:', clickResult.message);

        // 새 탭이 열릴 때까지 충분히 대기
        await new Promise((resolve) => setTimeout(resolve, 3000));

        return {
          success: true,
          message: '자연스러운 쇼핑 탭 클릭이 완료되었습니다.',
        };
      } else {
        console.log('[SourcingService] 쇼핑 탭 클릭 실패:', clickResult.message);
        if (clickResult.debug) {
          console.log('[SourcingService] 디버그 정보:', clickResult.debug);
        }

        return {
          success: false,
          message: '쇼핑 탭을 찾을 수 없습니다.',
        };
      }
    } catch (error) {
      console.error('[SourcingService] 쇼핑 탭 클릭 오류:', error);
      return {
        success: false,
        message: '쇼핑 탭 클릭 중 오류가 발생했습니다.',
      };
    }
  }

  /**
   * 새 탭으로 전환
   * @returns SourcingResult
   */
  private async switchToNewTab(): Promise<SourcingResult> {
    try {
      console.log('[SourcingService] 새 탭으로 전환 중...');

      const browser = browserService.getBrowser();
      if (!browser) {
        return {
          success: false,
          message: '브라우저를 찾을 수 없습니다.',
        };
      }

      const pages = await browser.pages();
      console.log(`[SourcingService] 현재 탭 수: ${pages.length}`);

      if (pages.length > 1) {
        const newPage = pages[pages.length - 1];
        browserService.setCurrentPage(newPage);
        console.log('[SourcingService] 새 탭으로 전환 완료');

        // 쇼핑 서비스 접속 제한 화면 감지
        const restrictionCheck = await this.checkForRestrictionPage();
        if (!restrictionCheck.success) {
          return {
            success: false,
            message: '쇼핑 서비스 접속이 일시적으로 제한되었습니다. 잠시 후 다시 시도해주세요.',
          };
        }
      }

      return {
        success: true,
        message: '새 탭으로 전환이 완료되었습니다.',
      };
    } catch (error) {
      console.error('[SourcingService] 새 탭 전환 오류:', error);
      return {
        success: false,
        message: '새 탭 전환 중 오류가 발생했습니다.',
      };
    }
  }

  /**
   * 쇼핑 데이터 수집
   * @param keyword 검색 키워드
   * @returns SourcingResult
   */
  private async fetchShoppingData(keyword: string): Promise<SourcingResult> {
    try {
      console.log(`[SourcingService] 쇼핑 데이터 수집 시작...`);
      console.log(`[SourcingService] 쇼핑 데이터 수집: "${keyword}"`);

      const page = browserService.getCurrentPage();
      if (!page || !browserService.isCurrentPageValid()) {
        return {
          success: false,
          message: '페이지를 찾을 수 없습니다.',
        };
      }

      // 현재 페이지 상태 확인
      const currentUrl = await page.url();
      const pageTitle = await page.title();
      console.log(`[SourcingService] 현재 페이지 URL: ${currentUrl}`);
      console.log(`[SourcingService] 현재 페이지 제목: ${pageTitle}`);

      // 페이지가 쇼핑 검색 결과 페이지인지 확인
      if (!currentUrl.includes('shopping.naver.com')) {
        console.error('[SourcingService] 쇼핑 페이지가 아님:', currentUrl);
        return {
          success: false,
          message: '현재 페이지가 네이버 쇼핑 페이지가 아닙니다.',
        };
      }

      // 가격비교 화면이 완전히 로드될 때까지 대기
      console.log('[SourcingService] 가격비교 화면 완전 로딩 대기 중...');
      try {
        // DOM이 완전히 로드될 때까지 대기
        await page.waitForFunction(() => document.readyState === 'complete', { timeout: 10000 });

        // 추가로 페이지 내 주요 요소들이 로드되기를 기다림
        await new Promise((resolve) => setTimeout(resolve, 1000));
      } catch {
        console.log('[SourcingService] 페이지 로딩 대기 시간 초과, 계속 진행');
      }

      // 추가 딜레이 (화면이 완전히 안정화될 때까지)
      await new Promise((resolve) => setTimeout(resolve, 2000));
      console.log('[SourcingService] 가격비교 화면 로딩 완료, API 호출 시작');

      // TODO: 임시로 API 방식을 실패 처리하여 클릭 방식 테스트
      console.log('[SourcingService] API 방식을 임시로 비활성화, 클릭 방식으로 대체');

      // API 방식 시도 (실제 코드는 주석 처리)
      /*
      const encodedKeyword = encodeURIComponent(keyword);
      const apiUrl = `/api/search/all?sort=rel&pagingIndex=1&pagingSize=80&viewType=list&productSet=checkout&frm=NVSCPRO&query=${encodedKeyword}&origQuery=${encodedKeyword}&adQuery=${encodedKeyword}&iq=&eq=&xq=&window=&agency=true`;
      console.log(`[SourcingService] API URL: ${apiUrl}`);
      */

      // API 방식 실패로 가정하고 클릭 방식으로 대체
      console.log('[SourcingService] API 방식 실패, 클릭 방식으로 데이터 수집 시도');
      return await this.collectDataByClicking(page, keyword);

      /*
      // 기존 API 코드 (임시 비활성화)
      const encodedKeyword = encodeURIComponent(keyword);
      const apiUrl = \`/api/search/all?sort=rel&pagingIndex=1&pagingSize=80&viewType=list&productSet=checkout&frm=NVSCPRO&query=\${encodedKeyword}&origQuery=\${encodedKeyword}&adQuery=\${encodedKeyword}&iq=&eq=&xq=&window=&agency=true\`;
      console.log(\`[SourcingService] API URL: \${apiUrl}\`);

      // API 데이터 가져오기 (성공한 쿼리 함수 기반으로 수정)
      const data = await page.evaluate(async (url: string) => {
        try {
          console.log('[API] fetch 시작:', url);
          const response = await fetch(url, {
            method: 'GET',
            headers: {
              Accept: 'application/json, text/plain, */*',
              Logic: 'PART',
            },
          });
          console.log('[API] 응답 상태:', response.status, response.statusText);
          console.log('[API] 응답 헤더:', Object.fromEntries(response.headers.entries()));

          if (!response.ok) {
            console.error('[API] HTTP 오류:', response.status, response.statusText);
            const errorText = await response.text();
            console.error('[API] 오류 응답 내용:', errorText);
            return {
              error: true,
              status: response.status,
              statusText: response.statusText,
              errorText: errorText,
            };
          }

          const result = await response.json();
          console.log('[API] JSON 파싱 성공');
          console.log('[API] 응답 구조:', Object.keys(result));

          // 전체 응답 구조 출력용 복사본 생성 (로그용으로만 상품 데이터 제거)
          const logResult = JSON.parse(JSON.stringify(result)); // 깊은 복사
          console.log('[API] =========================== 전체 응답 구조 시작 ===========================');
          console.log(JSON.stringify(logResult, null, 2));
          console.log('[API] =========================== 전체 응답 구조 끝 ===========================');

          if (logResult.products) {
            console.log('[API] 최상위 상품 배열 존재, 길이:', logResult.products.length);
            logResult.products = []; // 로그용 복사본에서만 빈 배열로 처리
          }

          if (logResult.shoppingResult && logResult.shoppingResult.products) {
            console.log('[API] shoppingResult.products 배열 존재, 길이:', logResult.shoppingResult.products.length);
            logResult.shoppingResult.products = []; // 로그용 복사본에서만 빈 배열로 처리
          }


          return result;
        } catch (error) {
          console.error('[API] fetch 예외:', error.message);
          console.error('[API] 예외 스택:', error.stack);
          return {
            error: true,
            message: error.message,
            stack: error.stack,
          };
        }
      }, apiUrl);

      // 응답 결과 분석
      if (data && data.error) {
        console.error(`[SourcingService] API 오류 응답:`, data);

        // 네이버 쇼핑 서비스 접속 제한 감지 (HTTP 418 또는 제한 화면 HTML)
        if (
          data.status === 418 ||
          (data.errorText && data.errorText.includes('쇼핑 서비스 접속이 일시적으로 제한되었습니다'))
        ) {
          return {
            success: false,
            message: '네이버 쇼핑 호출이 일시적으로 블록되었습니다. 잠시 후 다시 시도해주세요.',
          };
        }

        return {
          success: false,
          message: `API 호출 오류: ${data.status || 'Unknown'} - ${data.message || data.statusText || 'API 요청이 실패했습니다.'}`,
        };
      }

      // 상품 데이터 추출 (여러 경로 시도)
      let products = null;
      let productCount = 0;

      if (data && data.products) {
        products = data.products;
        productCount = products.length;
        console.log(`[SourcingService] 최상위 products에서 데이터 발견: ${productCount}개`);
      } else if (data && data.shoppingResult && data.shoppingResult.products) {
        products = data.shoppingResult.products;
        productCount = products.length;
        console.log(`[SourcingService] shoppingResult.products에서 데이터 발견: ${productCount}개`);
      } else {
        console.error(`[SourcingService] 상품 데이터를 찾을 수 없음. 응답 구조:`, Object.keys(data || {}));
        if (data && data.shoppingResult) {
          console.error(`[SourcingService] shoppingResult 구조:`, Object.keys(data.shoppingResult));
        }
        return {
          success: false,
          message: '상품 데이터를 찾을 수 없습니다. API 응답 구조를 확인해주세요.',
        };
      }

      if (products && productCount > 0) {
        console.log(`[SourcingService] API fetch 결과 성공!`);
        console.log(`[SourcingService] 상품 개수: ${productCount}`);

        return {
          success: true,
          message: `키워드 "${keyword}" 데이터 수집 완료: ${productCount}개 상품`,
          data: products,
        };
      } else {
        return {
          success: false,
          message: '상품 데이터가 비어있습니다.',
        };
      }
    } catch (error) {
      console.error('[SourcingService] 쇼핑 데이터 수집 오류:', error);
      return {
        success: false,
        message: '쇼핑 데이터 수집 중 오류가 발생했습니다.',
      };
    }
  }

  /**
   * 나머지 키워드들 처리
   * @param keywords 나머지 키워드들
   * @returns Promise<void>
   */
  private async processRemainingKeywords(keywords: string[]): Promise<void> {
    console.log(`[SourcingService] 나머지 키워드들 처리 시작...`);
    console.log(`[SourcingService] 나머지 키워드 ${keywords.length}개:`, keywords);

    for (let i = 0; i < keywords.length; i++) {
      const keyword = keywords[i];
      console.log(`[SourcingService] 키워드 ${i + 1}/${keywords.length} 처리: "${keyword}"`);

      try {
        // 키워드 검색
        const searchResult = await this.searchKeywordInShoppingTab(keyword);
        if (!searchResult.success) {
          console.log(`[SourcingService] 키워드 "${keyword}" 검색 실패: ${searchResult.message}`);
          continue;
        }

        // 데이터 수집
        const dataResult = await this.fetchShoppingData(keyword);
        if (dataResult.success) {
          console.log(`[SourcingService] 키워드 "${keyword}" 데이터 수집 완료: ${dataResult.data?.length || 0}개 상품`);
        }

        // 다음 키워드 처리 전 대기
        console.log('[SourcingService] 다음 키워드 처리 전 대기 중...');
        await new Promise((resolve) => setTimeout(resolve, Math.random() * 1200 + 800));
      } catch (error) {
        console.error(`[SourcingService] 키워드 "${keyword}" 처리 오류:`, error);
      }
    }

    console.log(`[SourcingService] 나머지 키워드 처리 완료: ${keywords.length}개 키워드 성공`);
  }

  /**
   * 쇼핑 탭에서 키워드 검색
   * @param keyword 검색 키워드
   * @returns SourcingResult
   */
  private async searchKeywordInShoppingTab(keyword: string): Promise<SourcingResult> {
    try {
      console.log(`[SourcingService] 쇼핑 탭에서 키워드 검색: ${keyword}`);

      const page = browserService.getCurrentPage();
      if (!page || !browserService.isCurrentPageValid()) {
        return {
          success: false,
          message: '페이지를 찾을 수 없습니다.',
        };
      }

      // 쇼핑 탭에서 자연스러운 키워드 입력 (여러 선택자 시도)
      const shoppingInputSuccess = await findAndTypeNaturallyMultiple(
        page,
        [
          'form[name="search"] input[type="text"]', // 가격비교 페이지 검색창 (확인됨)
          'input[name="query"]',
          'input[id="query"]',
          'input.input_search',
          'input[data-testid="search-input"]',
          'input[placeholder*="검색"]',
          'input[id*="search"]',
          'input[name*="search"]',
          '#_search_input',
          '.search_input',
          'input[type="text"]',
        ],
        keyword,
        {
          minDelay: 120,
          maxDelay: 280,
          copyPasteChance: 0.25,
          mistakeChance: 0.12,
          correctionChance: 1.0,
        },
      );

      if (!shoppingInputSuccess) {
        return {
          success: false,
          message: '쇼핑 탭에서 검색창을 찾을 수 없거나 키워드 입력에 실패했습니다.',
        };
      }

      console.log('[SourcingService] 쇼핑 탭 자연스러운 키워드 입력 완료');

      // 쇼핑 탭에서 자연스러운 검색 실행 (엔터키 75% vs 검색버튼 25%)
      const shoppingSearchSuccess = await executeShoppingTabSearch(page);
      if (!shoppingSearchSuccess) {
        return {
          success: false,
          message: '쇼핑 탭에서 검색 실행에 실패했습니다.',
        };
      }

      console.log('[SourcingService] 쇼핑 탭 자연스러운 검색 실행 완료');
      return {
        success: true,
        message: '엔터 키로 검색이 완료되었습니다.',
      };
    } catch (error) {
      console.error('[SourcingService] 쇼핑 탭 키워드 검색 오류:', error);
      return {
        success: false,
        message: '쇼핑 탭에서 키워드 검색 중 오류가 발생했습니다.',
      };
    }
  }

  /**
   * 쇼핑 서비스 접속 제한 화면 감지
   * @returns SourcingResult
   */
  private async checkForRestrictionPage(): Promise<SourcingResult> {
    try {
      console.log('[SourcingService] 쇼핑 서비스 접속 제한 화면 감지 중...');

      const page = browserService.getCurrentPage();
      if (!page) {
        return {
          success: false,
          message: '페이지를 찾을 수 없습니다.',
        };
      }

      // 페이지 로딩 대기
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // 제한 화면 감지 로직
      const hasRestriction = await page.evaluate(() => {
        // 1. 제한 화면의 고유 클래스 확인
        const errorContent = document.querySelector('.content_error');
        if (errorContent) {
          console.log('content_error 클래스 감지됨');
          return true;
        }

        // 2. 제한 화면의 특정 텍스트 확인
        const restrictionTexts = [
          '쇼핑 서비스 접속이 일시적으로 제한되었습니다',
          '네이버는 안정적인 쇼핑 서비스 제공하고자',
          '비정상적인 접근이 감지될 경우',
          '해당 네트워크의 접속을 일시적으로 제한하고 있습니다',
        ];

        for (const text of restrictionTexts) {
          if (document.body.textContent?.includes(text)) {
            console.log(`제한 화면 텍스트 감지: ${text}`);
            return true;
          }
        }

        // 3. 제한 화면의 특정 요소들 확인
        const restrictionSelectors = [
          '.content_error .head',
          '.content_error .desc',
          '.content_error .reason',
          '.content_error .footer',
        ];

        for (const selector of restrictionSelectors) {
          const element = document.querySelector(selector);
          if (element && element.textContent?.includes('제한')) {
            console.log(`제한 화면 요소 감지: ${selector}`);
            return true;
          }
        }

        // 4. URL 패턴 확인
        const currentUrl = window.location.href;
        if (
          currentUrl.includes('shopping.naver.com') &&
          (currentUrl.includes('error') || currentUrl.includes('restrict'))
        ) {
          console.log('제한 화면 URL 패턴 감지');
          return true;
        }

        return false;
      });

      if (hasRestriction) {
        console.log('[SourcingService] 쇼핑 서비스 접속 제한 화면 감지됨');
        return {
          success: false,
          message: '쇼핑 서비스 접속이 일시적으로 제한되었습니다. 잠시 후 다시 시도해주세요.',
        };
      }

      console.log('[SourcingService] 쇼핑 서비스 접속 제한 화면 없음');
      return {
        success: true,
        message: '정상적인 쇼핑 페이지입니다.',
      };
    } catch (error) {
      console.error('[SourcingService] 제한 화면 감지 오류:', error);
      return {
        success: true, // 오류 시 정상으로 간주
        message: '제한 화면 감지 중 오류가 발생했습니다.',
      };
    }
  }

  /**
   * 소싱 진행상황 가져오기
   * @returns any
   */
  getProgress(): any {
    return {
      isRunning: this.isRunning,
      config: this.currentConfig,
      progress: this.isRunning ? '소싱 진행 중...' : '대기 중',
    };
  }

  /**
   * 클릭 방식으로 상품 데이터 수집 (껍데기 함수)
   * @param page Puppeteer 페이지 인스턴스
   * @param keyword 검색 키워드
   */
  private async collectDataByClicking(page: any, keyword: string): Promise<SourcingResult> {
    try {
      console.log(`[SourcingService] 클릭 방식 데이터 수집 시작 - 키워드: "${keyword}"`);

      // TODO: 실제 클릭 방식 데이터 수집 로직 구현
      // 1. 페이지에서 상품 목록 요소들 찾기
      // 2. 각 상품 요소를 클릭하여 상세 정보 수집
      // 3. 수집된 데이터 정리 및 반환

      // 임시로 성공 응답 반환
      console.log('[SourcingService] 클릭 방식 데이터 수집 완료 (임시 구현)');

      return {
        success: true,
        message: `클릭 방식으로 키워드 "${keyword}" 데이터 수집 완료 (임시)`,
        data: [], // 임시로 빈 배열 반환
      };
    } catch (error) {
      console.error('[SourcingService] 클릭 방식 데이터 수집 오류:', error);
      return {
        success: false,
        message: '클릭 방식 데이터 수집 중 오류가 발생했습니다.',
      };
    }
  }
}

// 싱글톤 인스턴스
export const sourcingService = SourcingService.getInstance();
