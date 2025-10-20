/**
 * 상품수집 서비스
 * 실제 상품 수집 비즈니스 로직을 담당
 */

import axios from 'axios';
import { browserService } from './browserService';
import { CaptchaUtils } from '../utils/captchaUtils';
import { BlockDetectionUtils } from '../utils/blockDetectionUtils';

export interface CollectionResult {
  success: boolean;
  message: string;
  data?: any;
}

export class CollectionService {
  private isRunning: boolean = false;
  private currentUsernum: string | null = null;
  private logs: string[] = [];
  private progress: {
    current: number;
    total: number;
    currentStore: string;
    status: string;
    waitTime?: number;
  } = {
    current: 0,
    total: 0,
    currentStore: '',
    status: '대기 중',
  };

  /**
   * 로그 추가
   * @param message 로그 메시지
   */
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

  /**
   * 수집 시작
   * @param usernum 사용자 번호
   * @returns CollectionResult
   */
  async startCollection(usernum: string): Promise<CollectionResult> {
    try {
      // ========================================
      // 1단계: 기본 검증 및 초기화
      // ========================================
      // 이미 실행 중인지 확인
      if (this.isRunning) {
        return {
          success: false,
          message: '이미 수집이 진행 중입니다.',
        };
      }

      // 유저번호 유효성 검사
      if (!usernum || usernum.trim() === '') {
        return {
          success: false,
          message: '유효하지 않은 사용자 번호입니다.',
        };
      }

      // 수집 상태 설정
      this.isRunning = true;
      this.currentUsernum = usernum;
      this.logs = []; // 로그 초기화

      // 진행상황 초기화
      this.progress = {
        current: 0,
        total: 0,
        currentStore: '',
        status: '수집 시작 중...',
      };

      this.addLog('수집 프로세스 시작');
      console.log(`[CollectionService] 수집 시작 - 사용자: ${usernum}`);
      console.log(`[CollectionService] 현재 진행상황:`, this.getProgress());

      // ========================================
      // 2단계: 상품목록 조회 및 검증
      // ========================================
      this.addLog('상품목록 조회 중...');
      const res = await getGoodsUrlList(usernum);
      console.log(`[CollectionService] 상품목록 조회 결과: ${res.item.length}개`);

      // 오늘 처리 횟수 초과 체크
      if (res.todayStop) {
        throw new Error('오늘 처리 횟수가 초과 되었습니다.');
      }

      // 처리할 상품이 있는지 체크
      if (res.item.length === 0) {
        throw new Error('처리할 상품이 없습니다.');
      }

      // 진행상황 업데이트 - 상품목록 조회 완료
      this.progress.total = res.item.length;
      this.progress.status = `상품목록 조회 완료 (${res.item.length}개)`;
      this.addLog(`상품목록 조회 완료: ${res.item.length}개 상품`);
      console.log(`[CollectionService] 상품목록 조회 후 진행상황:`, this.getProgress());

      // ========================================
      // 3단계: 브라우저 준비 및 초기화
      // ========================================
      this.progress.status = '브라우저 준비 중...';
      this.addLog('브라우저 준비 중...');
      console.log('[CollectionService] 브라우저 준비 시작');

      const prepareResult = await browserService.prepareForService();
      if (!prepareResult.success) {
        throw new Error(prepareResult.message);
      }

      // 작업 데이터 클리어
      this.progress.status = '작업 데이터 초기화 중...';
      this.addLog('작업 데이터 초기화 중...');
      console.log('[CollectionService] 작업 데이터 클리어 시작');

      // 진행상황 초기화 (total은 유지)
      const totalCount = this.progress.total;
      this.progress = {
        current: 0,
        total: totalCount,
        currentStore: '',
        status: '작업 준비 완료',
      };

      this.addLog('작업 데이터 초기화 완료');
      console.log('[CollectionService] 작업 데이터 클리어 완료');

      // ========================================
      // 4단계: 상품별 수집 처리 루프
      // ========================================
      const insertUrl = res.inserturl;
      const page = browserService.getCurrentPage();

      // 상품 수집 시작
      this.progress.status = '상품 수집 시작';
      this.addLog('상품 수집 시작');

      for (const item of res.item) {
        // 작업종료 요청이 있으면 break(종료)
        if (!this.isRunning) {
          console.log('[CollectionService] 수집 작업이 중단되었습니다.');
          break;
        }

        // 블럭 페이지 체크
        const isBlockedPage = await BlockDetectionUtils.isBlockedPage(page);
        if (isBlockedPage) {
          throw new Error('블럭 페이지 감지');
        }

        // 캡챠 화면 대기
        await CaptchaUtils.handleCaptcha(
          page,
          usernum,
          async () => {
            this.addLog(`❌ captcha 화면이 감지되었습니다. 해결될때까지 대기 중...`);
            // 캡챠 감지 시 UI 상태 업데이트
            console.log('[CollectionService] 캡챠 감지됨 - UI 상태 업데이트');
            try {
              // 메인 프로세스에서 직접 상태 업데이트
              const { BrowserWindow } = await import('electron');
              const mainWindow = BrowserWindow.getFocusedWindow();
              if (mainWindow) {
                mainWindow.webContents.send('captcha-detected');
              }
            } catch (error) {
              console.error('[CollectionService] 캡챠 상태 업데이트 실패:', error);
            }
          },
          async () => {
            // 캡챠 해결 시 UI 상태 업데이트
            this.addLog(`✅ captcha 해결됨`);
            console.log('[CollectionService] 캡챠 해결됨 - UI 상태 업데이트');
            try {
              const { BrowserWindow } = await import('electron');
              const mainWindow = BrowserWindow.getFocusedWindow();
              if (mainWindow) {
                mainWindow.webContents.send('captcha-resolved');
              }
            } catch (error) {
              console.error('[CollectionService] 캡챠 해결 상태 업데이트 실패:', error);
            }
          },
        );

        console.log(`[CollectionService] 상품 처리 시작: ${item.TARGETSTORENAME} (${item.URLPLATFORMS})`);
        this.addLog(`상품 처리 시작: ${item.TARGETSTORENAME} (${item.URLPLATFORMS})`);

        // 진행상황 업데이트
        this.progress.current += 1;
        this.progress.currentStore = item.TARGETSTORENAME;
        this.progress.status = `${item.URLPLATFORMS} 상품 수집 중... (${this.progress.current}/${this.progress.total})`;
        console.log(`[CollectionService] 상품 처리 진행상황 업데이트:`, this.getProgress());

        // 결과 객체 초기화
        const result: any = {
          urlnum: item.URLNUM,
          usernum: usernum,
          spricelimit: item.SPRICELIMIT,
          epricelimit: item.EPRICELIMIT,
          platforms: item.URLPLATFORMS,
          bestyn: item.BESTYN,
          newyn: item.NEWYN,
          result: { error: false, errorMsg: '', list: [] },
        };

        try {
          // 플랫폼별 분기 처리
          if (item.URLPLATFORMS === 'AUCTION') {
            console.log('[CollectionService] AUCTION 상품 처리 시작');
            const goods = await getAuctionGoodsList(item.TARGETURL, page);

            if (goods.length === 0) {
              result.result.error = true;
              result.result.errorMsg = '상품 없음';
              result.result.list = [];
            } else {
              // 해외배송 상품 체크
              const procPage = await browserService.createPage();
              await procPage.goto(goods[0].goodsurl);
              const spans = await procPage.$$('.text__title');
              let isOversea = false;
              for (const span of spans) {
                const text = await procPage.evaluate((el) => el.textContent, span);
                if (text === '해외배송 상품') {
                  isOversea = true;
                  break;
                }
              }
              await procPage.close();

              if (isOversea) {
                result.result.error = false;
                result.result.errorMsg = '수집성공';
                result.result.list = goods;
              } else {
                result.result.error = true;
                result.result.errorMsg = '국내사업자입니다.';
                result.result.list = [];
              }
            }
          } else if (item.URLPLATFORMS === 'NAVER') {
            console.log('[CollectionService] NAVER 상품 처리 시작');
            const data = await getNaverGoodsList(item.TARGETURL, page);

            // 데이터 유효성 검사
            if (!data) {
              result.result.error = true;
              result.result.errorMsg = '데이터 로드 실패';
              result.result.list = [];
            } else if (!data.categoryTree?.A || Object.keys(data.categoryTree?.A).length === 0) {
              result.result.error = true;
              result.result.errorMsg = '운영중이 아님';
              result.result.list = [];
            } else {
              // 베스트/신상품 필터링
              const bestList = data.smartStoreV2?.specialProducts?.bestProductNos ?? [];
              const newList = data.smartStoreV2?.specialProducts?.newProductNos ?? [];
              const targetList = [...(result.bestyn === 'Y' ? bestList : []), ...(result.newyn === 'Y' ? newList : [])];

              if (targetList.length === 0) {
                result.result.error = true;
                result.result.errorMsg = '베스트 상품이 없음';
                result.result.list = [];
              } else {
                // 상품 데이터 수집 및 필터링
                const combinedFound = await collectNaverProducts(data, targetList);

                if (combinedFound.length === 0) {
                  result.result.error = true;
                  result.result.errorMsg = '수집된 상품 데이터 없음';
                  result.result.list = [];
                } else {
                  const spricelimit: number = +item.SPRICELIMIT;
                  const epricelimit: number = +item.EPRICELIMIT;

                  const priceFiltered = combinedFound.filter(
                    (item: any) => item.salePrice >= spricelimit && item.salePrice <= epricelimit,
                  );

                  const nameFiltered = priceFiltered.filter((item: any) => Boolean(item.name));

                  if (nameFiltered.length === 0) {
                    result.result.error = true;
                    result.result.errorMsg = '가격/이름 필터링 후 상품 없음';
                    result.result.list = [];
                  } else {
                    result.result.error = false;
                    result.result.errorMsg = '수집성공';
                    result.result.list = nameFiltered.map((item: any) => ({
                      goodscode: item.id,
                      goodsname: item.name,
                      saleprice: item.salePrice,
                      discountsaleprice: item.benefitsView?.discountedSalePrice || item.salePrice,
                      discountrate: item.benefitsView?.discountedRatio || 0,
                      deliveryfee: item.productDeliveryInfo?.baseFee ?? 0,
                      nvcate: item.category?.categoryId || '',
                      imageurl: item.representativeImageUrl || '',
                      goodsurl: `https://smartstore.naver.com/${data.smartStoreV2?.channel?.url || 'unknown'}/products/${item.id}`,
                      seoinfo: data.seoInfo?.sellerTags ?? '',
                    }));
                  }
                }
              }
            }
          } else {
            console.log('[CollectionService] 처리 제외 플랫폼:', item.URLPLATFORMS);
            continue;
          }

          // 결과 데이터 API 전송
          console.log('[CollectionService] 결과 데이터 전송:', result);
          const resPost = await postGoodsList(
            {
              properties: {
                urlnum: item.URLNUM,
                usernum: usernum,
                platforms: item.URLPLATFORMS,
                spricelimit: item.SPRICELIMIT,
                epricelimit: item.EPRICELIMIT,
                inserturl: insertUrl,
                jsonstring: result,
              },
              params: { isParsed: true },
            },
            item.URLPLATFORMS,
          );

          // 오늘 처리 횟수 초과 체크
          if (resPost.todayStop) {
            throw new Error('오늘 처리 횟수가 초과 되었습니다.');
          }
        } catch (error) {
          console.error('[CollectionService] 개별 상품 처리 오류:', error);
          // 오류가 발생해도 다음 상품 처리 계속
        }

        // 랜덤 지연 (10-15초)
        const randomDelay = Math.floor(Math.random() * (15000 - 10000 + 1)) + 10000;
        console.log(
          `[CollectionService] 완료: ${item.TARGETSTORENAME} - 다음 대기 (${Math.floor(randomDelay / 1000)}초)`,
        );

        // 대기시간 카운팅
        this.progress.status = `다음 상품 대기 중... (${Math.floor(randomDelay / 1000)}초)`;
        this.progress.waitTime = Math.floor(randomDelay / 1000);
        console.log(`[CollectionService] 대기 시작 진행상황:`, this.getProgress());

        // 1초씩 카운트다운
        for (let i = Math.floor(randomDelay / 1000); i > 0; i--) {
          if (!this.isRunning) break; // 중단 요청 시 즉시 종료
          this.progress.waitTime = i;
          this.progress.status = `다음 상품 대기 중... (${i}초)`;
          console.log(`[CollectionService] 대기 중 진행상황:`, this.getProgress());
          await delay(1000);
        }

        this.progress.waitTime = undefined;
        this.progress.status = `상품 수집 중... (${this.progress.current}/${this.progress.total})`;
      }

      // ========================================
      // 5단계: 완료 처리
      // ========================================
      // TODO: 브라우저 정리
      // TODO: 최종 상태 업데이트

      this.progress.status = '수집 완료';
      this.progress.currentStore = '';
      this.addLog('🎉 전체 수집 프로세스 완료!');
      this.addLog(`총 ${this.progress.total}개 상품 처리 완료`);

      return {
        success: true,
        message: '상품 수집이 완료되었습니다.',
        data: {
          usernum,
          startTime: new Date().toISOString(),
          totalProcessed: this.progress.current,
          totalItems: this.progress.total,
        },
      };
    } catch (error) {
      console.error('[CollectionService] 수집 시작 오류:', error);
      this.isRunning = false;
      this.currentUsernum = null;
      this.progress = {
        current: 0,
        total: 0,
        currentStore: '',
        status: '오류 발생',
      };

      return {
        success: false,
        message: error.message || '수집 시작 중 오류가 발생했습니다.',
      };
    }
  }

