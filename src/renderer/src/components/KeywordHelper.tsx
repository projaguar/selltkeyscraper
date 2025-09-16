import React, { useState, useEffect, useCallback } from 'react';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog';
import { Loader2 } from 'lucide-react';

interface KeywordHelperProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectKeywords: (keywords: string[]) => void;
  userNum: string;
}

interface KeywordData {
  id: string;
  text: string;
  checked: boolean;
}

export const KeywordHelper: React.FC<KeywordHelperProps> = ({ isOpen, onClose, onSelectKeywords, userNum }) => {
  const [keywords, setKeywords] = useState<KeywordData[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 키워드 목록 가져오기
  const fetchKeywords = useCallback(async () => {
    console.log('fetchKeywords 호출됨, userNum:', userNum);
    if (!userNum) {
      console.log('userNum이 없어서 키워드 가져오기 중단');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      console.log('키워드 API 호출 시작...');
      const response = await window.api.fetchKeywords(userNum);
      console.log('키워드 API 응답:', response);

      if (response.result) {
        const keywordList = response.payload.map((keyword: string, index: number) => ({
          id: `keyword-${index}`,
          text: keyword.trim(),
          checked: false,
        }));
        console.log('처리된 키워드 목록:', keywordList);
        setKeywords(keywordList);
      } else {
        console.log('키워드 API 실패:', response.message);
        setError(response.message || '키워드를 불러올 수 없습니다.');
      }
    } catch (err) {
      console.error('키워드 가져오기 오류:', err);
      setError('키워드 로딩 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  }, [userNum]);

  // 팝업이 열릴 때 키워드 가져오기
  useEffect(() => {
    if (isOpen && userNum) {
      fetchKeywords();
    }
  }, [isOpen, userNum, fetchKeywords]);

  // 키워드 선택/해제
  const toggleKeyword = (id: string) => {
    setKeywords((prev) =>
      prev.map((keyword) => (keyword.id === id ? { ...keyword, checked: !keyword.checked } : keyword)),
    );
  };

  // 선택된 키워드 개수
  const selectedCount = keywords.filter((k) => k.checked).length;

  // 선택된 키워드 적용
  const handleApply = () => {
    const selectedKeywords = keywords.filter((k) => k.checked).map((k) => k.text);
    onSelectKeywords(selectedKeywords);
    onClose();
  };

  // 다이얼로그 닫을 때 상태 초기화
  const handleClose = () => {
    setKeywords([]);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-[90vw] max-h-[85vh] overflow-hidden p-6" style={{ width: '95vw' }}>
        <DialogHeader className="mb-6">
          <DialogTitle className="text-xl font-bold text-gray-900">키워드 도우미</DialogTitle>
          <DialogDescription className="text-gray-600">
            추천 키워드를 선택하여 벤치마킹 소싱에 활용하세요
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 overflow-y-auto flex-1">
          {/* 키워드 목록 */}
          {loading ? (
            <div className="flex justify-center items-center h-32">
              <Loader2 className="h-6 w-6 animate-spin" />
              <span className="ml-2 text-gray-600">키워드를 불러오는 중...</span>
            </div>
          ) : error ? (
            <div className="text-center text-red-600 py-8">{error}</div>
          ) : keywords.length > 0 ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-gray-900">추천 키워드 ({keywords.length}개)</h3>
                <div className="text-sm text-gray-500">선택된 키워드: {selectedCount}개</div>
              </div>

              <div className="grid grid-cols-3 gap-4 max-h-96 overflow-y-auto">
                {keywords.map((item) => (
                  <label
                    key={item.id}
                    className="flex items-center p-3 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer transition-colors"
                  >
                    <input
                      type="checkbox"
                      checked={item.checked}
                      onChange={() => toggleKeyword(item.id)}
                      className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500 mr-3 flex-shrink-0"
                    />
                    <span className="text-gray-700 text-sm">{item.text}</span>
                  </label>
                ))}
              </div>
            </div>
          ) : (
            <div className="text-center text-gray-500 py-8">
              <p>추천 키워드가 없습니다.</p>
            </div>
          )}
        </div>

        <DialogFooter className="flex gap-3 mt-6">
          <Button variant="outline" onClick={onClose}>
            취소
          </Button>
          <Button onClick={handleApply} disabled={selectedCount === 0} className="bg-blue-600 hover:bg-blue-700">
            선택된 키워드 적용 ({selectedCount}개)
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
