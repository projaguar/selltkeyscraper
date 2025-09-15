import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

interface LoginResponse {
  result: boolean;
  usernum: string;
  msg: string;
}

interface AuthContextType {
  isAuthenticated: boolean;
  userInfo: LoginResponse | null;
  loginUser: (email: string, password: string) => Promise<{ success: boolean; message?: string }>;
  logout: () => void;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [userInfo, setUserInfo] = useState<LoginResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // 앱 시작 시 저장된 로그인 정보 확인
    const savedAuth = localStorage.getItem('selltkey_auth');
    if (savedAuth) {
      try {
        const authData = JSON.parse(savedAuth);
        setUserInfo(authData);
        setIsAuthenticated(true);
      } catch (error) {
        console.error('저장된 인증 정보 파싱 오류:', error);
        localStorage.removeItem('selltkey_auth');
      }
    }
    setLoading(false);
  }, []);

  const loginUser = async (email: string, password: string): Promise<{ success: boolean; message?: string }> => {
    try {
      setLoading(true);
      const response = await window.api.login(email, password);

      if (response.result === true) {
        setUserInfo(response);
        setIsAuthenticated(true);
        localStorage.setItem('selltkey_auth', JSON.stringify(response));
        return { success: true };
      } else {
        const errorMessage =
          response.msg && response.msg.trim() ? response.msg : '아이디와 비밀번호를 다시 확인해주세요.';
        return { success: false, message: errorMessage };
      }
    } catch (error) {
      console.error('로그인 오류:', error);
      return { success: false, message: '네트워크 오류가 발생했습니다.' };
    } finally {
      setLoading(false);
    }
  };

  const logout = () => {
    setIsAuthenticated(false);
    setUserInfo(null);
    localStorage.removeItem('selltkey_auth');
  };

  const value: AuthContextType = {
    isAuthenticated,
    userInfo,
    loginUser,
    logout,
    loading,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