  /**
   * 수집 중지
   * @returns CollectionResult
   */
  async stopCollection(): Promise<CollectionResult> {
    try {
      // 실행 중이 아닌 경우
      if (!this.isRunning) {
        return {
          success: false,
          message: '수집이 실행 중이 아닙니다.',
        };
      }

      console.log(`[CollectionService] 수집 중지 - 사용자: ${this.currentUsernum}`);

      // TODO: 실제 수집 중지 로직 구현
      // 1. 진행 중인 수집 작업 중단
      // 2. 리소스 정리
      // 3. 상태 초기화

      // 상태 초기화
      this.isRunning = false;
      this.currentUsernum = null;
      this.progress = {
        current: 0,
        total: 0,
        currentStore: '',
        status: '대기 중',
      };

      return {
        success: true,
        message: '상품 수집이 중지되었습니다.',
        data: {
          stopTime: new Date().toISOString(),
        },
      };
    } catch (error) {
      console.error('[CollectionService] 수집 중지 오류:', error);
      return {
        success: false,
        message: '수집 중지 중 오류가 발생했습니다.',
      };
    }
  }

  /**
   * 현재 수집 상태 확인
   * @returns boolean
   */
  isCollectionRunning(): boolean {
    return this.isRunning;
  }

  /**
   * 현재 수집 상태 확인 (앱 종료용)
   * @returns boolean
   */
  isServiceActive(): boolean {
    return this.isRunning;
  }

