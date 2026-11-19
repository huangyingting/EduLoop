import { useEffect, useRef } from "react";
import { ignoresPracticeShortcuts, optionIndexForShortcut } from "@/lib/practice-shortcuts";
import { canAdvance, canSubmit, type PracticeAction, type PracticeState } from "./practice-machine";
import type { PracticeActions as Actions } from "./use-practice-session";

// Registers the keyboard shortcuts once and reads the latest state through a
// ref, instead of re-subscribing the window listener on every render.
export function usePracticeShortcuts(
  state: PracticeState,
  dispatch: (action: PracticeAction) => void,
  actions: Actions,
  isAuthenticated: boolean,
) {
  const latest = useRef({ state, actions, isAuthenticated });
  useEffect(() => {
    latest.current = { state, actions, isAuthenticated };
  });

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const { state: current, actions: currentActions, isAuthenticated: signedIn } = latest.current;
      const question = current.question;
      if (!question || current.phase === "loading" || event.repeat || ignoresPracticeShortcuts(event.target)) return;
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      const optionIndex = optionIndexForShortcut(event.key, question.options.length);
      if (optionIndex !== null && current.phase === "answering") {
        event.preventDefault();
        dispatch({ type: "OPTION_TOGGLED", label: question.options[optionIndex].label });
      } else if (event.key === "Enter") {
        event.preventDefault();
        if (canAdvance(current)) void currentActions.nextQuestion();
        else if (canSubmit(current)) void currentActions.submit();
      } else if (event.key.toLowerCase() === "h" && !current.result) {
        event.preventDefault();
        void currentActions.revealHint();
      } else if (event.key.toLowerCase() === "s" && signedIn) {
        event.preventDefault();
        void currentActions.toggleSaved();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [dispatch]);
}
