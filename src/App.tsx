import {
  Eye,
  EyeOff,
  Pause,
  Play,
  RotateCcw,
  Shuffle,
  SkipForward,
} from 'lucide-react'
import type { CSSProperties } from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'
import './App.css'
import { TOEIC_WORDS, type ToeicWord, type WordCategory } from './data/words'

type LevelFilter = 'all' | '800' | '900'
type CategoryFilter = 'all' | WordCategory

const TIMER_OPTIONS = [30, 45, 60, 90]

function pickWord(pool: ToeicWord[], avoidId?: string) {
  if (pool.length === 0) {
    return null
  }

  if (pool.length === 1) {
    return pool[0]
  }

  let next = pool[Math.floor(Math.random() * pool.length)]
  while (next.id === avoidId) {
    next = pool[Math.floor(Math.random() * pool.length)]
  }
  return next
}

function formatTime(seconds: number) {
  const safeSeconds = Math.max(0, Math.ceil(seconds))
  const minutes = Math.floor(safeSeconds / 60)
  const rest = safeSeconds % 60
  return `${minutes}:${rest.toString().padStart(2, '0')}`
}

function sourceLabel(word: ToeicWord | null) {
  if (!word) {
    return '단어 없음'
  }

  if (word.category === 'day') {
    return `Day ${String(word.day).padStart(2, '0')} · ${word.level}`
  }

  const labels: Record<WordCategory, string> = {
    day: 'Day',
    idiom: '숙어',
    note: '노트',
    conjunctive: '연결어',
  }

  return `${labels[word.category]} · ${word.source}`
}

function categoryLabel(category: CategoryFilter) {
  const labels: Record<CategoryFilter, string> = {
    all: '전체',
    day: 'Day',
    idiom: '숙어',
    note: '노트',
    conjunctive: '연결어',
  }

  return labels[category]
}

