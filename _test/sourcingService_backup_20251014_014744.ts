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

  constructor() {
    // Stealth 플러그인 초기화
    puppeteer.use(StealthPlugin());
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
      console.log('[소싱] 전체 프로세스 시작');

      // ========================================
      // 1단계: 브라우저 초기화 및 정리
      // ========================================
      console.log('[소싱] 브라우저 초기화 시작');

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

      for (const keyword of keywords) {
        // check block screen (블럭되어도 fetch 소싱은 가능)
        const isBlockedPage = await this.isBlocked(newPage);
        if (isBlockedPage) {
          console.warn(`[소싱] 블럭 페이지 감지 - 키워드 "${keyword}" (fetch 소싱 계속 진행)`);
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
          const naverResult = await this.collectNaverProductData(newPage, keyword);
          if (!naverResult.success) {
            console.warn(`[소싱] 네이버 데이터 수집 실패 - 키워드 "${keyword}": ${naverResult.message}`);
            // 네이버 수집 실패해도 계속 진행
          } else {
            try {
              await this.sendNaverProductData(naverResult.data);
            } catch (error) {
              console.warn(`[소싱] 네이버 데이터 전송 실패 - 키워드 "${keyword}":`, error);
            }
          }
        }

        // 데이터 수집 - 옥션 (옵션 체크시에만)
        if (config.includeAuction) {
          const auctionResult = await this.collectAuctionProductData(newPage, keyword);
          if (!auctionResult.success) {
            console.warn(`[소싱] 옥션 데이터 수집 실패 - 키워드 "${keyword}": ${auctionResult.message}`);
            // 옥션 수집 실패해도 계속 진행
          } else {
            try {
              await this.sendAuctionProductData(auctionResult.data);
            } catch (error) {
              console.warn(`[소싱] 옥션 데이터 전송 실패 - 키워드 "${keyword}":`, error);
            }
          }
        }

        await AntiDetectionUtils.naturalDelay(1000, 2800);
      }

      this.isRunning = false;
      console.log('[소싱] 전체 소싱 프로세스 완료');
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
        await this.sendProductDataWithTouching(keyword, dataResult.data.processedData);
      }

      console.log(`[3단계] 완료: "${keyword}" 데이터 수집 성공`);

      // 크롤링 회피 작업 (데이터 수집 완료 후, 로그인 상태는 유지)
      await AntiDetectionUtils.performAntiDetectionCleanup(page, {
        enableCookieCleanup: false, // 로그인 쿠키 보존
        enableSessionCleanup: false, // 로그인 세션 보존
        enableLocalStorageCleanup: false, // 로그인 관련 로컬스토리지 보존
        enableRandomDelay: true,
        enableMouseMovement: true,
        enableScrollSimulation: false, // 스크롤 시뮬레이션 제거
        minDelay: 2000,
        maxDelay: 4000,
      });

      return { success: true, message: '데이터 수집 완료', data: dataResult.data };
    } catch (error) {
      console.error('[3단계] 오류:', error);
      return { success: false, message: '데이터 수집 실패' };
    }
  }

  /**
   * 4단계: 쇼핑 탭에서 키워드 검색
   */
  // @ts-ignore
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
  // @ts-ignore
  private async step5_CollectData(page: Page, keyword: string): Promise<SourcingResult> {
    return await this.step3_CollectData(page, keyword);
  }

  // ================================================
  // 세부 작업 함수들 (3rd Depth)
  // ================================================

  /**
   * 브라우저 준비 및 로그인 확인
   */
  // @ts-ignore
  private async prepareBrowser(): Promise<SourcingResult> {
    try {
      // userDataDir 설정으로 영구 프로필 사용 (봇 감지 우회)
      // Electron의 안전한 경로 사용 (Windows/Mac 모두 지원)
      const userDataPath = app.getPath('userData'); // OS별 적절한 경로
      const chromeUserDataDir = path.join(userDataPath, 'chrome-profile');

      console.log('[소싱] Chrome 프로필 경로:', chromeUserDataDir);

      await browserService.initializeBrowser({
        userDataDir: chromeUserDataDir,
      });

      const isLoggedIn = await browserService.checkNaverLoginStatus();

      if (!isLoggedIn) {
        return { success: false, message: '네이버 로그인이 필요합니다.' };
      }

      return { success: true, message: '브라우저 준비 완료' };
    } catch {
      return { success: false, message: '브라우저 준비 실패' };
    }
  }

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

  private async checkRestrictionPage(_page: Page): Promise<{ isRestricted: boolean }> {
    // TODO: 제한 페이지 확인 구현
    return { isRestricted: false };
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
      await AntiDetectionUtils.naturalDelay(500, 800); // 0.5~0.8초 대기

      // 2. 상품타입을 해외직구보기로 변경 (자연스러운 속도)
      const productTypeResult = await this.selectOverseasDirectPurchaseQuick(page);
      if (!productTypeResult.success) {
        console.warn('[클릭 데이터 수집] 해외직구보기 선택 실패:', productTypeResult.message);
      }
      await AntiDetectionUtils.naturalDelay(500, 800); // 0.5~0.8초 대기

      // 3. 80개씩 보기로 변경 (자연스러운 속도)
      const viewCountResult = await this.selectView80ItemsQuick(page);
      if (!viewCountResult.success) {
        console.warn('[클릭 데이터 수집] 80개씩 보기 선택 실패:', viewCountResult.message);
      }

      // TEST CODE //////////////////////////////////////////////////////////////
      // TEST CODE //////////////////////////////////////////////////////////////
      // TEST CODE //////////////////////////////////////////////////////////////

      /* // 4. 모든 데이터 로드를 위한 자연스러운 스크롤
      console.log('[클릭 데이터 수집] 모든 데이터 로드를 위한 스크롤 시작');
      await this.scrollToLoadAllData(page);
 */
      // 5. 네트워크 요청 완료 대기 (API 호출 모니터링)
      console.log('[클릭 데이터 수집] 네트워크 요청 완료 대기 중...');
      await this.waitForNetworkIdle(page, networkMonitor);

      // TEST CODE //////////////////////////////////////////////////////////////
      // TEST CODE //////////////////////////////////////////////////////////////
      // TEST CODE //////////////////////////////////////////////////////////////
      await AntiDetectionUtils.naturalDelay(3000, 5000);

      // 80개씩 보기 변경 후 페이지 새로고침으로 새로운 데이터 강제 로딩
      console.log('[클릭 데이터 수집] 80개씩 보기 변경 후 페이지 새로고침으로 데이터 동기화...');

      // 현재 URL 저장
      const currentUrl = page.url();
      console.log(`[클릭 데이터 수집] 현재 URL: ${currentUrl}`);

      // 페이지 새로고침 (캐시 무시)
      await page.reload({
        waitUntil: 'domcontentloaded',
        timeout: 30000,
      });

      // 새로고침 후 추가 대기
      console.log('[클릭 데이터 수집] 새로고침 후 데이터 로딩 대기...');
      await AntiDetectionUtils.naturalDelay(3000, 5000);

      // 네트워크 요청 완료 대기
      await this.waitForNetworkIdle(page, networkMonitor);

      // 현재 활성화된 보기 설정 확인
      const currentViewSetting = await page.evaluate(() => {
        const activeViewButton = document.querySelector(
          '.subFilter_sort__4Q_hv.active, [data-shp-contents-id*="보기"].active',
        );
        return activeViewButton?.textContent?.trim() || '알 수 없음';
      });
      console.log(`[클릭 데이터 수집] 새로고침 후 보기 설정: ${currentViewSetting}`);

      // 실제 DOM에 렌더링된 상품 개수 확인
      const domProductCount = await page.evaluate(() => {
        const productElements = document.querySelectorAll(
          '.basicList_item__2XT81, .product_list_item, [data-testid="product-item"]',
        );
        return productElements.length;
      });
      console.log(`[클릭 데이터 수집] 새로고침 후 DOM 상품 개수: ${domProductCount}개`);

      // __NEXT_DATA__의 compositeList 개수 확인
      const nextDataCount = await page.evaluate(() => {
        try {
          const nextDataElement = document.querySelector('#__NEXT_DATA__');
          if (nextDataElement?.textContent) {
            const jsonData = JSON.parse(nextDataElement.textContent);
            const compositeList = jsonData?.props?.pageProps?.compositeList?.list;
            return compositeList ? compositeList.length : 0;
          }
        } catch {
          // 무시
        }
        return 0;
      });
      console.log(`[클릭 데이터 수집] 새로고침 후 __NEXT_DATA__ compositeList 개수: ${nextDataCount}개`);

      console.log('[클릭 데이터 수집] 네트워크 요청 완료 --------------------------------');
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

  /**
   * DOM에서 상품 데이터 추출
   */
  private async extractProductsFromDOM(page: Page): Promise<any> {
    try {
      console.log('[상품 추출] DOM에서 상품 데이터 추출 시작');

      // __NEXT_DATA__ JSON 데이터 추출
      const jsonData = await page.evaluate(() => {
        const nextDataElement = document.querySelector('#__NEXT_DATA__');
        if (!nextDataElement?.textContent) {
          return null;
        }
        return JSON.parse(nextDataElement.textContent);
      });

      if (!jsonData) {
        console.warn('[상품 추출] __NEXT_DATA__ 요소를 찾을 수 없음');
        return { relatedTags: [], list: [], uniqueMenuTag: [] };
      }

      // 데이터 가공 처리
      const processedData = this.processNextData(jsonData);
      console.log(
        `[상품 추출] 완료: list ${processedData.list.length}개, uniqueMenuTag ${processedData.uniqueMenuTag.length}개`,
      );

      return processedData;
    } catch (error) {
      console.error('[상품 추출] 오류:', error);
      return { relatedTags: [], list: [], uniqueMenuTag: [] };
    }
  }

  /**
   * __NEXT_DATA__ JSON 데이터 가공
   */
  private processNextData(jsonData: any): any {
    try {
      const parseRoot = jsonData.props.pageProps;
      const relatedTags = parseRoot.relatedTags || [];
      const compositeList = parseRoot.compositeList?.list;

      console.log('[데이터 가공] compositeList 갯수:', compositeList.length);

      if (!compositeList || !Array.isArray(compositeList)) {
        return { relatedTags, list: [], uniqueMenuTag: [] };
      }

      // 데이터 가공
      const { list, manuTag } = compositeList.reduce(
        (acc: any, curr: any) => {
          // manuTag 처리
          if (curr.item?.manuTag) {
            acc.manuTag.push(...curr.item.manuTag.split(','));
          }

          // list 조건에 맞는 객체 처리 (스마트스토어만, 광고 제외)
          const { mallName, mallPcUrl, adId } = curr.item || {};
          if (!adId && mallPcUrl?.startsWith('https://smartstore.naver.com')) {
            if (!acc.list.some((item: any) => item.mallPcUrl === mallPcUrl)) {
              acc.list.push({ mallName, mallPcUrl });
            }
          }

          return acc;
        },
        { list: [], manuTag: [] },
      );

      // 중복 제거
      const uniqueMenuTag = [...new Set(manuTag)];

      return { relatedTags, list, uniqueMenuTag };
    } catch (error) {
      console.error('[데이터 가공] 오류:', error);
      return { relatedTags: [], list: [], uniqueMenuTag: [] };
    }
  }

  // ================================================
  // 빠른 클릭 및 네트워크 모니터링 함수들
  // ================================================

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
        await AntiDetectionUtils.naturalDelay(200, 400); // 짧은 대기

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

      // 보기 설정 드롭다운 찾기 (여러 선택자 시도)
      const viewSelectors = [
        'a[data-shp-contents-id="40개씩 보기"]',
        'a[data-shp-contents-id*="40개"]',
        '.subFilter_sort__4Q_hv:contains("40개")',
        'button:contains("40개")',
        'a:contains("40개씩 보기")',
      ];

      let currentViewButton = null;
      for (const selector of viewSelectors) {
        try {
          currentViewButton = await page.$(selector);
          if (currentViewButton) {
            console.log(`[80개씩 보기] 보기 설정 버튼 발견: ${selector}`);
            break;
          }
        } catch {
          continue;
        }
      }

      if (currentViewButton) {
        await page.evaluate((button) => (button as HTMLElement).click(), currentViewButton);
        await AntiDetectionUtils.naturalDelay(500, 800); // 조금 더 긴 대기

        // 80개씩 보기 옵션 찾기 (여러 선택자 시도)
        const eightySelectors = [
          'a[data-shp-contents-id="80개씩 보기"]',
          'a[data-shp-contents-id*="80개"]',
          'a:contains("80개씩 보기")',
          'button:contains("80개")',
          'li:contains("80개")',
        ];

        let eightyOption = null;
        for (const selector of eightySelectors) {
          try {
            eightyOption = await page.$(selector);
            if (eightyOption) {
              console.log(`[80개씩 보기] 80개 옵션 발견: ${selector}`);
              break;
            }
          } catch {
            continue;
          }
        }

        if (eightyOption) {
          await page.evaluate((option) => (option as HTMLElement).click(), eightyOption);
          console.log('✅ 80개씩 보기 빠른 선택 완료');

          // 클릭 후 잠시 대기
          await AntiDetectionUtils.naturalDelay(2000, 3000);

          // 실제로 80개씩 보기가 선택되었는지 확인
          const is80Selected = await page.evaluate(() => {
            const activeButtons = document.querySelectorAll(
              '.subFilter_sort__4Q_hv.active, [data-shp-contents-id*="보기"].active',
            );
            for (const button of activeButtons) {
              if (button.textContent?.includes('80개')) {
                return true;
              }
            }
            return false;
          });

          console.log(`[80개씩 보기] 선택 확인: ${is80Selected ? '성공' : '실패'}`);

          return { success: true, message: '80개씩 보기 선택 완료' };
        } else {
          console.log('[80개씩 보기] 80개 옵션을 찾을 수 없음');
        }
      } else {
        console.log('[80개씩 보기] 보기 설정 버튼을 찾을 수 없음');
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

// https://search.shopping.naver.com/search/all?where=all&frm=NVSCTAB&query=%EC%9D%B8%EA%B3%B5+%EC%9D%B8%EC%A1%B0+%EC%9E%94%EB%94%94&
// https://search.shopping.naver.com/search/all?adQuery=%EC%9D%B8%EA%B3%B5%20%EC%9D%B8%EC%A1%B0%20%EC%9E%94%EB%94%94&frm=NVSCTAB&origQuery=%EC%9D%B8%EA%B3%B5%20%EC%9D%B8%EC%A1%B0%20%EC%9E%94%EB%94%94&pagingIndex=1&pagingSize=40&productSet=checkout&query=%EC%9D%B8%EA%B3%B5%20%EC%9D%B8%EC%A1%B0%20%EC%9E%94%EB%94%94&sort=rel&timestamp=&viewType=list
// https://search.shopping.naver.com/search/all?adQuery=%EC%9D%B8%EA%B3%B5%20%EC%9D%B8%EC%A1%B0%20%EC%9E%94%EB%94%94&frm=NVSCTAB&origQuery=%EC%9D%B8%EA%B3%B5%20%EC%9D%B8%EC%A1%B0%20%EC%9E%94%EB%94%94&pagingIndex=1&pagingSize=80&productSet=total&query=%EC%9D%B8%EA%B3%B5%20%EC%9D%B8%EC%A1%B0%20%EC%9E%94%EB%94%94&sort=rel&timestamp=&viewType=list
// https://search.shopping.naver.com/search/all?adQuery=%EC%9D%B8%EA%B3%B5%20%EC%9D%B8%EC%A1%B0%20%EC%9E%94%EB%94%94&frm=NVSCTAB&origQuery=%EC%9D%B8%EA%B3%B5%20%EC%9D%B8%EC%A1%B0%20%EC%9E%94%EB%94%94&pagingIndex=1&pagingSize=80&productSet=checkout&query=%EC%9D%B8%EA%B3%B5%20%EC%9D%B8%EC%A1%B0%20%EC%9E%94%EB%94%94&sort=rel&timestamp=&viewType=list
// https://search.shopping.naver.com/search/all?adQuery=%EC%9D%B8%EA%B3%B5%20%EC%9D%B8%EC%A1%B0%20%EC%9E%94%EB%94%94&frm=NVSCTAB&origQuery=%EC%9D%B8%EA%B3%B5%20%EC%9D%B8%EC%A1%B0%20%EC%9E%94%EB%94%94&pagingIndex=1&pagingSize=80&productSet=checkout&query=%EC%9D%B8%EA%B3%B5%20%EC%9D%B8%EC%A1%B0%20%EC%9E%94%EB%94%94&sort=rel&timestamp=&viewType=list

// &productSet=checkout : 네이버페이
// &pagingSize=80 : 80개씩 보기
// &agency=true : 해외 직구 보기
