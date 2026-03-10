[简体中文](README.md) | [English](README.en.md) | [日本語](README.ja.md) | [한국어](README.ko.md)

# oshiTag v0.3.0

순수 HTML, CSS, JavaScript로 만든 오프라인 지원 경량 PWA입니다. 그룹 -> 아이돌 -> TAG와 즐겨찾기를 관리하고, 한 번의 클릭으로 복사할 수 있습니다.

[![DEMO](https://img.shields.io/website?url=https%3A%2F%2Foshitag.com&label=DEMO&up_message=online&down_message=down)](https://oshitag.com)

## 사용 방법

- 기본 상태는 탐색 모드이며, 오른쪽 위의 ＋ 버튼으로 편집 모드로 전환할 수 있습니다.
- 탐색 모드
  - 그룹 탭: 클릭으로 전환, 더블클릭으로 해당 그룹의 모든 TAG 복사
  - 아이돌 이름: 클릭으로 해당 아이돌의 모든 TAG 복사
  - TAG: 클릭으로 해당 TAG 복사
  - 즐겨찾기 탭: 클릭으로 전환, 더블클릭으로 해당 즐겨찾기의 모든 TAG 복사
  - 즐겨찾기 내용 영역의 빈 공간: 클릭으로 해당 즐겨찾기의 모든 TAG 복사
- 편집 모드
  - 현재 그룹 / 즐겨찾기 탭: 클릭으로 이름 변경, 더블클릭으로 삭제, 드래그로 정렬
  - 아이돌 이름 / TAG: 클릭으로 이름 변경, 더블클릭으로 삭제, 드래그로 정렬
  - 색상 점: 프리셋 또는 HEX 값으로 응원색 선택
  - ＋ 또는 + TAG: 그룹 / 즐겨찾기 / 아이돌 / TAG 추가

## 가져오기 / 내보내기

오른쪽 위의 ⋯ 메뉴에서 사용할 수 있습니다.

- 내보내기 형식: `# 그룹 / ## 아이돌 / ### TAG`, 아이돌 응원색은 `<!-- cheerColor: #RRGGBB -->` 사용
- 가져오기는 동일한 구조를 읽으며, 즐겨찾기는 `# [FAVORITES]` 섹션을 사용
- 가져오기 모드는 덮어쓰기와 병합 두 가지를 지원
- 가져오기 전에 현재 데이터, 가져오기 원본, 적용 후 결과의 비교 요약과 그룹 / 아이돌 / 즐겨찾기 / TAG의 추가 및 제거 차이를 표시합니다. 긴 차이 목록은 펼쳐서 볼 수 있으며, 가져오기 전 백업은 브라우저 `localStorage`에 자동 저장됩니다
- 오른쪽 위의 ⋯ 메뉴에서 Restore Backup을 사용해 가장 최근의 가져오기 전 상태로 되돌릴 수 있습니다

## 배포

정적 사이트이므로 GitHub Pages, Netlify, Vercel Static 같은 어떤 정적 호스팅에도 그대로 배포할 수 있습니다.
로컬 미리보기 예시:

```bash
python -m http.server 5173
```

`http://localhost:5173/index.html` 를 열면 됩니다.

## 디렉터리 구조 (릴리스 빌드)

- `index.html`
- `assets/css/styles.css`
- `assets/js/app.js`
- `assets/js/dialogs.js`
- `assets/js/data-manager.js`
- `assets/js/import-workflow.js`
- `assets/js/locale-manager.js`
- `assets/js/menu-controller.js`
- `assets/js/render.js`
- `assets/js/sort-utils.js`
- `assets/js/i18n.js`
- `assets/js/import-utils.js`
- `assets/icons/*`
- `manifest.json`, `service-worker.js`

## 참고

- 데이터는 브라우저 `localStorage`에 저장됩니다.
- PWA는 Service Worker로 정적 자산을 캐시합니다. 정식 릴리스를 만들 때는 `manifest.json`, `assets/js/app.js`, `service-worker.js`의 버전 번호를 함께 갱신하세요.