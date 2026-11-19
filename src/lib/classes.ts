import { randomInt } from "node:crypto";
import { Prisma } from "@prisma/client";
import {
  practiceAssignmentFiltersSchema,
  type AssignmentView,
  type ClassroomDashboard,
  type CreateAssignmentRequest,
  type LearnerClassroomsPayload,
  type PracticeAssignmentFilters,
  type TeacherClassroomSummary,
} from "@/lib/contracts/classes";
import { ASSIGNMENT_KIND, CONTEST_SESSION_STATUS, type AssignmentKind } from "@/lib/domain-constants";
import { prisma } from "@/lib/prisma";
import { parseQuestionFilters, questionWhere } from "@/lib/question-filters";

// Teachers create classes; learners (or a guardian on behalf of a child
// profile) join with a code. A teacher sees each member's display name and
// assignment progress, plus class-wide topic results, but never email
// addresses, answers, or per-learner topic detail.

const JOIN_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const MAX_CLASSROOM_MEMBERS = 200;
export const MAX_TEACHER_CLASSROOMS = 50;
export const MAX_CLASSROOM_ASSIGNMENTS = 100;
// Class topic results appear only once they rest on enough attempts.
export const MIN_TOPIC_ATTEMPTS = 10;

type Teacher = { id: string; organizationId: string | null };

export function generateJoinCode() {
  return Array.from({ length: 8 }, () => JOIN_CODE_ALPHABET[randomInt(JOIN_CODE_ALPHABET.length)]).join("");
}

function isUniqueConflict(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

async function withUniqueJoinCode<T>(write: (joinCode: string) => Promise<T>) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      return await write(generateJoinCode());
    } catch (error) {
      if (!isUniqueConflict(error)) throw error;
    }
  }
  throw new Error("Could not allocate a unique class join code.");
}

export function assignmentHref(kind: string, filters: PracticeAssignmentFilters, paperKey: string | null) {
  if (kind === ASSIGNMENT_KIND.CONTEST && paperKey) return `/contest?paper=${encodeURIComponent(paperKey)}`;
  const params = new URLSearchParams(Object.entries(filters).filter(([, value]) => value) as Array<[string, string]>);
  const query = params.toString();
  return query ? `/practice?${query}` : "/practice";
}

function parseFilters(value: string): PracticeAssignmentFilters {
  try {
    const parsed = practiceAssignmentFiltersSchema.safeParse(JSON.parse(value));
    return parsed.success ? parsed.data : {};
  } catch {
    return {};
  }
}

type AssignmentRow = { id: string; title: string; kind: string; filters: string; questionGoal: number; paperKey: string | null; dueAt: Date | null; createdAt: Date };

function assignmentView(row: AssignmentRow): AssignmentView {
  const filters = parseFilters(row.filters);
  return {
    id: row.id,
    title: row.title,
    kind: row.kind as AssignmentKind,
    filters,
    questionGoal: row.questionGoal,
    paperKey: row.paperKey,
    dueAt: row.dueAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    href: assignmentHref(row.kind, filters, row.paperKey),
  };
}

function practiceWhere(filters: PracticeAssignmentFilters) {
  const parsed = parseQuestionFilters(new URLSearchParams(Object.entries(filters).filter(([, value]) => value) as Array<[string, string]>));
  return parsed ? questionWhere(parsed) : null;
}

type Progress = { progress: number; target: number; completed: boolean; bestScore: number | null };

// Progress counts work done after the assignment was set and before it was due.
async function assignmentProgress(assignment: AssignmentRow, learnerIds: string[]): Promise<Map<string, Progress>> {
  const progress = new Map<string, Progress>();
  if (!learnerIds.length) return progress;
  const window = { gte: assignment.createdAt, ...(assignment.dueAt ? { lte: assignment.dueAt } : {}) };
  if (assignment.kind === ASSIGNMENT_KIND.CONTEST && assignment.paperKey) {
    const sessions = await prisma.contestSession.groupBy({
      by: ["learnerId"],
      where: { learnerId: { in: learnerIds }, paperKey: assignment.paperKey, status: CONTEST_SESSION_STATUS.SUBMITTED, submittedAt: window },
      _max: { score: true },
    });
    for (const session of sessions) progress.set(session.learnerId, { progress: 1, target: 1, completed: true, bestScore: session._max.score });
    for (const id of learnerIds) if (!progress.has(id)) progress.set(id, { progress: 0, target: 1, completed: false, bestScore: null });
    return progress;
  }
  const where = practiceWhere(parseFilters(assignment.filters));
  const counts = where ? await prisma.practiceAttempt.groupBy({
    by: ["learnerId"],
    where: { learnerId: { in: learnerIds }, createdAt: window, contestSessionId: null, question: where },
    _count: { _all: true },
  }) : [];
  const byLearner = new Map(counts.map((row) => [row.learnerId, row._count._all]));
  for (const id of learnerIds) {
    const done = Math.min(byLearner.get(id) ?? 0, assignment.questionGoal);
    progress.set(id, { progress: done, target: assignment.questionGoal, completed: done >= assignment.questionGoal, bestScore: null });
  }
  return progress;
}

