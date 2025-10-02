/**
 * 벤치마킹 소싱 서비스 (리팩토링 버전)
 * 2-depth 구조로 단순화된 플로우
 */

import axios from 'axios';
import { browserService } from './browserService';
import { Page } from 'puppeteer';

export interface SourcingConfig {
  minAmount: string;
  maxAmount: string;
  keywords: string;
  includeNaver: boolean;
  includeAuction: boolean;
  includeBest: boolean;
  includeNew: boolean;
  usernum?: string;
}

export interface SourcingResult {
  success: boolean;
  message: string;
  data?: any;
}

export class SourcingService {
  private isRunning: boolean = false;
  private currentConfig: SourcingConfig | null = null;

  // ================================================
  // 메인 플로우 (1st Depth)
  // ================================================

  /**
   * 전체 소싱 프로세스 실행
   */
  async startSourcing(config: SourcingConfig): Promise<SourcingResult> {
    try {
      if (this.isRunning) {
        return { success: false, message: '이미 소싱이 진행 중입니다.' };
      }

      this.isRunning = true;
      this.currentConfig = config;
      console.log('[소싱] 전체 프로세스 시작');

      // 브라우저 준비 및 로그인 확인
      const browserResult = await this.prepareBrowser();
      if (!browserResult.success) return browserResult;

      // 키워드 파싱
      const keywords = this.parseKeywords(config.keywords);
      if (keywords.length === 0) {
        return { success: false, message: '검색할 키워드가 없습니다.' };
      }

      // 1. 첫 번째 키워드로 메인 페이지에서 검색
      console.log('[소싱] 첫 번째 키워드로 메인 페이지에서 검색', 1);
      const firstKeyword = keywords[0];
      const searchResult = await this.step1_SearchFromMainPage(browserService.getCurrentPage(), firstKeyword);
      if (!searchResult.success) return searchResult;

      // 2. 쇼핑 탭 클릭하여 새 탭 열기
      const shoppingTabResult = await this.step2_ClickShoppingTab(browserService.getCurrentPage());
      if (!shoppingTabResult.success) return shoppingTabResult;

      // 3. 새 탭에서 데이터 수집
      const newPage = await this.switchToNewTab();
      if (!newPage) return { success: false, message: '새 탭으로 전환 실패' };

      const firstDataResult = await this.step3_CollectData(newPage, firstKeyword);
      if (!firstDataResult.success) return firstDataResult;

      // 4~6. 나머지 키워드들 처리 (같은 탭에서 반복)
      const remainingKeywords = keywords.slice(1);
      for (const keyword of remainingKeywords) {
        // 4. 키워드 검색
        const searchResult = await this.step4_SearchInShoppingTab(newPage, keyword);
        if (!searchResult.success) {
          console.warn(`키워드 "${keyword}" 검색 실패:`, searchResult.message);
          continue;
        }

        // 5. 데이터 수집
        const dataResult = await this.step5_CollectData(newPage, keyword);
        if (!dataResult.success) {
          console.warn(`키워드 "${keyword}" 데이터 수집 실패:`, dataResult.message);
          continue;
        }
      }

      this.isRunning = false;
      return { success: true, message: '전체 소싱 프로세스 완료' };
    } catch (error) {
      console.error('[소싱] 전체 프로세스 오류:', error);
      this.isRunning = false;
      return { success: false, message: '소싱 프로세스 중 오류 발생' };
    }
  }

  /**
   * 소싱 중지
   */
  async stopSourcing(): Promise<SourcingResult> {
    this.isRunning = false;
    this.currentConfig = null;
    return { success: true, message: '소싱이 중지되었습니다.' };
  }

  /**
   * 진행 상황 조회
   */
  getProgress(): any {
    return {
      isRunning: this.isRunning,
      config: this.currentConfig,
      progress: this.isRunning ? '소싱 진행 중...' : '대기 중',
    };
  }

  // ================================================
  // 플로우 단계별 함수들 (2nd Depth)
  // ================================================

  /**
   * 1단계: 메인 페이지에서 첫 번째 키워드 검색
   */
  private async step1_SearchFromMainPage(page: Page, keyword: string): Promise<SourcingResult> {
    try {
      console.log(`[1단계] 메인 페이지에서 "${keyword}" 검색 시작`);

      // 네이버 메인 페이지로 이동
      const navigationResult = await this.navigateToNaverMain(page);
      if (!navigationResult.success) return navigationResult;

      // 키워드 입력
      const inputResult = await this.inputKeyword(page, keyword);
      if (!inputResult.success) return inputResult;

      // 검색 실행
      const executeResult = await this.executeSearch(page);
      if (!executeResult.success) return executeResult;

      console.log(`[1단계] 완료: "${keyword}" 검색 성공`);
      return { success: true, message: '메인 페이지 검색 완료' };
    } catch (error) {
      console.error('[1단계] 오류:', error);
      return { success: false, message: '메인 페이지 검색 실패' };
    }
  }

  /**
   * 2단계: 쇼핑 탭 클릭
   */
  private async step2_ClickShoppingTab(page: Page): Promise<SourcingResult> {
    try {
      console.log('[2단계] 쇼핑 탭 클릭 시작');

      // 페이지 로딩 대기
      await this.waitForPageLoad(page);

      // 쇼핑 탭 찾기 및 클릭
      const clickResult = await this.findAndClickShoppingTab(page);
      if (!clickResult.success) return clickResult;

      console.log('[2단계] 완료: 쇼핑 탭 클릭 성공');
      return { success: true, message: '쇼핑 탭 클릭 완료' };
    } catch (error) {
      console.error('[2단계] 오류:', error);
      return { success: false, message: '쇼핑 탭 클릭 실패' };
    }
  }

