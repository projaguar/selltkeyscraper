import React, { useState, useEffect, useRef } from 'react';
import { Button } from '@renderer/components/ui/button';
import { useAuth } from '../contexts/AuthContext';

const MainPage: React.FC = () => {
  const { logout, userInfo } = useAuth();
  const [isCollecting, setIsCollecting] = useState(false);
  const [isNaverLoggedIn, setIsNaverLoggedIn] = useState(false);
  const [isCheckingNaverLogin, setIsCheckingNaverLogin] = useState(true);
  const [isWaitingForCaptcha, setIsWaitingForCaptcha] = useState(false);
  const logContainerRef = useRef<HTMLDivElement>(null);

  const [progress, setProgress] = useState<{
    isRunning: boolean;
    usernum: string | null;
    current: number;
    total: number;
    currentStore: string;
    status: string;
    waitTime?: number;
    progress: string;
    logs: string[];
  }>({
    isRunning: false,
    usernum: null,
    current: 0,
    total: 0,
    currentStore: '',
    status: '대기 중',
    waitTime: undefined,
    progress: '대기 중',
    logs: [],
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
        setProgress({ ...progressData, logs: (progressData as any).logs || [] });

        // 수집이 완료되었거나 중지된 경우 상태 초기화
        if (!progressData.isRunning && isCollecting) {
          console.log('수집 완료/중지 감지, 상태 초기화');
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
            logs: [],
          });
        }
      } catch (error) {
        console.error('진행상황 업데이트 오류:', error);
      }
    }, 500); // 0.5초마다 업데이트

    return () => clearInterval(interval);
  }, [isCollecting]);

  // 로그 자동 스크롤 (수집)
  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [progress.logs]);

  // 캡챠 이벤트 수신
  useEffect(() => {
    const handleCaptchaDetected = () => {
      console.log('[MainPage] 캡챠 감지됨 - 대기 화면 표시');
      setIsWaitingForCaptcha(true);
    };

    const handleCaptchaResolved = () => {
      console.log('[MainPage] 캡챠 해결됨 - 대기 화면 숨김');
      setIsWaitingForCaptcha(false);
    };

    // Electron IPC 이벤트 리스너 등록
    if (window.electron && window.electron.ipcRenderer) {
      window.electron.ipcRenderer.on('captcha-detected', handleCaptchaDetected);
      window.electron.ipcRenderer.on('captcha-resolved', handleCaptchaResolved);
    }

    return () => {
      // 클린업
      if (window.electron && window.electron.ipcRenderer) {
        window.electron.ipcRenderer.removeAllListeners('captcha-detected');
        window.electron.ipcRenderer.removeAllListeners('captcha-resolved');
      }
    };
  }, []);

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
            logs: [],
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
          logs: [],
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
            logs: [],
          });
          alert(`수집 시작 실패: ${result.message}`);
        }
      }
    } catch (error) {
      console.error('수집 작업 처리 오류:', error);
      alert('작업 처리 중 오류가 발생했습니다.');
    }
  };

  console.log('isWaitingForCaptcha:', isWaitingForCaptcha);

  // 캡챠 대기 화면
  // if (isWaitingForCaptcha) {
  //   return (
  //     <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 flex items-center justify-center p-4 relative overflow-hidden">
  //       {/* 배경 장식 요소들 */}
  //       <div className="absolute inset-0 overflow-hidden">
  //         <div className="absolute -top-40 -right-40 w-80 h-80 bg-blue-200/30 rounded-full blur-3xl"></div>
  //         <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-indigo-200/30 rounded-full blur-3xl"></div>
  //         <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-purple-100/20 rounded-full blur-3xl"></div>
  //       </div>

  //       <div className="w-full max-w-md text-center space-y-8 relative z-10">
  //         {/* 로딩 스피너 */}
  //         <div className="flex justify-center">
  //           <div className="relative">
  //             <div className="inline-block animate-spin rounded-full h-20 w-20 border-4 border-blue-200 border-t-blue-600"></div>
  //             <div className="absolute inset-0 flex items-center justify-center">
  //               <svg className="w-8 h-8 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
  //                 <path
  //                   strokeLinecap="round"
  //                   strokeLinejoin="round"
  //                   strokeWidth={2}
  //                   d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
  //                 />
  //               </svg>
  //             </div>
  //           </div>
  //         </div>

  //         {/* 메시지 */}
  //         <div className="space-y-6">
  //           <div className="flex items-center justify-center gap-3">
  //             <div className="inline-flex items-center justify-center w-12 h-12 bg-gradient-to-br from-amber-500 to-orange-600 rounded-2xl shadow-lg">
  //               <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
  //                 <path
  //                   strokeLinecap="round"
  //                   strokeLinejoin="round"
  //                   strokeWidth={2}
  //                   d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
  //                 />
  //               </svg>
  //             </div>
  //             <h1 className="text-3xl font-bold bg-gradient-to-r from-gray-900 to-gray-700 bg-clip-text text-transparent">
  //               셀트키스크래퍼
  //             </h1>
  //           </div>

  //           <div className="bg-white/70 backdrop-blur-xl rounded-3xl shadow-xl border border-white/20 p-8">
  //             <h2 className="text-xl font-semibold text-gray-900 mb-3">캡챠 해결 대기 중...</h2>
  //             <p className="text-gray-600 mb-6">브라우저에서 캡챠를 해결해주세요.</p>

  //             <div className="space-y-4">
  //               <div className="bg-amber-50/80 border border-amber-200/50 rounded-xl p-4 backdrop-blur-sm">
  //                 <div className="flex items-center gap-2 text-amber-800 text-sm">
  //                   <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
  //                     <path
  //                       strokeLinecap="round"
  //                       strokeLinejoin="round"
  //                       strokeWidth={2}
  //                       d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
  //                     />
  //                   </svg>
  //                   브라우저에서 캡챠 화면이 표시되었습니다. 캡챠를 완료하면 자동으로 작업이 계속됩니다.
  //                 </div>
  //               </div>
  //             </div>
  //           </div>
  //         </div>
  //       </div>
  //     </div>
  //   );
  // }

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
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-indigo-50/50 p-3 relative overflow-hidden flex items-center justify-center">
      {/* 배경 장식 요소들 */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-20 right-20 w-64 h-64 bg-blue-200/20 rounded-full blur-3xl"></div>
        <div className="absolute bottom-20 left-20 w-80 h-80 bg-indigo-200/20 rounded-full blur-3xl"></div>
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-purple-100/10 rounded-full blur-3xl"></div>
      </div>

      <div className="max-w-6xl mx-auto relative z-10 w-full">
        {/* 헤더 */}
        <div className="flex justify-between items-center mb-6 px-8 pt-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">셀트키스크래퍼</h1>
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
        <div className="mb-6">
          {/* 상품수집 탭 */}

          <div className="bg-white/70 backdrop-blur-xl rounded-3xl shadow-xl border border-white/20 p-8">
            <div className="mb-8">
              <div>
                <h2 className="text-2xl font-bold text-gray-900 mb-2">상품수집</h2>
                <p className="text-gray-600 text-sm">스마트한 상품 정보 수집 및 관리</p>
              </div>
            </div>

            <div className="space-y-8">
              {/* 진행 상황 표시 (항상 표시) */}
              <div className="bg-gradient-to-br from-gray-50/80 to-blue-50/50 backdrop-blur-sm border border-white/40 rounded-2xl p-8 shadow-lg">
                <div className="mb-6">
                  <h3 className="text-xl font-bold text-gray-900">진행상황</h3>
                </div>
                <div className="space-y-4">
                  {/* 프로그래스바들 (한 줄에 1:1 배치) */}
                  <div className="grid grid-cols-2 gap-4">
                    {/* 진행률 바 */}
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm text-gray-600">
                        <span>진행률</span>
                        <span>{progress.total > 0 ? `${progress.current}/${progress.total}` : '0/0'}</span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-3">
                        <div
                          className="bg-blue-600 h-3 rounded-full transition-all duration-300"
                          style={{
                            width: `${progress.total > 0 ? (progress.current / progress.total) * 100 : 0}%`,
                          }}
                        ></div>
                      </div>
                    </div>

                    {/* 대기시간 프로그래스바 */}
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm text-gray-600">
                        <span>대기시간</span>
                        <span>{progress.waitTime && progress.waitTime > 0 ? `${progress.waitTime}초` : '0초'}</span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-3">
                        <div
                          className={`h-3 rounded-full transition-all duration-1000 ${progress.waitTime && progress.waitTime > 0 ? 'bg-amber-500' : 'bg-gray-300'}`}
                          style={{
                            width: `${progress.waitTime && progress.waitTime > 0 ? Math.min((progress.waitTime / 20) * 100, 100) : 0}%`,
                          }}
                        ></div>
                      </div>
                    </div>
                  </div>

                  {/* 현재 처리 중인 상점 */}

                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <div className="flex items-center space-x-2">
                      {progress.currentStore && (
                        <div className="inline-block animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
                      )}
                      <span className="text-blue-800 font-medium">진행: {progress.currentStore}</span>
                    </div>
                  </div>

                  {/* 상태 텍스트 */}
                  <div className="text-center">
                    <p className="text-blue-600 font-medium">{progress.status}</p>
                  </div>

                  {/* 로그 표시 영역 */}
                  <div
                    ref={logContainerRef}
                    className="bg-gray-900 rounded-lg p-4 h-[160px] overflow-y-auto font-mono text-xs"
                  >
                    {progress.logs && progress.logs.length > 0 ? (
                      <div className="space-y-1">
                        {progress.logs.map((log, index) => (
                          <div key={index} className="text-green-400 whitespace-pre-wrap break-words">
                            {log}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-gray-500 text-center py-8">
                        {isCollecting ? '로그 대기 중...' : '수집 작업이 시작되면 진행상황이 여기에 표시됩니다'}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* 버튼 영역 (수집 중지/시작 버튼) */}
              <div className="w-full">
                {isCollecting ? (
                  <Button
                    onClick={handleCollectionToggle}
                    className="w-full h-14 text-lg rounded-2xl font-semibold transition-all duration-200 transform hover:-translate-y-0.5 bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white shadow-lg hover:shadow-xl"
                  >
                    <div className="flex items-center justify-center gap-2">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                      수집 중지
                    </div>
                  </Button>
                ) : (
                  <Button
                    onClick={handleCollectionToggle}
                    className="w-full h-14 text-lg rounded-2xl font-semibold transition-all duration-200 transform hover:-translate-y-0.5 bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 text-white shadow-lg hover:shadow-xl"
                  >
                    수집 실행
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MainPage;
