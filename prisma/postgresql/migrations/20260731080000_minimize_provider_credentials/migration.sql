-- EduLoop needs only the stable provider identity for subsequent sign-in.
-- Remove OAuth/OIDC response credentials retained by earlier adapter writes.
UPDATE "Account"
SET
  "refresh_token" = NULL,
  "access_token" = NULL,
  "expires_at" = NULL,
  "token_type" = NULL,
  "scope" = NULL,
  "id_token" = NULL,
  "session_state" = NULL
WHERE
  "refresh_token" IS NOT NULL
  OR "access_token" IS NOT NULL
  OR "expires_at" IS NOT NULL
  OR "token_type" IS NOT NULL
  OR "scope" IS NOT NULL
  OR "id_token" IS NOT NULL
  OR "session_state" IS NOT NULL;
