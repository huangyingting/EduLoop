import { hashPassword } from "../src/lib/auth";
import { normalizeEmail } from "../src/lib/auth-validation";
import { PRIVACY_VERSION, TERMS_VERSION } from "../src/lib/legal";
import { prisma } from "../src/lib/prisma";

const rawEmail = process.env.BOOTSTRAP_USER_EMAIL?.trim() ?? "";
const password = process.env.BOOTSTRAP_USER_PASSWORD ?? "";
const displayName = process.env.BOOTSTRAP_USER_NAME?.trim() || "EduLoop Admin";

async function main() {
  const email = normalizeEmail(rawEmail);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("BOOTSTRAP_USER_EMAIL must be a valid email address.");
  }
  const passwordBytes = new TextEncoder().encode(password).length;
  if (password.length < 12 || passwordBytes > 72) {
    throw new Error("BOOTSTRAP_USER_PASSWORD must contain 12 through 72 UTF-8 bytes.");
  }
  if (displayName.length > 50) {
    throw new Error("BOOTSTRAP_USER_NAME must contain at most 50 characters.");
  }

  const existing = await prisma.user.findUnique({
    where: { email },
    select: { role: true },
  });
  if (existing) {
    if (existing.role !== "ADMIN") {
      throw new Error("The bootstrap email already belongs to a non-admin user.");
    }
    console.info(JSON.stringify({ event: "bootstrap_user_exists", email, role: existing.role }));
    return;
  }

  const acceptedAt = new Date();
  const passwordHash = await hashPassword(password);
  await prisma.user.create({
    data: {
      email,
      name: displayName,
      passwordHash,
      role: "ADMIN",
      emailVerified: acceptedAt,
      termsAcceptedAt: acceptedAt,
      termsVersion: TERMS_VERSION,
      privacyAcceptedAt: acceptedAt,
      privacyVersion: PRIVACY_VERSION,
      consentBasis: "ADULT",
      learner: {
        create: { displayName },
      },
      consentRecords: {
        create: {
          termsVersion: TERMS_VERSION,
          privacyVersion: PRIVACY_VERSION,
          basis: "ADULT",
          method: "OPERATOR_BOOTSTRAP",
          acceptedAt,
        },
      },
    },
  });
  console.info(JSON.stringify({ event: "bootstrap_user_created", email, role: "ADMIN" }));
}

main()
  .finally(() => prisma.$disconnect())
  .catch((error) => {
    console.error(error instanceof Error ? error.message : "Bootstrap user creation failed.");
    process.exitCode = 1;
  });
