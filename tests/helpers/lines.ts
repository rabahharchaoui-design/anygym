import type { Page } from '@playwright/test';

/**
 * A quiet 12 to 13 px line under the set rows (17 px line height): one line from 360 points wide;
 * on the 320 floor, where 12 px is already the smallest size SPEC 13 allows, it wraps once rather
 * than being cut off or shrunk further.
 */
export const quietLineMax = (page: Page) => (page.viewportSize()!.width >= 360 ? 20 : 36);
