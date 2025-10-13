/**
 * 자연스러운 텍스트 입력 유틸리티
 * 사람처럼 자연스럽게 텍스트를 입력하는 기능들을 제공
 */

import { ElementHandle, Page } from 'puppeteer';

interface NaturalInputOptions {
  /** 최소 타이핑 딜레이 (ms) */
  minDelay?: number;
  /** 최대 타이핑 딜레이 (ms) */
  maxDelay?: number;
  /** 복사 붙여넣기 확률 (0-1) */
  copyPasteChance?: number;
  /** 실수 확률 (0-1) */
  mistakeChance?: number;
  /** 백스페이스 후 수정 확률 (0-1) - 기본값 1.0 (100% 수정) */
  correctionChance?: number;
  /** 입력 전 기존 텍스트 클리어 여부 */
  clearFirst?: boolean;
}

/**
 * 랜덤 딜레이 생성
 */
function getRandomDelay(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * 랜덤 확률 체크
 */
function shouldExecute(probability: number): boolean {
  return Math.random() < probability;
}

/**
 * 자연스러운 텍스트 입력
 * @param page Puppeteer 페이지
 * @param element 입력할 요소
 * @param text 입력할 텍스트
 * @param options 입력 옵션
 */
export async function typeNaturally(
  page: Page,
  element: ElementHandle<Element>,
  text: string,
  options: NaturalInputOptions = {},
): Promise<void> {
  const {
    minDelay = 80,
    maxDelay = 200,
    copyPasteChance = 0, // 복사/붙여넣기 비활성화 (값이 안 들어가는 문제)
    mistakeChance = 0.15,
    correctionChance = 1.0,
    clearFirst = true,
  } = options;

  console.log(`[NaturalInput] 자연스러운 입력 시작: "${text}"`);

  // 요소가 클릭 가능한지 확인
  const isClickable = await element.evaluate((el: any) => {
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 && !el.disabled && !el.readOnly;
  });

  if (!isClickable) {
    console.log(`[NaturalInput] 요소가 클릭할 수 없는 상태입니다.`);
    throw new Error('Element is not clickable');
  }

  // 입력 요소 클릭하여 포커스
  await element.click();
  await new Promise((resolve) => setTimeout(resolve, getRandomDelay(200, 500)));

  // 기존 텍스트 클리어
  if (clearFirst) {
    await element.evaluate((el: any) => {
      if (el.value !== undefined) {
        el.value = '';
      }
    });
    await page.keyboard.down('Control');
    await page.keyboard.press('KeyA');
    await page.keyboard.up('Control');
    await page.keyboard.press('Delete');
    await new Promise((resolve) => setTimeout(resolve, getRandomDelay(100, 300)));
  }

  // 복사 붙여넣기 vs 타이핑 결정
  if (shouldExecute(copyPasteChance) && text.length > 5) {
    console.log('[NaturalInput] 복사 붙여넣기 방식 선택');
    await copyPasteInput(page, element, text);
  } else {
    console.log('[NaturalInput] 타이핑 방식 선택');
    await typingInput(page, element, text, {
      minDelay,
      maxDelay,
      mistakeChance,
      correctionChance,
    });
  }

  console.log('[NaturalInput] 자연스러운 입력 완료');
}

/**
 * 복사 붙여넣기 방식 입력
 */
async function copyPasteInput(page: Page, element: ElementHandle<Element>, text: string): Promise<void> {
  try {
    // 클립보드에 텍스트 복사
    await page.evaluate((textToCopy: string) => {
      return navigator.clipboard.writeText(textToCopy);
    }, text);

    // 잠시 대기 (클립보드 작업 시뮬레이션)
    await new Promise((resolve) => setTimeout(resolve, getRandomDelay(300, 800)));

    // 붙여넣기
    await page.keyboard.down('Control');
    await page.keyboard.press('KeyV');
    await page.keyboard.up('Control');

    console.log('[NaturalInput] 복사 붙여넣기 완료');
  } catch {
    console.log('[NaturalInput] 복사 붙여넣기 실패, 타이핑으로 전환');
    await typingInput(page, element, text, {});
  }
}

/**
 * 타이핑 방식 입력
 */
async function typingInput(
  page: Page,
  element: ElementHandle<Element>,
  text: string,
  options: {
    minDelay?: number;
    maxDelay?: number;
    mistakeChance?: number;
    correctionChance?: number;
  },
): Promise<void> {
  const { minDelay = 80, maxDelay = 200, mistakeChance = 0.15, correctionChance = 1.0 } = options;

  let currentIndex = 0;
  const chars = text.split('');

  while (currentIndex < chars.length) {
    const char = chars[currentIndex];

    // 실수 시뮬레이션
    if (shouldExecute(mistakeChance) && currentIndex > 0) {
      // 잘못된 문자 입력
      const wrongChar = getRandomWrongChar(char);
      await element.type(wrongChar, { delay: getRandomDelay(minDelay, maxDelay) });

      // 실수 인지 후 대기
      await new Promise((resolve) => setTimeout(resolve, getRandomDelay(200, 600)));

      // 수정할지 결정
      if (shouldExecute(correctionChance)) {
        console.log(`[NaturalInput] 실수 수정: "${wrongChar}" → "${char}"`);
        await page.keyboard.press('Backspace');
        await new Promise((resolve) => setTimeout(resolve, getRandomDelay(100, 300)));
      }
    }

    // 정상 문자 입력
    await element.type(char, { delay: getRandomDelay(minDelay, maxDelay) });

    // 가끔 더 긴 휴식 (생각하는 시간)
    if (shouldExecute(0.1)) {
      await new Promise((resolve) => setTimeout(resolve, getRandomDelay(500, 1200)));
    }

    currentIndex++;
  }
}

/**
 * 잘못된 문자 생성 (키보드 근접 문자)
 */
function getRandomWrongChar(correctChar: string): string {
  const keyboard = {
    q: ['w', 'a', 's'],
    w: ['q', 'e', 's', 'd'],
    e: ['w', 'r', 'd', 'f'],
    r: ['e', 't', 'f', 'g'],
    t: ['r', 'y', 'g', 'h'],
    y: ['t', 'u', 'h', 'j'],
    u: ['y', 'i', 'j', 'k'],
    i: ['u', 'o', 'k', 'l'],
    o: ['i', 'p', 'l'],
    p: ['o', 'l'],
    a: ['q', 's', 'z'],
    s: ['a', 'd', 'z', 'x'],
    d: ['s', 'f', 'x', 'c'],
    f: ['d', 'g', 'c', 'v'],
    g: ['f', 'h', 'v', 'b'],
    h: ['g', 'j', 'b', 'n'],
    j: ['h', 'k', 'n', 'm'],
    k: ['j', 'l', 'm'],
    l: ['k', 'm'],
    z: ['a', 's', 'x'],
    x: ['z', 's', 'd', 'c'],
    c: ['x', 'd', 'f', 'v'],
    v: ['c', 'f', 'g', 'b'],
    b: ['v', 'g', 'h', 'n'],
    n: ['b', 'h', 'j', 'm'],
    m: ['n', 'j', 'k'],
  };

  const lowerChar = correctChar.toLowerCase();
  const wrongChars = keyboard[lowerChar as keyof typeof keyboard];

  if (wrongChars && wrongChars.length > 0) {
    const randomWrong = wrongChars[Math.floor(Math.random() * wrongChars.length)];
    return correctChar === correctChar.toLowerCase() ? randomWrong : randomWrong.toUpperCase();
  }

  // 키보드 맵에 없으면 인접 문자 반환
  return String.fromCharCode(correctChar.charCodeAt(0) + (Math.random() > 0.5 ? 1 : -1));
}

/**
 * 입력 요소 찾기 및 자연스러운 입력 (편의 함수)
 * @param page Puppeteer 페이지
 * @param selector CSS 선택자
 * @param text 입력할 텍스트
 * @param options 입력 옵션
 */
export async function findAndTypeNaturally(
  page: Page,
  selector: string,
  text: string,
  options: NaturalInputOptions = {},
): Promise<boolean> {
  try {
    console.log(`[NaturalInput] 요소 찾기: ${selector}`);

    const element = await page.$(selector);
    if (!element) {
      console.log(`[NaturalInput] 요소를 찾을 수 없음: ${selector}`);
      return false;
    }

    await typeNaturally(page, element, text, options);
    return true;
  } catch (error) {
    console.error(`[NaturalInput] 입력 오류:`, error);
    return false;
  }
}

/**
 * 여러 선택자 중 하나를 찾아서 자연스러운 입력
 * @param page Puppeteer 페이지
 * @param selectors CSS 선택자 배열 (우선순위 순)
 * @param text 입력할 텍스트
 * @param options 입력 옵션
 */
export async function findAndTypeNaturallyMultiple(
  page: Page,
  selectors: string[],
  text: string,
  options: NaturalInputOptions = {},
): Promise<boolean> {
  for (const selector of selectors) {
    try {
      console.log(`[NaturalInput] 요소 찾기 시도: ${selector}`);

      const element = await page.$(selector);
      if (element) {
        console.log(`[NaturalInput] 요소 발견: ${selector}`);
        await typeNaturally(page, element, text, options);
        return true;
      }
    } catch (error) {
      console.log(`[NaturalInput] 선택자 실패: ${selector}`, error);
      continue;
    }
  }

  console.log(`[NaturalInput] 모든 선택자에서 요소를 찾을 수 없음:`, selectors);
  return false;
}

interface SearchSubmitOptions {
  /** 엔터키 사용 확률 (0-1) */
  enterKeyChance?: number;
  /** 검색 버튼 클릭 전 대기시간 (ms) */
  clickDelay?: number;
  /** 검색 후 결과 로딩 대기시간 (ms) */
  waitAfterSearch?: number;
}

/**
 * 자연스러운 검색 실행 (엔터키 또는 검색 버튼 클릭)
 * @param page Puppeteer 페이지
 * @param searchButtonSelectors 검색 버튼 선택자들
 * @param options 검색 실행 옵션
 */
export async function executeSearchNaturally(
  page: Page,
  searchButtonSelectors: string[] = [],
  options: SearchSubmitOptions = {},
): Promise<boolean> {
  const { enterKeyChance = 0.7, clickDelay = 500, waitAfterSearch = 2000 } = options;

  try {
    console.log('[NaturalSearch] 자연스러운 검색 실행 시작');

    // 엔터키 vs 버튼 클릭 확률적 선택
    if (shouldExecute(enterKeyChance)) {
      console.log('[NaturalSearch] 엔터키 방식 선택');

      // 자연스러운 엔터키 입력
      await new Promise((resolve) => setTimeout(resolve, getRandomDelay(200, 600)));
      await page.keyboard.press('Enter');
      console.log('[NaturalSearch] 엔터키 검색 실행 완료');
    } else if (searchButtonSelectors.length > 0) {
      console.log('[NaturalSearch] 버튼 클릭 방식 선택');

      // 검색 버튼 찾기 및 클릭
      let buttonClicked = false;
      for (const selector of searchButtonSelectors) {
        try {
          const button = await page.$(selector);
          if (button) {
            console.log(`[NaturalSearch] 검색 버튼 발견: ${selector}`);

            // 버튼 클릭 전 자연스러운 대기
            await new Promise((resolve) => setTimeout(resolve, getRandomDelay(clickDelay, clickDelay + 500)));

            // 자연스러운 클릭 시뮬레이션
            await button.click();
            console.log('[NaturalSearch] 검색 버튼 클릭 완료');
            buttonClicked = true;
            break;
          }
        } catch (error) {
          console.log(`[NaturalSearch] 버튼 클릭 실패: ${selector}`, error);
          continue;
        }
      }

      // 버튼을 찾지 못했으면 엔터키로 대체
      if (!buttonClicked) {
        console.log('[NaturalSearch] 검색 버튼을 찾지 못함, 엔터키로 대체');
        await page.keyboard.press('Enter');
      }
    } else {
      console.log('[NaturalSearch] 검색 버튼 선택자가 없음, 엔터키 사용');
      await page.keyboard.press('Enter');
    }

    // 검색 결과 로딩 대기
    if (waitAfterSearch > 0) {
      console.log(`[NaturalSearch] 검색 결과 로딩 대기: ${waitAfterSearch}ms`);
      await new Promise((resolve) => setTimeout(resolve, waitAfterSearch));
    }

    console.log('[NaturalSearch] 자연스러운 검색 실행 완료');
    return true;
  } catch (error) {
    console.error('[NaturalSearch] 검색 실행 오류:', error);
    return false;
  }
}

/**
 * 네이버 메인 페이지 전용 검색 실행
 * @param page Puppeteer 페이지
 * @param options 검색 실행 옵션
 */
export async function executeNaverMainSearch(page: Page, options: SearchSubmitOptions = {}): Promise<boolean> {
  const naverSearchButtonSelectors = [
    'button.bt_search', // 네이버 메인 페이지 정확한 검색 버튼
    '#nx_search_form button[type="submit"]', // 네이버 검색 폼의 submit 버튼
    'button.btn_search',
    '.search_btn',
    '#search_btn',
    '.ico_search_submit',
    'button.search-btn',
  ];

  return executeSearchNaturally(page, naverSearchButtonSelectors, {
    enterKeyChance: 0.85, // 네이버에서는 엔터키를 훨씬 더 자주 사용 (잘못된 버튼 클릭 방지)
    clickDelay: 400,
    waitAfterSearch: 3000, // 네이버 검색 결과는 조금 더 기다림
    ...options,
  });
}

/**
 * 쇼핑 탭 전용 검색 실행
 * @param page Puppeteer 페이지
 * @param options 검색 실행 옵션
 */
export async function executeShoppingTabSearch(page: Page, options: SearchSubmitOptions = {}): Promise<boolean> {
  const shoppingSearchButtonSelectors = [
    'form[name="search"] button[type="button"]:last-of-type', // 가격비교 페이지 검색 버튼 (확인됨)
    'button[type="submit"]',
    '.search_btn',
    'button.btn_search',
    '.btn_search',
    '#search-btn',
    'button.search-button',
  ];

  return executeSearchNaturally(page, shoppingSearchButtonSelectors, {
    enterKeyChance: 0.75, // 쇼핑 탭에서는 엔터키를 더 자주 사용
    clickDelay: 300,
    waitAfterSearch: 2500,
    ...options,
  });
}
