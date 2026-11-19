import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { POST as createAttempt } from "@/app/api/attempts/route";
import { POST as createAssignment } from "@/app/api/classes/[id]/assignments/route";
import { DELETE as removeMember } from "@/app/api/classes/[id]/members/route";
import { GET as getDashboard, PATCH as updateClass } from "@/app/api/classes/[id]/route";
import { DELETE as leaveClass, POST as joinClass } from "@/app/api/classes/join/route";
import { GET as getClasses, POST as createClass } from "@/app/api/classes/route";
import { GET as exportAccount } from "@/app/api/learner/export/route";
import { assignOrganizationOnSignIn, cleanupOrganizationRetention } from "@/lib/organizations";
import { prisma } from "@/lib/prisma";
import { authCookie, createCatalogFixture, createChoiceQuestion, createConsentingUser, integrationHeaders, jsonRequest, type CatalogFixture } from "./fixtures";

const prefix = "classroom-flow";
const teacherId = `${prefix}-teacher`;
const studentId = `${prefix}-student`;
const otherTeacherId = `${prefix}-other-teacher`;
const staleId = `${prefix}-stale`;
const tenant = "11111111-2222-4333-8444-555555555555";
let catalog: CatalogFixture;
let classroomId = "";
let joinCode = "";

function context(id: string) {
  return { params: Promise.resolve({ id }) };
}

function get(url: string, cookie: string) {
  return new NextRequest(url, { headers: { ...integrationHeaders, cookie } });
}

beforeAll(async () => {
  catalog = await createCatalogFixture(prefix);
  for (let index = 0; index < 3; index += 1) await createChoiceQuestion(catalog, `${prefix}-question-${index}`);
  await createConsentingUser(teacherId);
  await createConsentingUser(studentId);
  await createConsentingUser(otherTeacherId);
  await prisma.user.updateMany({ where: { id: { in: [teacherId, otherTeacherId] } }, data: { role: "TEACHER" } });
});

afterAll(async () => {
  await prisma.user.deleteMany({ where: { id: { in: [teacherId, studentId, otherTeacherId, staleId] } } });
  await prisma.organization.deleteMany({ where: { slug: prefix } });
  await catalog.cleanup();
  await prisma.rateLimitBucket.deleteMany();
  await prisma.$disconnect();
});