  /**
   * 현재 수집 중인 사용자 번호
   * @returns string | null
   */
  getCurrentUsernum(): string | null {
    return this.currentUsernum;
  }

  /**
   * 수집 진행상황 가져오기
   * @returns any
   */
  getProgress(): any {
    const progressData = {
      isRunning: this.isRunning,
      usernum: this.currentUsernum,
      current: this.progress.current,
      total: this.progress.total,
      currentStore: this.progress.currentStore,
      status: this.progress.status,
      waitTime: this.progress.waitTime,
      progress: this.isRunning
        ? `${this.progress.current}/${this.progress.total} - ${this.progress.currentStore} (${this.progress.status})`
        : '대기 중',
      logs: this.logs,
    };

    console.log('[CollectionService] getProgress 호출됨:', progressData);
    return progressData;
  }
}

// 싱글톤 인스턴스
export const collectionService = new CollectionService();

// ------------------------------------------------------------
// 유틸리티 함수들
// ------------------------------------------------------------

const getGoodsUrlList = async (userNum: string): Promise<any> => {
  return axios
    .request({
      method: 'GET',
      url: 'https://selltkey.com/scb/api/getUrlList_scraper.asp',
      params: {
        usernum: userNum,
      },
    })
    .then((res) => res.data);
};

// 기본 유틸리티 함수들 (향후 사용 예정)
const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

