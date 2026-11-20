import type { AttemptResult, HintPayload, QuestionPayload, SessionSnapshot } from "@/lib/contracts/practice";
import { DEFAULT_QUESTION_GOAL, PRACTICE_SESSION_STATUS, QUESTION_TYPE } from "@/lib/domain-constants";

// The practice player as a pure state machine:
// loading -> answering -> submitting -> reviewing (-> assessing) -> loading ...
// Network effects live in usePracticeSession; this module only decides state.

export type PracticePhase = "loading" | "answering" | "submitting" | "reviewing" | "assessing" | "failed";

const RECENT_QUESTION_MEMORY = 8;

export type PracticeState = {
  phase: PracticePhase;
  question: QuestionPayload | null;
  selected: string[];
  written: string;
  result: AttemptResult | null;
  // A load failure replaces the question; an action failure keeps it.
  loadError: string;
  actionError: string;
  goal: number;
  completed: number;
  correct: number;
  combo: number;
  recent: string[];
  // Revealed hint steps; kind tells whether they are question-specific hints
  // or the generic solving strategy.
  hint: { items: string[]; kind: HintPayload["kind"] | null; total: number; loading: boolean; error: string };
  report: { open: boolean; category: string; detail: string; submitting: boolean; submitted: boolean };
  saving: boolean;
};

export type PracticeAction =
  | { type: "LOAD_STARTED" }
  | { type: "LOAD_SUCCEEDED"; question: QuestionPayload }
  | { type: "LOAD_FAILED"; message: string }
  | { type: "OPTION_TOGGLED"; label: string }
  | { type: "WRITTEN_CHANGED"; text: string }
  | { type: "SUBMIT_STARTED" }
  | { type: "SUBMIT_SUCCEEDED"; result: AttemptResult }
  | { type: "ACTION_FAILED"; message: string }
  | { type: "ASSESS_STARTED" }
  | { type: "ASSESS_SUCCEEDED"; isCorrect: boolean }
  | { type: "SESSION_SYNCED"; session: SessionSnapshot | null }
  | { type: "ROUND_RESET" }
  | { type: "HINT_STARTED" }
  | { type: "HINT_SUCCEEDED"; hint: HintPayload }
  | { type: "HINT_FAILED"; message: string }
  | { type: "SAVE_STARTED" }
  | { type: "SAVE_FINISHED"; saved: boolean | null }
  | { type: "REPORT_TOGGLED" }
  | { type: "REPORT_CHANGED"; category?: string; detail?: string }
  | { type: "REPORT_STARTED" }
  | { type: "REPORT_FINISHED"; submitted: boolean };

const emptyHint: PracticeState["hint"] = { items: [], kind: null, total: 0, loading: false, error: "" };
const emptyReport = { open: false, category: "UNCLEAR", detail: "", submitting: false, submitted: false };

export function initialPracticeState(goal = DEFAULT_QUESTION_GOAL): PracticeState {
  return {
    phase: "loading",
    question: null,
    selected: [],
    written: "",
    result: null,
    loadError: "",
    actionError: "",
    goal,
    completed: 0,
    correct: 0,
    combo: 0,
    recent: [],
    hint: emptyHint,
    report: emptyReport,
    saving: false,
  };
}

export function canSubmit(state: PracticeState) {
  if (state.phase !== "answering" || !state.question) return false;
  return state.question.options.length ? state.selected.length > 0 : state.written.trim().length > 0;
}

// Hints are progressive; the generic strategy is a single step.
export function canRequestHint(state: PracticeState) {
  if (state.phase !== "answering" || !state.question || state.hint.loading) return false;
  if (!state.hint.items.length) return true;
  return state.hint.kind === "HINT" && state.hint.items.length < state.hint.total;
}

export function hintsUsed(state: PracticeState) {
  return state.hint.kind === "HINT" ? state.hint.items.length : 0;
}

export function canAdvance(state: PracticeState) {
  return state.phase === "reviewing" && state.result?.isCorrect !== null;
}

export function roundComplete(state: PracticeState) {
  return state.completed >= state.goal;
}

function scored(state: PracticeState, isCorrect: boolean | null) {
  if (isCorrect === true) return { correct: state.correct + 1, combo: state.combo + 1 };
  if (isCorrect === false) return { correct: state.correct, combo: 0 };
  return { correct: state.correct, combo: state.combo };
}

