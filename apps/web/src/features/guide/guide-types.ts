import type { LucideIcon } from 'lucide-react';

/** Demo roles shown in the guide's "who can do what" table. */
export const GUIDE_ROLES = [
  'owner',
  'manager',
  'cashier',
  'waiter',
  'kitchen',
  'rider',
  'rep',
] as const;
export type GuideRole = (typeof GUIDE_ROLES)[number];

/**
 * One numbered step. Text lives at `guide:sections.<section>.tasks.<task>.steps.<key>`;
 * `shot` is a file name (no extension) under /guide/shots/.
 */
export interface GuideStep {
  key: string;
  shot?: string;
  /** Captured at phone width (390×844): rendered narrower. */
  mobile?: boolean;
}

/** A task ("Take a cash payment"). Title at `guide:sections.<section>.tasks.<key>.title`. */
export interface GuideTask {
  key: string;
  steps: GuideStep[];
}

/** A chapter. Title and intro at `guide:sections.<key>.title` / `.intro`. */
export interface GuideSection {
  key: string;
  icon: LucideIcon;
  /** Roles that can open this area (full or view-only). */
  roles: GuideRole[];
  tasks: GuideTask[];
}
