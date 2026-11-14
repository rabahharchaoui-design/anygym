/** A count with its word: plural(1, 'lift', 'lifts') is "1 lift", plural(3, 'lift', 'lifts') is "3 lifts". */
export const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;

/** The first letter in upper case, the rest left as it is: "chest and back" reads "Chest and back". */
export const cap = (t: string): string => t.charAt(0).toUpperCase() + t.slice(1);

/** "a", "a and b", "a, b and c" (or "a, b or c"): the one way a list is joined in a sentence. */
export const list = (items: readonly string[], last = 'and'): string => (items.length < 2 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')} ${last} ${items[items.length - 1]}`);
