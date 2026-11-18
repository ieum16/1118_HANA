# 강사용 · 대시보드 데이터 규칙

대시보드는 저장소를 pull 해서 아래 규칙대로 읽으면 됩니다. (수집 스크립트는 대시보드 만들 때 추가)

## 수강생 한 명 = 닉네임 하나

| 위치 | 읽을 것 |
|---|---|
| `00_자기소개/<닉네임>.md` | 맨 위 `---` 칸: `nickname` · `work` · `github` · `vibecoding` · `joined` · `rating`(수업 점수 1~5) · `ai_before` · `ai_after`(수업 전·후 AI 활용 능력 1~5, 차이 = 오른 단계) — 셋 다 수업 끝날 때, 본문 `## 하는 일` · `## 오늘 만들어 보고 싶은 것` · `## 재밌었던 것` · `## 어려웠던 것` |
| `실습1_확장프로그램/<닉네임>/` | `manifest.json` 있음 = 만들기 시작, `README.md` 의 `##` 칸, `screenshot.png` |
| `실습2_홈페이지/<닉네임>/` | `prd.md`, 로고(`logo.*` · `images/logo.*`), `README.md` `## 배포 주소`의 `https://*.vercel.app`, `screenshot.png` |
| `실습3_나만의도구/<닉네임>/` | `prd.md`, `index.html`, `test.md`(○/× 개수), `README.md` 의 `##` 칸(`## 아낄 수 있는 시간` 포함), `screenshot.png` |

- `README.md` 첫 줄 `# 제목`이 양식 그대로(확장 프로그램 이름 / 팀 홈페이지 이름 / 도구 이름)면 "아직 안 채움".
- 진행 단계 예: 자기소개만 → 실습1 파일 있음 → 실습1 README·캡처까지 = 제출 완료 → 실습2 버셀 링크 → 실습3 제출.
- 제출 시각은 `git log --format=%cI -- <경로>`의 가장 최근 값.
- `_instructor/out/` 은 `.gitignore`에 있어 올라가지 않아요.
