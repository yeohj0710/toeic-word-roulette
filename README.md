# TOEIC Word Roulette

릴 촬영처럼 랜덤 토익 단어를 뽑고 1분 동안 말하면서 외우는 웹 앱.
영상 레퍼런스처럼 흰 화면, 큰 단어 슬롯, 원형 타이머 중심으로 구성했다.

## Stack

- React
- TypeScript
- Vite
- lucide-react

## Run

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```

## Word Data

단어 데이터만 `yeohj0710/TOEIC-word-test`의 txt 파일에서 CP949로 읽어 변환했다.
기존 C 프로그램 UI/코드는 사용하지 않았다.

## Features

- 슬롯머신처럼 단어가 빠르게 지나가는 룰렛 UI
- 선택된 단어 중심 원형 카운트다운
- 단어별 확률 가중치 설정
- 단어/뜻 직접 편집
- 커스텀 단어 추가
- 편집 내용은 브라우저 localStorage에 저장
