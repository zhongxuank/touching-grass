import * as vscode from "vscode";
import { formatValidationError, loadTrack, type Step, type TrackSession } from "./engine";
import { registerPasteNudge } from "./pasteNudge";
import { renderStepHtml } from "./stepHtml";
import { TrackTree } from "./trackTree";

export function activate(context: vscode.ExtensionContext): void {
  const tree = new TrackTree();
  let session: TrackSession | undefined;
  let panel: vscode.WebviewPanel | undefined;
  let currentStep: Step | undefined;

  const showStep = (step: Step) => {
    currentStep = step;
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
    registerPasteNudge(() => currentStep),
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
      currentStep = undefined;
      tree.setTrack(session.track);
      await vscode.commands.executeCommand("touchingGrass.track.focus");
      return { title: session.track.title, lessons: session.track.lessons.length };
    }),
    vscode.commands.registerCommand("touchingGrass.openStep", (stepId: string) => {
      const step = session?.getStep(stepId);
      if (step) showStep(step);
      return step?.title;
    }),
  );
}

export function deactivate(): void {}
