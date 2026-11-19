import type { EmailCatalog } from "./zh-CN";

export const enEmails: EmailCatalog = {
  passwordReset: {
    subject: "Reset your EduLoop password",
    before: ["Someone asked to reset your EduLoop password. Open this link within 30 minutes:"],
    action: "Reset your password within 30 minutes",
    after: ["If you didn't ask for this, you can ignore this email."],
  },
  emailVerification: {
    subject: "Verify your EduLoop email",
    before: ["Open this link within 24 hours and enter the password you registered with or just set, to finish setting up email sign-in for EduLoop:"],
    action: "Verify your email within 24 hours",
    after: [
      "Unverified password registrations that are never used are deleted after 30 days; resending the email does not extend that.",
      "If you didn't register or set a password, don't open the link and never share your password.",
    ],
  },
  emailChangeVerification: {
    subject: "Confirm your new EduLoop sign-in email",
    before: ["Someone asked to make this address their EduLoop sign-in email. Confirm within 60 minutes:"],
    action: "Confirm your new email within 60 minutes",
    after: ["If you didn't ask for this, you can ignore this email; the current sign-in email stays the same."],
  },
  emailChanged: {
    subject: "Your EduLoop sign-in email changed",
    before: ["Your EduLoop sign-in email is now {newEmail}, and all old sessions were signed out.", "If this wasn't you, contact support right away."],
    action: "",
    after: [],
  },
  providerDisconnected: {
    subject: "Your EduLoop {provider} sign-in was removed",
    before: ["The {provider} sign-in connection was removed from your EduLoop account, and all old sessions were signed out.", "If this wasn't you, reset your password and contact support right away."],
    action: "",
    after: [],
  },
  passwordChanged: {
    subject: "Your EduLoop password was updated",
    before: ["Your EduLoop password was updated. All old sessions and unused account verification links no longer work.", "If this wasn't you, contact support right away and check your email account's security."],
    action: "",
    after: [],
  },
  accountDeleted: {
    subject: "Your EduLoop account was deleted",
    before: [
      "Your EduLoop account, sign-in methods, and online learning data were permanently deleted, and every session ended. Identity links and free text in question reports were erased; review states and action records without reporter identity stay with the question bank. Deleted data in backups is rotated out on the retention schedule in the privacy notice.",
      "If this wasn't you, contact support right away and check your email account's security.",
    ],
    action: "",
    after: [],
  },
  learningDataDeleted: {
    subject: "Your EduLoop learning data was deleted",
    before: [
      "Your EduLoop online learning data was permanently deleted. Identity links and free text in question reports were erased; review states and action records without reporter identity stay with the question bank. Your sign-in account and methods remain; deleted data in backups is rotated out on the retention schedule in the privacy notice.",
      "If this wasn't you, reset your password and contact support right away.",
    ],
    action: "",
    after: [],
  },
  sessionsRevoked: {
    subject: "You were signed out of EduLoop everywhere",
    before: ["Every EduLoop session was signed out, and unused account security links no longer work. Your password, sign-in email, and social connections did not change.", "If this wasn't you, reset your password and contact support right away."],
    action: "",
    after: [],
  },
  dueReviewDigest: {
    subject: "{count} {count|mistake is|mistakes are} ready for review today",
    before: ["{count} {count|question you missed is|questions you missed are} due for review today. A few minutes now turns them into knowledge you keep."],
    action: "Start reviewing",
    after: [],
  },
  weeklySummary: {
    subject: "Your EduLoop week in review",
    before: ["Last week you practiced {attempts} {attempts|question|questions} at {rate}% accuracy, on {activeDays} {activeDays|day|days}. Your current streak is {streak} {streak|day|days}."],
    action: "See your growth",
    after: [],
  },
  weeklySummaryEmpty: {
    subject: "Your EduLoop week in review",
    before: ["No practice last week yet. One question lights up today, and starting again is completely fine."],
    action: "See your growth",
    after: [],
  },
  unsubscribe: {
    dueReviewDigest: "Don't want review reminders?",
    weeklySummary: "Don't want weekly summaries?",
    link: "Unsubscribe",
  },
};