function summary(row: { id: string; name: string; joinCode: string; archivedAt: Date | null; createdAt: Date; _count: { members: number; assignments: number } }): TeacherClassroomSummary {
  return {
    id: row.id,
    name: row.name,
    joinCode: row.joinCode,
    archived: Boolean(row.archivedAt),
    memberCount: row._count.members,
    assignmentCount: row._count.assignments,
    createdAt: row.createdAt.toISOString(),
  };
}

const summarySelect = {
  id: true, name: true, joinCode: true, archivedAt: true, createdAt: true,
  _count: { select: { members: true, assignments: true } },
} as const;

export async function teacherClassrooms(teacherId: string) {
  const rows = await prisma.classroom.findMany({ where: { teacherUserId: teacherId }, orderBy: { createdAt: "desc" }, select: summarySelect });
  return rows.map(summary);
}

export async function createClassroom(teacher: Teacher, name: string) {
  const owned = await prisma.classroom.count({ where: { teacherUserId: teacher.id, archivedAt: null } });
  if (owned >= MAX_TEACHER_CLASSROOMS) return { status: "LIMIT_REACHED" as const };
  const row = await withUniqueJoinCode((joinCode) => prisma.classroom.create({
    data: { name, joinCode, teacherUserId: teacher.id, organizationId: teacher.organizationId },
    select: summarySelect,
  }));
  return { status: "CREATED" as const, classroom: summary(row) };
}

export async function updateClassroom(teacherId: string, classroomId: string, change: { archived: boolean } | { rotateJoinCode: true }) {
  const owned = await prisma.classroom.findFirst({ where: { id: classroomId, teacherUserId: teacherId }, select: { id: true } });
  if (!owned) return null;
  const row = "archived" in change
    ? await prisma.classroom.update({ where: { id: classroomId }, data: { archivedAt: change.archived ? new Date() : null }, select: summarySelect })
    : await withUniqueJoinCode((joinCode) => prisma.classroom.update({ where: { id: classroomId }, data: { joinCode }, select: summarySelect }));
  return summary(row);
}

export async function joinClassroom(learnerId: string, code: string) {
  return prisma.$transaction(async (transaction) => {
    const classroom = await transaction.classroom.findUnique({ where: { joinCode: code }, select: { id: true, name: true, archivedAt: true, _count: { select: { members: true } } } });
    if (!classroom || classroom.archivedAt) return { status: "NOT_FOUND" as const };
    const existing = await transaction.classroomMember.findUnique({ where: { classroomId_learnerId: { classroomId: classroom.id, learnerId } } });
    if (existing) return { status: "JOINED" as const, classroom: { id: classroom.id, name: classroom.name } };
    if (classroom._count.members >= MAX_CLASSROOM_MEMBERS) return { status: "FULL" as const };
    await transaction.classroomMember.create({ data: { classroomId: classroom.id, learnerId } });
    return { status: "JOINED" as const, classroom: { id: classroom.id, name: classroom.name } };
  });
}

export async function leaveClassroom(learnerId: string, classroomId: string) {
  const removed = await prisma.classroomMember.deleteMany({ where: { classroomId, learnerId } });
  return removed.count > 0;
}

export async function removeClassroomMember(teacherId: string, classroomId: string, learnerId: string) {
  const removed = await prisma.classroomMember.deleteMany({ where: { classroomId, learnerId, classroom: { teacherUserId: teacherId } } });
  return removed.count > 0;
}

