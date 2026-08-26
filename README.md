# 너겟 브랜드메시지 랜딩 페이지

세무사 대상 카카오톡 브랜드메시지 서비스 소개 페이지. 콜드 문자에서 유입받아 무료 체험 신청을 받는다.

## 구성

| 파일 | 역할 |
|---|---|
| `index.html` | 랜딩 페이지 전체 (HTML·CSS·JS 한 파일) |
| `images/` | 페이지에서 쓰는 이미지 |
| `apps-script.gs` | 신청 폼 → 구글 시트 연동 코드 (참고용 사본) |
| `브랜드메시지 상품 소개서(ver.2607).pdf` | 원본 소개서 |

## 로컬에서 띄우기

`index.html`을 브라우저로 직접 열면(`file://`) **신청 폼이 동작하지 않는다.**
반드시 로컬 서버로 띄울 것.

```bash
python3 -m http.server 5500
```

→ http://localhost:5500

VS Code를 쓴다면 **Live Server** 확장을 설치하고 `index.html`에서 우클릭 →
"Open with Live Server" 를 써도 된다.

## 신청 폼

페이지 하단 `<script>` 맨 위 두 값이 설정 지점이다.

```js
var KAKAO_URL    = "";   // 카카오톡 채널 주소. 비우면 카톡 버튼이 숨겨진다
var FORM_ENDPOINT = "";  // Apps Script 웹 앱 주소. 비우면 메일 앱이 대신 열린다
```

### 동작 방식

1. CTA 클릭 → 모달 열림
2. 이름 / 사무실 이름 / 연락처 / 이메일 + 개인정보 동의 (전부 필수)
3. 제출 → `FORM_ENDPOINT` 로 POST → 구글 시트에 행 추가 + 알림 메일

### 주의: 성공 표시를 믿지 말 것

구글 Apps Script는 응답에 CORS 헤더를 주지 않아서 `mode: "no-cors"` 로 보낸다.
**브라우저가 성공/실패를 구분할 수 없으므로 페이지는 항상 "접수되었습니다"를 띄운다.**
실제 접수 여부는 언제나 구글 시트로 확인한다.

### 시트에 안 들어올 때

1. Apps Script 편집기에서 `테스트` 함수 실행 → 시트에 행이 들어가는가?
   - 안 들어감 → 코드나 권한 문제
   - 들어감 → 배포 문제, 2번으로
2. 배포 → 배포 관리 → 연필 → 버전 **"새 버전"** → 배포
   - 코드를 저장만 하면 배포에 반영되지 않는다. 배포는 그 시점 코드의 사본이다.
3. 배포 설정 확인: 실행 계정 **나**, 액세스 권한 **모든 사용자**
4. 터미널에서 직접 확인:

```bash
curl -sS -L -X POST "<웹앱주소>" \
  --data-urlencode "name=테스트" --data-urlencode "office=테스트" \
  --data-urlencode "phone=010-0000-0000" --data-urlencode "email=t@e.com" \
  --data-urlencode "agree=동의" --data-urlencode "source=curl"
```

`{"ok":true}` 가 오면 정상. `다음 스크립트 함수(doPost)를 찾을 수 없습니다` 가 오면 2번.

## 유입 경로 추적

주소 뒤에 `?s=` 를 붙이면 시트 **유입경로** 칸에 그대로 찍힌다.

```
nugget.im/tax?s=sms       → 문자
nugget.im/tax?s=sms-a     → 문자 A안
nugget.im/tax?s=sms-b     → 문자 B안
```

아무것도 안 붙이면 `direct` 또는 `ref:<유입 사이트>` 로 기록된다.

## 배포

정적 파일이라 어디든 올라간다. Vercel 기준:

1. 이 폴더를 Vercel에 드래그 앤 드롭 (또는 깃허브 연결)
2. Settings → Domains → `nugget.im` 연결
3. 하위 주소로 쓰려면 `tax/index.html` 구조로 두면 `nugget.im/tax` 가 된다

배포 후 **실제 주소에서 신청을 한 번 해보고 시트를 확인할 것.**
claude.ai 미리보기에서는 보안 정책상 외부 요청이 막혀 폼이 절대 동작하지 않는다.

## 수정할 때 자주 건드리는 곳

| 내용 | 찾을 문자열 |
|---|---|
| 히어로 헤드라인 | `<h1>` |
| 무료 체험 조건 | `먼저 신청하신` |
| 요금 관련 | (없음 — 요금제 섹션은 제거됨) |
| 개인정보 고지 문구 | `agree-detail` |
| 폼 필드 | `id="lead-form"` |
