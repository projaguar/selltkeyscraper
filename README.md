# Selltkey Scraper

스마트한 상품 수집 및 벤치마킹 소싱 도구

## 다운로드

최신 버전은 [Releases](https://github.com/projaguar/selltkeyscraper/releases) 페이지에서 다운로드하세요.

- **Windows**: `selltkeyscraper-{version}-setup.exe`
- **macOS**: `selltkeyscraper-{version}.dmg`

## 기능

### 상품수집

- 스마트스토어 상품 정보 자동 수집
- 실시간 진행 상황 표시
- 자동 데이터 전송

### 벤치마킹 소싱

- 네이버 쇼핑 상품 분석
- 옥션 상품 데이터 수집
- 키워드 기반 자동 소싱
- 실시간 로그 및 진행 상황

## 개발

### 요구사항

- Node.js 20+
- Bun

### 설치

```bash
bun install
```

### 개발 모드

```bash
bun run dev
```

### 빌드

```bash
# 모든 플랫폼
bun run build

# Windows용
bun run build:win

# macOS용
bun run build:mac
```

### 릴리즈

```bash
# 자동 릴리즈 (버전 업데이트, 태그 생성, 푸시)
bun run release 2.0.1

# 또는 수동으로
git tag v2.0.1
git push origin v2.0.1
```

자세한 내용은 [RELEASE.md](RELEASE.md)를 참고하세요.

## 라이선스

MIT
