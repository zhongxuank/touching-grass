import * as vscode from "vscode";
import { formatValidationError, loadTrack, type Step, type TrackSession } from "./engine";
import { registerPasteNudge } from "./pasteNudge";
import { renderReflectionHtml, renderStepHtml, renderTrackHtml } from "./stepHtml";
import { TrackTree } from "./trackTree";

export function activate(context: vscode.ExtensionContext): void {
  const tree = new TrackTree();
  let session: TrackSession | undefined;
  let panel: vscode.WebviewPanel | undefined;
  let currentStep: Step | undefined;

  /** Show one panel, reused for Steps, Reflections and the Track overview. */
  const showPanel = (title: string, body: string) => {
    if (!panel) {
      panel = vscode.window.createWebviewPanel("touchingGrass.step", title, vscode.ViewColumn.Beside, {});
      panel.onDidDispose(() => (panel = undefined), null, context.subscriptions);
    }
    panel.title = title;
    panel.webview.html = `<!doctype html><html><head><meta charset="utf-8">
<style>
  body { font-family: var(--vscode-font-family); padding: 1rem 1.5rem; line-height: 1.5; }
  pre { padding: 0.75rem; overflow-x: auto; background: var(--vscode-textCodeBlock-background); }
  .target-file { opacity: 0.8; }
  .habit-callout { border-left: 3px solid var(--vscode-textLink-foreground); padding: 0.25rem 0.75rem; margin: 1rem 0; }
  .reflection-note { opacity: 0.8; font-style: italic; }
</style></head><body>${body}</body></html>`;
  };

  const showStep = (step: Step) => {
    currentStep = step;
    showPanel(step.title, renderStepHtml(step));
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
    vscode.commands.registerCommand("touchingGrass.openReflection", (lessonId: string) => {
      const lesson = session?.track.lessons.find((l) => l.id === lessonId);
      if (lesson) showPanel(`Reflection: ${lesson.title}`, renderReflectionHtml(lesson));
      return lesson?.title;
    }),
    vscode.commands.registerCommand("touchingGrass.openTrackOverview", () => {
      if (session) showPanel(session.track.title, renderTrackHtml(session.track));
      return session?.track.title;
    }),
  );
}

export function deactivate(): void {}
