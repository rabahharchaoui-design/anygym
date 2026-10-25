// Imported workouts have no dates (SPEC 9.3). Their startedAt holds the import order instead
// (1, 2, 3...), which sorts them before every real workout and keeps the file's order among
// themselves. Anything that shows a date checks here first and says "Imported".

/** startedAt values below this are import order, never a time (1e9 ms is 12 days into 1970). */
export const IMPORT_ORDER_LIMIT = 1e9;

export const IMPORTED_LABEL = 'Imported';

export const isImportOrder = (startedAt: number): boolean => startedAt >= 0 && startedAt < IMPORT_ORDER_LIMIT;
