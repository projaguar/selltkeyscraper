# GitHub Secrets 설정 가이드

GitHub Actions에서 macOS 앱에 코드 서명을 하려면 다음 Secrets를 설정해야 합니다.

## 필수 Secrets

GitHub Repository → Settings → Secrets and variables → Actions → New repository secret

### 1. Apple 계정 정보

#### `APPLE_ID`
- **값**: `leejj00217@icloud.com`
- **설명**: Apple 개발자 계정 이메일

#### `APPLE_TEAM_ID`
- **값**: `GLT56F9L6G`
- **설명**: Apple Developer Team ID

#### `APPLE_APP_SPECIFIC_PASSWORD`
- **값**: `fdcf-qdie-ipwe-lksc`
- **설명**: Apple App-Specific Password (notarization용)
- **생성 방법**: https://appleid.apple.com → App-Specific Passwords

### 2. 코드 서명 인증서

#### `MACOS_CERTIFICATE`
- **설명**: macOS 코드 서명 인증서 (.p12 파일을 Base64로 인코딩)
- **생성 방법**:
  ```bash
  # .cer 파일을 .p12로 변환 (키체인 접근 앱에서)
  # 1. 키체인 접근 앱 열기
  # 2. Developer ID Application 인증서 찾기
  # 3. 인증서와 개인키를 모두 선택
  # 4. 우클릭 → "2개 항목 내보내기..."
  # 5. .p12 형식으로 저장 (비밀번호 설정)

  # .p12 파일을 Base64로 인코딩
  base64 -i /path/to/certificate.p12 | pbcopy
  # 클립보드에 복사된 Base64 문자열을 GitHub Secret에 붙여넣기
  ```

#### `MACOS_CERTIFICATE_PASSWORD`
- **설명**: .p12 인증서 내보내기 시 설정한 비밀번호

#### `KEYCHAIN_PASSWORD`
- **설명**: GitHub Actions에서 사용할 임시 키체인 비밀번호
- **값**: 임의의 강력한 비밀번호 생성 (예: 20자 이상의 무작위 문자열)
- **생성 예시**:
  ```bash
  openssl rand -base64 32
  ```

## 현재 상태

### 로컬 환경
- `.env` 파일에 Apple 계정 정보 존재 ✅
- `_resources/developerID_application.cer` 인증서 파일 존재 ✅
- `build/entitlements.mac.plist` 파일 존재 ✅
- `electron-builder.yml` 서명 설정 적용됨 ✅

### GitHub Actions
- macOS 빌드 워크플로우 업데이트됨 ✅
- 코드 서명 활성화됨 ✅

## 주의사항

1. **인증서 형식**: `.cer` 파일은 공개 인증서만 포함합니다. 코드 서명을 위해서는 **개인키가 포함된 `.p12` 파일**이 필요합니다.

2. **보안**: GitHub Secrets는 암호화되어 저장되며, 로그에 출력되지 않습니다.

3. **.env 파일**: 로컬 개발용입니다. GitHub에 푸시하지 마세요. (`.gitignore`에 추가 권장)

4. **테스트**: 설정 후 테스트 태그를 푸시하여 빌드가 성공하는지 확인하세요.
   ```bash
   git tag v0.0.58-test
   git push origin v0.0.58-test
   ```

## 다음 단계

1. [ ] .p12 인증서 파일 준비
2. [ ] 모든 GitHub Secrets 설정
3. [ ] 테스트 빌드 실행
4. [ ] 실제 릴리즈 태그 생성