// ========================================
// 상품 수집 유틸리티 함수들
// ========================================

/**
 * 옥션 상품 목록 수집
 */
const getAuctionGoodsList = async (url: string, page: any): Promise<any> => {
  await page.goto(url);
  const textContent = await page.evaluate(() => {
    const element = document.getElementById('__NEXT_DATA__');
    return element?.textContent ?? null;
  });

  if (!textContent) {
    throw new Error('textContent is undefined');
  }

  const data = JSON.parse(textContent);
  const regions = data.props.pageProps.initialStates.curatorData.regions;

  const list = regions.reduce((acc: any, curr: any) => {
    const subList = curr.modules.reduce((acc: any, curr: any) => {
      const subSubList = curr.rows.reduce((acc: any, curr: any) => {
        if (curr.designName === 'ItemCardGeneral') {
          if ((curr.viewModel.score?.payCount?.text ?? '0') === '0') {
            return acc;
          }

          const salePrice = Number((curr.viewModel.price.binPrice ?? '0').replace(/,/g, ''));
          const discountsaleprice = curr.viewModel.price.couponDiscountedBinPrice
            ? Number((curr.viewModel.price.couponDiscountedBinPrice ?? '0').replace(/,/g, ''))
            : salePrice;
          const discountrate = curr.viewModel.price.discountRate
            ? Number((curr.viewModel.price.discountRate ?? '0').replace(/,/g, ''))
            : 0;

          let deliveryfee = 0;
          const tag = curr.viewModel.tags.find((tag: string) => tag.startsWith('배송비'));
          if (tag) {
            const match = tag.match(/(\d{1,3}(,\d{3})*)/);
            if (match) {
              deliveryfee = Number(match[0].replace(/,/g, ''));
            }
          }

          return [
            ...acc,
            {
              goodscode: curr.viewModel.itemNo,
              goodsname: curr.viewModel.item.text,
              imageurl: curr.viewModel.item.imageUrl,
              goodsurl: curr.viewModel.item.link,
              salePrice,
              discountsaleprice,
              discountrate,
              deliveryfee,
              seoinfo: '',
              nvcate: '',
            },
          ];
        }
        return acc;
      }, []);
      return [...acc, ...subSubList];
    }, []);
    return [...acc, ...subList];
  }, []);

  const result = Array.from(list.reduce((map: any, item: any) => map.set(item.goodscode, item), new Map()).values());
  return result;
};

