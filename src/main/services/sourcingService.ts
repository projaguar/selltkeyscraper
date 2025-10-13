/**
 * 벤치마킹 소싱 서비스 (리팩토링 버전)
 * 2-depth 구조로 단순화된 플로우
 */

import axios from 'axios';
import { app } from 'electron';
import * as path from 'path';
import { browserService } from './browserService';
import { Page } from 'puppeteer';
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import AntiDetectionUtils from '../utils/antiDetectionUtils';
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
  private currentKeyword: string = '';
  private totalKeywords: number = 0;
  private currentKeywordIndex: number = 0;
  private logs: string[] = [];

  constructor() {
    // Stealth 플러그인 초기화
    puppeteer.use(StealthPlugin());
  }

  private addLog(message: string): void {
    const timestamp = new Date().toLocaleTimeString('ko-KR');
    const logMessage = `[${timestamp}] ${message}`;
    this.logs.push(logMessage);
    console.log(logMessage);
    // 최대 100개의 로그만 유지
    if (this.logs.length > 100) {
      this.logs.shift();
    }
  }

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
      this.logs = []; // 로그 초기화
      this.addLog('소싱 프로세스 시작');

      // ========================================
      // 1단계: 브라우저 초기화 및 정리
      // ========================================
      this.addLog('브라우저 초기화 중...');

      // 브라우저 준비 (로그인 체크 제외)
      const browserResult = await this.prepareBrowserWithoutLoginCheck();
      if (!browserResult.success) return browserResult;

      // 서비스 준비 (탭 정리, URL 이동, 로그인 체크)
      const prepareResult = await browserService.prepareForService();
      if (!prepareResult.success) {
        return { success: false, message: prepareResult.message };
      }

      console.log('[소싱] 브라우저 초기화 완료');

      // ========================================
      // 2단계: 키워드 파싱 및 검증
      // ========================================
      const keywords = this.parseKeywords(config.keywords);
      if (keywords.length === 0) {
        return { success: false, message: '검색할 키워드가 없습니다.' };
      }

      this.totalKeywords = keywords.length;
      this.addLog(`총 ${keywords.length}개의 키워드 처리 예정`);

      // ========================================
      // 3단계: 첫 번째 키워드로 메인 페이지에서 검색
      // ========================================
      console.log('[소싱] 첫 번째 키워드로 메인 페이지에서 검색', '시작');
      const firstKeyword = keywords[0];
      const searchResult = await this.step1_SearchFromMainPage(browserService.getCurrentPage(), firstKeyword);
      console.log('[소싱] 첫 번째 키워드로 메인 페이지에서 검색', '종료');
      if (!searchResult.success) return searchResult;

      // ========================================
      // 4단계: 쇼핑 탭 클릭하여 새 탭 열기
      // ========================================
      console.log('[소싱] 쇼핑 탭 클릭하여 새 탭 열기', '시작');
      const shoppingTabResult = await this.step2_ClickShoppingTab(browserService.getCurrentPage());
      console.log('[소싱] 쇼핑 탭 클릭하여 새 탭 열기', '종료');
      if (!shoppingTabResult.success) return shoppingTabResult;

      // ========================================
      // 5단계: 새 탭에서 데이터 수집
      // ========================================
      const newPage = await this.switchToNewTab();
      if (!newPage) return { success: false, message: '새 탭으로 전환 실패' };

      let isFirst = true;

      for (let i = 0; i < keywords.length; i++) {
        const keyword = keywords[i];
        this.currentKeyword = keyword;
        this.currentKeywordIndex = i + 1;

        this.addLog(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
        this.addLog(`키워드 [${i + 1}/${keywords.length}]: "${keyword}"`);
        this.addLog(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

        // 중지 요청 확인
        if (!this.isRunning) {
          this.addLog('사용자에 의해 소싱 중지됨');
          return { success: true, message: '소싱이 사용자에 의해 중지되었습니다.' };
        }

        // check block screen (블럭되어도 fetch 소싱은 가능)
        const isBlockedPage = await this.isBlocked(newPage);
        if (isBlockedPage) {
          this.addLog(`⚠️ 블럭 페이지 감지 (fetch 소싱 계속 진행)`);
        }

        // 블럭되지 않았고 첫 페이지가 아니면 검색 수행
        if (!isBlockedPage && !isFirst) {
          console.log(`[소싱] 쇼핑 탭에서 "${keyword}" 검색 시작`);

          // 1. 검색창에 키워드 입력
          const inputResult = await this.inputKeywordInShoppingTab(newPage, keyword);
          if (!inputResult.success) {
            console.error(`[소싱] 키워드 입력 실패: ${keyword}`);
            return inputResult;
          }

          // 2. 잠시 쉬기 (사람처럼)
          await AntiDetectionUtils.naturalDelay(300, 700);

          // 3. 검색 버튼 클릭
          const executeResult = await this.executeSearchInShoppingTab(newPage);
          if (!executeResult.success) {
            console.error(`[소싱] 검색 실행 실패: ${keyword}`);
            return executeResult;
          }

          // 4. 검색 결과 로딩 대기
          await this.waitForPageLoad(newPage);
          console.log(`[소싱] 키워드 "${keyword}" 검색 완료`);

          // 5. 가끔 화면 아래로 스크롤 (30% 확률)
          if (Math.random() < 0.3) {
            console.log(`[소싱] 자연스러운 스크롤 수행`);
            await AntiDetectionUtils.simulateScroll(newPage);
          }
        }

        isFirst = false; // 첫 페이지 플래그 업데이트

        // NOTICE: 지우면 안됨 임시로 막은것임
        // 데이터 수집 - 네이버 (블럭되어도 fetch 소싱은 가능)
        if (config.includeNaver) {
          this.addLog('📦 네이버 데이터 수집 시작...');
          const naverResult = await this.collectNaverProductData(newPage, keyword);
          if (!naverResult.success) {
            this.addLog(`❌ 네이버 데이터 수집 실패: ${naverResult.message}`);
          } else {
            const itemCount = naverResult.data?.result?.list?.length || 0;
            this.addLog(`✅ 네이버 데이터 수집 완료: ${itemCount}개 상품`);
            try {
              this.addLog('📤 네이버 데이터 서버 전송 중...');
              await this.sendNaverProductData(naverResult.data);
              this.addLog('✅ 네이버 데이터 서버 전송 완료');
            } catch (error) {
              this.addLog(`❌ 네이버 데이터 전송 실패: ${error}`);
            }
          }
        }

        // 데이터 수집 - 옥션 (옵션 체크시에만)
        if (config.includeAuction) {
          this.addLog('📦 옥션 데이터 수집 시작...');
          const auctionResult = await this.collectAuctionProductData(newPage, keyword);
          if (!auctionResult.success) {
            this.addLog(`❌ 옥션 데이터 수집 실패: ${auctionResult.message}`);
          } else {
            const itemCount = auctionResult.data?.result?.list?.length || 0;
            this.addLog(`✅ 옥션 데이터 수집 완료: ${itemCount}개 상품`);
            try {
              this.addLog('📤 옥션 데이터 서버 전송 중...');
              await this.sendAuctionProductData(auctionResult.data);
              this.addLog('✅ 옥션 데이터 서버 전송 완료');
            } catch (error) {
              this.addLog(`❌ 옥션 데이터 전송 실패: ${error}`);
            }
          }
        }

        await AntiDetectionUtils.naturalDelay(1000, 2800);
      }

      this.isRunning = false;
      this.addLog('\n🎉 전체 소싱 프로세스 완료!');
      this.addLog(`총 ${keywords.length}개 키워드 처리 완료`);
      return { success: true, message: '전체 소싱 프로세스 완료' };
    } catch (error) {
      console.error('[소싱] 전체 프로세스 오류:', error);
      this.isRunning = false;
      console.log('[소싱] 소싱 프로세스 중단됨');
      return { success: false, message: '소싱 프로세스 중 오류 발생' };
    }
  }

  /**
   * 소싱 중지
   */
  async stopSourcing(): Promise<SourcingResult> {
    console.log('[소싱] 소싱 중지 요청');
    this.isRunning = false;
    this.currentConfig = null;
    console.log('[소싱] 소싱 중지 완료');
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
      status: this.isRunning ? 'running' : 'idle',
      currentKeyword: this.currentKeyword,
      currentKeywordIndex: this.currentKeywordIndex,
      totalKeywords: this.totalKeywords,
      logs: this.logs,
    };
  }

  // ================================================
  // 유틸리티 함수들
  // ================================================

  /**
   * 현재 페이지가 블럭 페이지인지 확인
   */
  private async isBlocked(page: Page): Promise<boolean> {
    try {
      const isBlockedPage = await page.evaluate(() => {
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

        // 3. title이 짧고 단순한지 확인 (정상 페이지는 검색어가 포함됨)
        const title = document.title || '';
        const isSimpleTitle = title === '네이버쇼핑' || title.length < 10;

        // 4. 블럭 페이지 특징적인 링크 확인
        const hasBlockLink =
          document.querySelector('a[href*="help.naver.com"]') !== null ||
          document.querySelector('a[href*="help.pay.naver.com"]') !== null;

        // 블럭 조건: 메시지가 있거나, 에러 클래스가 있거나, 단순한 title + 헬프 링크
        return hasBlockMessage || hasErrorClass || (isSimpleTitle && hasBlockLink);
      });

      if (isBlockedPage) {
        console.warn('[블럭 체크] 블럭 페이지 감지!');
      }

      return isBlockedPage;
    } catch (error) {
      console.error('[블럭 체크] 오류:', error);
      return false; // 오류 시 블럭되지 않은 것으로 간주
    }
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

      // 잠시 쉬기 (사람처럼 보이기 위한 자연스러운 pause)
      await AntiDetectionUtils.naturalDelay(300, 700);

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

  // ================================================
  // 세부 작업 함수들 (3rd Depth)
  // ================================================

  /**
   * 브라우저 준비 (로그인 체크 제외)
   */
  private async prepareBrowserWithoutLoginCheck(): Promise<SourcingResult> {
    try {
      // userDataDir 설정으로 영구 프로필 사용 (봇 감지 우회)
      // Electron의 안전한 경로 사용 (Windows/Mac 모두 지원)
      const userDataPath = app.getPath('userData'); // OS별 적절한 경로
      const chromeUserDataDir = path.join(userDataPath, 'chrome-profile');

      console.log('[소싱] Chrome 프로필 경로:', chromeUserDataDir);

      await browserService.initializeBrowser({
        userDataDir: chromeUserDataDir,
      });

      return { success: true, message: '브라우저 준비 완료 (로그인 체크 제외)' };
    } catch {
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

      return newPage;
    } catch (_error) {
      console.error('새 탭 전환 오류:', _error);
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
      console.log(`[키워드 입력] "${keyword}" 자연스러운 입력 시작`);

      // 네이버 메인 페이지 검색창 선택자들 (우선순위 순)
      const searchSelectors = [
        '#query', // 네이버 메인 검색창 ID
        'input[name="query"]', // 네이버 메인 검색창 name
        'input[placeholder*="검색어를 입력하세요"]', // 네이버 메인 검색창 placeholder
        'input[placeholder*="검색"]', // 검색 placeholder가 있는 입력창
        'input[type="search"]', // search 타입 입력창
        '.search_input', // 검색 입력 클래스
        '#nx_query', // 네이버 검색창 대체 ID
      ];

      // 자연스러운 키워드 입력 (실수 시뮬레이션, 복사 붙여넣기 등 포함)
      const inputSuccess = await findAndTypeNaturallyMultiple(page, searchSelectors, keyword, {
        minDelay: 80,
        maxDelay: 200,
        copyPasteChance: 0, // 복사/붙여넣기 비활성화 (값이 안 들어가는 문제)
        mistakeChance: 0.15, // 15% 확률로 실수
        correctionChance: 1.0, // 실수 시 100% 수정
        clearFirst: true, // 기존 텍스트 클리어
      });

      if (!inputSuccess) {
        return { success: false, message: '검색창을 찾을 수 없습니다.' };
      }

      console.log(`[키워드 입력] 자연스러운 입력 완료: "${keyword}"`);
      return { success: true, message: '키워드 입력 완료' };
    } catch (error) {
      console.error('[키워드 입력] 오류:', error);
      return { success: false, message: '키워드 입력 실패' };
    }
  }

  private async executeSearch(page: Page): Promise<SourcingResult> {
    try {
      console.log('[검색 실행] 검색 시작');

      // 검색 실행 (엔터키 사용)
      const searchSuccess = await executeNaverMainSearch(page, {
        enterKeyChance: 1.0, // 엔터키만 사용 (단순화)
        clickDelay: 0,
        waitAfterSearch: 1000, // 최소한의 대기만
      });

      if (!searchSuccess) {
        return { success: false, message: '검색 실행 실패' };
      }

      console.log('[검색 실행] 자연스러운 검색 완료');
      return { success: true, message: '검색 실행 완료' };
    } catch (error) {
      console.error('[검색 실행] 오류:', error);
      return { success: false, message: '검색 실행 실패' };
    }
  }

  private async waitForPageLoad(_page: Page): Promise<void> {
    // TODO: 페이지 로딩 대기 구현
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }

  private async findAndClickShoppingTab(page: Page): Promise<SourcingResult> {
    // &productSet=checkout : 네이버페이
    // &pagingSize=80 : 80개씩 보기
    // &agency=true : 해외 직구 보기

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

  /**
   * Fetch API를 사용한 데이터 수집
   */
  private async collectNaverProductData(page: Page, keyword: string): Promise<SourcingResult> {
    try {
      console.log(`[Fetch 데이터 수집] "${keyword}" 시작`);

      // 1. API URL 생성
      const encodedKeyword = encodeURIComponent(keyword);
      const apiUrl = `/api/search/all?sort=rel&pagingIndex=1&pagingSize=80&viewType=list&productSet=checkout&frm=NVSCPRO&query=${encodedKeyword}&origQuery=${encodedKeyword}&adQuery=${encodedKeyword}&iq=&eq=&xq=&window=&agency=true`;

      console.log(`[Fetch 데이터 수집] API URL: ${apiUrl}`);

      // 2. Fetch로 API 호출
      const response = await page.evaluate(async (url) => {
        try {
          const res = await fetch(url, {
            method: 'GET',
            headers: {
              Accept: 'application/json, text/plain, */*',
              Logic: 'PART',
            },
          });

          if (!res.ok) {
            throw new Error(`HTTP error! status: ${res.status}`);
          }

          const data = await res.json();
          return { success: true, data };
        } catch (error: any) {
          return { success: false, error: error.message };
        }
      }, apiUrl);

      if (!response.success) {
        console.error('[Fetch 데이터 수집] API 호출 실패:', response.error);
        return { success: false, message: 'API 호출 실패: ' + response.error };
      }

      console.log('[Fetch 데이터 수집] API 응답 받음');

      // 3. 데이터 처리
      const apiData = response.data;
      if (!apiData?.shoppingResult?.products) {
        console.error('[Fetch 데이터 수집] 상품 데이터 없음');
        return { success: false, message: '상품 데이터를 찾을 수 없습니다.' };
      }

      const products = apiData.shoppingResult.products;
      console.log(`[Fetch 데이터 수집] 상품 ${products.length}개 수집`);

      // 4. 중복 제거 (mallPcUrl 기준)
      const list = products
        .map((item: any) => ({
          mallName: item.mallName,
          mallPcUrl: item.mallPcUrl,
          productTitle: item.productTitle,
          price: item.price,
          imageUrl: item.imageUrl,
        }))
        .filter(
          (item: any, index: number, self: any[]) => index === self.findIndex((t) => t.mallPcUrl === item.mallPcUrl),
        );

      console.log(`[네이버 데이터 수집] 중복 제거 후 ${list.length}개`);

      // 5. 서버로 전송할 데이터 구성
      const relatedTags: any[] = [];
      const uniqueMenuTag: any[] = [];

      const result = {
        squery: keyword,
        usernum: this.currentConfig?.usernum || '',
        spricelimit: this.currentConfig?.minAmount || '0',
        epricelimit: this.currentConfig?.maxAmount || '99999999',
        bestyn: this.currentConfig?.includeBest ? 'Y' : 'N',
        newyn: this.currentConfig?.includeNew ? 'Y' : 'N',
        platforms: 'NAVER',
        result: {
          relatedTags,
          uniqueMenuTag,
          list,
        },
      };

      return {
        success: true,
        message: `네이버 데이터 수집 완료: ${list.length}개`,
        data: result,
      };
    } catch (error) {
      console.error('[Fetch 데이터 수집] 오류:', error);
      return {
        success: false,
        message: 'Fetch 방식 데이터 수집 중 오류 발생',
      };
    }
  }

  /**
   * 옥션 상품 데이터 수집 (페이지 이동 방식)
   */
  private async collectAuctionProductData(page: Page, keyword: string): Promise<SourcingResult> {
    try {
      console.log(`[옥션 데이터 수집] "${keyword}" 시작`);

      // 1. 옥션 URL로 페이지 이동
      const encodedKeyword = encodeURIComponent(keyword);
      const auctionUrl = `https://www.auction.co.kr/n/search?keyword=${encodedKeyword}`;

      console.log(`[옥션 데이터 수집] URL로 이동: ${auctionUrl}`);
      await page.goto(auctionUrl, {
        waitUntil: 'domcontentloaded',
        timeout: 30000,
      });

      console.log('[옥션 데이터 수집] 페이지 로딩 완료');

      // 2. 현재 페이지에서 #__NEXT_DATA__ JSON 추출
      const nextDataResult = await page.evaluate(() => {
        try {
          // #__NEXT_DATA__ 찾기
          const nextDataScript = document.querySelector('#__NEXT_DATA__');
          if (!nextDataScript || !nextDataScript.textContent) {
            return { success: false, error: '#__NEXT_DATA__를 찾을 수 없음' };
          }

          // JSON 파싱
          const jsonData = JSON.parse(nextDataScript.textContent);
          console.log('[옥션 데이터 수집] __NEXT_DATA__ 파싱 완료');
          return { success: true, data: jsonData };
        } catch (error: any) {
          return { success: false, error: error.message };
        }
      });

      if (!nextDataResult.success) {
        console.error('[옥션 데이터 수집] __NEXT_DATA__ 파싱 실패:', nextDataResult.error);

        // history back 후 에러 반환
        await page.goBack({ waitUntil: 'domcontentloaded' });
        return { success: false, message: '__NEXT_DATA__ 파싱 실패: ' + nextDataResult.error };
      }

      const rawAuctionData = nextDataResult.data;
      console.log('[옥션 데이터 수집] __NEXT_DATA__ 파싱 완료');

      // 3. rawAuctionData에서 상품 정보 추출
      const relatedTags: any[] = [];
      const uniqueMenuTag: any[] = [];

      const list =
        rawAuctionData?.props?.pageProps?.initialStates?.curatorData?.regions?.reduce((acc: any[], curr: any) => {
          const subList = curr.modules.reduce((subAcc: any[], subCurr: any) => {
            const subSubList = subCurr.rows.reduce((subSubAcc: any[], subSubCurr: any) => {
              // ItemCardGeneral이 아니면 스킵
              if (subSubCurr.designName !== 'ItemCardGeneral') return subSubAcc;

              // seller.text가 없으면 스킵
              if (!subSubCurr.viewModel?.seller?.text) return subSubAcc;

              // 중복 제거 (mallName 기준)
              if (
                subSubAcc.some((item) => item.mallName === subSubCurr.viewModel.seller.text) ||
                subAcc.some((item) => item.mallName === subSubCurr.viewModel.seller.text) ||
                acc.some((item) => item.mallName === subSubCurr.viewModel.seller.text)
              )
                return subSubAcc;

              return [
                ...subSubAcc,
                {
                  mallName: subSubCurr.viewModel.seller.text,
                  mallPcUrl: subSubCurr.viewModel.seller.link,
                },
              ];
            }, []);
            return [...subAcc, ...subSubList];
          }, []);
          return [...acc, ...subList];
        }, []) || [];

      console.log(`[옥션 데이터 수집] 상품 ${list.length}개 수집`);

      // 4. 서버로 전송할 데이터 구성
      const result = {
        squery: keyword,
        usernum: this.currentConfig?.usernum || '',
        spricelimit: this.currentConfig?.minAmount || '0',
        epricelimit: this.currentConfig?.maxAmount || '99999999',
        platforms: 'AUCTION',
        result: {
          relatedTags,
          uniqueMenuTag,
          list,
        },
      };

      // 5. history back으로 원래 페이지로 돌아가기
      console.log('[옥션 데이터 수집] 원래 페이지로 돌아가기 (history back)');
      await page.goBack({ waitUntil: 'domcontentloaded' });
      await AntiDetectionUtils.naturalDelay(500, 1000);
      console.log('[옥션 데이터 수집] 원래 페이지로 복귀 완료');

      return {
        success: true,
        message: `옥션 데이터 수집 완료: ${list.length}개`,
        data: result,
      };
    } catch (error) {
      console.error('[옥션 데이터 수집] 오류:', error);

      // 오류 발생 시에도 원래 페이지로 돌아가기 시도
      try {
        await page.goBack({ waitUntil: 'domcontentloaded' });
        console.log('[옥션 데이터 수집] 오류 후 원래 페이지로 복귀');
      } catch (backError) {
        console.error('[옥션 데이터 수집] 뒤로가기 실패:', backError);
      }

      return {
        success: false,
        message: '옥션 데이터 수집 중 오류 발생',
      };
    }
  }

  /**
   * 네이버 상품 데이터 전송
   * @param resultData 수집된 네이버 result 객체 (squery, usernum, spricelimit, epricelimit, platforms, result)
   */
  private async sendNaverProductData(resultData: any): Promise<any> {
    try {
      const { squery, result } = resultData;
      const { list } = result;

      console.log(`[네이버 데이터 전송] 키워드 "${squery}" - ${list.length}개 상품 전송 시작`);

      if (list.length === 0) {
        console.warn('[네이버 데이터 전송] 전송할 상품이 없습니다.');
        return { success: false, message: '전송할 상품이 없습니다.' };
      }

      const context = {
        isParsed: true,
        inserturl: 'https://selltkey.com/scb/api/setSearchResult.asp',
      };

      const url = 'https://api.opennest.co.kr/restful/v1/selltkey/relay-naver';
      console.log('[네이버 데이터 전송] 전송 데이터:', JSON.stringify({ data: resultData, context }));

      const response = await axios.post(url, { data: resultData, context });
      const responseResult = response.data;

      console.log(`[네이버 데이터 전송] 전송 결과:`, responseResult);

      if (responseResult.result === 'OK') {
        console.log(`[네이버 데이터 전송] 성공 - 키워드 "${squery}"`);
      } else {
        console.error(`[네이버 데이터 전송] 실패 - 키워드 "${squery}":`, responseResult.message);
      }

      return responseResult;
    } catch (error) {
      console.error('[네이버 데이터 전송] 오류:', error);
      return { success: false, message: '네이버 데이터 전송 중 오류 발생' };
    }
  }

  /**
   * 옥션 상품 데이터 전송
   * @param resultData 수집된 옥션 result 객체 (squery, usernum, spricelimit, epricelimit, platforms, result)
   */
  private async sendAuctionProductData(resultData: any): Promise<any> {
    try {
      const { squery, result } = resultData;
      const { list } = result;

      console.log(`[옥션 데이터 전송] 키워드 "${squery}" - ${list.length}개 상품 전송 시작`);

      if (list.length === 0) {
        console.warn('[옥션 데이터 전송] 전송할 상품이 없습니다.');
        return { success: false, message: '전송할 상품이 없습니다.' };
      }

      const context = {
        isParsed: true,
        inserturl: 'https://selltkey.com/scb/api/setSearchResult.asp',
      };

      const url = 'https://api.opennest.co.kr/restful/v1/selltkey/relay-auction';
      console.log('[옥션 데이터 전송] 전송 데이터:', JSON.stringify({ data: resultData, context }));

      const response = await axios.post(url, { data: resultData, context });
      const responseResult = response.data;

      console.log(`[옥션 데이터 전송] 전송 결과:`, responseResult);

      if (responseResult.result === 'OK') {
        console.log(`[옥션 데이터 전송] 성공 - 키워드 "${squery}"`);
      } else {
        console.error(`[옥션 데이터 전송] 실패 - 키워드 "${squery}":`, responseResult.message);
      }

      return responseResult;
    } catch (error) {
      console.error('[옥션 데이터 전송] 오류:', error);
      return { success: false, message: '옥션 데이터 전송 중 오류 발생' };
    }
  }

  private async inputKeywordInShoppingTab(page: Page, keyword: string): Promise<SourcingResult> {
    try {
      console.log(`[쇼핑 탭 키워드 입력] "${keyword}" 자연스러운 입력 시작`);

      // 쇼핑 탭 검색창 선택자들 (원래 잘 작동하던 선택자들 사용)
      const searchSelectors = [
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
      ];

      // 디버깅: 검색창 찾기 시도
      console.log('[쇼핑 탭 키워드 입력] 검색창 찾기 시도 중...');

      // 자연스러운 키워드 입력 (원래 잘 작동하던 설정 사용)
      const inputSuccess = await findAndTypeNaturallyMultiple(page, searchSelectors, keyword, {
        minDelay: 120,
        maxDelay: 280,
        copyPasteChance: 0, // 복사/붙여넣기 비활성화 (값이 안 들어가는 문제)
        mistakeChance: 0.12,
        correctionChance: 1.0,
        clearFirst: true, // 기존 텍스트 클리어
      });

      if (!inputSuccess) {
        console.error('[쇼핑 탭 키워드 입력] 검색창을 찾을 수 없음. 사용 가능한 선택자:', searchSelectors);
        return { success: false, message: '쇼핑 탭 검색창을 찾을 수 없습니다.' };
      }

      console.log(`[쇼핑 탭 키워드 입력] 자연스러운 입력 완료: "${keyword}"`);
      return { success: true, message: '쇼핑 탭 키워드 입력 완료' };
    } catch (error) {
      console.error('[쇼핑 탭 키워드 입력] 오류:', error);
      return { success: false, message: '쇼핑 탭 키워드 입력 실패' };
    }
  }

  private async executeSearchInShoppingTab(page: Page): Promise<SourcingResult> {
    try {
      console.log('[쇼핑 탭 검색 실행] 자연스러운 검색 시작');

      // 검색창에 값이 입력되었는지 간단히 확인
      const hasInputValue = await page.evaluate(() => {
        const searchInputs = document.querySelectorAll('input[type="text"], input[name="query"], input[id="query"]');
        for (const input of searchInputs) {
          const inputElement = input as HTMLInputElement;
          if (inputElement.value && inputElement.value.trim().length > 0) {
            console.log(`[검색 실행] 검색창에 값 발견: "${inputElement.value}"`);
            return true;
          }
        }
        console.log('[검색 실행] 검색창에 값이 없음');
        return false;
      });

      if (!hasInputValue) {
        console.error('[쇼핑 탭 검색 실행] 검색창에 값이 입력되지 않음');
        return { success: false, message: '검색창에 키워드가 입력되지 않았습니다.' };
      }

      // 자연스러운 검색 실행 (쇼핑 탭에 맞는 설정)
      const searchSuccess = await executeShoppingTabSearch(page, {
        enterKeyChance: 0.75, // 75% 확률로 엔터키 사용
        clickDelay: 300,
        waitAfterSearch: 2500, // 쇼핑 탭은 조금 더 빠른 로딩
      });

      if (!searchSuccess) {
        return { success: false, message: '쇼핑 탭 검색 실행 실패' };
      }

      console.log('[쇼핑 탭 검색 실행] 자연스러운 검색 완료');
      return { success: true, message: '쇼핑 탭 검색 실행 완료' };
    } catch (error) {
      console.error('[쇼핑 탭 검색 실행] 오류:', error);
      return { success: false, message: '쇼핑 탭 검색 실행 실패' };
    }
  }

  // ================================================
  // 네이버페이 탭 관련 함수들
  // ================================================

  /**
   * 네이버페이 탭 클릭 (사용하지 않음 - 빠른 클릭 방식 사용)
   */
  /*
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
  */

  /**
   * 상품타입을 해외직구보기로 변경 (사용하지 않음 - 빠른 선택 방식 사용)
   */
  /*
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
  */

  /**
   * 80개씩 보기로 변경 (사용하지 않음 - 빠른 선택 방식 사용)
   */
  /*
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
  */
}

// 싱글톤 인스턴스
export const sourcingService = new SourcingService();

// https://search.shopping.naver.com/search/all?where=all&frm=NVSCTAB&query=%EC%9D%B8%EA%B3%B5+%EC%9D%B8%EC%A1%B0+%EC%9E%94%EB%94%94&
// https://search.shopping.naver.com/search/all?adQuery=%EC%9D%B8%EA%B3%B5%20%EC%9D%B8%EC%A1%B0%20%EC%9E%94%EB%94%94&frm=NVSCTAB&origQuery=%EC%9D%B8%EA%B3%B5%20%EC%9D%B8%EC%A1%B0%20%EC%9E%94%EB%94%94&pagingIndex=1&pagingSize=40&productSet=checkout&query=%EC%9D%B8%EA%B3%B5%20%EC%9D%B8%EC%A1%B0%20%EC%9E%94%EB%94%94&sort=rel&timestamp=&viewType=list
// https://search.shopping.naver.com/search/all?adQuery=%EC%9D%B8%EA%B3%B5%20%EC%9D%B8%EC%A1%B0%20%EC%9E%94%EB%94%94&frm=NVSCTAB&origQuery=%EC%9D%B8%EA%B3%B5%20%EC%9D%B8%EC%A1%B0%20%EC%9E%94%EB%94%94&pagingIndex=1&pagingSize=80&productSet=total&query=%EC%9D%B8%EA%B3%B5%20%EC%9D%B8%EC%A1%B0%20%EC%9E%94%EB%94%94&sort=rel&timestamp=&viewType=list
// https://search.shopping.naver.com/search/all?adQuery=%EC%9D%B8%EA%B3%B5%20%EC%9D%B8%EC%A1%B0%20%EC%9E%94%EB%94%94&frm=NVSCTAB&origQuery=%EC%9D%B8%EA%B3%B5%20%EC%9D%B8%EC%A1%B0%20%EC%9E%94%EB%94%94&pagingIndex=1&pagingSize=80&productSet=checkout&query=%EC%9D%B8%EA%B3%B5%20%EC%9D%B8%EC%A1%B0%20%EC%9E%94%EB%94%94&sort=rel&timestamp=&viewType=list
// https://search.shopping.naver.com/search/all?adQuery=%EC%9D%B8%EA%B3%B5%20%EC%9D%B8%EC%A1%B0%20%EC%9E%94%EB%94%94&frm=NVSCTAB&origQuery=%EC%9D%B8%EA%B3%B5%20%EC%9D%B8%EC%A1%B0%20%EC%9E%94%EB%94%94&pagingIndex=1&pagingSize=80&productSet=checkout&query=%EC%9D%B8%EA%B3%B5%20%EC%9D%B8%EC%A1%B0%20%EC%9E%94%EB%94%94&sort=rel&timestamp=&viewType=list

// &productSet=checkout : 네이버페이
// &pagingSize=80 : 80개씩 보기
// &agency=true : 해외 직구 보기