function App() {
  const [level, setLevel] = useState<LevelFilter>('all')
  const [category, setCategory] = useState<CategoryFilter>('all')
  const [day, setDay] = useState<number | 'all'>('all')
  const [duration, setDuration] = useState(60)
  const [remaining, setRemaining] = useState(60)
  const [isRunning, setIsRunning] = useState(false)
  const [showMeaning, setShowMeaning] = useState(false)
  const [isSpinning, setIsSpinning] = useState(false)
  const [history, setHistory] = useState<ToeicWord[]>([])
  const durationRef = useRef(duration)
  const [currentWord, setCurrentWord] = useState<ToeicWord | null>(() =>
    pickWord(TOEIC_WORDS),
  )

  const filteredWords = useMemo(() => {
    return TOEIC_WORDS.filter((word) => {
      if (level !== 'all' && word.level !== level) {
        return false
      }

      if (category !== 'all' && word.category !== category) {
        return false
      }

      if (day !== 'all' && word.day !== day) {
        return false
      }

      return true
    })
  }, [category, day, level])

  const previewWords = useMemo(() => {
    return filteredWords
      .filter((word) => word.id !== currentWord?.id)
      .slice(0, 64)
      .sort(() => Math.random() - 0.5)
      .slice(0, 4)
  }, [currentWord?.id, filteredWords])

  const progress = duration === 0 ? 0 : remaining / duration

  const resetTimer = () => {
    setRemaining(duration)
    setIsRunning(false)
  }

  const moveToNextWord = () => {
    if (filteredWords.length === 0) {
      setCurrentWord(null)
      resetTimer()
      return
    }

    setIsSpinning(true)
    setShowMeaning(false)
    setIsRunning(false)

    const spinPool = filteredWords.length > 1 ? filteredWords : TOEIC_WORDS
    let spinCount = 0
    const spin = window.setInterval(() => {
      spinCount += 1
      setCurrentWord((word) => pickWord(spinPool, word?.id))

      if (spinCount >= 9) {
        window.clearInterval(spin)
        setCurrentWord((word) => {
          const next = pickWord(filteredWords, word?.id)
          if (next) {
            setHistory((items) => [next, ...items].slice(0, 5))
          }
          return next
        })
        setRemaining(duration)
        setIsSpinning(false)
      }
    }, 70)
  }

  useEffect(() => {
    durationRef.current = duration
  }, [duration])

  useEffect(() => {
    const next = pickWord(filteredWords)
    setCurrentWord(next)
    setHistory(next ? [next] : [])
    setRemaining(durationRef.current)
    setShowMeaning(false)
    setIsRunning(false)
  }, [filteredWords])

  useEffect(() => {
    if (!isRunning) {
      return
    }

    const timer = window.setInterval(() => {
      setRemaining((value) => {
        const next = value - 0.25
        if (next <= 0) {
          window.clearInterval(timer)
          setIsRunning(false)
          return 0
        }
        return next
      })
    }, 250)

    return () => window.clearInterval(timer)
  }, [isRunning])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement) {
        return
      }

      if (event.code === 'Space') {
        event.preventDefault()
        setIsRunning((value) => !value)
      }

      if (event.key === 'Enter') {
        event.preventDefault()
        moveToNextWord()
      }

      if (event.key.toLowerCase() === 'm') {
        setShowMeaning((value) => !value)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  })

  return (
    <main className="app">
      <section className="practice">
        <header className="topbar">
          <div>
            <p className="eyebrow">TOEIC Word Roulette</p>
            <h1>말하면서 외우는 토익 단어</h1>
          </div>
          <div className="word-count">{filteredWords.length.toLocaleString()} words</div>
        </header>

        <div className="practice-grid">
          <aside className="roulette-panel" aria-label="단어 룰렛">
            <div className="panel-title">
              <Shuffle size={18} aria-hidden="true" />
              <span>Roulette</span>
            </div>

            <div className="word-stack">
              {previewWords.map((word, index) => (
                <span key={word.id} data-depth={index}>
                  {word.term}
                </span>
              ))}
            </div>

            <div className="filters">
              <label>
                <span>구분</span>
                <select
                  value={category}
                  onChange={(event) =>
                    setCategory(event.target.value as CategoryFilter)
                  }
                >
                  {(['all', 'day', 'idiom', 'note', 'conjunctive'] as const).map(
                    (item) => (
                      <option key={item} value={item}>
                        {categoryLabel(item)}
                      </option>
                    ),
                  )}
                </select>
              </label>

              <label>
                <span>레벨</span>
                <select
                  value={level}
                  onChange={(event) => setLevel(event.target.value as LevelFilter)}
                >
                  <option value="all">전체</option>
                  <option value="800">800</option>
                  <option value="900">900</option>
                </select>
              </label>

              <label>
                <span>Day</span>
                <select
                  value={day}
                  onChange={(event) =>
                    setDay(
                      event.target.value === 'all'
                        ? 'all'
                        : Number(event.target.value),
                    )
                  }
                >
                  <option value="all">전체</option>
                  {Array.from({ length: 30 }, (_, index) => index + 1).map(
                    (item) => (
                      <option key={item} value={item}>
                        Day {String(item).padStart(2, '0')}
                      </option>
                    ),
                  )}
                </select>
              </label>
            </div>
          </aside>

          <section className="focus-panel" aria-live="polite">
            <p className="source">{sourceLabel(currentWord)}</p>
            <div className="word-area">
              <h2 className={isSpinning ? 'spinning' : ''}>
                {currentWord?.term ?? 'No words'}
              </h2>
              <p className={showMeaning ? 'meaning visible' : 'meaning'}>
                {showMeaning
                  ? currentWord?.meaning
                  : '뜻을 가리고 1분 동안 설명해보세요'}
              </p>
            </div>

            <div
              className="timer-ring"
              style={{
                '--progress': `${progress * 360}deg`,
              } as CSSProperties}
              aria-label={`남은 시간 ${formatTime(remaining)}`}
            >
              <div>
                <strong>{formatTime(remaining)}</strong>
                <span>{isRunning ? 'speaking' : 'ready'}</span>
              </div>
            </div>

            <div className="actions">
              <button
                type="button"
                onClick={() => setIsRunning((value) => !value)}
                title={isRunning ? '일시정지' : '시작'}
              >
                {isRunning ? <Pause size={18} /> : <Play size={18} />}
                {isRunning ? '정지' : '시작'}
              </button>
              <button type="button" onClick={moveToNextWord} title="다음 단어">
                <SkipForward size={18} />
                다음
              </button>
              <button
                type="button"
                onClick={() => setShowMeaning((value) => !value)}
                title={showMeaning ? '뜻 가리기' : '뜻 보기'}
              >
                {showMeaning ? <EyeOff size={18} /> : <Eye size={18} />}
                {showMeaning ? '가리기' : '뜻 보기'}
              </button>
              <button type="button" onClick={resetTimer} title="타이머 초기화">
                <RotateCcw size={18} />
                리셋
              </button>
            </div>
          </section>

          <aside className="session-panel" aria-label="학습 흐름">
            <div>
              <p className="panel-kicker">One take</p>
              <h3>스크립트 없이 바로 말하기</h3>
              <p>
                단어를 보고 뜻, 예문, 혼동 포인트를 1분 안에 말하면 릴처럼
                연습할 수 있어요.
              </p>
            </div>

            <div className="timer-options" aria-label="타이머 선택">
              {TIMER_OPTIONS.map((seconds) => (
                <button
                  key={seconds}
                  type="button"
                  className={duration === seconds ? 'selected' : ''}
                  onClick={() => {
                    setDuration(seconds)
                    setRemaining(seconds)
                    setIsRunning(false)
                  }}
                >
                  {seconds}s
                </button>
              ))}
            </div>

            <div className="history">
              <p>최근 단어</p>
              <ol>
                {history.map((word) => (
                  <li key={word.id}>
                    <span>{word.term}</span>
                    <small>{sourceLabel(word)}</small>
                  </li>
                ))}
              </ol>
            </div>
          </aside>
        </div>
      </section>
    </main>
  )
}

export default App
