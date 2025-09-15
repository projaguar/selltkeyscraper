import React, { useState, useEffect } from 'react';
import { Button } from '@renderer/components/ui/button';
import { Input } from '@renderer/components/ui/input';
import { Label } from '@renderer/components/ui/label';
import { Checkbox } from '@renderer/components/ui/checkbox';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@renderer/components/ui/tabs';
import { useAuth } from '../contexts/AuthContext';

const MainPage: React.FC = () => {
  const { logout, userInfo } = useAuth();
  const [activeTab, setActiveTab] = useState('collection');
  const [isCollecting, setIsCollecting] = useState(false);
  const [isNaverLoggedIn, setIsNaverLoggedIn] = useState(false);
  const [isCheckingNaverLogin, setIsCheckingNaverLogin] = useState(true);
  const [progress, setProgress] = useState({
    current: 0,
    total: 0,
    currentStore: '',
    status: '대기 중',
    waitTime: undefined as number | undefined,
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
            current: 0,
            total: 0,
            currentStore: '',
            status: '대기 중',
            waitTime: undefined,
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
          current: 0,
          total: 0,
          currentStore: '',
          status: '수집 시작 중...',
          waitTime: undefined,
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
            current: 0,
            total: 0,
            currentStore: '',
            status: '대기 중',
            waitTime: undefined,
          });
          alert(`수집 시작 실패: ${result.message}`);
        }
      }
    } catch (error) {
      console.error('수집 작업 처리 오류:', error);
      alert('작업 처리 중 오류가 발생했습니다.');
    }
  };

  // 네이버 로그인 대기 화면
  if (isCheckingNaverLogin || !isNaverLoggedIn) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
        <div className="w-full max-w-md text-center space-y-8">
          {/* 로딩 스피너 */}
          <div className="flex justify-center">
            <div className="inline-block animate-spin rounded-full h-16 w-16 border-b-2 border-blue-600"></div>
          </div>

          {/* 메시지 */}
          <div className="space-y-4">
            <h1 className="text-3xl font-bold text-gray-900">Selltkey Scraper</h1>
            <div className="bg-white/80 backdrop-blur-sm rounded-lg p-6 shadow-lg">
              <h2 className="text-xl font-semibold text-gray-900 mb-2">
                {isCheckingNaverLogin ? '네이버 로그인 상태를 확인하고 있습니다...' : '네이버 로그인이 필요합니다'}
              </h2>
              <p className="text-gray-600 mb-4">
                {isCheckingNaverLogin ? '잠시만 기다려주세요.' : 'Puppeteer 브라우저에서 네이버에 로그인해주세요.'}
              </p>

              {!isCheckingNaverLogin && (
                <div className="space-y-3">
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                    <p className="text-blue-800 text-sm">
                      💡 브라우저가 자동으로 열렸습니다. 네이버에 로그인하면 자동으로 메인 화면으로 이동합니다.
                    </p>
                  </div>
                  <Button onClick={logout} variant="outline" className="text-red-600 hover:text-red-700">
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
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-4xl mx-auto">
        {/* 헤더 */}
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Selltkey Scraper</h1>
          <Button variant="outline" onClick={logout} className="text-red-600 hover:text-red-700">
            로그아웃
          </Button>
        </div>

        {/* 탭 영역 */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="collection">상품수집</TabsTrigger>
            <TabsTrigger value="sourcing">벤치마킹 소싱</TabsTrigger>
          </TabsList>

          {/* 상품수집 탭 */}
          <TabsContent value="collection" className="mt-6">
            <div className="bg-white rounded-lg shadow-sm border p-6">
              <div className="mb-6">
                <h2 className="text-xl font-semibold text-gray-900 mb-2">상품수집</h2>
                <p className="text-gray-600">상품 정보를 수집하고 관리합니다</p>
              </div>

              <div className="space-y-6">
                <div className="flex justify-center">
                  <Button
                    onClick={handleCollectionToggle}
                    className={`h-12 text-base px-8 ${
                      isCollecting
                        ? 'bg-red-600 hover:bg-red-700 text-white'
                        : 'bg-blue-600 hover:bg-blue-700 text-white'
                    }`}
                  >
                    {isCollecting ? '수집 종료' : '수집 실행'}
                  </Button>
                </div>

                <div className="bg-gray-50 border rounded-lg p-6 min-h-[300px]">
                  <h3 className="text-lg font-medium text-gray-900 mb-4">진행상황</h3>
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
                        <div className="text-center">
                          {/* 대기 중이 아닐 때만 파란색 상태 텍스트 표시 */}
                          {(!progress.waitTime || progress.waitTime <= 0) && (
                            <p className="text-blue-600 font-medium mb-2">{progress.status}</p>
                          )}

                          {/* 대기시간 카운트다운 */}
                          {progress.waitTime && progress.waitTime > 0 && (
                            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                              <p className="text-yellow-800 text-sm">다음 상품까지 대기 중... {progress.waitTime}초</p>
                              <div className="w-full bg-yellow-200 rounded-full h-1 mt-2">
                                <div
                                  className="bg-yellow-500 h-1 rounded-full transition-all duration-1000"
                                  style={{ width: `${((progress.waitTime || 0) / 15) * 100}%` }}
                                ></div>
                              </div>
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
          <TabsContent value="sourcing" className="mt-6">
            <div className="bg-white rounded-lg shadow-sm border p-6">
              <div className="mb-6">
                <h2 className="text-xl font-semibold text-gray-900 mb-2">벤치마킹 소싱</h2>
                <p className="text-gray-600">경쟁사 상품을 분석하고 소싱합니다</p>
              </div>

              <div className="space-y-6">
                {/* 금액 설정 */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="minAmount" className="text-sm font-medium">
                      최저금액
                    </Label>
                    <Input id="minAmount" type="text" placeholder="최저금액을 입력하세요" className="h-12" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="maxAmount" className="text-sm font-medium">
                      최고금액
                    </Label>
                    <Input id="maxAmount" type="text" placeholder="최고금액을 입력하세요" className="h-12" />
                  </div>
                </div>

                {/* 키워드 */}
                <div className="space-y-2">
                  <Label htmlFor="keywords" className="text-sm font-medium">
                    키워드
                  </Label>
                  <Input id="keywords" type="text" placeholder="키워드를 입력하세요" className="h-12" />
                </div>

                {/* 옵션 체크박스 */}
                <div className="space-y-3">
                  <h3 className="text-sm font-medium text-gray-900">포함 옵션</h3>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="flex items-center space-x-2">
                      <Checkbox id="includeNaver" />
                      <Label htmlFor="includeNaver" className="text-sm">
                        네이버 포함
                      </Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Checkbox id="includeAuction" />
                      <Label htmlFor="includeAuction" className="text-sm">
                        옥션 포함
                      </Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Checkbox id="includeBest" />
                      <Label htmlFor="includeBest" className="text-sm">
                        베스트 상품 포함
                      </Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Checkbox id="includeNew" />
                      <Label htmlFor="includeNew" className="text-sm">
                        신상품 포함
                      </Label>
                    </div>
                  </div>
                </div>

                <Button className="w-full h-12 text-base">소싱 시작</Button>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default MainPage;
