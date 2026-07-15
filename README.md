# 생활도우미 (MakingDB)

마비노기 모바일 제작법/스크롤/교환/구매 정보를 찾아보고 편집할 수 있는 개인용 웹 도구.

- **배포 주소**: https://mobi-yoon.github.io/contentsHelper/
- **저장소**: https://github.com/mobi-yoon/contentsHelper (이전 이름: `MakingDB` — GitHub 저장소 이름은 한글을 지원하지 않아 영문으로 유지)

## 구성

두 부분으로 나뉘어 있고, **서로 데이터가 동기화되지 않는다** (아래 "알려진 제약" 참고).

1. **웹 앱** (`index.html` / `app.js` / `style.css`) — 실제로 쓰는 부분. GitHub Pages로 배포, [Supabase](https://supabase.com)를 DB로 사용.
2. **로컬 CLI** (`main.py` / `db.py`) — 프로젝트 초기에 만든 터미널 도구. `data/*.json` 파일을 직접 읽고 쓴다. 지금은 웹 앱과 별개로 남아있는 레거시.

## 웹 앱 아키텍처

- 순수 HTML/CSS/바닐라 JS, 빌드 과정 없음. `app.js` 하나에 전체 로직이 들어있다.
- DB: Supabase (Postgres) — `SUPABASE_URL`/anon key를 `app.js`에 그대로 하드코딩 (anon key는 원래 클라이언트에 노출되는 용도이며, 실제 접근 제어는 Postgres RLS 정책이 담당).
- 인증: Supabase Auth 이메일/비밀번호 로그인 (계정 1개, Supabase 대시보드에서 직접 생성). 로그인해야만 데이터 추가/수정/삭제 가능.
- RLS 정책: 모든 테이블 — 누구나 조회(SELECT) 가능, 로그인한 사용자만 쓰기(INSERT/UPDATE/DELETE) 가능.

### 테이블

| 테이블 | 내용 |
|---|---|
| `recipes` | 가공품/제작품 레시피 (`major_category`, `sub_category`, `name`, `output_qty`, `materials` jsonb 배열) |
| `scrolls` | 채집/채광/제작/요리 스크롤 (`scroll_type`, `town`, `target_name`, `qty_per_scroll`) |
| `materials` | 레시피가 없는 순수 원재료 이름 목록 (오타 방지용 레지스트리) |
| `trades` | NPC 물물교환 (`town`, `npc`, `item_name`, `item_qty`, `required_name`, `required_qty`, `limit_text`) |
| `purchases` | NPC 골드/토큰 구매 (`town`, `npc`, `item_name`, `price_currency`, `price_amount`, `limit_text`) |

스키마/RLS/시드 데이터는 저장소 루트의 `supabase_*.sql` 파일들에 남아있다 (한 번 실행하고 나면 재실행할 일은 없지만, 스키마 이력 기록 겸 재구축용으로 보관):

- `supabase_schema.sql`, `supabase_seed.sql`, `supabase_grants.sql` — recipes/scrolls/materials 최초 마이그레이션
- `supabase_trade_schema.sql`, `supabase_trade_seed.sql` — trades/purchases 테이블
- `supabase_item_patch.sql` — 가공 레시피 파싱 버그로 누락됐던 항목 패치
- `supabase_craft_seed.sql` — 제작품(무기/방어구 등) 레시피 대량 추가

## 웹 앱 기능

- **완제품 검색** / **재료 역검색** — 이름으로 레시피 조회, 재료로 완제품 역조회
- **필요 재료 계산** — 완제품 n개 제작 시 필요한 가공품/원재료 집계(배치 단위 반올림 반영) + 들여쓰기된 제작 트리
- **스크롤 계산** — 마을별 스크롤 체크박스 다중 선택, 선택한 스크롤 전체의 재료 합계 + 개별 상세
- **교환/구매 검색** — 아이템 이름 검색, 마을/카테고리(레시피 소분류 기반, 매칭 안 되면 "기타") 드롭다운으로 243개 항목 브라우징
- **전체 목록** — 제작법/스크롤/원재료/교환/구매를 표 형태로, 열 헤더에 드롭다운 필터 내장
- **편집** — 로그인 후 레시피/스크롤/원재료 추가·수정·삭제. 원재료로 등록된 이름에 나중에 레시피가 생기면 원재료 목록에서 자동으로 빠짐

## 로컬 CLI (레거시)

```
python3 main.py
```

`data/recipes.json`, `data/scrolls.json`, `data/materials.json`을 직접 읽고 쓰는 대화형 메뉴. 3단계 아이템 분류(재료템/가공품/제작품), 배치 제작 반올림, 스크롤-재료 역산 등 웹 앱의 핵심 로직이 여기서 먼저 설계됐다.

## 배포 워크플로

```
git add -A && git commit -m "..." && git push origin main
```

push하면 GitHub Pages가 자동으로 재빌드한다 (보통 1~2분, 가끔 8분 이상 걸릴 때도 있음 — GitHub 쪽 인프라 이슈로 추정, 재시도하면 됨). Supabase 스키마를 바꿔야 할 때는 SQL Editor에서 직접 실행해야 한다 (이 저장소에 마이그레이션 자동화 도구는 없음).

## 알려진 제약

- **CLI ↔ 웹 DB 불일치**: `main.py`로 편집해도 Supabase에 반영 안 되고, 웹에서 편집해도 `data/*.json`에 반영 안 됨. 현재는 웹이 사실상 메인이고 CLI는 거의 안 씀.
- **교환/구매 카테고리 커버리지**: `trades`/`purchases`의 "카테고리"는 `recipes.sub_category`를 이름으로 매칭해서 계산하는데, 전체 항목의 약 32%만 매칭되고 나머지는 "기타"로 뭉뚱그려진다.
