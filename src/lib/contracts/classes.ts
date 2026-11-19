import { z } from "zod";
import { ASSIGNMENT_KIND, type AssignmentKind } from "@/lib/domain-constants";

const slug = z.string().min(1).max(80).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);

export const practiceAssignmentFiltersSchema = z.object({
  subject: slug.optional(),
  gradeBand: slug.optional(),
  grade: slug.optional(),
  difficulty: z.enum(["EASY", "MEDIUM", "HARD"]).optional(),
  type: z.string().regex(/^[A-Z_]{3,40}$/).optional(),
  // Comma-separated DIMENSION:slug tag filters, as in practice links.
  tags: z.string().max(400).regex(/^[A-Za-z0-9:,_-]*$/).optional(),
}).strict();
export type PracticeAssignmentFilters = z.infer<typeof practiceAssignmentFiltersSchema>;

export const createClassroomSchema = z.object({ name: z.string().trim().min(1).max(60) }).strict();
export const joinClassroomSchema = z.object({ code: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{8}$/) }).strict();
export const leaveClassroomSchema = z.object({ classroomId: z.string().min(1).max(64) }).strict();
export const updateClassroomSchema = z.union([
  z.object({ archived: z.boolean() }).strict(),
  z.object({ rotateJoinCode: z.literal(true) }).strict(),
]);
export const removeMemberSchema = z.object({ learnerId: z.string().min(1).max(64) }).strict();
export const deleteAssignmentSchema = z.object({ assignmentId: z.string().min(1).max(64) }).strict();

export const createAssignmentSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal(ASSIGNMENT_KIND.PRACTICE),
    title: z.string().trim().min(1).max(80),
    filters: practiceAssignmentFiltersSchema,
    questionGoal: z.number().int().min(1).max(50),
    dueAt: z.iso.datetime().nullable(),
  }).strict(),
  z.object({
    kind: z.literal(ASSIGNMENT_KIND.CONTEST),
    title: z.string().trim().min(1).max(80),
    paperKey: z.string().regex(/^[a-z0-9-]{4,40}$/),
    dueAt: z.iso.datetime().nullable(),
  }).strict(),
]);
export type CreateAssignmentRequest = z.infer<typeof createAssignmentSchema>;

export type AssignmentView = {
  id: string;
  title: string;
  kind: AssignmentKind;
  filters: PracticeAssignmentFilters;
  questionGoal: number;
  paperKey: string | null;
  dueAt: string | null;
  createdAt: string;
  // Link that starts the assignment for a learner.
  href: string;
};

export type LearnerAssignmentView = AssignmentView & {
  // Questions answered toward the goal, or 1 when the contest paper is submitted.
  progress: number;
  target: number;
  completed: boolean;
  bestScore: number | null;
};

export type LearnerClassroomsPayload = {
  classrooms: Array<{
    id: string;
    name: string;
    teacherName: string | null;
    joinedAt: string;
    assignments: LearnerAssignmentView[];
  }>;
};

export type TeacherClassroomSummary = {
  id: string;
  name: string;
  joinCode: string;
  archived: boolean;
  memberCount: number;
  assignmentCount: number;
  createdAt: string;
};

export type ClassroomDashboard = TeacherClassroomSummary & {
  members: Array<{
    learnerId: string;
    displayName: string | null;
    joinedAt: string;
    // assignment ID -> progress toward its target
    progress: Record<string, { progress: number; target: number; completed: boolean; bestScore: number | null }>;
  }>;
  assignments: Array<AssignmentView & { completedCount: number }>;
  // Class-wide topic results, shown only with enough attempts to avoid
  // singling out one learner.
  topics: Array<{ label: string; attempts: number; accuracy: number }>;
};
