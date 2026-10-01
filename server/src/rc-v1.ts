// The RevenueCat v1 requests this Worker makes, built as data so their shape is a tested contract
// rather than something only a live call can confirm. A leaf module on purpose: the reconcile route
// and the account-deletion route both need them, and stripe.ts importing the reconcile module would
// close an import cycle through the webhook (revenuecat.ts imports timingSafeEqual from stripe.ts).

/**
 * GET /v1/subscribers/{id}. v1 and NOT v2 deliberately: it returns `subscriptions` keyed by product
 * with a per-subscription `is_sandbox`, `store` and `store_transaction_id`, which is everything the
 * reconcile and the deletion paths read. The v2 customer endpoints need a project id, a different
 * shape and pagination to answer the same question. NOTE: RevenueCat CREATES a customer for an id it
 * has never seen, so callers gate this call on having a reason to ask.
 */
export function buildSubscriberRequest(userId: string, secret: string): { url: string; init: RequestInit } {
  return {
    url: `https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(userId)}`,
    init: { method: 'GET', headers: { Authorization: `Bearer ${secret}`, accept: 'application/json' } },
  };
}

/**
 * POST /v1/subscribers/{id}/subscriptions/{store_transaction_identifier}/cancel: turns OFF renewal on
 * a Google Play subscription. RevenueCat's own words: "The subscription remains valid until its
 * expiration time, but it will not renew." Never confuse it with /revoke, which takes a product id,
 * ends access at once and REFUNDS the last purchase. Nothing in this Worker ever calls /revoke.
 */
export function buildPlayCancelRequest(userId: string, storeTransactionId: string, secret: string): { url: string; init: RequestInit } {
  return {
    url: `https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(userId)}/subscriptions/${encodeURIComponent(storeTransactionId)}/cancel`,
    init: { method: 'POST', headers: { Authorization: `Bearer ${secret}`, accept: 'application/json' } },
  };
}
