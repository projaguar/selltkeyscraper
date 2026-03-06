#!/bin/bash
set -euo pipefail

# ============================================
# Selltkey Scraper - Windows 포터블 빌드 스크립트
# ============================================

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
VERSION=$(node -p "require('$PROJECT_DIR/package.json').version")
APP_NAME="selltkeyscraper"
OUTPUT_DIR="$PROJECT_DIR/dist"
PORTABLE_DIR="$OUTPUT_DIR/${APP_NAME}-${VERSION}-portable-win"
WIN_UNPACKED="$OUTPUT_DIR/win-unpacked"

echo "============================================"
echo "  Building Selltkey Scraper v${VERSION}"
echo "  Target: Windows x64 Portable"
echo "============================================"
echo ""

# 1. 이전 빌드 정리
echo "[1/5] 이전 빌드 정리..."
rm -rf "$WIN_UNPACKED" "$PORTABLE_DIR" "${PORTABLE_DIR}.zip"

# 2. electron-vite 빌드
echo "[2/5] electron-vite 빌드 중..."
cd "$PROJECT_DIR"
bun run build

# 3. electron-builder 포터블(dir) 빌드
echo "[3/5] electron-builder 포터블 빌드 중..."
npx electron-builder --win --x64 --dir

# 4. 포터블 패키지 구성
echo "[4/5] 포터블 패키지 구성 중..."
mkdir -p "$PORTABLE_DIR"

# 앱 파일은 app/ 하위 폴더로 분리
cp -r "$WIN_UNPACKED" "$PORTABLE_DIR/app"

# 루트에는 사용자가 볼 파일만 배치
cp "$PROJECT_DIR/build/portable/install.bat" "$PORTABLE_DIR/"
cp "$PROJECT_DIR/build/portable/install.ps1" "$PORTABLE_DIR/"
cp "$PROJECT_DIR/build/portable/SelltkeyScraper.bat" "$PORTABLE_DIR/"
cp "$PROJECT_DIR/build/portable/사용방법.txt" "$PORTABLE_DIR/"

# 5. ZIP 압축
echo "[5/5] ZIP 압축 중..."
cd "$OUTPUT_DIR"
zip -r "${APP_NAME}-${VERSION}-portable-win.zip" "$(basename "$PORTABLE_DIR")" -x "*.DS_Store"

echo ""
echo "============================================"
echo "  빌드 완료!"
echo "  출력: dist/${APP_NAME}-${VERSION}-portable-win.zip"
echo "============================================"
