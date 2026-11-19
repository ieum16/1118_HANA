# DEALING DESK — 간단 조치 안내 도구

반복되는 문의에 조치 방법과 담당자 연락처를 함께 안내하는 브라우저 도구입니다.

## 기능

- 문의 유형별 조치 방법 작성, 안내문 생성·수정·복사
- 미해결 시 문의할 업체·담당자 연락처 포함
- 업체명·담당자명으로 연락처 등록·검색·수정·삭제
- 한 담당자에 여러 장애 유형 연결, 같은 업체에 여러 담당자 등록
- 동일 업체명·담당자명 재등록 시 중복 알림과 기존 정보 업데이트
- Obsidian / Neon Lime 테마, 모바일 대응

## 로컬 실행

`index.html`을 브라우저에서 열면 됩니다. 별도 설치·API 키·서버가 필요 없습니다.

연락처는 사용 중인 브라우저의 localStorage에만 저장됩니다. 서버 공유·PC 간 동기화 기능은 없습니다. 로컬 파일과 배포 사이트는 저장 공간이 다르므로 로컬에 등록한 연락처가 배포 사이트로 자동 이동하지 않습니다. 작성 중인 안내문은 새로고침하면 초기화됩니다. 처음 표시되는 연락처와 조치 방법은 가짜 예시입니다.

## Vercel 배포

Vercel에서 이 GitHub 저장소를 Import합니다.

| 항목 | 설정 |
|---|---|
| Framework Preset | Other |
| Root Directory | 저장소 루트 (`./`) |
| Build Command | `npm run build` |
| Output Directory | `dist` |
| Environment Variables | 없음 |

`vercel.json`에 빌드·출력 설정을 포함했습니다. 빌드는 Node.js 기본 모듈만 사용하고 `index.html`만 배포 디렉터리에 복사합니다. 기획·테스트·디자인 문서는 배포 산출물에 포함하지 않습니다.

Git 저장소와 연결한 이후 배포 동작은 Vercel 프로젝트의 Git·브랜치 설정을 따릅니다.

## 문서

- [기획서](prd.md)
- [확인표와 검증 범위](test.md)
- [디자인 분석](design-analysis.md)

## 빌드 확인

Node.js 환경에서 `npm run build`를 실행합니다. 출력 파일은 `dist/index.html`입니다. 빌드 과정에서 페이지 스크립트 문법을 검사합니다.
