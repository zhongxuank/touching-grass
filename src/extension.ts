import * as vscode from "vscode";
import { formatValidationError, loadTrack, type Step, type TrackSession } from "./engine";
import { randomBytes } from "node:crypto";
import { showValidationErrors } from "./diagnostics";
import { registerPasteNudge } from "./pasteNudge";
import { renderPanelDocument, renderReflectionDocument, renderTrackDocument, type PanelState } from "./stepHtml";
import { TrackTree } from "./trackTree";

export function activate(context: vscode.ExtensionContext): void {
  const tree = new TrackTree();
  let session: TrackSession | undefined;
  let panel: vscode.WebviewPanel | undefined;
  const problems = vscode.languages.createDiagnosticCollection("touching-grass");

  let current: Step | undefined;
  let results: PanelState["results"];
  let message: string | undefined;

  const chooseWorkspace = async (): Promise<string | undefined> => {
    const picked = (
      await vscode.window.showOpenDialog({
        canSelectFolders: true,
        canSelectFiles: false,
        canSelectMany: false,
        openLabel: "Use as agent workspace",
      })
    )?.[0];
    if (picked && session) session.setWorkspace(picked.fsPath);
    return picked?.fsPath;
  };

  const onPanelMessage = async (msg: { action: string; check?: string }) => {
    if (!session || !current) return;
    const step = current;
    if (msg.action === "runChecks") {
      if (!session.getWorkspace() && !(await chooseWorkspace())) {
        message = "Choose your agent workspace to run Checks.";
        return render();
      }
      const outcome = await session.runChecks(step.id);
      results = outcome.status === "ran" ? outcome.results : undefined;
      message = outcome.status === "tooling-missing" ? outcome.message : undefined;
      render();
    } else if (msg.action === "markDone") {
      session.markDone(step.id);
      render();
    } else if (msg.action === "next") {
      const next = session.advance(step.id);
      if (next) showStep(next);
    } else if (msg.action === "openCheck" && msg.check && step.checks.includes(msg.check)) {
      await vscode.window.showTextDocument(vscode.Uri.file(session.checkFilePath(msg.check)), {
        viewColumn: vscode.ViewColumn.One,
        preview: true,
      });
    }
  };

  /** The one panel, reused for Steps, Reflections and the Track overview. */
  const showDocument = (title: string, document: (nonce: string, cspSource: string) => string) => {
    if (!panel) {
      panel = vscode.window.createWebviewPanel("touchingGrass.step", title, vscode.ViewColumn.Beside, {
        enableScripts: true,
      });
      panel.onDidDispose(() => (panel = undefined), null, context.subscriptions);
      panel.webview.onDidReceiveMessage(onPanelMessage, null, context.subscriptions);
    }
    panel.title = title;
    panel.webview.html = document(randomBytes(16).toString("hex"), panel.webview.cspSource);
  };

  const render = () => {
    if (!session || !current) return;
    const step = current;
    const state: PanelState = {
      done: session.isDone(step.id),
      hasNext: session.advance(step.id) !== undefined,
      results,
      message,
    };
    showDocument(step.title, (nonce, cspSource) => renderPanelDocument(step, state, nonce, cspSource));
  };

  const showStep = (step: Step) => {
    current = step;
    results = undefined;
    message = undefined;
    render();
  };

  /** Reflection and overview panels have no Step controls, so no Step is current while they show. */
  const showOverview = (title: string, document: (nonce: string, cspSource: string) => string) => {
    current = undefined;
    showDocument(title, document);
  };

  context.subscriptions.push(
    vscode.window.registerTreeDataProvider("touchingGrass.track", tree),
    registerPasteNudge(() => current),
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
      current = undefined;
      tree.setTrack(session.track);
      await vscode.commands.executeCommand("touchingGrass.track.focus");
      return { title: session.track.title, lessons: session.track.lessons.length };
    }),
    vscode.commands.registerCommand("touchingGrass.chooseWorkspace", async () => {
      if (!session) {
        void vscode.window.showErrorMessage("Open a Track first.");
        return undefined;
      }
      return chooseWorkspace();
    }),
    vscode.commands.registerCommand("touchingGrass.openStep", (stepId: string) => {
      const step = session?.getStep(stepId);
      if (step) showStep(step);
      return step?.title;
    }),
    vscode.commands.registerCommand("touchingGrass.openReflection", (lessonId: string) => {
      const lesson = session?.track.lessons.find((l) => l.id === lessonId);
      if (lesson) showOverview(`Reflection: ${lesson.title}`, (n, c) => renderReflectionDocument(lesson, n, c));
      return lesson?.title;
    }),
    vscode.commands.registerCommand("touchingGrass.openTrackOverview", () => {
      const track = session?.track;
      if (track) showOverview(track.title, (n, c) => renderTrackDocument(track, n, c));
      return track?.title;
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
