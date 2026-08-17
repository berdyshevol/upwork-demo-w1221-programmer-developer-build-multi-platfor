/**
 * Shape returned by the blocklist server actions.
 *
 * Lives outside `app/actions.ts` on purpose: a `'use server'` module may only
 * export async functions, so the initial-state constant cannot live there.
 */
export interface ActionResult {
  error?: string;
  added?: string;
}

export const EMPTY_RESULT: ActionResult = {};
