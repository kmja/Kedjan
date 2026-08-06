/**
 * Swedish plural agreement for a counted noun. Some nouns are invariant in the
 * plural (ett felförsök, två felförsök), so both forms are always spelled out
 * rather than derived.
 */
export const plural = (n: number, one: string, many: string): string =>
  `${n} ${n === 1 ? one : many}`;
