import { AuraRenderer } from './engine';

let current: AuraRenderer | null = null;
let clock = 0;

export function setRenderer(r: AuraRenderer | null) {
  current = r;
}

/** Access the live renderer (used by the native export pipeline). */
export function getRenderer(): AuraRenderer | null {
  return current;
}

/** The preview's animation clock, so a snapshot matches what you see. */
export function setClock(t: number) {
  clock = t;
}

export function getClock(): number {
  return clock;
}
