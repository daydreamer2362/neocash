/*
  Canonical UTR index (uppercase + whitespace removed) for fast duplicate lookup.
  NOTE:
  We intentionally avoid a UNIQUE index here because production may contain
  legacy duplicate UTR values. Duplicate prevention is enforced in API submit
  logic using transactional checks + advisory lock, without data loss.
*/

DROP INDEX IF EXISTS "UserOrder_utr_canonical_unique_idx";
CREATE INDEX IF NOT EXISTS "UserOrder_utr_canonical_idx"
ON "UserOrder" ((UPPER(REGEXP_REPLACE(BTRIM("utr"), '\\s+', '', 'g'))))
WHERE "utr" IS NOT NULL AND BTRIM("utr") <> '';