/**
 * 네이버 상품 목록 수집
 */
const getNaverGoodsList = async (url: string, page: any): Promise<any> => {
  try {
    console.log(`[CollectionService] 네이버 상품 페이지 접근: ${url}`);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });

    // CAPTCHA 체크 및 대기
    let isCaptchaPage = false;
    try {
      const pageInfo = await page.evaluate(() => {
        const captchaScript = document.querySelector('script[src*="wtm_captcha.js"]');
        const captchaFrame = document.querySelector('iframe[src*="captcha"]');
        const captchaContainer = document.querySelector('.captcha_container');
        const loginForm = document.querySelector('#frmNIDLogin');

        return {
          hasCaptchaScript: !!captchaScript,
          hasCaptchaFrame: !!captchaFrame,
          hasCaptchaContainer: !!captchaContainer,
          hasLoginForm: !!loginForm,
        };
      });

      isCaptchaPage =
        (pageInfo.hasCaptchaScript || pageInfo.hasCaptchaFrame || pageInfo.hasCaptchaContainer) &&
        pageInfo.hasLoginForm;

      if (isCaptchaPage) {
        console.log('[CollectionService] CAPTCHA 감지됨, 대기 중...');
        // CAPTCHA 완료 대기
        await page.waitForFunction(
          () => {
            const captchaScript = document.querySelector('script[src*="wtm_captcha.js"]');
            const captchaFrame = document.querySelector('iframe[src*="captcha"]');
            const captchaContainer = document.querySelector('.captcha_container');
            const loginForm = document.querySelector('#frmNIDLogin');
            const currentUrl = window.location.href;
            const isSuccessUrl = currentUrl.search('smartstore.naver.com') !== -1;

            return !captchaScript && !captchaFrame && !captchaContainer && (!loginForm || isSuccessUrl);
          },
          { timeout: 300000 },
        );
      }
    } catch (error) {
      console.log('[CollectionService] CAPTCHA 체크 중 오류:', error);
    }

    // __PRELOADED_STATE__ 데이터 추출
    const data: any = await page.evaluate(() => {
      return (globalThis as any).window.__PRELOADED_STATE__;
    });

    if (!data) {
      console.error('[CollectionService] __PRELOADED_STATE__ 데이터가 없습니다.');
      return null;
    }

    console.log('[CollectionService] 네이버 상품 데이터 로드 완료');
    return data;
  } catch (error) {
    console.error('[CollectionService] 네이버 상품 목록 수집 오류:', error);
    return null;
  }
};

