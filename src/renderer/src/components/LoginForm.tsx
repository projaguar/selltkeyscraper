import React, { useState, useEffect } from 'react';
import { Button } from '@renderer/components/ui/button';
import { Input } from '@renderer/components/ui/input';
import { Label } from '@renderer/components/ui/label';
import { Checkbox } from '@renderer/components/ui/checkbox';
import { useAuth } from '../contexts/AuthContext';

const LoginForm: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState('');
  const { loginUser, loading } = useAuth();

  // 컴포넌트 마운트 시 저장된 인증 정보 로드
  useEffect(() => {
    const loadSavedCredentials = async (): Promise<void> => {
      try {
        const savedCredentials = await window.api.getSavedCredentials();
        if (savedCredentials) {
          setEmail(savedCredentials.email);
          setPassword(savedCredentials.password);
          setRememberMe(savedCredentials.rememberMe);
        }
      } catch (error) {
        console.error('저장된 인증 정보 로드 오류:', error);
      }
    };

    loadSavedCredentials();
  }, []);

  const handleSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    setError('');

    if (!email.trim() || !password.trim()) {
      setError('이메일과 비밀번호를 입력해주세요.');
      return;
    }

    const result = await loginUser(email, password);
    if (!result.success) {
      const errorMessage = result.message || '로그인에 실패했습니다. 이메일과 비밀번호를 확인해주세요.';
      setError(errorMessage);
    } else {
      // 로그인 성공 시 저장 설정에 따라 인증 정보 저장/삭제
      try {
        if (rememberMe) {
          await window.api.saveCredentials({
            email,
            password,
            rememberMe: true,
          });
        } else {
          await window.api.clearCredentials();
        }
      } catch (error) {
        console.error('인증 정보 저장/삭제 오류:', error);
      }
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 flex items-center justify-center p-4 relative overflow-hidden">
      {/* 배경 장식 요소들 */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-blue-200/30 rounded-full blur-3xl"></div>
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-indigo-200/30 rounded-full blur-3xl"></div>
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-purple-100/20 rounded-full blur-3xl"></div>
      </div>

      <div className="w-full max-w-md space-y-8 relative z-10">
        {/* 헤더 */}
        <div className="text-center space-y-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">
              Selltkey Scraper <span className="text-sm text-gray-500">V2</span>
            </h1>
            <p className="text-gray-600 text-sm">스마트한 상품 수집의 시작</p>
          </div>
        </div>

        {/* 로그인 폼 */}
        <div className="bg-white/70 backdrop-blur-xl rounded-3xl shadow-xl border border-white/20 p-8 space-y-6">
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="email" className="text-sm font-medium text-gray-700">
                이메일
              </Label>
              <Input
                id="email"
                type="email"
                placeholder="이메일을 입력하세요"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={loading}
                className="h-12 text-base border-gray-200 focus:border-blue-400 focus:ring-blue-400/20 bg-white/50 rounded-xl transition-all duration-200"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password" className="text-sm font-medium text-gray-700">
                비밀번호
              </Label>
              <Input
                id="password"
                type="password"
                placeholder="비밀번호를 입력하세요"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={loading}
                className="h-12 text-base border-gray-200 focus:border-blue-400 focus:ring-blue-400/20 bg-white/50 rounded-xl transition-all duration-200"
              />
            </div>

            <div className="flex items-center space-x-3">
              <Checkbox
                id="remember"
                checked={rememberMe}
                onCheckedChange={(checked) => setRememberMe(checked as boolean)}
                disabled={loading}
                className="border-gray-300 rounded-md"
              />
              <Label htmlFor="remember" className="text-sm text-gray-600 cursor-pointer">
                로그인 정보 저장
              </Label>
            </div>

            {error && (
              <div className="bg-red-50/80 border border-red-200/50 rounded-xl p-4 backdrop-blur-sm">
                <div className="text-red-600 text-sm text-center">{error}</div>
              </div>
            )}

            <Button
              type="submit"
              className="w-full h-12 text-base font-medium bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 text-white rounded-xl transition-all duration-200 shadow-lg hover:shadow-xl transform hover:-translate-y-0.5"
              disabled={loading}
            >
              {loading ? '로그인 중...' : '로그인'}
            </Button>
          </form>
        </div>

        {/* 푸터 */}
        <div className="text-center text-sm text-gray-500">
          <p>안전하고 편리한 로그인을 제공합니다</p>
          <p>v2.0.0</p>
        </div>
      </div>
    </div>
  );
};

export default LoginForm;
