import rawWords from './words-data.js'

export type WordCategory = 'day' | 'idiom' | 'note' | 'conjunctive'

export type ToeicWord = {
  id: string
  term: string
  meaning: string
  source: string
  category: WordCategory
  day: number | null
  level: '800' | '900' | null
}

export const TOEIC_WORDS = rawWords as ToeicWord[]
