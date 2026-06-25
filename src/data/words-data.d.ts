declare const words: {
  id: string
  term: string
  meaning: string
  source: string
  category: 'day' | 'idiom' | 'note' | 'conjunctive'
  day: number | null
  level: '800' | '900' | null
}[]

export default words
