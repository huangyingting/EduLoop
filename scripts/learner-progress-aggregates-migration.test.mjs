import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

const migrationName = "20261120040000_learner_progress_aggregates";
const [sqliteMigration, postgresqlMigration] = await Promise.all([
  readFile(new URL(`../prisma/migrations/${migrationName}/migration.sql`, import.meta.url), "utf8"),
  readFile(new URL(`../prisma/postgresql/migrations/${migrationName}/migration.sql`, import.meta.url), "utf8"),
]);

test("backfills subject and topic aggregates from graded attempts only", () => {
  assert.match(postgresqlMigration, /"isCorrect" = true THEN 1/);
  const database = new DatabaseSync(":memory:");
  try {
    database.exec(`
      CREATE TABLE "LearnerProfile" ("id" TEXT PRIMARY KEY);
      CREATE TABLE "Subject" ("id" TEXT PRIMARY KEY);
      CREATE TABLE "TagDimension" ("id" TEXT PRIMARY KEY, "key" TEXT NOT NULL);
      CREATE TABLE "Tag" ("id" TEXT PRIMARY KEY, "dimensionId" TEXT NOT NULL);
      CREATE TABLE "Question" ("id" TEXT PRIMARY KEY, "subjectId" TEXT NOT NULL);
      CREATE TABLE "QuestionTag" ("questionId" TEXT NOT NULL, "tagId" TEXT NOT NULL);
      CREATE TABLE "PracticeAttempt" ("id" TEXT PRIMARY KEY, "learnerId" TEXT NOT NULL, "questionId" TEXT NOT NULL, "isCorrect" BOOLEAN, "createdAt" DATETIME NOT NULL);
      INSERT INTO "LearnerProfile" VALUES ('learner');
      INSERT INTO "Subject" VALUES ('math'), ('physics');
      INSERT INTO "TagDimension" VALUES ('topic-dimension', 'TOPIC'), ('skill-dimension', 'SKILL');
      INSERT INTO "Tag" VALUES ('geometry', 'topic-dimension'), ('reasoning', 'skill-dimension');
      INSERT INTO "Question" VALUES ('q1', 'math'), ('q2', 'math'), ('q3', 'physics');
      INSERT INTO "QuestionTag" VALUES ('q1', 'geometry'), ('q1', 'reasoning'), ('q2', 'geometry');
      INSERT INTO "PracticeAttempt" VALUES
        ('a1', 'learner', 'q1', 1, 1000),
        ('a2', 'learner', 'q2', 0, 2000),
        ('a3', 'learner', 'q2', NULL, 3000),
        ('a4', 'learner', 'q3', 1, 4000);
    `);
    database.exec(sqliteMigration);
    const subjects = database.prepare(`SELECT "subjectId", "attempts", "correct", "lastAttemptAt" FROM "LearnerSubjectStat" ORDER BY "subjectId"`).all();
    assert.deepEqual(subjects.map((row) => ({ ...row })), [
      { subjectId: "math", attempts: 2, correct: 1, lastAttemptAt: 2000 },
      { subjectId: "physics", attempts: 1, correct: 1, lastAttemptAt: 4000 },
    ]);
    const topics = database.prepare(`SELECT "subjectId", "tagId", "attempts", "correct" FROM "LearnerTopicStat"`).all();
    assert.deepEqual(topics.map((row) => ({ ...row })), [{ subjectId: "math", tagId: "geometry", attempts: 2, correct: 1 }]);
  } finally {
    database.close();
  }
});
