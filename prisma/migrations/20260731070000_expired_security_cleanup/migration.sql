-- Support bounded, index-backed cleanup of expired authentication artifacts.
CREATE INDEX "Session_expires_idx" ON "Session"("expires");
CREATE INDEX "VerificationToken_expires_idx" ON "VerificationToken"("expires");
CREATE INDEX "EmailVerificationToken_expiresAt_idx" ON "EmailVerificationToken"("expiresAt");
CREATE INDEX "PasswordResetToken_expiresAt_idx" ON "PasswordResetToken"("expiresAt");
