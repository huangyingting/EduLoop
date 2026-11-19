import { describe, expect, it } from "vitest";
import type { AttemptResult, QuestionPayload } from "@/lib/contracts/practice";
import { canAdvance, canRequestHint, canSubmit, hintsUsed, initialPracticeState, practiceReducer, roundComplete, type PracticeAction, type PracticeState } from "./practice-machine";

function question(overrides: Partial<QuestionPayload> = {}): QuestionPayload {
  return {
    id: "question-1", stem: "1 + 1 = ?", type: "SINGLE_CHOICE", typeLabel: "单项选择", difficulty: "EASY",
    isAutoGradable: true, hasHint: true, hintCount: 1, subject: { name: "数学", slug: "math", color: "#000" }, grade: "一年级",
    stemAsset: null, options: [{ label: "A", content: "1", asset: null }, { label: "B", content: "2", asset: null }],
    tags: [], isSaved: false, recommendationReason: null, history: null, ...overrides,
  };
}

function result(overrides: Partial<AttemptResult> = {}): AttemptResult {
  return {
    attemptId: "attempt-1", isCorrect: true, correctLabels: ["B"], answer: "B", explanation: null, earnedXp: 10,
    totalXp: 10, level: 1, currentStreak: 1, streakFreezes: 1, streakFreezeUsed: false, todayAttempts: 1,
    newBadges: [], session: null, replayed: false, persisted: false, ...overrides,
  };
}

function run(actions: PracticeAction[], state = initialPracticeState()): PracticeState {
  return actions.reduce(practiceReducer, state);
}

const loaded = (payload = question()): PracticeAction[] => [{ type: "LOAD_STARTED" }, { type: "LOAD_SUCCEEDED", question: payload }];

