# 역지네 팀 홈페이지 제작 계획서

[기획서](prd.md)를 바탕으로 휴대폰과 데스크톱에서 열 수 있는 한 장짜리 팀 소개 페이지를 만든다.

## 파일 구조

```text
team-page/
├─ prd.md
├─ logo-prompt.md
├─ build-plan.md
├─ fonts/
│  ├─ jua.css
│  ├─ Jua-Regular.ttf
│  └─ OFL.txt
├─ images/
│  ├─ logo.png
│  └─ birthday-usagi.png
└─ index.html
```

## 준비물

| 준비물 | 상태 |
|---|---|
| `ㅇㅈ` 로고 | 헤더에 글자로 표시. 시안은 `images/logo.png`에 저장 |
| 첫 화면 일러스트 | 생일 요정 우사기 `images/birthday-usagi.png`. SVG 별빛이 지팡이에서 가운데 스크롤 표시까지 이어진다. |
| 배민 주아체 | 팀 홈페이지와 벽돌 깨기 게임에서 로컬 글꼴을 불러온다. |
| 벽돌 깨기 게임 | 작업 폴더에 있는 `../brick-breaker.html`을 연결할 후보로 확인 |

## 만드는 순서

| 순서 | 작업 | 확인 기준 |
|---|---|---|
| 1 | 상단 로고와 메뉴, 팀 소개·하는 일·만든 페이지 섹션을 배치한다. | 메뉴를 누르면 해당 섹션 제목이 보인다. |
| 2 | 하늘색 배경 위에 생일 요정 우사기와 작은 파스텔 별을 배치한다. | 일러스트와 팀 소개 문구가 서로 가려지지 않는다. |
| 3 | 업무 카드 3개와 게임·준비 중 카드 2개를 넣는다. | 게임 링크가 열리고 준비 중 카드는 상태가 한눈에 구분된다. |
| 4 | 화면 폭에 맞춰 카드 열 수를 조절하고 작은 화면에 접이식 메뉴를 적용한다. | 375px와 데스크톱 폭에서 메뉴와 링크를 사용할 수 있다. |

## 브라우저 확인

`index.html`을 열어 데스크톱과 375px 화면에서 배경과 글자 대비, 카드 배치, 가로 스크롤을 확인한다. 접이식 메뉴와 게임 링크를 직접 눌러 본다. 두 페이지의 글자가 주아체로 표시되는지 확인한다.

## 첫 화면 일러스트

[치이카와 마켓 공식 상품](https://chiikawamarket.jp/products/4582662951587)의 생일 요정 의상을 참고해 Codex 이미지 생성 도구에서 일러스트를 만들었다.

### 이전 별빛 시안에 사용한 프롬프트

```text
Edit this transparent PNG for a website. Keep the exact same recognizable Birthday Fairy Usagi drawing, same soft brown outline, colors, ears, facial expression, pink bow, blue hooded cape, and pose with wand on viewer's left. Uniformly scale the existing drawing down to about 79% of the square canvas height so there is comfortable whitespace above and around it. Add one magical rising spiral around the character, deliberately drawn like a single one-turn helix made of a fine curved warm gold/peach luminous ribbon and little clearly delineated four-point stars in warm amber, yellow and pink. Make the origin absolutely clear: the visible ribbon starts directly at the glowing star tip of the existing magic wand at viewer's left. It sweeps down a little and in front of the character across the LOWER cape, below the pink bow, then swings outside the character's right edge and curls around BEHIND the head, partly occluded by the character as it wraps, and re-emerges just outside the left ear and curves UP toward the space above both ears, ending in a little rising trail of small golden starlets. One connected gesture, a strong ascending movement, one wrap, not a circular halo. Keep the eyes, mouth, pink ribbon, ears and face clear, avoid drawing the trail over the face. A few distinct bright gold sparkle highlights still legible on an ivory/light-pink website background. Clean cute matte illustration, fine marks with warm gold edges, restrained glow, no backdrop, no floor, no text, no other objects, genuine transparent alpha around illustration and sparkles. Keep all sparkles and ears comfortably within the canvas.
```

### 원본 일러스트에 사용한 프롬프트

```text
Illustration asset on genuinely transparent background for a fan's personal website: Usagi from Chiikawa (ちいかわ), specifically the birthday fairy godmother version from the 2024 バ～スディッ・・・マスコット series. Depict only one character, full front-facing body, compact rounded pale golden custard-yellow rabbit face and small body, classic Chiikawa Usagi tiny dark oval eyes and small whimsical w-shaped mouth, delicate warm pink cheek marks. The identifying outfit is a soft baby-blue hooded fairy-godmother cape framing the face and covering the head, with pale pink ribbon bow tied underneath the chin. Add a tiny cream star-tipped wand held close at one side. Use a simple cute 2D storybook illustration with confident soft dark-brown outlines, few shapes and matte pastel fills, not a plush photograph. Character occupies 88% of square canvas, front view, no floor, no external backdrop, no halo, no decorations surrounding the character, no text, no branding, no watermark and no keychain.
```