export function practiceReducer(state: PracticeState, action: PracticeAction): PracticeState {
  switch (action.type) {
    case "LOAD_STARTED":
      return {
        ...state,
        phase: "loading",
        question: null,
        selected: [],
        written: "",
        result: null,
        loadError: "",
        actionError: "",
        hint: emptyHint,
        report: emptyReport,
      };
    case "LOAD_SUCCEEDED":
      return {
        ...state,
        phase: "answering",
        question: action.question,
        recent: [...state.recent.slice(-(RECENT_QUESTION_MEMORY - 1)), action.question.id],
      };
    case "LOAD_FAILED":
      return { ...state, phase: "failed", loadError: action.message };
    case "OPTION_TOGGLED": {
      if (state.phase !== "answering" || !state.question) return state;
      if (state.question.type !== QUESTION_TYPE.MULTIPLE_CHOICE) return { ...state, selected: [action.label] };
      const selected = state.selected.includes(action.label)
        ? state.selected.filter((label) => label !== action.label)
        : [...state.selected, action.label];
      return { ...state, selected };
    }
    case "WRITTEN_CHANGED":
      return state.phase === "answering" ? { ...state, written: action.text } : state;
    case "SUBMIT_STARTED":
      return canSubmit(state) ? { ...state, phase: "submitting", actionError: "" } : state;
    case "SUBMIT_SUCCEEDED": {
      const { session } = action.result;
      // A signed-in session is authoritative; guests and detached attempts
      // (another device restarted the session) count locally.
      const progress = session
        ? { goal: session.questionGoal, completed: session.completedCount, correct: session.correctCount, combo: scored(state, action.result.isCorrect).combo }
        : { completed: state.completed + 1, ...scored(state, action.result.isCorrect) };
      return { ...state, ...progress, phase: "reviewing", result: action.result };
    }
    case "ACTION_FAILED":
      return {
        ...state,
        phase: state.phase === "submitting" ? "answering" : state.phase === "assessing" ? "reviewing" : state.phase,
        actionError: action.message,
        saving: false,
        report: { ...state.report, submitting: false },
      };
    case "ASSESS_STARTED":
      return state.phase === "reviewing" && state.result?.isCorrect === null ? { ...state, phase: "assessing", actionError: "" } : state;
    case "ASSESS_SUCCEEDED":
      if (!state.result) return state;
      return {
        ...state,
        ...scored(state, action.isCorrect),
        phase: "reviewing",
        result: { ...state.result, isCorrect: action.isCorrect },
      };
    case "SESSION_SYNCED":
      if (!action.session) return state;
      return {
        ...state,
        goal: action.session.questionGoal,
        ...(action.session.resumed ? {
          completed: action.session.completedCount,
          correct: action.session.correctCount,
          recent: action.session.recentQuestionIds.slice(0, RECENT_QUESTION_MEMORY),
        } : {}),
      };
    case "ROUND_RESET":
      return { ...state, completed: 0, correct: 0, combo: 0, recent: [] };
    case "HINT_STARTED":
      return { ...state, hint: { ...state.hint, loading: true, error: "" } };
    case "HINT_SUCCEEDED":
      return {
        ...state,
        hint: { items: [...state.hint.items, action.hint.hint], kind: action.hint.kind, total: action.hint.total, loading: false, error: "" },
      };
    case "HINT_FAILED":
      return { ...state, hint: { ...state.hint, loading: false, error: action.message } };
    case "SAVE_STARTED":
      return { ...state, saving: true, actionError: "" };
    case "SAVE_FINISHED":
      return {
        ...state,
        saving: false,
        question: state.question && action.saved !== null ? { ...state.question, isSaved: action.saved } : state.question,
      };
    case "REPORT_TOGGLED":
      return { ...state, report: { ...state.report, open: !state.report.open } };
    case "REPORT_CHANGED":
      return {
        ...state,
        report: {
          ...state.report,
          ...(action.category !== undefined ? { category: action.category } : {}),
          ...(action.detail !== undefined ? { detail: action.detail } : {}),
        },
      };
    case "REPORT_STARTED":
      return { ...state, actionError: "", report: { ...state.report, submitting: true } };
    case "REPORT_FINISHED":
      return {
        ...state,
        report: { ...state.report, submitting: false, submitted: action.submitted, open: action.submitted ? false : state.report.open },
      };
  }
}

export function sessionCompleted(result: AttemptResult | null) {
  return result?.session?.status === PRACTICE_SESSION_STATUS.COMPLETED;
}
