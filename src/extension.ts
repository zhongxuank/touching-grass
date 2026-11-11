import * as vscode from "vscode";
import { formatValidationError, loadTrack, type Step, type TrackSession } from "./engine";
import { showValidationErrors } from "./diagnostics";
import { renderStepHtml } from "./stepHtml";
import { TrackTree } from "./trackTree";

export function activate(context: vscode.ExtensionContext): void {
  const tree = new TrackTree();
  let session: TrackSession | undefined;
  let panel: vscode.WebviewPanel | undefined;
  const problems = vscode.languages.createDiagnosticCollection("touching-grass");

  const showStep = (step: Step) => {
    if (!panel) {
      panel = vscode.window.createWebviewPanel("touchingGrass.step", step.title, vscode.ViewColumn.Beside, {});
      panel.onDidDispose(() => (panel = undefined), null, context.subscriptions);
    }
    panel.title = step.title;
    panel.webview.html = `<!doctype html><html><head><meta charset="utf-8">
<style>
  body { font-family: var(--vscode-font-family); padding: 1rem 1.5rem; line-height: 1.5; }
  pre { padding: 0.75rem; overflow-x: auto; background: var(--vscode-textCodeBlock-background); }
  .target-file { opacity: 0.8; }
</style></head><body>${renderStepHtml(step)}</body></html>`;
  };

  context.subscriptions.push(
    vscode.window.registerTreeDataProvider("touchingGrass.track", tree),
    vscode.commands.registerCommand("touchingGrass.openTrack", async (folder?: vscode.Uri) => {
      const uri =
        folder ??
        (await vscode.window.showOpenDialog({
          canSelectFolders: true,
          canSelectFiles: false,
          canSelectMany: false,
          openLabel: "Open Track",
        }))?.[0];
      if (!uri) return undefined;
      const result = await loadTrack(uri.fsPath);
      if (!result.ok) {
        void vscode.window.showErrorMessage(
          `Cannot open Track:\n${result.errors.map(formatValidationError).join("\n")}`,
        );
        return undefined;
      }
      session = result.session;
      tree.setTrack(session.track);
      await vscode.commands.executeCommand("touchingGrass.track.focus");
      return { title: session.track.title, lessons: session.track.lessons.length };
    }),
    vscode.commands.registerCommand("touchingGrass.openStep", (stepId: string) => {
      const step = session?.getStep(stepId);
      if (step) showStep(step);
      return step?.title;
    }),
    problems,
    vscode.commands.registerCommand("touchingGrass.validateTrack", async (folder?: vscode.Uri) => {
      const uri =
        folder ??
        (await vscode.window.showOpenDialog({
          canSelectFolders: true,
          canSelectFiles: false,
          canSelectMany: false,
          openLabel: "Validate Track",
        }))?.[0];
      if (!uri) return undefined;
      const result = await loadTrack(uri.fsPath);
      if (result.ok) {
        problems.clear();
        const { track } = result.session;
        const steps = track.lessons.reduce((count, lesson) => count + lesson.steps.length, 0);
        void vscode.window.showInformationMessage(
          `Track "${track.title}" is valid: ${track.lessons.length} Lessons, ${steps} Steps.`,
        );
        return { ok: true, lessons: track.lessons.length, steps };
      }
      showValidationErrors(problems, uri.fsPath, result.errors);
      await vscode.commands.executeCommand("workbench.actions.view.problems");
      void vscode.window.showErrorMessage(
        `Track has ${result.errors.length} problem(s). Open the Problems panel to see each one with its file and line.`,
      );
      return { ok: false, errors: result.errors.map(formatValidationError) };
    }),
  );
}

export function deactivate(): void {}
