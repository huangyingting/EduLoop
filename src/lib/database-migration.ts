// Advance this marker with every migration. schema:check keeps it aligned with
// both provider histories so a newer application cannot accept old-schema traffic.
export const REQUIRED_DATABASE_MIGRATION = "20261120060000_question_hints";
