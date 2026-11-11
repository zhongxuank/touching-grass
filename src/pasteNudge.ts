import * as vscode from "vscode";
import { looksLikePastedChunk, type Step } from "./engine";

/**
 * Gently asks the Learner to type the current Step's Code Chunk when they paste it.
 * Never blocks or undoes the paste, and nudges at most once per Step.
 */
export function registerPasteNudge(getCurrentStep: () => Step | undefined): vscode.Disposable {
  const nudged = new WeakSet<Step>();
  return vscode.workspace.onDidChangeTextDocument((event) => {
    const step = getCurrentStep();
    if (!step || nudged.has(step) || event.contentChanges.length !== 1) return;
    if (!looksLikePastedChunk(event.contentChanges[0]!.text, step.codeChunk)) return;
    nudged.add(step);
    void vscode.window.showInformationMessage("Try typing this one yourself, that's how it sticks.");
  });
}
