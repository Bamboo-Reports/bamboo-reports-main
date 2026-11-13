/**
 * Apostrophe look-alikes that appear in names: straight, backtick, acute,
 * curly left and right, and the modifier letter. Data and typed queries mix
 * them ("O'Reilly" vs "O’Reilly"), so search treats them as the same character.
 */
export const APOSTROPHES = /['`´‘’ʼ]/g

/** Lower-cases text and folds every apostrophe variant to a straight one, for matching. */
export function searchKey(text: string): string {
  return text.toLowerCase().replace(APOSTROPHES, "'")
}
