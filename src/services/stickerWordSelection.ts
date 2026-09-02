const TWO_CHARACTER_WORD = /^\p{Script=Han}{2}$/u
const FOUR_CHARACTER_WORD = /^\p{Script=Han}{4}$/u

export type ThreeWordStickerWords = [string, string, string]

/** 前两格依次选取两字词语，第三格选取首个四字词语；不足时对应留空。 */
export function selectThreeWordStickerWords(
  words: readonly (string | null | undefined)[] | null | undefined
): ThreeWordStickerWords {
  const normalizedWords = (words ?? []).map((word) => String(word ?? '').trim())
  const twoCharacterWords = normalizedWords.filter((word) => TWO_CHARACTER_WORD.test(word))
  const fourCharacterWord = normalizedWords.find((word) => FOUR_CHARACTER_WORD.test(word))

  return [
    twoCharacterWords[0] ?? '',
    twoCharacterWords[1] ?? '',
    fourCharacterWord ?? '',
  ]
}
