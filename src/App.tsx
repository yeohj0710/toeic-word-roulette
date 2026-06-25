import {
  Eye,
  EyeOff,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Save,
  Settings2,
  Shuffle,
  X,
} from 'lucide-react'
import type { CSSProperties } from 'react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import './App.css'
import { TOEIC_WORDS, type ToeicWord, type WordCategory } from './data/words'

type LevelFilter = 'all' | '800' | '900'
type CategoryFilter = 'all' | WordCategory
type MachineMode = 'roulette' | 'timer'

type RouletteWord = ToeicWord & {
  weight: number
  enabled: boolean
  custom?: boolean
}

type SavedState = {
  overrides: Record<string, Partial<Pick<RouletteWord, 'term' | 'meaning' | 'weight' | 'enabled'>>>
  customWords: RouletteWord[]
}

type Draft = {
  term: string
  meaning: string
  weight: string
  enabled: boolean
}

const STORAGE_KEY = 'toeic-word-roulette-state-v2'
const DEFAULT_DURATION = 60
const SLOT_ITEM_HEIGHT = 92
const SLOT_CENTER_INDEX = 2
const SPIN_MS = 2200
const SPIN_LEAD_COUNT = 32
const TIMER_OPTIONS = [30, 45, 60, 90]

const emptyState: SavedState = {
  overrides: {},
  customWords: [],
}

function loadSavedState(): SavedState {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) {
      return emptyState
    }

    const parsed = JSON.parse(raw) as Partial<SavedState>
    return {
      overrides: parsed.overrides ?? {},
      customWords: Array.isArray(parsed.customWords) ? parsed.customWords : [],
    }
  } catch {
    return emptyState
  }
}

function normalizeWeight(value: string | number) {
  const parsed = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(parsed)) {
    return 1
  }
  return Math.min(20, Math.max(0, parsed))
}

function toDraft(word: RouletteWord | null): Draft {
  return {
    term: word?.term ?? '',
    meaning: word?.meaning ?? '',
    weight: String(word?.weight ?? 1),
    enabled: word?.enabled ?? true,
  }
}

function formatTime(seconds: number) {
  const safeSeconds = Math.max(0, Math.ceil(seconds))
  const minutes = Math.floor(safeSeconds / 60)
  const rest = safeSeconds % 60
  return `${minutes}:${rest.toString().padStart(2, '0')}`
}

