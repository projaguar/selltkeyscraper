/**
 * 벤치마킹 소싱 서비스
 * 경쟁사 상품 분석 및 소싱 비즈니스 로직을 담당
 */

import { browserService } from './browserService';

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
  private isRunning: boolean = false;
  private currentConfig: SourcingConfig | null = null;

  /**
   * 소싱 시작
   * @param config 소싱 설정
   * @returns SourcingResult
   */
  async startSourcing(config: SourcingConfig): Promise<SourcingResult> {
    try {
      // 이미 실행 중인지 확인
      if (this.isRunning) {
        return {
          success: false,
          message: '이미 소싱이 진행 중입니다.',
        };
      }

      // 설정 유효성 검사
      if (!this.validateConfig(config)) {
        return {
          success: false,
          message: '소싱 설정이 올바르지 않습니다.',
        };
      }

      // 소싱 상태 설정
      this.isRunning = true;
      this.currentConfig = config;

      console.log('[SourcingService] 소싱 시작:', config);

      // 실제 소싱 로직 구현
      // 1. 브라우저 초기화 및 로그인 상태 확인
      await browserService.initializeBrowser();
      const isLoggedIn = await browserService.checkNaverLoginStatus();

      if (!isLoggedIn) {
        return {
          success: false,
          message: '네이버 로그인이 필요합니다. 먼저 로그인해주세요.',
        };
      }

      // 2. 네이버 메인 페이지로 이동
      const mainPageResult = await this.navigateToNaverMain();
      if (!mainPageResult.success) {
        return mainPageResult;
      }

      // 3. 보안 화면 확인 및 대기 (임시 비활성화)
      // const securityCheckResult = await this.waitForSecurityCheck();
      // if (!securityCheckResult.success) {
      //   return securityCheckResult;
      // }
      console.log('[SourcingService] 보안 화면 확인 건너뛰기');

      // 4. 첫 번째 키워드로 검색 시작
      const searchResult = await this.searchFirstKeyword(config.keywords);
      if (!searchResult.success) {
        return searchResult;
      }

      // 5. 검색 결과에서 쇼핑 탭 클릭
      const shoppingTabResult = await this.clickShoppingTab();
      if (!shoppingTabResult.success) {
        return shoppingTabResult;
      }

      // 6. 새 탭으로 전환
      const switchTabResult = await this.switchToNewTab();
      if (!switchTabResult.success) {
        return switchTabResult;
      }

      console.log('[SourcingService] 새 탭으로 전환 완료');

      // 7. 상품 데이터 수집
      const productDataResult = await this.fetchShoppingData(config.keywords);
      if (!productDataResult.success) {
        return productDataResult;
      }

      // console.log('[SourcingService] 상품 데이터 수집 완료', productDataResult.data);

      return {
        success: true,
        message: '벤치마킹 소싱이 완료되었습니다.',
        data: {
          config,
          startTime: new Date().toISOString(),
          searchResult: searchResult.data,
          shoppingTabResult: shoppingTabResult.data,
          switchTabResult: switchTabResult.data,
          productData: productDataResult.data,
        },
      };
    } catch (error) {
      console.error('[SourcingService] 소싱 시작 오류:', error);
      this.isRunning = false;
      this.currentConfig = null;

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
      if (!this.isRunning) {
        return {
          success: false,
          message: '소싱이 실행 중이 아닙니다.',
        };
      }

      console.log('[SourcingService] 소싱 중지');

      // TODO: 실제 소싱 중지 로직 구현
      // 1. 진행 중인 크롤링 작업 중단
      // 2. 리소스 정리
      // 3. 상태 초기화

      this.isRunning = false;
      this.currentConfig = null;

      return {
        success: true,
        message: '벤치마킹 소싱이 중지되었습니다.',
        data: {
          stopTime: new Date().toISOString(),
        },
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
   * 설정 유효성 검사
   * @param config 소싱 설정
   * @returns boolean
   */
  private validateConfig(config: SourcingConfig): boolean {
    // 최저/최고금액 검사
    const minAmount = parseFloat(config.minAmount);
    const maxAmount = parseFloat(config.maxAmount);

    if (isNaN(minAmount) || isNaN(maxAmount) || minAmount < 0 || maxAmount < 0) {
      return false;
    }

    if (minAmount >= maxAmount) {
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

      // 현재 페이지 가져오기
      let page = browserService.getCurrentPage();
      if (!page || !browserService.isCurrentPageValid()) {
        page = await browserService.createPage();
        browserService.setCurrentPage(page);
      }

      // 네이버 메인 페이지로 이동
      await page.goto('https://www.naver.com', {
        waitUntil: 'domcontentloaded',
        timeout: 10000,
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
   * 첫 번째 키워드로 검색 실행
   * @param keywords 키워드 문자열 (쉼표로 구분)
   * @returns SourcingResult
   */
  private async searchFirstKeyword(keywords: string): Promise<SourcingResult> {
    try {
      // 키워드 파싱 (쉼표로 구분)
      const keywordList = keywords
        .split(',')
        .map((k) => k.trim())
        .filter((k) => k.length > 0);

      if (keywordList.length === 0) {
        return {
          success: false,
          message: '검색할 키워드가 없습니다.',
        };
      }

      const firstKeyword = keywordList[0];
      console.log('[SourcingService] 첫 번째 키워드 검색 시작:', firstKeyword);

      // 현재 페이지 가져오기 (이미 네이버 메인 페이지에 있어야 함)
      const page = browserService.getCurrentPage();
      if (!page || !browserService.isCurrentPageValid()) {
        return {
          success: false,
          message: '페이지를 찾을 수 없습니다.',
        };
      }

      // 검색창 찾기 및 키워드 입력
      const searchResult = await this.inputKeywordToSearchBox(firstKeyword);
      if (!searchResult.success) {
        return searchResult;
      }

      // 검색 실행
      const executeResult = await this.executeSearch();
      if (!executeResult.success) {
        return executeResult;
      }

      return {
        success: true,
        message: `키워드 "${firstKeyword}" 검색이 완료되었습니다.`,
        data: {
          keyword: firstKeyword,
          searchUrl: page.url(),
          remainingKeywords: keywordList.slice(1),
        },
      };
    } catch (error) {
      console.error('[SourcingService] 키워드 검색 오류:', error);
      return {
        success: false,
        message: '키워드 검색 중 오류가 발생했습니다.',
      };
    }
  }

  /**
   * 검색창에 키워드 입력
   * @param keyword 검색 키워드
   * @returns SourcingResult
   */
  private async inputKeywordToSearchBox(keyword: string): Promise<SourcingResult> {
    try {
      // 현재 페이지 가져오기
      const page = browserService.getCurrentPage();
      if (!page || !browserService.isCurrentPageValid()) {
        return {
          success: false,
          message: '페이지를 찾을 수 없습니다.',
        };
      }

      // 네이버 메인 페이지 검색창 선택자들
      const searchSelectors = [
        '#query', // 네이버 메인 검색창 ID
        'input[name="query"]', // 네이버 메인 검색창 name
        'input[placeholder*="검색어를 입력하세요"]', // 네이버 메인 검색창 placeholder
        'input[placeholder*="검색"]', // 검색 placeholder가 있는 입력창
        'input[type="search"]', // search 타입 입력창
        '.search_input', // 검색 입력 클래스
        '#nx_query', // 네이버 검색창 대체 ID
      ];

      let searchInput = null;
      for (const selector of searchSelectors) {
        try {
          searchInput = await page.$(selector);
          if (searchInput) {
            console.log(`[SourcingService] 검색창 발견: ${selector}`);
            break;
          }
        } catch {
          continue;
        }
      }

      if (!searchInput) {
        return {
          success: false,
          message: '검색창을 찾을 수 없습니다.',
        };
      }

      // 검색창 클리어 및 키워드 입력
      await searchInput.click();
      await searchInput.evaluate((input: any) => (input.value = '')); // 기존 값 클리어
      await searchInput.type(keyword, { delay: 100 }); // 타이핑 속도 조절

      console.log(`[SourcingService] 키워드 입력 완료: "${keyword}"`);

      return {
        success: true,
        message: '키워드 입력이 완료되었습니다.',
      };
    } catch (error) {
      console.error('[SourcingService] 키워드 입력 오류:', error);
      return {
        success: false,
        message: '키워드 입력 중 오류가 발생했습니다.',
      };
    }
  }

  /**
   * 검색 실행 (검색 버튼 클릭 또는 엔터키)
   * @returns SourcingResult
   */
  private async executeSearch(): Promise<SourcingResult> {
    try {
      // 현재 페이지 가져오기
      const page = browserService.getCurrentPage();
      if (!page || !browserService.isCurrentPageValid()) {
        return {
          success: false,
          message: '페이지를 찾을 수 없습니다.',
        };
      }

      // 네이버 메인 페이지 검색 버튼 선택자들
      const searchButtonSelectors = [
        '.btn_search', // 네이버 메인 검색 버튼 클래스
        '#search_btn', // 네이버 메인 검색 버튼 ID
        'button[type="submit"]', // submit 버튼
        'button[class*="search"]', // search가 포함된 버튼 클래스
        'input[type="submit"]', // submit 타입 입력
        '.search_btn', // 검색 버튼 클래스
      ];

      let searchButton = null;
      for (const selector of searchButtonSelectors) {
        try {
          searchButton = await page.$(selector);
          if (searchButton) {
            console.log(`[SourcingService] 검색 버튼 발견: ${selector}`);
            break;
          }
        } catch {
          continue;
        }
      }

      if (searchButton) {
        // 검색 버튼 클릭
        await searchButton.click();
        console.log('[SourcingService] 검색 버튼 클릭 완료');
      } else {
        // 검색 버튼이 없으면 엔터키로 검색 실행
        await page.keyboard.press('Enter');
        console.log('[SourcingService] 엔터키로 검색 실행');
      }

      // 검색 결과 페이지 로딩 대기
      await page.waitForNavigation({
        waitUntil: 'domcontentloaded',
        timeout: 10000,
      });

      console.log('[SourcingService] 검색 결과 페이지 로딩 완료');

      return {
        success: true,
        message: '검색이 실행되었습니다.',
      };
    } catch (error) {
      console.error('[SourcingService] 검색 실행 오류:', error);
      return {
        success: false,
        message: '검색 실행 중 오류가 발생했습니다.',
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

      // 모든 탭 가져오기
      const pages = await browser.pages();
      console.log(`[SourcingService] 현재 탭 수: ${pages.length}`);

      if (pages.length < 2) {
        return {
          success: false,
          message: '새 탭이 열리지 않았습니다.',
        };
      }

      // 가장 최근에 열린 탭 (마지막 탭)으로 전환
      const newPage = pages[pages.length - 1];
      browserService.setCurrentPage(newPage);

      // 새 탭이 로딩될 때까지 대기
      await new Promise(resolve => setTimeout(resolve, 3000));

      console.log('[SourcingService] 새 탭으로 전환 완료');
      return {
        success: true,
        message: '새 탭으로 전환되었습니다.',
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
   * @param keywords 키워드 문자열
   * @returns SourcingResult
   */
  private async fetchShoppingData(keywords: string): Promise<SourcingResult> {
    try {
      console.log('[SourcingService] 쇼핑 데이터 수집 시작...');

      // 현재 페이지 가져오기 (새 탭)
      const page = browserService.getCurrentPage();
      if (!page || !browserService.isCurrentPageValid()) {
        return {
          success: false,
          message: '페이지를 찾을 수 없습니다.',
        };
      }

      // 키워드 파싱 (첫 번째 키워드 사용)
      const keywordList = keywords
        .split(',')
        .map((k) => k.trim())
        .filter((k) => k.length > 0);

      if (keywordList.length === 0) {
        return {
          success: false,
          message: '검색할 키워드가 없습니다.',
        };
      }

      const firstKeyword = keywordList[0];
      console.log(`[SourcingService] 쇼핑 데이터 수집: "${firstKeyword}"`);

      // 네이버 쇼핑 API URL 생성
      const encodedKeyword = encodeURIComponent(firstKeyword);
      const apiUrl = `https://search.shopping.naver.com/api/search/all?sort=rel&pagingIndex=1&pagingSize=80&viewType=list&productSet=checkout&frm=NVSCPRO&query=${encodedKeyword}&origQuery=${encodedKeyword}&adQuery=${encodedKeyword}&iq=&eq=&xq=&window=&agency=true`;

      console.log('[SourcingService] API URL:', apiUrl);

      // TODO: 임시로 API 방식을 실패 처리하여 클릭 방식 테스트
      console.log('[SourcingService] API 방식을 임시로 비활성화, 클릭 방식으로 대체');

      // API 방식 실패로 가정하고 클릭 방식으로 대체
      console.log('[SourcingService] API 방식 실패, 클릭 방식으로 데이터 수집 시도');
      return await this.collectDataByClicking(page, firstKeyword);

      /*
      // JavaScript inject로 API fetch 실행 (임시 비활성화)
      const fetchResult = await page.evaluate(async (url) => {
        try {
          console.log('🌐 API fetch 시작:', url);

          const response = await fetch(url, {
            method: 'GET',
            headers: {
              'Accept': 'application/json',
              'Content-Type': 'application/json',
              'User-Agent': navigator.userAgent,
              'Referer': 'https://search.shopping.naver.com/',
              'Origin': 'https://search.shopping.naver.com'
            },
            credentials: 'include' // 쿠키 포함
          });

          if (!response.ok) {
            throw new Error('HTTP error! status: ' + response.status);
          }

          const data = await response.json();
          console.log('✅ API fetch 성공');

          return {
            success: true,
            data: data
          };
        } catch (error) {
          console.log('❌ API fetch 실패:', error.message);
          return {
            success: false,
            error: error.message
          };
        }
      }, apiUrl);

      if (fetchResult.success) {
        console.log('[SourcingService] API fetch 결과 성공!');

        // 실제 필요한 데이터만 추출
        const products = fetchResult.data.shoppingResult?.products || [];
        console.log(`[SourcingService] 상품 개수: ${products.length}`);

        return {
          success: true,
          message: `쇼핑 데이터 수집 완료 (${products.length}개 상품)`,
          data: {
            keyword: firstKeyword,
            products: products,
            totalCount: products.length,
            apiData: fetchResult.data
          }
        };
      } else {
        console.log('[SourcingService] API fetch 실패:', fetchResult.error);
        return {
          success: false,
          message: `쇼핑 데이터 수집 실패: ${fetchResult.error}`,
        };
      }
      */
    } catch (error) {
      console.error('[SourcingService] 쇼핑 데이터 수집 오류:', error);
      return {
        success: false,
        message: '쇼핑 데이터 수집 중 오류가 발생했습니다.',
      };
    }
  }

  /**
   * 쇼핑 탭 클릭
   * @returns SourcingResult
   */
  private async clickShoppingTab(): Promise<SourcingResult> {
    try {
      console.log('[SourcingService] ===== 쇼핑 탭 클릭 함수 시작 =====');
      console.log('[SourcingService] 쇼핑 탭 찾는 중...');

      // 현재 페이지 가져오기
      const page = browserService.getCurrentPage();
      if (!page || !browserService.isCurrentPageValid()) {
        return {
          success: false,
          message: '페이지를 찾을 수 없습니다.',
        };
      }

      // 페이지 로딩 완료 대기
      await new Promise(resolve => setTimeout(resolve, 2000));

      // JavaScript로 텍스트 기반 검색 시도
      console.log('[SourcingService] JavaScript로 쇼핑 탭 검색...');
      try {
        const shoppingTabFound = await page.evaluate(() => {
          // 모든 링크와 버튼 요소 찾기
          const allElements = document.querySelectorAll('a, button, [role="tab"], [role="button"]');
          
          // 쇼핑 관련 요소들을 먼저 필터링
          const shoppingElements = Array.from(allElements).filter(element => {
            const text = element.textContent?.toLowerCase() || '';
            const href = element.getAttribute('href') || '';
            
            return (text.includes('쇼핑') || 
                    href.includes('shopping') || 
                    href.includes('where=shopping') ||
                    text.includes('shopping'));
          });

          console.log(`쇼핑 관련 요소 ${shoppingElements.length}개 발견`);

          // 첫 번째로 보이는 쇼핑 요소만 클릭 (한 번만)
          for (let i = 0; i < shoppingElements.length; i++) {
            const element = shoppingElements[i];
            const rect = element.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0) {
              try {
                console.log(`쇼핑 탭 클릭 시도 (${i+1}/${shoppingElements.length}): ${element.textContent} (${element.getAttribute('href')})`);
                (element as HTMLElement).click();
                console.log('쇼핑 탭 클릭 완료 - 함수 종료');
                return { success: true, message: `클릭 성공: ${element.textContent} (${element.getAttribute('href')})` };
              } catch (error) {
                console.log(`클릭 실패: ${error.message}`);
                // 다음 요소로 넘어가기
              }
            }
          }
          return { success: false, message: '클릭 가능한 쇼핑 탭을 찾을 수 없습니다.' };
        });

        if (shoppingTabFound.success) {
          console.log('[SourcingService] JavaScript로 쇼핑 탭 클릭 완료:', shoppingTabFound.message);
          console.log('[SourcingService] ===== 쇼핑 탭 클릭 함수 종료 =====');
          await new Promise(resolve => setTimeout(resolve, 3000));
          return {
            success: true,
            message: '쇼핑 탭 클릭이 완료되었습니다.',
          };
        }
      } catch (jsError) {
        console.log(`[SourcingService] JavaScript 검색 실패: ${jsError.message}`);
      }

      return {
        success: false,
        message: '쇼핑 탭을 찾을 수 없습니다.',
      };
    } catch (error) {
      console.error('[SourcingService] 쇼핑 탭 클릭 오류:', error);
      return {
        success: false,
        message: '쇼핑 탭 클릭 중 오류가 발생했습니다.',
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
export const sourcingService = new SourcingService();
