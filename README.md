# 개인 대시보드 — Next.js / Vercel 버전

Google Apps Script 웹앱의 화면과 기존 클라이언트 로직을 최대한 그대로 유지하면서 Next.js로 옮긴 버전입니다.

## 요청에 따라 제거된 기능

- 메일 탭 및 Gmail 연동 전체 제거
- 사이드바의 `달력` 탭 제거
- 사이드바의 `북마크` 탭 제거

원본 요청이 "사이드바에 있는 달력, 북마크"를 대상으로 했기 때문에, **홈 화면 내부의 달력/북마크 패널은 그대로 유지**했습니다.

## 주요 변경점

- `Index.html` → Next.js App Router의 `app/page.js` + `legacy/dashboard.js`
- 원본 CSS → `app/globals.css`에 그대로 이동
- `google.script.run` → 브라우저 `localStorage` CRUD + `/api/functions` 호출
- GAS의 공개 외부 데이터 함수(날씨/급식/학사일정/공지) → Next.js Node 서버 API로 이동
- 기존 UI의 Lucide 아이콘은 원본과 같은 `lucide@0.513.0` CDN을 사용

## 데이터 저장 방식

원래 GAS 버전은 사용자별 Google Sheet를 사용했지만, Vercel에서는 같은 동작을 추가 외부 DB 없이 재현할 수 없기 때문에 개인 데이터(`Schedule`, `Homework`, `Note`, `Timetable` 및 홈에서 쓰는 Bookmark 계열)는 **브라우저 localStorage**에 저장합니다.

즉, 같은 브라우저/기기에서는 새로고침해도 데이터가 유지되지만, 다른 기기/브라우저와는 자동으로 공유되지 않습니다.

## Vercel 배포

1. 이 폴더 전체를 GitHub 저장소에 올립니다.
2. Vercel에서 해당 GitHub 저장소를 Import 합니다.
3. Framework Preset은 Next.js로 두고 별도 환경변수 없이 배포할 수 있습니다.
4. 배포 후 `https://...vercel.app` 주소로 접속합니다.

로컬 실행:

```bash
npm install
npm run dev
```

## 주의

학교 사이트를 원본 GAS 코드와 같은 방식으로 서버에서 가져오므로, 학교 웹사이트 구조나 외부 사이트의 접근 정책이 변경되면 해당 파서도 수정이 필요할 수 있습니다.

또한 학사일정은 원본 코드와 동일하게 페이지를 순차적으로 넘겨 여러 번 요청하는 구조를 유지했습니다. Vercel Hobby 플랜에서는 긴 첫 요청이 플랜의 실행시간 제한에 걸릴 가능성이 있으므로, 그런 경우에는 학교 일정 수집 방식을 별도 최적화해야 합니다.
