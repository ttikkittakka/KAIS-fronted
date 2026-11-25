export const PHOTO_KINDS = ['cup', 'book', 'meal', 'music'] as const;
export type PhotoKind = typeof PHOTO_KINDS[number];
export type VisionKind = PhotoKind | 'arms';

export const PHOTO_EVIDENCE = ['cup-with-liquid', 'empty-cup', 'book', 'meal', 'music-playing', 'other', 'unclear'] as const;
export type PhotoEvidence = typeof PHOTO_EVIDENCE[number];
export const MAX_MISSION_PHOTO_BASE64 = 950_000;

const expected: Record<PhotoKind, PhotoEvidence> = {
  cup: 'cup-with-liquid',
  book: 'book',
  meal: 'meal',
  music: 'music-playing',
};

export function photoVerdict(kind: PhotoKind, evidence: PhotoEvidence) {
  if (evidence === expected[kind]) return 'match';
  return evidence === 'unclear' ? 'unknown' : 'mismatch';
}