export async function createAssignment(teacherId: string, classroomId: string, input: CreateAssignmentRequest) {
  const classroom = await prisma.classroom.findFirst({
    where: { id: classroomId, teacherUserId: teacherId },
    select: { id: true, _count: { select: { assignments: true } } },
  });
  if (!classroom) return { status: "NOT_FOUND" as const };
  if (classroom._count.assignments >= MAX_CLASSROOM_ASSIGNMENTS) return { status: "LIMIT_REACHED" as const };
  if (input.kind === ASSIGNMENT_KIND.CONTEST) {
    const paper = await prisma.contestPaper.findUnique({ where: { key: input.paperKey }, select: { key: true } });
    if (!paper) return { status: "INVALID_PAPER" as const };
  } else if (!practiceWhere(input.filters)) {
    return { status: "INVALID_FILTERS" as const };
  }
  const row = await prisma.assignment.create({
    data: {
      classroomId,
      title: input.title,
      kind: input.kind,
      filters: input.kind === ASSIGNMENT_KIND.PRACTICE ? JSON.stringify(input.filters) : "{}",
      questionGoal: input.kind === ASSIGNMENT_KIND.PRACTICE ? input.questionGoal : 1,
      paperKey: input.kind === ASSIGNMENT_KIND.CONTEST ? input.paperKey : null,
      dueAt: input.dueAt ? new Date(input.dueAt) : null,
    },
  });
  return { status: "CREATED" as const, assignment: assignmentView(row) };
}

export async function deleteAssignment(teacherId: string, classroomId: string, assignmentId: string) {
  const removed = await prisma.assignment.deleteMany({ where: { id: assignmentId, classroomId, classroom: { teacherUserId: teacherId } } });
  return removed.count > 0;
}

export async function classroomDashboard(teacherId: string, classroomId: string): Promise<ClassroomDashboard | null> {
  const classroom = await prisma.classroom.findFirst({
    where: { id: classroomId, teacherUserId: teacherId },
    select: {
      ...summarySelect,
      members: { orderBy: { joinedAt: "asc" }, select: { learnerId: true, joinedAt: true, learner: { select: { displayName: true } } } },
      assignments: { orderBy: { createdAt: "desc" } },
    },
  });
  if (!classroom) return null;
  const learnerIds = classroom.members.map(({ learnerId }) => learnerId);
  const progressByAssignment = new Map<string, Map<string, Progress>>();
  for (const assignment of classroom.assignments) progressByAssignment.set(assignment.id, await assignmentProgress(assignment, learnerIds));

  const topicStats = learnerIds.length ? await prisma.learnerTopicStat.groupBy({
    by: ["tagId"],
    where: { learnerId: { in: learnerIds } },
    _sum: { attempts: true, correct: true },
  }) : [];
  const eligible = topicStats.filter((row) => (row._sum.attempts ?? 0) >= MIN_TOPIC_ATTEMPTS);
  const tags = eligible.length ? await prisma.tag.findMany({ where: { id: { in: eligible.map(({ tagId }) => tagId) } }, select: { id: true, label: true } }) : [];
  const tagLabels = new Map(tags.map((tag) => [tag.id, tag.label]));
  const topics = eligible
    .map((row) => {
      const attempts = row._sum.attempts ?? 0;
      return { label: tagLabels.get(row.tagId) ?? "", attempts, accuracy: Math.round(((row._sum.correct ?? 0) / attempts) * 100) };
    })
    .filter(({ label }) => label)
    .sort((left, right) => left.accuracy - right.accuracy || right.attempts - left.attempts)
    .slice(0, 30);

  return {
    ...summary(classroom),
    members: classroom.members.map((member) => ({
      learnerId: member.learnerId,
      displayName: member.learner.displayName,
      joinedAt: member.joinedAt.toISOString(),
      progress: Object.fromEntries(classroom.assignments.map((assignment) => [assignment.id, progressByAssignment.get(assignment.id)!.get(member.learnerId)!])),
    })),
    assignments: classroom.assignments.map((assignment) => ({
      ...assignmentView(assignment),
      completedCount: [...progressByAssignment.get(assignment.id)!.values()].filter(({ completed }) => completed).length,
    })),
    topics,
  };
}

export async function learnerClassrooms(learnerId: string): Promise<LearnerClassroomsPayload> {
  const memberships = await prisma.classroomMember.findMany({
    where: { learnerId, classroom: { archivedAt: null } },
    orderBy: { joinedAt: "asc" },
    select: {
      joinedAt: true,
      classroom: {
        select: {
          id: true, name: true,
          teacher: { select: { name: true } },
          assignments: { orderBy: [{ dueAt: "asc" }, { createdAt: "desc" }] },
        },
      },
    },
  });
  const classrooms = [];
  for (const { joinedAt, classroom } of memberships) {
    const assignments = [];
    for (const assignment of classroom.assignments) {
      const progress = (await assignmentProgress(assignment, [learnerId])).get(learnerId)!;
      assignments.push({ ...assignmentView(assignment), ...progress });
    }
    classrooms.push({ id: classroom.id, name: classroom.name, teacherName: classroom.teacher.name, joinedAt: joinedAt.toISOString(), assignments });
  }
  return { classrooms };
}