describe("classes and assignments", () => {
  it("lets only teachers create classes", async () => {
    const studentCookie = await authCookie(studentId);
    expect((await createClass(jsonRequest("http://localhost/api/classes", "POST", { name: "7A" }, studentCookie))).status).toBe(403);
    const created = await createClass(jsonRequest("http://localhost/api/classes", "POST", { name: "Grade 7A" }, await authCookie(teacherId)));
    expect(created.status).toBe(201);
    const classroom = await created.json();
    classroomId = classroom.id;
    joinCode = classroom.joinCode;
    expect(joinCode).toMatch(/^[A-Z0-9]{8}$/);
  });

  it("joins with the code, tracks assignment progress, and shows the dashboard only to the owner", async () => {
    const teacherCookie = await authCookie(teacherId);
    const studentCookie = await authCookie(studentId);
    expect((await joinClass(jsonRequest("http://localhost/api/classes/join", "POST", { code: "ZZZZZZZZ" }, studentCookie))).status).toBe(404);
    expect(await (await joinClass(jsonRequest("http://localhost/api/classes/join", "POST", { code: joinCode.toLowerCase() }, studentCookie))).json())
      .toEqual({ id: classroomId, name: "Grade 7A" });

    const assignment = await createAssignment(jsonRequest(`http://localhost/api/classes/${classroomId}/assignments`, "POST", {
      kind: "PRACTICE", title: "Warm-up", filters: { subject: `${prefix}-subject` }, questionGoal: 2, dueAt: null,
    }, teacherCookie), context(classroomId));
    expect(assignment.status).toBe(201);
    const { id: assignmentId, href } = await assignment.json();
    expect(href).toBe(`/practice?subject=${prefix}-subject`);
    expect((await createAssignment(jsonRequest(`http://localhost/api/classes/${classroomId}/assignments`, "POST", {
      kind: "CONTEST", title: "Paper", paperKey: "no-such-paper", dueAt: null,
    }, teacherCookie), context(classroomId))).status).toBe(400);

    await createAttempt(jsonRequest("http://localhost/api/attempts", "POST", { questionId: `${prefix}-question-0`, response: ["B"], clientAttemptId: crypto.randomUUID() }, studentCookie));
    const learnerView = await (await getClasses(get("http://localhost/api/classes", studentCookie))).json();
    expect(learnerView.teaching).toBeNull();
    expect(learnerView.classrooms[0].assignments[0]).toMatchObject({ id: assignmentId, progress: 1, target: 2, completed: false });

    await createAttempt(jsonRequest("http://localhost/api/attempts", "POST", { questionId: `${prefix}-question-1`, response: ["A"], clientAttemptId: crypto.randomUUID() }, studentCookie));
    const dashboard = await (await getDashboard(get(`http://localhost/api/classes/${classroomId}`, teacherCookie), context(classroomId))).json();
    expect(dashboard.members).toEqual([expect.objectContaining({ displayName: null, progress: { [assignmentId]: { progress: 2, target: 2, completed: true, bestScore: null } } })]);
    expect(dashboard.assignments[0]).toMatchObject({ completedCount: 1 });
    expect(JSON.stringify(dashboard)).not.toContain("@example.com");

    expect((await getDashboard(get(`http://localhost/api/classes/${classroomId}`, await authCookie(otherTeacherId)), context(classroomId))).status).toBe(404);
  });

  it("rotates codes, archives classes, and exports memberships and classes taught", async () => {
    const teacherCookie = await authCookie(teacherId);
    const rotated = await (await updateClass(jsonRequest(`http://localhost/api/classes/${classroomId}`, "PATCH", { rotateJoinCode: true }, teacherCookie), context(classroomId))).json();
    expect(rotated.joinCode).not.toBe(joinCode);
    const studentExport = JSON.parse(await (await exportAccount(get("http://localhost/api/learner/export", await authCookie(studentId)))).text());
    expect(JSON.stringify(studentExport)).toContain("Grade 7A");
    const teacherExport = JSON.parse(await (await exportAccount(get("http://localhost/api/learner/export", teacherCookie))).text());
    expect(JSON.stringify(teacherExport)).toContain(rotated.joinCode);
    await updateClass(jsonRequest(`http://localhost/api/classes/${classroomId}`, "PATCH", { archived: true }, teacherCookie), context(classroomId));
    expect((await joinClass(jsonRequest("http://localhost/api/classes/join", "POST", { code: rotated.joinCode }, await authCookie(otherTeacherId)))).status).toBe(404);
  });

  it("lets learners leave and teachers remove members", async () => {
    const teacherCookie = await authCookie(teacherId);
    const learner = await prisma.learnerProfile.findUniqueOrThrow({ where: { userId: studentId } });
    expect((await removeMember(jsonRequest(`http://localhost/api/classes/${classroomId}/members`, "DELETE", { learnerId: learner.id }, await authCookie(otherTeacherId)), context(classroomId))).status).toBe(404);
    expect((await removeMember(jsonRequest(`http://localhost/api/classes/${classroomId}/members`, "DELETE", { learnerId: learner.id }, teacherCookie), context(classroomId))).status).toBe(200);
    expect((await leaveClass(jsonRequest("http://localhost/api/classes/join", "DELETE", { classroomId }, await authCookie(studentId)))).status).toBe(404);
  });
});

describe("organizations", () => {
  it("joins accounts through verified institutional claims and applies retention", async () => {
    const organization = await prisma.organization.create({ data: { slug: prefix, name: "Classroom School", entraTenantId: tenant, retentionDays: 90, domains: { create: { domain: "classroom-school.example" } } } });
    expect(await assignOrganizationOnSignIn(studentId, "google", { email_verified: true, hd: "classroom-school.example" }, `${studentId}@example.com`)).toBeNull();
    expect(await assignOrganizationOnSignIn(studentId, "microsoft-entra-id", { tid: tenant }, "anything@else.example")).toBe(organization.id);

    const old = new Date(Date.now() - 200 * 24 * 60 * 60_000);
    await prisma.user.create({ data: { id: staleId, email: `${staleId}@example.com`, organizationId: organization.id, createdAt: old, learner: { create: { lastActiveOn: "2020-01-01" } } } });
    await prisma.$executeRaw`UPDATE "User" SET "updatedAt" = ${old} WHERE "id" = ${staleId}`;
    await prisma.$executeRaw`UPDATE "LearnerProfile" SET "updatedAt" = ${old} WHERE "userId" = ${staleId}`;
    const deleted = await cleanupOrganizationRetention(new Date());
    expect(deleted[prefix]).toBe(1);
    expect(await prisma.user.findUnique({ where: { id: staleId } })).toBeNull();
    expect(await prisma.user.findUnique({ where: { id: studentId } })).not.toBeNull();
  });
});
