#!/bin/bash

# 릴리즈 자동화 스크립트
# 사용법: ./scripts/release.sh 2.0.1

set -e

if [ -z "$1" ]; then
  echo "❌ 버전을 지정해주세요."
  echo "사용법: ./scripts/release.sh 2.0.1"
  exit 1
fi

VERSION=$1
TAG="v${VERSION}"

echo "🚀 릴리즈 프로세스 시작: ${TAG}"
echo ""

# 1. 현재 브랜치 확인
CURRENT_BRANCH=$(git branch --show-current)
echo "📍 현재 브랜치: ${CURRENT_BRANCH}"

# 2. 변경사항 확인
if [[ -n $(git status -s) ]]; then
  echo "⚠️  커밋되지 않은 변경사항이 있습니다."
  git status -s
  echo ""
  read -p "계속하시겠습니까? (y/N): " -n 1 -r
  echo
  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "❌ 릴리즈 취소"
    exit 1
  fi
fi

# 3. package.json 버전 업데이트
echo "📝 package.json 버전 업데이트: ${VERSION}"
if [[ "$OSTYPE" == "darwin"* ]]; then
  # macOS
  sed -i '' "s/\"version\": \".*\"/\"version\": \"${VERSION}\"/" package.json
else
  # Linux
  sed -i "s/\"version\": \".*\"/\"version\": \"${VERSION}\"/" package.json
fi

# 4. 모든 변경사항 커밋
echo "💾 모든 변경사항 커밋"
git add .
git commit -m "chore: release v${VERSION}" || echo "변경사항 없음"

# 5. 태그 생성
echo "🏷️  태그 생성: ${TAG}"
git tag -a "${TAG}" -m "Release ${TAG}"

# 6. 푸시
echo "📤 푸시 중..."
git push origin "${CURRENT_BRANCH}"
git push origin "${TAG}"

echo ""
echo "✅ 릴리즈 프로세스 완료!"
echo ""
echo "📦 GitHub Actions에서 빌드가 시작됩니다."
echo "🔗 진행 상황: https://github.com/projaguar/selltkeyscraper/actions"
echo "🔗 릴리즈: https://github.com/projaguar/selltkeyscraper/releases/tag/${TAG}"
echo ""

