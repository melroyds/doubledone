// The web never asks for a review. There is no store card on the web, and the package's own web
// fallback would only console.warn. So this half never imports expo-store-review at all, and
// REVIEW_SUPPORTED being false keeps Today from writing any review key (REV-04). Signatures mirror
// store-review.ts, held identical by platform-split.contract.ts.

export const REVIEW_SUPPORTED: boolean = false;

/** Always false on the web. */
export async function reviewCardAvailable(): Promise<boolean> {
  return false;
}

/** Never asks on the web. */
export async function requestReviewCard(): Promise<boolean> {
  return false;
}
