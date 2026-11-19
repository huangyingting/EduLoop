-- CreateTable
CREATE TABLE "Organization" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "entraTenantId" TEXT,
    "retentionDays" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "OrganizationDomain" (
    "domain" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    CONSTRAINT "OrganizationDomain_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Classroom" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "joinCode" TEXT NOT NULL,
    "teacherUserId" TEXT NOT NULL,
    "organizationId" TEXT,
    "archivedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Classroom_teacherUserId_fkey" FOREIGN KEY ("teacherUserId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Classroom_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ClassroomMember" (
    "classroomId" TEXT NOT NULL,
    "learnerId" TEXT NOT NULL,
    "joinedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY ("classroomId", "learnerId"),
    CONSTRAINT "ClassroomMember_classroomId_fkey" FOREIGN KEY ("classroomId") REFERENCES "Classroom" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ClassroomMember_learnerId_fkey" FOREIGN KEY ("learnerId") REFERENCES "LearnerProfile" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Assignment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "classroomId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "filters" TEXT NOT NULL DEFAULT '{}',
    "questionGoal" INTEGER NOT NULL DEFAULT 10,
    "paperKey" TEXT,
    "dueAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Assignment_classroomId_fkey" FOREIGN KEY ("classroomId") REFERENCES "Classroom" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- AlterTable
-- Added in place: rebuilding "User" would drop the triggers defined on it.
ALTER TABLE "User" ADD COLUMN "organizationId" TEXT REFERENCES "Organization" ("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex
CREATE UNIQUE INDEX "Organization_slug_key" ON "Organization"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Organization_entraTenantId_key" ON "Organization"("entraTenantId");

-- CreateIndex
CREATE INDEX "OrganizationDomain_organizationId_idx" ON "OrganizationDomain"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "Classroom_joinCode_key" ON "Classroom"("joinCode");

-- CreateIndex
CREATE INDEX "Classroom_teacherUserId_idx" ON "Classroom"("teacherUserId");

-- CreateIndex
CREATE INDEX "Classroom_organizationId_idx" ON "Classroom"("organizationId");

-- CreateIndex
CREATE INDEX "ClassroomMember_learnerId_idx" ON "ClassroomMember"("learnerId");

-- CreateIndex
CREATE INDEX "Assignment_classroomId_createdAt_idx" ON "Assignment"("classroomId", "createdAt");

