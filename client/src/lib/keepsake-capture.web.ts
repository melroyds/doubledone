// Web variant: no native view snapshot here. share.web.ts composites the keepsake page
// on a canvas instead, so this returns null and the caller falls through to that path.
import { type RefObject } from 'react';
import { type View } from 'react-native';

export async function captureKeepsakeCard(ref: RefObject<View | null>): Promise<string | null> {
  return null;
}
