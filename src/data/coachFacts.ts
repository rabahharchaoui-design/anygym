// The curated why notes over the committed data (PLAN 3.5f): data/coach-facts.json, the only source
// of a card's why line and its two "more" sentences. src/lib/coachFacts.ts stays pure.
import file from '../../data/coach-facts.json';
import type { CoachFact, FactFile } from '../lib/coachFacts';

export const FACT_FILE = file as unknown as FactFile;
export const COACH_FACTS: readonly CoachFact[] = FACT_FILE.facts;
const BY_ID = new Map(COACH_FACTS.map((f) => [f.id, f]));
export const factById = (id: string | undefined): CoachFact | undefined => (id ? BY_ID.get(id) : undefined);