describe("practice state machine", () => {
  it("submits only an answered question and counts guest progress locally", () => {
    let state = run(loaded());
    expect(canSubmit(state)).toBe(false);
    state = run([{ type: "OPTION_TOGGLED", label: "B" }, { type: "SUBMIT_STARTED" }], state);
    expect(state.phase).toBe("submitting");
    expect(run([{ type: "OPTION_TOGGLED", label: "A" }], state).selected).toEqual(["B"]);
    state = run([{ type: "SUBMIT_SUCCEEDED", result: result() }], state);
    expect(state).toMatchObject({ phase: "reviewing", completed: 1, correct: 1, combo: 1, recent: ["question-1"] });
    expect(canAdvance(state)).toBe(true);
  });

  it("toggles multiple-choice selections and replaces single-choice ones", () => {
    const multiple = run([...loaded(question({ type: "MULTIPLE_CHOICE" })), { type: "OPTION_TOGGLED", label: "A" }, { type: "OPTION_TOGGLED", label: "B" }, { type: "OPTION_TOGGLED", label: "A" }]);
    expect(multiple.selected).toEqual(["B"]);
    const single = run([...loaded(), { type: "OPTION_TOGGLED", label: "A" }, { type: "OPTION_TOGGLED", label: "B" }]);
    expect(single.selected).toEqual(["B"]);
  });

  it("treats the signed-in session as authoritative for progress and goal", () => {
    const state = run([...loaded(), { type: "OPTION_TOGGLED", label: "A" }, { type: "SUBMIT_STARTED" }, {
      type: "SUBMIT_SUCCEEDED",
      result: result({ isCorrect: false, session: { id: "s", status: "ACTIVE", questionGoal: 12, completedCount: 5, correctCount: 3, earnedXp: 40 } }),
    }]);
    expect(state).toMatchObject({ goal: 12, completed: 5, correct: 3, combo: 0 });
  });

  it("resumes an existing session and clears progress on a new round", () => {
    const resumed = run([{
      type: "SESSION_SYNCED",
      session: { id: "s", status: "ACTIVE", questionGoal: 10, completedCount: 4, correctCount: 2, earnedXp: 20, recentQuestionIds: ["a", "b"], resumed: true },
    }]);
    expect(resumed).toMatchObject({ completed: 4, correct: 2, recent: ["a", "b"] });
    const fresh = run([{
      type: "SESSION_SYNCED",
      session: { id: "s2", status: "ACTIVE", questionGoal: 10, completedCount: 0, correctCount: 0, earnedXp: 0, recentQuestionIds: [], resumed: false },
    }], resumed);
    expect(fresh.completed).toBe(4);
    expect(run([{ type: "ROUND_RESET" }], resumed)).toMatchObject({ completed: 0, correct: 0, combo: 0, recent: [] });
  });

  it("requires self-assessment before advancing past a written answer", () => {
    let state = run([...loaded(question({ options: [], type: "WRITTEN_RESPONSE", isAutoGradable: false })), { type: "WRITTEN_CHANGED", text: "思路" }, { type: "SUBMIT_STARTED" }, { type: "SUBMIT_SUCCEEDED", result: result({ isCorrect: null }) }]);
    expect(canAdvance(state)).toBe(false);
    state = run([{ type: "ASSESS_STARTED" }], state);
    expect(state.phase).toBe("assessing");
    state = run([{ type: "ASSESS_SUCCEEDED", isCorrect: true }], state);
    expect(state).toMatchObject({ phase: "reviewing", correct: 1, combo: 1, result: { isCorrect: true } });
    expect(canAdvance(state)).toBe(true);
  });

  it("returns to the previous phase after a failed action and keeps the question", () => {
    const state = run([...loaded(), { type: "OPTION_TOGGLED", label: "B" }, { type: "SUBMIT_STARTED" }, { type: "ACTION_FAILED", message: "答案提交失败" }]);
    expect(state).toMatchObject({ phase: "answering", actionError: "答案提交失败", question: { id: "question-1" } });
    const failedLoad = run([{ type: "LOAD_STARTED" }, { type: "LOAD_FAILED", message: "题目加载失败" }]);
    expect(failedLoad).toMatchObject({ phase: "failed", loadError: "题目加载失败", question: null });
  });

  it("detects a finished round from the goal", () => {
    const state = { ...initialPracticeState(3), completed: 3 };
    expect(roundComplete(state)).toBe(true);
    expect(roundComplete({ ...state, completed: 2 })).toBe(false);
  });

  it("remembers only the most recent eight questions", () => {
    const state = Array.from({ length: 10 }, (_, index) => question({ id: `q${index}` }))
      .reduce((current, payload) => run(loaded(payload), current), initialPracticeState());
    expect(state.recent).toEqual(["q2", "q3", "q4", "q5", "q6", "q7", "q8", "q9"]);
  });

  it("tracks hint, save, and report sub-states", () => {
    let state = run([...loaded(), { type: "HINT_STARTED" }, { type: "HINT_SUCCEEDED", hint: { kind: "HINT", hint: "先列式", step: 0, total: 2 } }]);
    expect(state.hint).toEqual({ items: ["先列式"], kind: "HINT", total: 2, loading: false, error: "" });
    expect(canRequestHint(state)).toBe(true);
    expect(hintsUsed(state)).toBe(1);
    const strategy = run([...loaded(), { type: "HINT_SUCCEEDED", hint: { kind: "STRATEGY", hint: "通用策略", step: 0, total: 0 } }]);
    expect(canRequestHint(strategy)).toBe(false);
    expect(hintsUsed(strategy)).toBe(0);
    state = run([{ type: "SAVE_STARTED" }, { type: "SAVE_FINISHED", saved: true }], state);
    expect(state).toMatchObject({ saving: false, question: { isSaved: true } });
    state = run([{ type: "REPORT_TOGGLED" }, { type: "REPORT_CHANGED", category: "WRONG_ANSWER", detail: "答案不对" }, { type: "REPORT_STARTED" }, { type: "REPORT_FINISHED", submitted: true }], state);
    expect(state.report).toMatchObject({ open: false, submitted: true, category: "WRONG_ANSWER" });
  });
});
