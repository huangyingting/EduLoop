-- AlterTable
ALTER TABLE "User" ADD COLUMN     "organizationId" TEXT;

-- CreateTable
CREATE TABLE "Organization" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "entraTenantId" TEXT,
    "retentionDays" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrganizationDomain" (
    "domain" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,

    CONSTRAINT "OrganizationDomain_pkey" PRIMARY KEY ("domain")
);

-- CreateTable
CREATE TABLE "Classroom" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "joinCode" TEXT NOT NULL,
    "teacherUserId" TEXT NOT NULL,
    "organizationId" TEXT,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Classroom_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClassroomMember" (
    "classroomId" TEXT NOT NULL,
    "learnerId" TEXT NOT NULL,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClassroomMember_pkey" PRIMARY KEY ("classroomId","learnerId")
);

-- CreateTable
CREATE TABLE "Assignment" (
    "id" TEXT NOT NULL,
    "classroomId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "filters" TEXT NOT NULL DEFAULT '{}',
    "questionGoal" INTEGER NOT NULL DEFAULT 10,
    "paperKey" TEXT,
    "dueAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Assignment_pkey" PRIMARY KEY ("id")
);

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

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizationDomain" ADD CONSTRAINT "OrganizationDomain_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Classroom" ADD CONSTRAINT "Classroom_teacherUserId_fkey" FOREIGN KEY ("teacherUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Classroom" ADD CONSTRAINT "Classroom_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassroomMember" ADD CONSTRAINT "ClassroomMember_classroomId_fkey" FOREIGN KEY ("classroomId") REFERENCES "Classroom"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassroomMember" ADD CONSTRAINT "ClassroomMember_learnerId_fkey" FOREIGN KEY ("learnerId") REFERENCES "LearnerProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assignment" ADD CONSTRAINT "Assignment_classroomId_fkey" FOREIGN KEY ("classroomId") REFERENCES "Classroom"("id") ON DELETE CASCADE ON UPDATE CASCADE;

