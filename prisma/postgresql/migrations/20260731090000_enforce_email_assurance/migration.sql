-- Earlier releases treated password presence and every OAuth/OIDC sign-in as
-- mailbox proof. Those timestamps do not record enough provenance to retain
-- safely, so require one explicit verification under the stricter policy.
-- Revoke affected sessions so the transition is effective immediately.
DELETE FROM "Session"
WHERE "userId" IN (
  SELECT "id"
  FROM "User"
  WHERE "emailVerified" IS NOT NULL
);

UPDATE "User"
SET
  "emailVerified" = NULL,
  "sessionVersion" = "sessionVersion" + 1
WHERE "emailVerified" IS NOT NULL;
