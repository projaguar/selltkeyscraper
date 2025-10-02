import React, { useState, useEffect } from 'react';
import { Button } from '@renderer/components/ui/button';
import { Input } from '@renderer/components/ui/input';
import { Label } from '@renderer/components/ui/label';
import { Checkbox } from '@renderer/components/ui/checkbox';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@renderer/components/ui/tabs';
import { useAuth } from '../contexts/AuthContext';
import { KeywordHelper } from './KeywordHelper';

const MainPage: React.FC = () => {
  const { logout, userInfo } = useAuth();
  const [activeTab, setActiveTab] = useState('collection');
  const [isCollecting, setIsCollecting] = useState(false);
  const [isKeywordHelperOpen, setIsKeywordHelperOpen] = useState(false);
  const [isNaverLoggedIn, setIsNaverLoggedIn] = useState(false);
  const [isCheckingNaverLogin, setIsCheckingNaverLogin] = useState(true);

  // 소싱 관련 상태
  const [isSourcing, setIsSourcing] = useState(false);
  const [sourcingConfig, setSourcingConfig] = useState({
    minAmount: '0',
    maxAmount: '99999999',
    keywords: '',
    includeNaver: true,
    includeAuction: false,
    includeBest: true,
    includeNew: false,
  });
  const [progress, setProgress] = useState<{
    isRunning: boolean;
    usernum: string | null;
    current: number;
    total: number;
    currentStore: string;
    status: string;
    waitTime?: number;
    progress: string;
  }>({
    isRunning: false,
    usernum: null,
    current: 0,
    total: 0,
    currentStore: '',
    status: '대기 중',
    waitTime: undefined,
    progress: '대기 중',
  });

  // 네이버 로그인 상태 체크
  useEffect(() => {
    let isInitialCheck = true;
    let isProcessing = false; // 중복 처리 방지
    let hasOpenedLoginPage = false; // 로그인 페이지 열기 중복 방지

    const checkNaverLogin = async (): Promise<void> => {
      if (isProcessing) {
        console.log('[MainPage] 이미 처리 중이므로 건너뜀');
        return;
      }

      try {
        isProcessing = true;

        if (isInitialCheck) {
          setIsCheckingNaverLogin(true);
        }

        const isLoggedIn = await window.api.checkNaverLoginStatus();
        setIsNaverLoggedIn(isLoggedIn);

        if (!isLoggedIn && isInitialCheck && !hasOpenedLoginPage) {
          // 네이버 로그인 페이지 열기 (초기 체크에서만, 한 번만)
          console.log('[MainPage] 로그인되지 않음. 네이버 로그인 페이지를 엽니다...');
          hasOpenedLoginPage = true;
          await window.api.openNaverLoginPage();
        } else if (isLoggedIn) {
          console.log('[MainPage] 이미 로그인되어 있습니다.');
        }
      } catch (error) {
        console.error('네이버 로그인 상태 확인 오류:', error);
      } finally {
        if (isInitialCheck) {
          setIsCheckingNaverLogin(false);
          isInitialCheck = false;
        }
        isProcessing = false;
      }
    };

    checkNaverLogin();
  }, []);

  // 네이버 로그인 상태 주기적 체크
  useEffect(() => {
    if (isNaverLoggedIn) return;

    const interval = setInterval(async () => {
      try {
        const isLoggedIn = await window.api.checkNaverLoginStatus();
        if (isLoggedIn) {
          setIsNaverLoggedIn(true);
          clearInterval(interval);
        }
      } catch (error) {
        console.error('네이버 로그인 상태 체크 오류:', error);
      }
    }, 5000); // 5초마다 체크 (빈도 줄임)

    return () => clearInterval(interval);
  }, [isNaverLoggedIn]);

  // 수집 진행상황 실시간 업데이트
  useEffect(() => {
    console.log('진행상황 useEffect 실행, isCollecting:', isCollecting);
    if (!isCollecting) return;

    const interval = setInterval(async () => {
      try {
        const progressData = await window.api.getCollectionProgress();
        console.log('진행상황 데이터 받음:', progressData);
        setProgress(progressData);
      } catch (error) {
        console.error('진행상황 업데이트 오류:', error);
      }
    }, 500); // 0.5초마다 업데이트

    return () => clearInterval(interval);
  }, [isCollecting]);

  // 소싱 시작/중지 핸들러
  const handleSourcingToggle = async (): Promise<void> => {
    try {
      if (isSourcing) {
        // 소싱 중지
        console.log('소싱 중지 요청');
        const result = await window.api.stopSourcing();
        if (result.success) {
          setIsSourcing(false);
          console.log('소싱 중지 성공:', result.message);
        } else {
          alert(`소싱 중지 실패: ${result.message}`);
        }
      } else {
        // 소싱 시작
        console.log('소싱 시작 요청:', sourcingConfig);

        // 설정 유효성 검사
        if (!sourcingConfig.keywords.trim()) {
          alert('키워드를 입력해주세요.');
          return;
        }
        if (!sourcingConfig.minAmount || !sourcingConfig.maxAmount) {
          alert('최저/최고 금액을 입력해주세요.');
          return;
        }
        if (!sourcingConfig.includeNaver && !sourcingConfig.includeAuction) {
          alert('최소 하나의 플랫폼을 선택해주세요.');
          return;
        }

        // UI 상태를 즉시 업데이트
        setIsSourcing(true);

        // usernum을 포함한 설정 전달
        const sourcingConfigWithUser = {
          ...sourcingConfig,
          usernum: userInfo?.usernum || '',
        };

        const result = await window.api.startSourcing(sourcingConfigWithUser);
        console.log('소싱 시작 결과:', result);

        if (result.success) {
          console.log('소싱 시작 성공:', result.message);
        } else {
          // 실패 시 상태 되돌리기
          setIsSourcing(false);
          alert(`소싱 시작 실패: ${result.message}`);
        }
      }
    } catch (error) {
      console.error('소싱 작업 처리 오류:', error);
      setIsSourcing(false);
      alert('소싱 작업 처리 중 오류가 발생했습니다.');
    }
  };

  const handleCollectionToggle = async (): Promise<void> => {
    // 1. 유저번호 확인
    if (!userInfo?.usernum) {
      alert('유저번호가 없습니다. 다시 로그인해주세요.');
      return;
    }

    try {
      if (isCollecting) {
        // 2.2 진행 상태라면 작업중지 요청
        console.log('작업중지 요청:', userInfo.usernum);
        const result = await window.api.stopCollection();
        if (result.success) {
          setIsCollecting(false);
          // 진행상황 초기화
          setProgress({
            isRunning: false,
            usernum: null,
            current: 0,
            total: 0,
            currentStore: '',
            status: '대기 중',
            waitTime: undefined,
            progress: '대기 중',
          });
          console.log('수집 중지 성공:', result.message);
        } else {
          alert(`수집 중지 실패: ${result.message}`);
        }
      } else {
        // 2.1 정지 상태라면 수집시작 요청
        console.log('수집시작 요청:', userInfo.usernum);

        // 먼저 UI 상태를 즉시 업데이트
        setIsCollecting(true);
        setProgress({
          isRunning: true,
          usernum: userInfo.usernum,
          current: 0,
          total: 0,
          currentStore: '',
          status: '수집 시작 중...',
          waitTime: undefined,
          progress: '수집 시작 중...',
        });

        const result = await window.api.startCollection(userInfo.usernum);
        console.log('수집 시작 결과:', result);
        if (result.success) {
          console.log('수집 시작 성공:', result.message);
          console.log('isCollecting 상태:', true);
        } else {
          // 실패 시 상태 되돌리기
          setIsCollecting(false);
          setProgress({
            isRunning: false,
            usernum: null,
            current: 0,
            total: 0,
            currentStore: '',
            status: '대기 중',
            waitTime: undefined,
            progress: '대기 중',
          });
          alert(`수집 시작 실패: ${result.message}`);
        }
      }
    } catch (error) {
      console.error('수집 작업 처리 오류:', error);
      alert('작업 처리 중 오류가 발생했습니다.');
    }
  };

  const handleKeywordHelperOpen = () => {
    setIsKeywordHelperOpen(true);
  };

  const handleKeywordHelperClose = () => {
    setIsKeywordHelperOpen(false);
  };

  const handleSelectKeywords = (selectedKeywords: string[]) => {
    const keywordString = selectedKeywords.join(', ');
    setSourcingConfig((prev) => ({ ...prev, keywords: keywordString }));
  };

  // 네이버 로그인 대기 화면
  if (isCheckingNaverLogin || !isNaverLoggedIn) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 flex items-center justify-center p-4 relative overflow-hidden">
        {/* 배경 장식 요소들 */}
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute -top-40 -right-40 w-80 h-80 bg-blue-200/30 rounded-full blur-3xl"></div>
          <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-indigo-200/30 rounded-full blur-3xl"></div>
          <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-purple-100/20 rounded-full blur-3xl"></div>
        </div>

        <div className="w-full max-w-md text-center space-y-8 relative z-10">
          {/* 로딩 스피너 */}
          <div className="flex justify-center">
            <div className="relative">
              <div className="inline-block animate-spin rounded-full h-20 w-20 border-4 border-blue-200 border-t-blue-600"></div>
              <div className="absolute inset-0 flex items-center justify-center">
                <svg className="w-8 h-8 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
            </div>
          </div>

          {/* 메시지 */}
          <div className="space-y-6">
            <div className="flex items-center justify-center gap-3">
              <div className="inline-flex items-center justify-center w-12 h-12 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-2xl shadow-lg">
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <h1 className="text-3xl font-bold bg-gradient-to-r from-gray-900 to-gray-700 bg-clip-text text-transparent">
                Selltkey Scraper
              </h1>
            </div>

            <div className="bg-white/70 backdrop-blur-xl rounded-3xl shadow-xl border border-white/20 p-8">
              <h2 className="text-xl font-semibold text-gray-900 mb-3">
                {isCheckingNaverLogin ? '네이버 로그인 상태를 확인하고 있습니다...' : '네이버 로그인이 필요합니다'}
              </h2>
              <p className="text-gray-600 mb-6">
                {isCheckingNaverLogin ? '잠시만 기다려주세요.' : 'Puppeteer 브라우저에서 네이버에 로그인해주세요.'}
              </p>

              {!isCheckingNaverLogin && (
                <div className="space-y-4">
                  <div className="bg-blue-50/80 border border-blue-200/50 rounded-xl p-4 backdrop-blur-sm">
                    <div className="flex items-center gap-2 text-blue-800 text-sm">
                      <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                        />
                      </svg>
                      브라우저가 자동으로 열렸습니다. 네이버에 로그인하면 자동으로 메인 화면으로 이동합니다.
                    </div>
                  </div>
                  <Button
                    onClick={logout}
                    variant="outline"
                    className="text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200 rounded-xl px-6 py-2 transition-all duration-200"
                  >
                    <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
                      />
                    </svg>
                    로그아웃
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-indigo-50/50 p-6 relative overflow-hidden">
      {/* 배경 장식 요소들 */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-20 right-20 w-64 h-64 bg-blue-200/20 rounded-full blur-3xl"></div>
        <div className="absolute bottom-20 left-20 w-80 h-80 bg-indigo-200/20 rounded-full blur-3xl"></div>
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-purple-100/10 rounded-full blur-3xl"></div>
      </div>

      <div className="max-w-6xl mx-auto relative z-10">
        {/* 헤더 */}
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Selltkey Scraper</h1>
            <p className="text-sm text-gray-600">스마트한 상품 수집 도구</p>
          </div>
          <Button
            variant="outline"
            onClick={logout}
            className="text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200 rounded-xl px-6 py-2 transition-all duration-200"
          >
            로그아웃
          </Button>
        </div>

        {/* 탭 영역 */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-2 bg-gray-100/50 rounded-lg p-1">
            <TabsTrigger
              value="collection"
              className="rounded-md data-[state=active]:bg-white data-[state=active]:text-gray-900 data-[state=active]:shadow-sm transition-all duration-200 text-gray-600"
            >
              상품수집
            </TabsTrigger>
            <TabsTrigger
              value="sourcing"
              className="rounded-md data-[state=active]:bg-white data-[state=active]:text-gray-900 data-[state=active]:shadow-sm transition-all duration-200 text-gray-600"
            >
              벤치마킹 소싱
            </TabsTrigger>
          </TabsList>

          {/* 상품수집 탭 */}
          <TabsContent value="collection" className="mt-8">
            <div className="bg-white/70 backdrop-blur-xl rounded-3xl shadow-xl border border-white/20 p-8">
              <div className="mb-8">
                <div>
                  <h2 className="text-2xl font-bold text-gray-900 mb-2">상품수집</h2>
                  <p className="text-gray-600 text-sm">스마트한 상품 정보 수집 및 관리</p>
                </div>
              </div>

              <div className="space-y-8">
                <div className="flex justify-center">
                  <Button
                    onClick={handleCollectionToggle}
                    className={`h-14 text-lg px-12 rounded-2xl font-semibold transition-all duration-200 transform hover:-translate-y-0.5 ${
                      isCollecting
                        ? 'bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white shadow-lg hover:shadow-xl'
                        : 'bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 text-white shadow-lg hover:shadow-xl'
                    }`}
                  >
                    {isCollecting ? '수집 종료' : '수집 실행'}
                  </Button>
                </div>

                <div className="bg-gradient-to-br from-gray-50/80 to-blue-50/50 backdrop-blur-sm border border-white/40 rounded-2xl p-8 min-h-[400px] shadow-lg">
                  <div className="mb-6">
                    <h3 className="text-xl font-bold text-gray-900">진행상황</h3>
                  </div>
                  <div className="space-y-4">
                    {isCollecting ? (
                      <div className="space-y-4">
                        {/* 진행률 바 */}
                        {progress.total > 0 && (
                          <div className="space-y-2">
                            <div className="flex justify-between text-sm text-gray-600">
                              <span>진행률</span>
                              <span>
                                {progress.current}/{progress.total}
                              </span>
                            </div>
                            <div className="w-full bg-gray-200 rounded-full h-2">
                              <div
                                className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                                style={{ width: `${(progress.current / progress.total) * 100}%` }}
                              ></div>
                            </div>
                          </div>
                        )}

                        {/* 현재 처리 중인 상점 */}
                        {progress.currentStore && (
                          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                            <div className="flex items-center space-x-2">
                              <div className="inline-block animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
                              <span className="text-blue-800 font-medium">진행: {progress.currentStore}</span>
                            </div>
                          </div>
                        )}

                        {/* 상태 메시지 */}
                        <div className="w-full">
                          {/* 대기 중이 아닐 때는 파란색 상태 텍스트만 표시 */}
                          {!progress.waitTime || progress.waitTime <= 0 ? (
                            <div className="text-center">
                              <p className="text-blue-600 font-medium">{progress.status}</p>
                            </div>
                          ) : (
                            /* 대기 중일 때는 한 줄 전체를 사용 */
                            <div className="w-full flex items-center gap-4">
                              <div className="flex items-center gap-2">
                                <div className="w-2 h-2 bg-amber-500 rounded-full animate-pulse"></div>
                                <span className="text-amber-800 font-medium text-sm">대기 중</span>
                              </div>
                              <div className="flex-1 bg-amber-200 rounded-full h-2">
                                <div
                                  className="bg-amber-500 h-2 rounded-full transition-all duration-1000"
                                  style={{ width: `${((progress.waitTime || 0) / 15) * 100}%` }}
                                ></div>
                              </div>
                              <div className="text-amber-600 text-sm font-medium">{progress.waitTime}초</div>
                            </div>
                          )}
                        </div>

                        {/* 디버깅 정보 */}
                        {process.env.NODE_ENV === 'development' && (
                          <div className="bg-gray-100 border rounded-lg p-3 text-xs">
                            <p>
                              <strong>디버깅 정보:</strong>
                            </p>
                            <p>isCollecting: {isCollecting.toString()}</p>
                            <p>progress.current: {progress.current}</p>
                            <p>progress.total: {progress.total}</p>
                            <p>progress.status: {progress.status}</p>
                            <p>progress.currentStore: {progress.currentStore}</p>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="text-center text-gray-500 py-8">
                        <p>수집 작업이 시작되면 진행상황이 여기에 표시됩니다</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </TabsContent>

          {/* 벤치마킹 소싱 탭 */}
          <TabsContent value="sourcing" className="mt-8">
            <div className="bg-white/70 backdrop-blur-xl rounded-3xl shadow-xl border border-white/20 p-8">
              <div className="mb-8">
                <div>
                  <h2 className="text-2xl font-bold text-gray-900 mb-2">벤치마킹 소싱</h2>
                  <p className="text-gray-600 text-sm">경쟁사 상품 분석 및 스마트 소싱</p>
                </div>
              </div>

              <div className="space-y-8">
                {/* 금액 설정 */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-3">
                    <Label htmlFor="minAmount" className="text-sm font-medium text-gray-700">
                      최저금액
                    </Label>
                    <Input
                      id="minAmount"
                      type="text"
                      placeholder="최저금액을 입력하세요"
                      className="h-12 rounded-xl border-gray-200 focus:border-indigo-400 focus:ring-indigo-400/20 bg-white/50 transition-all duration-200"
                      value={sourcingConfig.minAmount}
                      onChange={(e) => setSourcingConfig((prev) => ({ ...prev, minAmount: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-3">
                    <Label htmlFor="maxAmount" className="text-sm font-medium text-gray-700">
                      최고금액
                    </Label>
                    <Input
                      id="maxAmount"
                      type="text"
                      placeholder="최고금액을 입력하세요"
                      className="h-12 rounded-xl border-gray-200 focus:border-indigo-400 focus:ring-indigo-400/20 bg-white/50 transition-all duration-200"
                      value={sourcingConfig.maxAmount}
                      onChange={(e) => setSourcingConfig((prev) => ({ ...prev, maxAmount: e.target.value }))}
                    />
                  </div>
                </div>

                {/* 키워드 */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="keywords" className="text-sm font-medium text-gray-700">
                      키워드
                    </Label>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="text-xs px-3 py-1 h-7 border-gray-300 text-gray-600 hover:bg-gray-50"
                      onClick={handleKeywordHelperOpen}
                    >
                      키워드 도우미
                    </Button>
                  </div>
                  <textarea
                    id="keywords"
                    value={sourcingConfig.keywords}
                    onChange={(e) => setSourcingConfig((prev) => ({ ...prev, keywords: e.target.value }))}
                    placeholder="키워드를 입력하세요 (콤마로 구분하여 여러 개 입력 가능)"
                    rows={4}
                    className="w-full rounded-xl border border-gray-200 focus:border-indigo-400 focus:ring-indigo-400/20 bg-white/50 transition-all duration-200 p-3 text-sm resize-none"
                  />
                </div>

                {/* 옵션 체크박스 */}
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                    <svg className="w-5 h-5 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                      />
                    </svg>
                    포함 옵션
                  </h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="flex items-center space-x-3 p-3 bg-white/50 rounded-xl border border-gray-200 hover:bg-white/70 transition-all duration-200">
                      <Checkbox
                        id="includeNaver"
                        className="border-gray-300 rounded-md"
                        checked={sourcingConfig.includeNaver}
                        onCheckedChange={(checked) =>
                          setSourcingConfig((prev) => ({ ...prev, includeNaver: !!checked }))
                        }
                      />
                      <Label htmlFor="includeNaver" className="text-sm font-medium text-gray-700 cursor-pointer">
                        네이버 포함
                      </Label>
                    </div>
                    <div className="flex items-center space-x-3 p-3 bg-white/50 rounded-xl border border-gray-200 hover:bg-white/70 transition-all duration-200">
                      <Checkbox
                        id="includeAuction"
                        className="border-gray-300 rounded-md"
                        checked={sourcingConfig.includeAuction}
                        onCheckedChange={(checked) =>
                          setSourcingConfig((prev) => ({ ...prev, includeAuction: !!checked }))
                        }
                      />
                      <Label htmlFor="includeAuction" className="text-sm font-medium text-gray-700 cursor-pointer">
                        옥션 포함
                      </Label>
                    </div>
                    <div className="flex items-center space-x-3 p-3 bg-white/50 rounded-xl border border-gray-200 hover:bg-white/70 transition-all duration-200">
                      <Checkbox
                        id="includeBest"
                        className="border-gray-300 rounded-md"
                        checked={sourcingConfig.includeBest}
                        onCheckedChange={(checked) =>
                          setSourcingConfig((prev) => ({ ...prev, includeBest: !!checked }))
                        }
                      />
                      <Label htmlFor="includeBest" className="text-sm font-medium text-gray-700 cursor-pointer">
                        베스트 상품 포함
                      </Label>
                    </div>
                    <div className="flex items-center space-x-3 p-3 bg-white/50 rounded-xl border border-gray-200 hover:bg-white/70 transition-all duration-200">
                      <Checkbox
                        id="includeNew"
                        className="border-gray-300 rounded-md"
                        checked={sourcingConfig.includeNew}
                        onCheckedChange={(checked) => setSourcingConfig((prev) => ({ ...prev, includeNew: !!checked }))}
                      />
                      <Label htmlFor="includeNew" className="text-sm font-medium text-gray-700 cursor-pointer">
                        신상품 포함
                      </Label>
                    </div>
                  </div>
                </div>

                <Button
                  onClick={handleSourcingToggle}
                  disabled={isSourcing}
                  className="w-full h-14 text-lg font-semibold bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white rounded-2xl transition-all duration-200 shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
                >
                  <div className="flex items-center gap-2">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                      />
                    </svg>
                    {isSourcing ? '소싱 중...' : '소싱 시작'}
                  </div>
                </Button>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>

      {/* 키워드 도우미 다이얼로그 */}
      <KeywordHelper
        isOpen={isKeywordHelperOpen}
        onClose={handleKeywordHelperClose}
        onSelectKeywords={handleSelectKeywords}
        userNum={userInfo?.usernum || ''}
      />
    </div>
  );
};

export default MainPage;
