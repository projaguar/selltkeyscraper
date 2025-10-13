#!/bin/bash

# 태그 삭제 스크립트
# 사용법: ./scripts/delete-tag.sh 0.0.1

set -e

if [ -z "$1" ]; then
  echo "❌ 버전을 지정해주세요."
  echo "사용법: ./scripts/delete-tag.sh 0.0.1"
  exit 1
fi

VERSION=$1
TAG="v${VERSION}"

echo "🗑️  태그 삭제 프로세스 시작: ${TAG}"
echo ""

# 확인
read -p "정말로 태그 ${TAG}를 삭제하시겠습니까? (y/N): " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
  echo "❌ 취소됨"
  exit 1
fi

# 1. 로컬 태그 삭제
echo "🗑️  로컬 태그 삭제: ${TAG}"
git tag -d "${TAG}" 2>/dev/null || echo "로컬 태그가 존재하지 않음"

# 2. 원격 태그 삭제
echo "🗑️  원격 태그 삭제: ${TAG}"
git push origin ":refs/tags/${TAG}" 2>/dev/null || echo "원격 태그가 존재하지 않음"

echo ""
echo "✅ 태그 삭제 완료!"
echo ""
echo "⚠️  GitHub Releases 페이지에서 릴리즈도 수동으로 삭제해야 합니다:"
echo "🔗 https://github.com/projaguar/selltkeyscraper/releases"
echo ""
echo "이제 다시 릴리즈할 수 있습니다:"
echo "  bun run release ${VERSION}"
echo ""

