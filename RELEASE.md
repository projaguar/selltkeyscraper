# 릴리즈 가이드

## 자동 빌드 및 릴리즈

이 프로젝트는 GitHub Actions를 사용하여 자동으로 빌드하고 릴리즈합니다.

### 릴리즈 생성 방법

#### 방법 1: 자동 릴리즈 스크립트 (권장)

```bash
# 모든 변경사항이 자동으로 커밋되고 태그가 생성됩니다
bun run release 2.0.1
```

스크립트가 자동으로 수행하는 작업:

- 현재 변경사항 확인
- package.json 버전 업데이트
- 모든 변경사항 커밋 (`git add .`)
- 태그 생성 및 푸시

#### 방법 2: 수동 릴리즈

```bash
# 1. 변경사항 커밋
git add .
git commit -m "feat: 새로운 기능 추가"

# 2. package.json의 version 수정
# 예: "version": "2.0.1"

# 3. 태그 생성
git tag v2.0.1

# 4. 푸시
git push origin main
git push origin v2.0.1
```

2. **자동 빌드 시작**
   - 태그가 푸시되면 GitHub Actions가 자동으로 실행됩니다
   - Windows와 macOS용 실행 파일이 동시에 빌드됩니다
   - 빌드 진행 상황은 GitHub Actions 탭에서 확인할 수 있습니다

3. **릴리즈 확인**
   - 빌드가 완료되면 자동으로 GitHub Releases 페이지에 릴리즈가 생성됩니다
   - 다음 파일들이 자동으로 업로드됩니다:
     - `selltkeyscraper-{version}-setup.exe` (Windows 설치 파일)
     - `selltkeyscraper-{version}.dmg` (macOS 설치 파일)

### 릴리즈 페이지

릴리즈는 다음 URL에서 확인할 수 있습니다:

```
https://github.com/projaguar/selltkeyscraper/releases
```

### 버전 관리 규칙

- **Major 버전** (v1.0.0 → v2.0.0): 대규모 변경, 호환성 깨짐
- **Minor 버전** (v2.0.0 → v2.1.0): 새로운 기능 추가
- **Patch 버전** (v2.0.0 → v2.0.1): 버그 수정, 작은 개선

### 로컬 빌드 (테스트용)

릴리즈 전 로컬에서 빌드를 테스트하려면:

```bash
# Windows용 빌드
bun run build:win

# macOS용 빌드
bun run build:mac

# 빌드 결과는 dist/ 폴더에 생성됩니다
```

### 주의사항

1. **태그 삭제 후 재생성**

   ```bash
   # 로컬 태그 삭제
   git tag -d v2.0.1

   # 원격 태그 삭제
   git push origin :refs/tags/v2.0.1

   # 새 태그 생성 및 푸시
   git tag v2.0.1
   git push origin v2.0.1
   ```

2. **릴리즈 삭제**
   - GitHub Releases 페이지에서 수동으로 삭제 가능
   - 태그도 함께 삭제하려면 위의 명령어 사용

3. **빌드 실패 시**
   - GitHub Actions 탭에서 로그 확인
   - 로컬에서 `bun run build` 실행하여 오류 확인
   - 수정 후 새 태그로 다시 푸시

### 자동 업데이트

앱에는 `electron-updater`가 설치되어 있어 자동 업데이트 기능을 지원합니다.
사용자가 앱을 실행하면 자동으로 새 버전을 확인하고 업데이트를 제안합니다.

### 예제: 새 버전 릴리즈

#### 자동 릴리즈 사용 (권장)

```bash
# 1. 코드 수정 및 테스트
# 2. 릴리즈 스크립트 실행 (자동으로 모든 것 처리)
bun run release 2.1.0

# 스크립트가 자동으로:
# - package.json 버전을 "2.1.0"으로 변경
# - 모든 변경사항 커밋
# - v2.1.0 태그 생성
# - main 브랜치와 태그 푸시
# - GitHub Actions 자동 빌드 시작
```

#### 수동 릴리즈

```bash
# 1. 코드 수정 및 테스트
# 2. 변경사항 커밋
git add .
git commit -m "feat: 소싱 진행 상황 로그 기능 추가"

# 3. package.json의 version을 "2.1.0"으로 변경
# 4. 태그 생성 및 푸시
git tag v2.1.0
git push origin main
git push origin v2.1.0

# 5. GitHub Actions에서 자동 빌드 시작
# 6. 빌드 완료 후 Releases 페이지에서 확인
```

## 문제 해결

### GitHub Token 권한 오류

- Repository Settings → Actions → General
- Workflow permissions를 "Read and write permissions"로 설정

### macOS 서명 문제

- 현재 설정은 서명 없이 빌드됩니다 (`notarize: false`)
- 서명이 필요한 경우 Apple Developer 계정 필요

### Windows 서명 문제

- 현재 설정은 서명 없이 빌드됩니다
- 서명이 필요한 경우 코드 서명 인증서 필요
