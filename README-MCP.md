# Puppeteer MCP 설정 가이드

## 설치 완료

Puppeteer MCP가 성공적으로 설치되었습니다!

### 설치된 패키지
- `@modelcontextprotocol/server-puppeteer`: ^2025.5.12

### 설정 파일
- `mcp-config.json`: MCP 서버 설정 파일
- `package.json`: MCP 실행 스크립트 추가

## 사용 방법

### 1. MCP 서버 실행
```bash
bun run mcp:puppeteer
```

### 2. 환경 변수 설정
```bash
export PUPPETEER_HEADLESS=true
export PUPPETEER_EXECUTABLE_PATH=""  # 자동 감지
```

### 3. MCP 클라이언트에서 연결
MCP 클라이언트에서 `mcp-config.json` 파일을 사용하여 Puppeteer MCP 서버에 연결할 수 있습니다.

## 주요 기능

Puppeteer MCP를 통해 다음 기능들을 사용할 수 있습니다:

- 웹 페이지 스크래핑
- 스크린샷 촬영
- PDF 생성
- 자동화된 브라우저 작업
- 웹 요소 상호작용

## Docker Desktop 설치

Docker Desktop은 별도로 설치해야 합니다:

### macOS
```bash
# Homebrew를 통한 설치
brew install --cask docker

# 또는 공식 웹사이트에서 다운로드
# https://www.docker.com/products/docker-desktop/
```

### 설치 후 확인
```bash
docker --version
docker-compose --version
```

## 문제 해결

### Puppeteer 실행 오류
```bash
# Chromium 재설치
bun x puppeteer browsers install chrome
```

### 권한 문제
```bash
# 실행 권한 부여
chmod +x node_modules/.bin/mcp-server-puppeteer
```