  /**
   * 3단계: 새 탭에서 첫 번째 키워드 데이터 수집
   */
  private async step3_CollectData(page: Page, keyword: string): Promise<SourcingResult> {
    try {
      console.log(`[3단계] "${keyword}" 데이터 수집 시작`);

      // 페이지 로딩 대기
      await this.waitForPageLoad(page);

      // 제한 페이지 확인
      const restrictionCheck = await this.checkRestrictionPage(page);
      if (restrictionCheck.isRestricted) {
        return { success: false, message: '접속 제한 페이지 감지' };
      }

      // 데이터 수집 시도 (API 또는 클릭 방식)
      // let dataResult = await this.collectProductDataWithFetch(page, keyword);
      // if (!dataResult.success) {

      const dataResult = await this.collectProductDataWithTouching(page, keyword);
      console.log('[3단계] 클릭 방식 데이터 수집 성공', dataResult);

      if (dataResult.success) {
        console.log('[3단계] 클릭 방식 데이터 수집 성공', dataResult);
        // 데이터 전송
        const res = await this.sendProductDataWithTouching(keyword, dataResult.data.processedData);
        console.log('[3단계] 클릭 방식 데이터 전송 성공', res);
      }

      console.log(`[3단계] 완료: "${keyword}" 데이터 수집 성공`);
      return { success: true, message: '데이터 수집 완료', data: dataResult.data };
    } catch (error) {
      console.error('[3단계] 오류:', error);
      return { success: false, message: '데이터 수집 실패' };
    }
  }

  /**
   * 4단계: 쇼핑 탭에서 키워드 검색
   */
  private async step4_SearchInShoppingTab(page: Page, keyword: string): Promise<SourcingResult> {
    try {
      console.log(`[4단계] 쇼핑 탭에서 "${keyword}" 검색 시작`);

      // 키워드 입력
      const inputResult = await this.inputKeywordInShoppingTab(page, keyword);
      if (!inputResult.success) return inputResult;

      // 검색 실행
      const executeResult = await this.executeSearchInShoppingTab(page);
      if (!executeResult.success) return executeResult;

      console.log(`[4단계] 완료: "${keyword}" 검색 성공`);
      return { success: true, message: '쇼핑 탭 검색 완료' };
    } catch (error) {
      console.error('[4단계] 오류:', error);
      return { success: false, message: '쇼핑 탭 검색 실패' };
    }
  }

  /**
   * 5단계: 데이터 수집 (4단계와 동일하지만 명확성을 위해 분리)
   */
  private async step5_CollectData(page: Page, keyword: string): Promise<SourcingResult> {
    return await this.step3_CollectData(page, keyword);
  }

  // ================================================
  // 세부 작업 함수들 (3rd Depth)
  // ================================================

  /**
   * 브라우저 준비 및 로그인 확인
   */
  private async prepareBrowser(): Promise<SourcingResult> {
    try {
      await browserService.initializeBrowser();
      const isLoggedIn = await browserService.checkNaverLoginStatus();

      if (!isLoggedIn) {
        return { success: false, message: '네이버 로그인이 필요합니다.' };
      }

      return { success: true, message: '브라우저 준비 완료' };
    } catch (error) {
      return { success: false, message: '브라우저 준비 실패' };
    }
  }

  /**
   * 키워드 문자열 파싱
   */
  private parseKeywords(keywordString: string): string[] {
    return keywordString
      .split(',')
      .map((k) => k.trim())
      .filter((k) => k.length > 0);
  }

  /**
   * 새 탭으로 전환
   */
  private async switchToNewTab(): Promise<Page | null> {
    try {
      const browser = browserService.getBrowser();
      if (!browser) return null;

      const pages = await browser.pages();
      if (pages.length < 2) return null;

      const newPage = pages[pages.length - 1];
      browserService.setCurrentPage(newPage);

      await new Promise((resolve) => setTimeout(resolve, 3000));
      return newPage;
    } catch (error) {
      console.error('새 탭 전환 오류:', error);
      return null;
    }
  }

  // ================================================
  // 세부 작업 함수들 (구현 예정)
  // ================================================

  private async navigateToNaverMain(page: Page): Promise<SourcingResult> {
    try {
      console.log('[네이버 메인] 페이지 이동 시작');

      // 네이버 메인 페이지로 이동
      await page.goto('https://www.naver.com', {
        waitUntil: 'domcontentloaded',
        timeout: 10000,
      });

      console.log('[네이버 메인] 페이지 로딩 완료');
      return { success: true, message: '네이버 메인 페이지 이동 완료' };
    } catch (error) {
      console.error('[네이버 메인] 페이지 이동 오류:', error);
      return { success: false, message: '네이버 메인 페이지 이동 실패' };
    }
  }