function sourceLabel(word: RouletteWord | null) {
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

function weightLabel(weight: number) {
  return `x${Number.isInteger(weight) ? weight : weight.toFixed(1)}`
}

function pickWeighted(pool: RouletteWord[], avoidId?: string) {
  const weightedPool = pool.filter((word) => word.enabled && word.weight > 0)
  if (weightedPool.length === 0) {
    return null
  }

  if (weightedPool.length === 1) {
    return weightedPool[0]
  }

  let pick: RouletteWord | null = null
  let attempts = 0

  while (!pick || (pick.id === avoidId && attempts < 8)) {
    attempts += 1
    const totalWeight = weightedPool.reduce((sum, word) => sum + word.weight, 0)
    let cursor = Math.random() * totalWeight

    for (const word of weightedPool) {
      cursor -= word.weight
      if (cursor <= 0) {
        pick = word
        break
      }
    }
  }

  return pick ?? weightedPool[0]
}

function makeCustomWord(): RouletteWord {
  const id =
    globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`

  return {
    id: `custom-${id}`,
    term: 'new word',
    meaning: '뜻을 입력하세요',
    source: 'custom',
    category: 'note',
    day: null,
    level: null,
    weight: 1,
    enabled: true,
    custom: true,
  }
}

function makeIdleReel(pool: RouletteWord[], current: RouletteWord | null) {
  const fallback = current ?? pool[0]
  if (!fallback) {
    return []
  }

  return [
    pickWeighted(pool, fallback.id) ?? fallback,
    pickWeighted(pool, fallback.id) ?? fallback,
    fallback,
    pickWeighted(pool, fallback.id) ?? fallback,
    pickWeighted(pool, fallback.id) ?? fallback,
  ]
}

function makeSpinReel(pool: RouletteWord[], finalWord: RouletteWord) {
  const items: RouletteWord[] = []
  let previousId = finalWord.id

  for (let index = 0; index < SPIN_LEAD_COUNT; index += 1) {
    const next = pickWeighted(pool, previousId) ?? finalWord
    items.push(next)
    previousId = next.id
  }

  const finalIndex = items.length
  items.push(finalWord)

  for (let index = 0; index < 4; index += 1) {
    items.push(pickWeighted(pool, previousId) ?? finalWord)
  }

  return { items, finalIndex }
}

function App() {
  const [savedState, setSavedState] = useState<SavedState>(() => loadSavedState())
  const [level, setLevel] = useState<LevelFilter>('all')
  const [category, setCategory] = useState<CategoryFilter>('all')
  const [day, setDay] = useState<number | 'all'>('all')
  const [duration, setDuration] = useState(DEFAULT_DURATION)
  const [remaining, setRemaining] = useState(DEFAULT_DURATION)
  const [isRunning, setIsRunning] = useState(false)
  const [showMeaning, setShowMeaning] = useState(false)
  const [isSpinning, setIsSpinning] = useState(false)
  const [mode, setMode] = useState<MachineMode>('roulette')
  const [spinItems, setSpinItems] = useState<RouletteWord[]>([])
  const [slotOffset, setSlotOffset] = useState(0)
  const [historyIds, setHistoryIds] = useState<string[]>([])
  const [isManagerOpen, setIsManagerOpen] = useState(false)
  const [editQuery, setEditQuery] = useState('')
  const [selectedEditId, setSelectedEditId] = useState(TOEIC_WORDS[0]?.id ?? '')
  const [draft, setDraft] = useState<Draft>(() => toDraft(null))
  const [currentId, setCurrentId] = useState(() => TOEIC_WORDS[0]?.id ?? '')
  const spinTimeoutRef = useRef<number | null>(null)
  const durationRef = useRef(duration)

  const words = useMemo<RouletteWord[]>(() => {
    const baseWords = TOEIC_WORDS.map((word) => ({
      ...word,
      ...(savedState.overrides[word.id] ?? {}),
      weight: normalizeWeight(savedState.overrides[word.id]?.weight ?? 1),
      enabled: savedState.overrides[word.id]?.enabled ?? true,
    }))

    return [
      ...baseWords,
      ...savedState.customWords.map((word) => ({
        ...word,
        weight: normalizeWeight(word.weight),
        enabled: word.enabled ?? true,
        custom: true,
      })),
    ]
  }, [savedState])

  const activeWords = useMemo(() => {
    return words.filter((word) => {
      if (!word.enabled || word.weight <= 0) {
        return false
      }

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
  }, [category, day, level, words])

  const currentWord = useMemo(() => {
    return (
      words.find((word) => word.id === currentId) ??
      activeWords[0] ??
      words[0] ??
      null
    )
  }, [activeWords, currentId, words])

  const idleItems = useMemo(
    () => makeIdleReel(activeWords, currentWord),
    [activeWords, currentWord],
  )

  const visibleItems = spinItems.length > 0 ? spinItems : idleItems
  const progress = duration === 0 ? 0 : remaining / duration

  const selectedEditWord = useMemo(
    () => words.find((word) => word.id === selectedEditId) ?? currentWord,
    [currentWord, selectedEditId, words],
  )

  const editList = useMemo(() => {
    const query = editQuery.trim().toLowerCase()
    const pool = query
      ? words.filter((word) => {
          return (
            word.term.toLowerCase().includes(query) ||
            word.meaning.toLowerCase().includes(query)
          )
        })
      : words

    return pool.slice(0, 18)
  }, [editQuery, words])

  const historyWords = historyIds
    .map((id) => words.find((word) => word.id === id))
    .filter((word): word is RouletteWord => Boolean(word))

  const spin = useCallback(() => {
    const finalWord = pickWeighted(activeWords, currentWord?.id)
    if (!finalWord) {
      return
    }

    const { items, finalIndex } = makeSpinReel(activeWords, finalWord)
    const offset = -Math.max(0, finalIndex - SLOT_CENTER_INDEX) * SLOT_ITEM_HEIGHT

    if (spinTimeoutRef.current) {
      window.clearTimeout(spinTimeoutRef.current)
    }

    setMode('roulette')
    setShowMeaning(false)
    setIsRunning(false)
    setSpinItems(items)
    setSlotOffset(offset)
    setIsSpinning(true)

    spinTimeoutRef.current = window.setTimeout(() => {
      setCurrentId(finalWord.id)
      setHistoryIds((items) => [finalWord.id, ...items].slice(0, 6))
      setRemaining(durationRef.current)
      setMode('timer')
      setIsRunning(true)
      setIsSpinning(false)
      setSpinItems([])
    }, SPIN_MS)
  }, [activeWords, currentWord?.id])

  const resetTimer = () => {
    setRemaining(duration)
    setIsRunning(false)
  }

  const saveDraft = () => {
    if (!selectedEditWord) {
      return
    }

    const patch = {
      term: draft.term.trim() || selectedEditWord.term,
      meaning: draft.meaning.trim() || selectedEditWord.meaning,
      weight: normalizeWeight(draft.weight),
      enabled: draft.enabled,
    }

    setSavedState((state) => {
      if (selectedEditWord.custom) {
        return {
          ...state,
          customWords: state.customWords.map((word) =>
            word.id === selectedEditWord.id ? { ...word, ...patch } : word,
          ),
        }
      }

      return {
        ...state,
        overrides: {
          ...state.overrides,
          [selectedEditWord.id]: patch,
        },
      }
    })
  }

  const resetSelectedWord = () => {
    if (!selectedEditWord) {
      return
    }

    setSavedState((state) => {
      if (selectedEditWord.custom) {
        return {
          ...state,
          customWords: state.customWords.filter(
            (word) => word.id !== selectedEditWord.id,
          ),
        }
      }

      const nextOverrides = { ...state.overrides }
      delete nextOverrides[selectedEditWord.id]
      return { ...state, overrides: nextOverrides }
    })
  }

  const addCustomWord = () => {
    const word = makeCustomWord()
    setSavedState((state) => ({
      ...state,
      customWords: [word, ...state.customWords],
    }))
    setSelectedEditId(word.id)
    setDraft(toDraft(word))
  }

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(savedState))
  }, [savedState])

  useEffect(() => {
    durationRef.current = duration
  }, [duration])

  useEffect(() => {
    if (!selectedEditWord) {
      return
    }
    setDraft(toDraft(selectedEditWord))
  }, [selectedEditWord])

  useEffect(() => {
    if (!currentWord && activeWords[0]) {
      setCurrentId(activeWords[0].id)
    }
  }, [activeWords, currentWord])

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
      const target = event.target
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement
      ) {
        return
      }

      if (event.code === 'Space') {
        event.preventDefault()
        spin()
      }

      if (event.key.toLowerCase() === 'm') {
        setShowMeaning((value) => !value)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [spin])

  useEffect(() => {
    return () => {
      if (spinTimeoutRef.current) {
        window.clearTimeout(spinTimeoutRef.current)
      }
    }
  }, [])

  return (
    <main className="app">
      <section className="roulette-screen">
        <header className="machine-header">
          <div>
            <p>Roulette</p>
          </div>
          <div className="header-tools">
            <span>{activeWords.length.toLocaleString()} words</span>
            <button
              type="button"
              className="icon-button"
              onClick={() => setIsManagerOpen(true)}
              title="단어 편집"
            >
              <Settings2 size={19} />
            </button>
          </div>
        </header>

        <section className={`machine ${mode}`}>
          {mode === 'timer' && currentWord && !isSpinning ? (
            <div className="timer-view">
              <p className="word-meta">
                {sourceLabel(currentWord)} · {weightLabel(currentWord.weight)}
              </p>
              <h1>{currentWord.term}</h1>

              <div
                className="timer-ring"
                style={
                  {
                    '--progress': `${progress * 360}deg`,
                  } as CSSProperties
                }
                aria-label={`남은 시간 ${formatTime(remaining)}`}
              >
                <div>
                  <strong>{formatTime(remaining)}</strong>
                </div>
              </div>

              <p className={showMeaning ? 'meaning visible' : 'meaning'}>
                {showMeaning ? currentWord.meaning : ''}
              </p>

              <div className="main-actions">
                <button type="button" className="primary-action" onClick={spin}>
                  <Shuffle size={20} />
                  다시 돌리기
                </button>
                <button
                  type="button"
                  onClick={() => setIsRunning((value) => !value)}
                >
                  {isRunning ? <Pause size={20} /> : <Play size={20} />}
                  {isRunning ? '정지' : '시작'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowMeaning((value) => !value)}
                >
                  {showMeaning ? <EyeOff size={20} /> : <Eye size={20} />}
                  {showMeaning ? '숨기기' : '뜻 보기'}
                </button>
                <button type="button" onClick={resetTimer}>
                  <RotateCcw size={20} />
                  리셋
                </button>
              </div>
            </div>
          ) : (
            <div className="slot-view">
              <div className="slot-window" aria-live="polite">
                <div
                  className={isSpinning ? 'slot-track spinning' : 'slot-track'}
                  style={
                    {
                      '--slot-offset': `${slotOffset}px`,
                    } as CSSProperties
                  }
                >
                  {visibleItems.map((word, index) => (
                    <div
                      key={`${word.id}-${index}`}
                      className="slot-word"
                      data-center={!isSpinning && index === SLOT_CENTER_INDEX}
                    >
                      {word.term}
                    </div>
                  ))}
                </div>
                <div className="slot-marker" aria-hidden="true" />
              </div>

              <button
                type="button"
                className="spin-button"
                onClick={spin}
                disabled={isSpinning || activeWords.length === 0}
              >
                <Shuffle size={22} />
                {isSpinning ? '도는 중' : '돌리기'}
              </button>
            </div>
          )}
        </section>
      </section>

      <div
        className={isManagerOpen ? 'manager-backdrop open' : 'manager-backdrop'}
        onClick={() => setIsManagerOpen(false)}
      />
      <aside className={isManagerOpen ? 'manager open' : 'manager'}>
        <div className="manager-header">
          <div>
            <p>Words</p>
            <h2>단어 편집</h2>
          </div>
          <button
            type="button"
            className="icon-button"
            onClick={() => setIsManagerOpen(false)}
            title="닫기"
          >
            <X size={20} />
          </button>
        </div>

        <div className="filters">
          <label>
            <span>구분</span>
            <select
              value={category}
              onChange={(event) => setCategory(event.target.value as CategoryFilter)}
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
                  event.target.value === 'all' ? 'all' : Number(event.target.value),
                )
              }
            >
              <option value="all">전체</option>
              {Array.from({ length: 30 }, (_, index) => index + 1).map((item) => (
                <option key={item} value={item}>
                  Day {String(item).padStart(2, '0')}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="timer-options">
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

        <label className="search-field">
          <span>검색</span>
          <input
            value={editQuery}
            onChange={(event) => setEditQuery(event.target.value)}
            placeholder="단어 또는 뜻"
          />
        </label>

        <div className="word-list">
          {editList.map((word) => (
            <button
              key={word.id}
              type="button"
              className={selectedEditWord?.id === word.id ? 'selected' : ''}
              onClick={() => setSelectedEditId(word.id)}
            >
              <span>{word.term}</span>
              <small>{weightLabel(word.weight)}</small>
            </button>
          ))}
        </div>

        <div className="edit-form">
          <label>
            <span>단어</span>
            <input
              value={draft.term}
              onChange={(event) =>
                setDraft((value) => ({ ...value, term: event.target.value }))
              }
            />
          </label>

          <label>
            <span>뜻</span>
            <textarea
              value={draft.meaning}
              onChange={(event) =>
                setDraft((value) => ({ ...value, meaning: event.target.value }))
              }
            />
          </label>

          <label>
            <span>확률 가중치</span>
            <input
              type="number"
              min="0"
              max="20"
              step="0.5"
              value={draft.weight}
              onChange={(event) =>
                setDraft((value) => ({ ...value, weight: event.target.value }))
              }
            />
          </label>

          <label className="check-row">
            <input
              type="checkbox"
              checked={draft.enabled}
              onChange={(event) =>
                setDraft((value) => ({ ...value, enabled: event.target.checked }))
              }
            />
            <span>룰렛에 포함</span>
          </label>

          <div className="manager-actions">
            <button type="button" className="primary-action" onClick={saveDraft}>
              <Save size={18} />
              저장
            </button>
            <button type="button" onClick={resetSelectedWord}>
              {selectedEditWord?.custom ? '삭제' : '초기화'}
            </button>
            <button type="button" onClick={addCustomWord}>
              <Plus size={18} />새 단어
            </button>
          </div>
        </div>

        {historyWords.length > 0 ? (
          <div className="history">
            <p>최근 결과</p>
            {historyWords.map((word) => (
              <span key={word.id}>{word.term}</span>
            ))}
          </div>
        ) : null}
      </aside>
    </main>
  )
}

export default App