/**
 * 네이버 상품 데이터 수집 및 조합
 */
const collectNaverProducts = async (data: any, targetList: string[]): Promise<any[]> => {
  try {
    // 안전한 데이터 접근
    const widgetContents = data?.widgetContents || {};
    const category = data?.category || {};

    const found1 =
      widgetContents.bestProductWidget?.A?.data?.bestProducts?.REALTIME?.simpleProducts?.filter((item: any) =>
        targetList.includes(item.id),
      ) ?? [];

    const found2 =
      widgetContents.bestProductWidget?.A?.data?.bestProducts?.DAILY?.simpleProducts?.filter((item: any) =>
        targetList.includes(item.id),
      ) ?? [];

    const found3 =
      widgetContents.bestProductWidget?.A?.data?.bestProducts?.WEEKLY?.simpleProducts?.filter((item: any) =>
        targetList.includes(item.id),
      ) ?? [];

    const found4 =
      widgetContents.bestProductWidget?.A?.data?.bestProducts?.MONTHLY?.simpleProducts?.filter((item: any) =>
        targetList.includes(item.id),
      ) ?? [];

    const found5 =
      widgetContents?.bestProductWidget?.A?.data?.allCategoryProducts?.simpleProducts?.filter((item: any) =>
        targetList.includes(item.id),
      ) ?? [];

    const found6 =
      widgetContents?.bestReviewWidget?.A?.data?.reviewProducts?.filter((item: any) => targetList.includes(item.id)) ??
      [];

    const found7 =
      widgetContents?.wholeProductWidget?.A?.data?.simpleProducts?.filter((item: any) =>
        targetList.includes(item.id),
      ) ?? [];

    const found8 = category?.A?.simpleProducts?.filter((item: any) => targetList.includes(item.id)) ?? [];

    const combinedFound = [...found1, ...found2, ...found3, ...found4, ...found5, ...found6, ...found7, ...found8];

    // 중복 제거 및 유효성 검사
    const uniqueById = Array.from(
      combinedFound
        .filter((item: any) => item && item.id) // 유효한 아이템만 필터링
        .reduce((map: any, item: any) => map.set(item.id, item), new Map())
        .values(),
    );

    console.log(`[CollectionService] 상품 수집 결과: ${uniqueById.length}개 (대상: ${targetList.length}개)`);
    return uniqueById;
  } catch (error) {
    console.error('[CollectionService] 상품 데이터 수집 오류:', error);
    return [];
  }
};

/**
 * 결과 데이터 API 전송
 */
const postGoodsList = (data: any, platform: 'NAVER' | 'AUCTION'): Promise<any> => {
  const url = `${process.env.URL_API ?? 'https://api.opennest.co.kr/api/v2'}/restful/ovse/relay-${platform.toLowerCase()}-goods`;
  return axios
    .request({
      method: 'POST',
      url,
      headers: {
        'Content-Type': 'application/json',
      },
      data,
    })
    .then((res) => res.data);
};