  private async inputKeyword(page: Page, keyword: string): Promise<SourcingResult> {
    try {
      console.log(`[키워드 입력] "${keyword}" 입력 시작`);

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
            console.log(`[키워드 입력] 검색창 발견: ${selector}`);
            break;
          }
        } catch {
          continue;
        }
      }

      if (!searchInput) {
        return { success: false, message: '검색창을 찾을 수 없습니다.' };
      }

      // 검색창 클리어 및 키워드 입력
      await searchInput.click();
      await searchInput.evaluate((input: any) => (input.value = '')); // 기존 값 클리어
      await searchInput.type(keyword, { delay: 100 }); // 타이핑 속도 조절

      console.log(`[키워드 입력] 완료: "${keyword}"`);
      return { success: true, message: '키워드 입력 완료' };
    } catch (error) {
      console.error('[키워드 입력] 오류:', error);
      return { success: false, message: '키워드 입력 실패' };
    }
  }

  private async executeSearch(page: Page): Promise<SourcingResult> {
    try {
      console.log('[검색 실행] 시작');

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
            console.log(`[검색 실행] 검색 버튼 발견: ${selector}`);
            break;
          }
        } catch {
          continue;
        }
      }

      if (searchButton) {
        // 검색 버튼 클릭
        await searchButton.click();
        console.log('[검색 실행] 검색 버튼 클릭 완료');
      } else {
        // 검색 버튼이 없으면 엔터키로 검색 실행
        await page.keyboard.press('Enter');
        console.log('[검색 실행] 엔터키로 검색 실행');
      }

      // 검색 결과 페이지 로딩 대기
      await page.waitForNavigation({
        waitUntil: 'domcontentloaded',
        timeout: 10000,
      });

      console.log('[검색 실행] 검색 결과 페이지 로딩 완료');
      return { success: true, message: '검색 실행 완료' };
    } catch (error) {
      console.error('[검색 실행] 오류:', error);
      return { success: false, message: '검색 실행 실패' };
    }
  }

  private async waitForPageLoad(page: Page): Promise<void> {
    // TODO: 페이지 로딩 대기 구현
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }

  private async findAndClickShoppingTab(page: Page): Promise<SourcingResult> {
    try {
      console.log('[쇼핑 탭] 클릭 시작');

      // JavaScript로 텍스트 기반 검색
      const shoppingTabFound = await page.evaluate(() => {
        // 모든 링크와 버튼 요소 찾기
        const allElements = document.querySelectorAll('a, button, [role="tab"], [role="button"]');

        // 쇼핑 관련 요소들을 먼저 필터링
        const shoppingElements = Array.from(allElements).filter((element) => {
          const text = element.textContent?.toLowerCase() || '';
          const href = element.getAttribute('href') || '';

          return (
            text.includes('쇼핑') ||
            href.includes('shopping') ||
            href.includes('where=shopping') ||
            text.includes('shopping')
          );
        });

        console.log(`쇼핑 관련 요소 ${shoppingElements.length}개 발견`);

        // 첫 번째로 보이는 쇼핑 요소만 클릭
        for (let i = 0; i < shoppingElements.length; i++) {
          const element = shoppingElements[i];
          const rect = element.getBoundingClientRect();
          if (rect.width > 0 && rect.height > 0) {
            try {
              console.log(
                `쇼핑 탭 클릭 시도 (${i + 1}/${shoppingElements.length}): ${element.textContent} (${element.getAttribute('href')})`,
              );
              (element as HTMLElement).click();
              console.log('쇼핑 탭 클릭 완료');
              return { success: true, message: `클릭 성공: ${element.textContent} (${element.getAttribute('href')})` };
            } catch (error) {
              console.log(`클릭 실패: ${(error as Error).message}`);
              continue;
            }
          }
        }
        return { success: false, message: '클릭 가능한 쇼핑 탭을 찾을 수 없습니다.' };
      });

      if (shoppingTabFound.success) {
        console.log('[쇼핑 탭] 클릭 완료:', shoppingTabFound.message);
        await new Promise((resolve) => setTimeout(resolve, 3000));
        return { success: true, message: '쇼핑 탭 클릭 완료' };
      } else {
        console.log('[쇼핑 탭] 클릭 실패:', shoppingTabFound.message);
        return { success: false, message: '쇼핑 탭을 찾을 수 없습니다.' };
      }
    } catch (error) {
      console.error('[쇼핑 탭] 클릭 오류:', error);
      return { success: false, message: '쇼핑 탭 클릭 실패' };
    }
  }

  private async checkRestrictionPage(page: Page): Promise<{ isRestricted: boolean }> {
    // TODO: 제한 페이지 확인 구현
    return { isRestricted: false };
  }

  private async collectProductDataWithFetch(page: Page, keyword: string): Promise<SourcingResult> {
    try {
      console.log(`[API 데이터 수집] "${keyword}" 시작`);

      // API URL 생성
      const encodedKeyword = encodeURIComponent(keyword);
      const apiUrl = `/api/search/all?sort=rel&pagingIndex=1&pagingSize=80&viewType=list&productSet=checkout&frm=NVSCPRO&query=${encodedKeyword}&origQuery=${encodedKeyword}&adQuery=${encodedKeyword}&iq=&eq=&xq=&window=&agency=true`;

      console.log(`[API 데이터 수집] API URL: ${apiUrl}`);

      // JavaScript inject로 API fetch 실행
      const fetchResult = await page.evaluate(async (url: string) => {
        try {
          console.log('🌐 API fetch 시작:', url);

          const response = await fetch(url, {
            method: 'GET',
            headers: {
              Accept: 'application/json, text/plain, */*',
              Logic: 'PART',
              'User-Agent': navigator.userAgent,
              // 'Referer': 'https://search.shopping.naver.com/',
              // 'Origin': 'https://search.shopping.naver.com'
            },
            credentials: 'include', // 쿠키 포함
          });

          if (!response.ok) {
            throw new Error('HTTP error! status: ' + response.status);
          }

          const data = await response.json();
          console.log('✅ API fetch 성공');

          return {
            success: true,
            data: data,
          };
        } catch (error) {
          console.log('❌ API fetch 실패:', (error as Error).message);
          return {
            success: false,
            error: (error as Error).message,
          };
        }
      }, apiUrl);

      if (fetchResult.success) {
        console.log('[API 데이터 수집] API fetch 결과 성공!');

        // 실제 필요한 데이터만 추출 - result.shoppingResult.products 배열 확보
        const products = fetchResult.data.shoppingResult?.products || [];
        console.log(`[API 데이터 수집] 상품 개수: ${products.length}`);

        return {
          success: true,
          message: `API 데이터 수집 완료 (${products.length}개 상품)`,
          data: {
            keyword: keyword,
            products: products,
            totalCount: products.length,
            apiData: fetchResult.data,
          },
        };
      } else {
        console.log('[API 데이터 수집] API fetch 실패:', fetchResult.error);
        return {
          success: false,
          message: `API 데이터 수집 실패: ${fetchResult.error}`,
        };
      }
    } catch (error) {
      console.error('[API 데이터 수집] 오류:', error);
      return {
        success: false,
        message: 'API 데이터 수집 중 오류 발생',
      };
    }
  }

  private async collectProductDataWithTouching(page: Page, keyword: string): Promise<SourcingResult> {
    try {
      console.log(`[클릭 데이터 수집] "${keyword}" 시작`);

      // 네트워크 요청 모니터링 시작
      const networkMonitor = this.setupNetworkMonitoring(page);

      // 1. 네이버페이 탭 클릭 (자연스러운 속도)
      const naverPayResult = await this.clickNaverPayTabQuick(page);
      if (!naverPayResult.success) {
        console.warn('[클릭 데이터 수집] 네이버페이 탭 클릭 실패:', naverPayResult.message);
      }
      await this.naturalDelay(500, 800); // 0.5~0.8초 대기

      // 2. 상품타입을 해외직구보기로 변경 (자연스러운 속도)
      const productTypeResult = await this.selectOverseasDirectPurchaseQuick(page);
      if (!productTypeResult.success) {
        console.warn('[클릭 데이터 수집] 해외직구보기 선택 실패:', productTypeResult.message);
      }
      await this.naturalDelay(500, 800); // 0.5~0.8초 대기

      // 3. 80개씩 보기로 변경 (자연스러운 속도)
      const viewCountResult = await this.selectView80ItemsQuick(page);
      if (!viewCountResult.success) {
        console.warn('[클릭 데이터 수집] 80개씩 보기 선택 실패:', viewCountResult.message);
      }

      // 4. 네트워크 요청 완료 대기 (API 호출 모니터링)
      console.log('[클릭 데이터 수집] 네트워크 요청 완료 대기 중...');
      await this.waitForNetworkIdle(page, networkMonitor);

      // 5. 실제 상품 데이터 수집 (DOM에서 추출)
      const processedData = await this.extractProductsFromDOM(page);

      console.log(`[클릭 데이터 수집] 완료:  ${JSON.stringify(processedData)}`);
      return {
        success: true,
        message: `클릭 방식 데이터 수집 완료`,
        data: {
          keyword: keyword,
          processedData: processedData,
        },
      };
    } catch (error) {
      console.error('[클릭 데이터 수집] 오류:', error);
      return {
        success: false,
        message: '클릭 방식 데이터 수집 중 오류 발생',
      };
    }
  }

  private async sendProductDataWithTouching(
    keyword: string,
    processedData: {
      relatedTags: any[];
      list: any[];
      uniqueMenuTag: any[];
    },
  ): Promise<any> {
    // return await postGoodsList(data, 'NAVER');

    const data = {
      squery: keyword,
      usernum: this.currentConfig?.usernum || '',
      spricelimit: this.currentConfig?.minAmount || '0',
      epricelimit: this.currentConfig?.maxAmount || '99999999',
      platforms: 'NAVER',
      bestyn: this.currentConfig?.includeBest ? 'Y' : 'N',
      newyn: this.currentConfig?.includeNew ? 'Y' : 'N',
      result: {
        relatedTags: processedData.relatedTags,
        uniqueMenuTag: processedData.uniqueMenuTag,
        list: processedData.list,
      },
    };

    const context = {
      isParsed: true,
      inserturl: 'https://selltkey.com/scb/api/setSearchResult.asp',
    };

    const url = 'https://api.opennest.co.kr/restful/v1/selltkey/relay-naver';
    const res = await axios.post(url, { data, context }).then((res) => res.data);
    console.log(`[클릭 데이터 수집] 전송 결과: ${JSON.stringify(res)}`);
    return res;
  }

  private async inputKeywordInShoppingTab(page: Page, keyword: string): Promise<SourcingResult> {
    // TODO: 쇼핑 탭 검색창에 키워드 입력 구현
    return { success: true, message: '쇼핑 탭 키워드 입력 완료' };
  }

  private async executeSearchInShoppingTab(page: Page): Promise<SourcingResult> {
    // TODO: 쇼핑 탭 검색 실행 구현
    return { success: true, message: '쇼핑 탭 검색 실행 완료' };
  }

  // ================================================
  // 네이버페이 탭 관련 함수들
  // ================================================

  /**
   * 네이버페이 탭 클릭
   */
  private async clickNaverPayTab(page: Page): Promise<SourcingResult> {
    try {
      console.log('[네이버페이 탭] 클릭 시작');

      // 여러 가지 방법으로 네이버페이 탭 찾기
      const selectors = [
        '#content > div.style_content__AlF53 > div.seller_filter_area > ul > li:nth-child(3)', // 사용자 제공 CSS selector
        'a[title="네이버 아이디로 간편구매, 네이버페이"]', // a 태그의 title 속성
        'li:nth-child(3) a', // 세 번째 li의 a 태그
        'ul li:nth-child(3)', // ul의 세 번째 li
      ];

      for (const selector of selectors) {
        try {
          const element = await page.$(selector);
          if (element) {
            console.log(`[네이버페이 탭] 요소 발견: ${selector}`);
            await element.click();
            console.log('[네이버페이 탭] 클릭 완료');
            await new Promise((resolve) => setTimeout(resolve, 2000)); // 로딩 대기
            return { success: true, message: '네이버페이 탭 클릭 완료' };
          }
        } catch (error) {
          console.log(`[네이버페이 탭] ${selector} 클릭 실패:`, error);
          continue;
        }
      }

      // CSS selector로 찾지 못한 경우 JavaScript로 텍스트 기반 검색
      const jsClickResult = await page.evaluate(() => {
        const allElements = document.querySelectorAll('a, button, li');
        for (const element of allElements) {
          const text = element.textContent?.trim() || '';
          const title = element.getAttribute('title') || '';

          if (text.includes('네이버페이') || title.includes('네이버페이')) {
            try {
              (element as HTMLElement).click();
              return { success: true, message: `텍스트 기반 클릭 성공: ${text}` };
            } catch (error) {
              continue;
            }
          }
        }
        return { success: false, message: '네이버페이 요소를 찾을 수 없음' };
      });

      if (jsClickResult.success) {
        console.log('[네이버페이 탭] JavaScript 클릭 완료:', jsClickResult.message);
        await new Promise((resolve) => setTimeout(resolve, 2000));
        return { success: true, message: '네이버페이 탭 클릭 완료' };
      }

      return { success: false, message: '네이버페이 탭을 찾을 수 없습니다.' };
    } catch (error) {
      console.error('[네이버페이 탭] 클릭 오류:', error);
      return { success: false, message: '네이버페이 탭 클릭 실패' };
    }
  }

  /**
   * 상품타입을 해외직구보기로 변경
   */
  private async selectOverseasDirectPurchase(page: Page): Promise<SourcingResult> {
    try {
      console.log('[해외직구보기] 선택 시작');

      // 1. data-shp-contents-id 기반으로 상품타입 드롭다운 찾기
      const productTypeButton = await page.$('a[data-shp-contents-id="상품타입(전체)"]');
      if (productTypeButton) {
        console.log('✅ 상품타입 필터 드롭다운 발견');

        // JavaScript evaluate로 클릭 실행
        await page.evaluate((button) => {
          button.click();
        }, productTypeButton);

        console.log('✅ 상품타입 필터 드롭다운 열기 완료');
        await new Promise((resolve) => setTimeout(resolve, 3000));

        // 2. 해외직구보기 옵션 대기 및 클릭
        try {
          const overseasOption = await page.waitForSelector('a[data-shp-contents-id="해외직구보기"]', {
            timeout: 5000,
          });
          if (overseasOption) {
            console.log('✅ 해외직구보기 옵션 발견');

            // JavaScript evaluate로 클릭 실행
            await page.evaluate((option) => {
              option.click();
            }, overseasOption);

            console.log('✅ 해외직구보기 옵션 클릭 완료');
            await new Promise((resolve) => setTimeout(resolve, 5000));

            // 3. 필터 적용 후 페이지 로딩 대기
            await page.waitForSelector('.basicList_info_area__TWvzp', { timeout: 15000 }).catch(() => {
              console.log('⚠️ 상품 목록 로딩 대기 타임아웃 (계속 진행)');
            });

            return { success: true, message: '해외직구보기 선택 완료' };
          }
        } catch (waitError) {
          console.log('❌ 해외직구보기 옵션 대기 실패, 대안 방법 시도');
        }
      }

      // 4. 대안 방법: 텍스트 기반 검색
      console.log('[해외직구보기] 대안 방법: 텍스트 기반 검색');
      const fallbackResult = await page.evaluate(() => {
        const allElements = document.querySelectorAll('a, button, [role="button"]');
        for (const element of allElements) {
          const text = element.textContent?.trim() || '';
          if (text === '해외직구보기' || text.includes('해외직구')) {
            try {
              (element as HTMLElement).click();
              return { success: true, message: `대안 방법 성공: ${text}` };
            } catch {
              continue;
            }
          }
        }
        return { success: false, message: '해외직구보기 옵션을 찾을 수 없음' };
      });

      if (fallbackResult.success) {
        console.log('[해외직구보기] 대안 방법 성공:', fallbackResult.message);
        await new Promise((resolve) => setTimeout(resolve, 3000));
        return { success: true, message: '해외직구보기 선택 완료 (대안 방법)' };
      }

      return { success: false, message: '해외직구보기 옵션을 찾을 수 없습니다.' };
    } catch (error) {
      console.error('[해외직구보기] 선택 오류:', error);
      return { success: false, message: '해외직구보기 선택 실패' };
    }
  }

  /**
   * 80개씩 보기로 변경
   */
  private async selectView80Items(page: Page): Promise<SourcingResult> {
    try {
      console.log('[80개씩 보기] 선택 시작');

      // 1. data-shp-contents-id 기반으로 현재 보기 설정 드롭다운 찾기 (해외직구보기와 동일한 구조)
      // 현재 활성화된 보기 옵션(40개씩 보기)을 클릭하여 드롭다운 열기
      const currentViewButton = await page.$('a[data-shp-contents-id="40개씩 보기"]');
      if (currentViewButton) {
        console.log('✅ 현재 보기 설정 드롭다운 발견');

        // JavaScript evaluate로 클릭 실행 (드롭다운 열기)
        await page.evaluate((button) => {
          button.click();
        }, currentViewButton);

        console.log('✅ 보기 설정 드롭다운 열기 완료');
        await new Promise((resolve) => setTimeout(resolve, 3000));

        // 2. 80개씩 보기 옵션 대기 및 클릭
        try {
          const eightyOption = await page.waitForSelector('a[data-shp-contents-id="80개씩 보기"]', { timeout: 5000 });
          if (eightyOption) {
            console.log('✅ 80개씩 보기 옵션 발견');

            // JavaScript evaluate로 클릭 실행
            await page.evaluate((option) => {
              option.click();
            }, eightyOption);

            console.log('✅ 80개씩 보기 옵션 클릭 완료');
            await new Promise((resolve) => setTimeout(resolve, 5000));

            // 3. 필터 적용 후 페이지 로딩 대기
            await page.waitForSelector('.basicList_info_area__TWvzp', { timeout: 15000 }).catch(() => {
              console.log('⚠️ 상품 목록 로딩 대기 타임아웃 (계속 진행)');
            });

            return { success: true, message: '80개씩 보기 선택 완료' };
          }
        } catch (waitError) {
          console.log('❌ 80개씩 보기 옵션 대기 실패, 대안 방법 시도');
        }
      }

      // 4. 대안 방법: 텍스트 기반 검색
      console.log('[80개씩 보기] 대안 방법: 텍스트 기반 검색');
      const fallbackResult = await page.evaluate(() => {
        const allElements = document.querySelectorAll('a, button, [role="button"]');
        for (const element of allElements) {
          const text = element.textContent?.trim() || '';
          if (text === '80개씩 보기' || text.includes('80개씩')) {
            try {
              (element as HTMLElement).click();
              return { success: true, message: `대안 방법 성공: ${text}` };
            } catch {
              continue;
            }
          }
        }
        return { success: false, message: '80개씩 보기 옵션을 찾을 수 없음' };
      });

      if (fallbackResult.success) {
        console.log('[80개씩 보기] 대안 방법 성공:', fallbackResult.message);
        await new Promise((resolve) => setTimeout(resolve, 3000));
        return { success: true, message: '80개씩 보기 선택 완료 (대안 방법)' };
      }

      // 5. 현재 보기 개수 확인 (참고용)
      const currentViewCount = await page.evaluate(() => {
        const activeSortButton = document.querySelector('.subFilter_sort__4Q_hv.active');
        return activeSortButton?.textContent?.trim();
      });
      console.log(`📋 현재 정렬/보기 설정: ${currentViewCount}`);

      return { success: false, message: '80개씩 보기 옵션을 찾을 수 없습니다.' };
    } catch (error) {
      console.error('[80개씩 보기] 선택 오류:', error);
      return { success: false, message: '80개씩 보기 선택 실패' };
    }
  }

  /**
   * DOM에서 상품 데이터 추출
   */
  private async extractProductsFromDOM(page: Page): Promise<any> {
    try {
      console.log('[상품 추출] DOM에서 상품 데이터 추출 시작');

      // __NEXT_DATA__ JSON 데이터 추출
      const nextDataResult = await page.evaluate(() => {
        try {
          // __NEXT_DATA__ 스크립트 태그 찾기
          const nextDataElement = document.querySelector('#__NEXT_DATA__');
          if (nextDataElement) {
            console.log('✅ __NEXT_DATA__ 요소 발견');

            // JSON 파싱
            const jsonText = nextDataElement.textContent || '';
            if (jsonText) {
              const jsonData = JSON.parse(jsonText);
              console.log('✅ __NEXT_DATA__ JSON 파싱 성공');
              console.log('[__NEXT_DATA__] 전체 구조:', jsonData);

              // props.pageProps 경로 확인
              const pageProps = jsonData?.props?.pageProps;
              if (pageProps) {
                console.log('[__NEXT_DATA__] pageProps:', pageProps);

                // initialState 확인
                const initialState = pageProps?.initialState;
                if (initialState) {
                  console.log('[__NEXT_DATA__] initialState:', initialState);

                  // products 배열 찾기
                  const products = initialState?.products || initialState?.result?.products;
                  if (products && Array.isArray(products)) {
                    console.log(`[__NEXT_DATA__] 상품 데이터 발견: ${products.length}개`);
                    console.log('[__NEXT_DATA__] 첫 번째 상품 샘플:', products[0]);
                    return {
                      success: true,
                      data: jsonData,
                      products: products,
                      productsCount: products.length,
                    };
                  }
                }
              }

              return {
                success: true,
                data: jsonData,
                products: [],
                productsCount: 0,
                message: 'JSON 데이터는 있지만 상품 배열을 찾을 수 없음',
              };
            }
          }

          return {
            success: false,
            message: '__NEXT_DATA__ 요소를 찾을 수 없음',
          };
        } catch (error) {
          console.error('[__NEXT_DATA__] 파싱 오류:', error);
          return {
            success: false,
            error: error.message,
            message: '__NEXT_DATA__ 파싱 실패',
          };
        }
      });

      // 결과 로깅
      if (nextDataResult.success) {
        console.log(`[상품 추출] __NEXT_DATA__에서 ${nextDataResult.productsCount}개 상품 추출 완료`);

        // 전체 JSON 구조 로깅 (처음 몇 줄만)
        // const jsonString = JSON.stringify(nextDataResult.data, null, 2);
        // const firstLines = jsonString.split('\n').slice(0, 50).join('\n');
        // console.log('[상품 추출] __NEXT_DATA__ JSON 구조 (첫 50줄):');
        // console.log(firstLines);

        // 데이터 가공 처리
        const processedData = this.processNextData(nextDataResult.data);
        console.log('[데이터 가공] 가공 결과:', processedData);

        return processedData;
        // return nextDataResult.products || [];
      } else {
        console.warn('[상품 추출] __NEXT_DATA__ 추출 실패:', nextDataResult.message);
        console.log('[상품 추출] 빈 객체 반환');

        return {
          relatedTags: [],
          list: [],
          uniqueMenuTag: [],
        };
      }
    } catch (error) {
      console.error('[상품 추출] 오류:', error);
      return {
        relatedTags: [],
        list: [],
        uniqueMenuTag: [],
        error: error.message,
      };
    }
  }

  /**
   * __NEXT_DATA__ JSON 데이터 가공
   */
  private processNextData(jsonData: any): any {
    try {
      console.log('[데이터 가공] __NEXT_DATA__ 가공 시작');

      const parseRoot = jsonData.props.pageProps;
      console.log('[데이터 가공] parseRoot 구조 확인:', {
        hasRelatedTags: !!parseRoot.relatedTags,
        hasCompositeList: !!parseRoot.compositeList,
        hasInitialState: !!parseRoot.initialState,
      });

      const relatedTags = parseRoot.relatedTags || [];
      console.log('[데이터 가공] relatedTags:', relatedTags);

      // compositeList.list에서 데이터 추출
      const compositeList = parseRoot.compositeList?.list;
      if (!compositeList || !Array.isArray(compositeList)) {
        console.warn('[데이터 가공] compositeList.list를 찾을 수 없음');
        return {
          relatedTags,
          list: [],
          uniqueMenuTag: [],
        };
      }

      console.log(`[데이터 가공] compositeList.list 개수: ${compositeList.length}`);

      // reduce를 사용한 데이터 가공
      const { list, manuTag } = compositeList.reduce(
        (acc: any, curr: any) => {
          try {
            // manuTag 처리
            if (curr.item?.manuTag) {
              acc.manuTag.push(...curr.item.manuTag.split(','));
            }

            // list 조건에 맞는 객체 처리
            const { mallName, mallPcUrl, adId } = curr.item || {};
            if (!adId && mallPcUrl?.startsWith('https://smartstore.naver.com')) {
              if (!acc.list.some((item: any) => item.mallPcUrl === mallPcUrl)) {
                acc.list.push({ mallName, mallPcUrl });
              }
            }

            return acc;
          } catch (error) {
            console.warn('[데이터 가공] 개별 아이템 처리 오류:', error);
            return acc;
          }
        },
        { list: [], manuTag: [] },
      );

      console.log('[데이터 가공] list length before:', list.length);
      console.log('[데이터 가공] list before:', JSON.stringify(list));

      console.log('[데이터 가공] manuTag before:', manuTag.length);
      // 중복 제거
      const uniqueMenuTag = [...new Set(manuTag)];
      console.log('[데이터 가공] manuTag before:', uniqueMenuTag.length);

      const result = {
        relatedTags,
        list,
        uniqueMenuTag,
      };

      console.log('[데이터 가공] 가공 완료:');
      console.log('- relatedTags:', relatedTags);
      console.log(`- list: ${list.length}개`);
      console.log(`- manuTag: ${manuTag.length}개`);
      console.log(`- uniqueMenuTag: ${uniqueMenuTag.length}개`);
      console.log('- list 샘플:', list.slice(0, 3));
      console.log('- uniqueMenuTag 샘플:', uniqueMenuTag.slice(0, 10));

      return result;
    } catch (error) {
      console.error('[데이터 가공] 오류:', error);
      return {
        relatedTags: null,
        list: [],
        uniqueMenuTag: [],
      };
    }
  }

  // ================================================
  // 빠른 클릭 및 네트워크 모니터링 함수들
  // ================================================

  /**
   * 자연스러운 딜레이 (사람의 클릭 간격 시뮬레이션)
   */
  private async naturalDelay(minMs: number, maxMs: number): Promise<void> {
    const delay = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
    await new Promise((resolve) => setTimeout(resolve, delay));
  }

  /**
   * 네트워크 모니터링 설정
   */
  private setupNetworkMonitoring(page: Page): { pendingRequests: Set<string>; isIdle: boolean } {
    const monitor = {
      pendingRequests: new Set<string>(),
      isIdle: false,
    };

    // 요청 시작 모니터링
    page.on('request', (request) => {
      const url = request.url();
      if (url.includes('search.shopping.naver.com/api') || url.includes('shopping')) {
        monitor.pendingRequests.add(request.url());
        monitor.isIdle = false;
        console.log(`🌐 API 요청 시작: ${url.substring(0, 100)}...`);
      }
    });

    // 응답 완료 모니터링
    page.on('response', (response) => {
      const url = response.url();
      if (monitor.pendingRequests.has(url)) {
        monitor.pendingRequests.delete(url);
        console.log(`✅ API 응답 완료: ${url.substring(0, 100)}... (Status: ${response.status()})`);

        if (monitor.pendingRequests.size === 0) {
          monitor.isIdle = true;
        }
      }
    });

    return monitor;
  }

  /**
   * 네트워크 idle 상태 대기
   */
  private async waitForNetworkIdle(
    _page: Page,
    monitor: { pendingRequests: Set<string>; isIdle: boolean },
  ): Promise<void> {
    const maxWaitTime = 10000; // 최대 10초 대기
    const checkInterval = 200; // 200ms마다 체크
    let waitedTime = 0;

    while (waitedTime < maxWaitTime) {
      if (monitor.pendingRequests.size === 0) {
        console.log('🎯 모든 네트워크 요청 완료, 추가 안정화 대기...');
        await new Promise((resolve) => setTimeout(resolve, 1000)); // 1초 추가 대기
        return;
      }

      console.log(`⏳ 대기 중인 요청 ${monitor.pendingRequests.size}개 (${waitedTime}ms/${maxWaitTime}ms)`);
      await new Promise((resolve) => setTimeout(resolve, checkInterval));
      waitedTime += checkInterval;
    }

    console.log('⚠️ 네트워크 대기 타임아웃, 계속 진행');
  }

  /**
   * 네이버페이 탭 빠른 클릭
   */
  private async clickNaverPayTabQuick(page: Page): Promise<SourcingResult> {
    try {
      console.log('[네이버페이 탭] 빠른 클릭 시작');

      const selectors = [
        '#content > div.style_content__AlF53 > div.seller_filter_area > ul > li:nth-child(3)',
        'a[title="네이버 아이디로 간편구매, 네이버페이"]',
        'li:nth-child(3) a',
      ];

      for (const selector of selectors) {
        try {
          const element = await page.$(selector);
          if (element) {
            await page.evaluate((el) => (el as HTMLElement).click(), element);
            console.log(`✅ 네이버페이 탭 클릭 완료: ${selector}`);
            return { success: true, message: '네이버페이 탭 클릭 완료' };
          }
        } catch {
          continue;
        }
      }

      return { success: false, message: '네이버페이 탭을 찾을 수 없습니다.' };
    } catch (error) {
      console.error('[네이버페이 탭] 빠른 클릭 오류:', error);
      return { success: false, message: '네이버페이 탭 클릭 실패' };
    }
  }

  /**
   * 해외직구보기 빠른 선택
   */
  private async selectOverseasDirectPurchaseQuick(page: Page): Promise<SourcingResult> {
    try {
      console.log('[해외직구보기] 빠른 선택 시작');

      // 드롭다운 열기
      const productTypeButton = await page.$('a[data-shp-contents-id="상품타입(전체)"]');
      if (productTypeButton) {
        await page.evaluate((button) => (button as HTMLElement).click(), productTypeButton);
        await this.naturalDelay(200, 400); // 짧은 대기

        // 해외직구보기 옵션 클릭
        const overseasOption = await page.waitForSelector('a[data-shp-contents-id="해외직구보기"]', {
          timeout: 3000,
        });
        if (overseasOption) {
          await page.evaluate((option) => (option as HTMLElement).click(), overseasOption);
          console.log('✅ 해외직구보기 빠른 선택 완료');
          return { success: true, message: '해외직구보기 선택 완료' };
        }
      }

      return { success: false, message: '해외직구보기 옵션을 찾을 수 없습니다.' };
    } catch (error) {
      console.error('[해외직구보기] 빠른 선택 오류:', error);
      return { success: false, message: '해외직구보기 선택 실패' };
    }
  }

  /**
   * 80개씩 보기 빠른 선택
   */
  private async selectView80ItemsQuick(page: Page): Promise<SourcingResult> {
    try {
      console.log('[80개씩 보기] 빠른 선택 시작');

      // 현재 보기 설정 드롭다운 열기
      const currentViewButton = await page.$('a[data-shp-contents-id="40개씩 보기"]');
      if (currentViewButton) {
        await page.evaluate((button) => (button as HTMLElement).click(), currentViewButton);
        await this.naturalDelay(200, 400); // 짧은 대기

        // 80개씩 보기 옵션 클릭
        const eightyOption = await page.waitForSelector('a[data-shp-contents-id="80개씩 보기"]', { timeout: 3000 });
        if (eightyOption) {
          await page.evaluate((option) => (option as HTMLElement).click(), eightyOption);
          console.log('✅ 80개씩 보기 빠른 선택 완료');
          return { success: true, message: '80개씩 보기 선택 완료' };
        }
      }

      return { success: false, message: '80개씩 보기 옵션을 찾을 수 없습니다.' };
    } catch (error) {
      console.error('[80개씩 보기] 빠른 선택 오류:', error);
      return { success: false, message: '80개씩 보기 선택 실패' };
    }
  }
}

// 싱글톤 인스턴스
export const sourcingService = new SourcingService();
