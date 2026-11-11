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
  /** The Learner's agent workspace. Kept across Tracks, so a Track opened later resumes in it. */
  let workspace: string | undefined;

  /** Wait for progress to reach the workspace, and say so if it could not be saved. */
  const saveProgress = async () => {
    const error = await session?.flush();
    if (error) void vscode.window.showErrorMessage(error);
  };

  /** Use a folder as the agent workspace and load the progress saved in it. */
  const attachWorkspace = async (folder: string) => {
    if (!session) return;
    workspace = folder;
    const { notice } = await session.openWorkspace(folder);
    if (notice) void vscode.window.showWarningMessage(notice);
    tree.refresh();
    await saveProgress();
  };

  const pickWorkspace = async (): Promise<string | undefined> => {
    const picked = (
      await vscode.window.showOpenDialog({
        canSelectFolders: true,
        canSelectFiles: false,
        canSelectMany: false,
        openLabel: "Use as agent workspace",
      })
    )?.[0];
    if (picked) await attachWorkspace(picked.fsPath);
    return picked?.fsPath;
  };

  const onPanelMessage = async (msg: { action: string; check?: string }) => {
    if (!session || !current) return;
    const step = current;
    if (msg.action === "runChecks") {
      if (!session.getWorkspace() && !(await pickWorkspace())) {
        message = "Choose your agent workspace to run Checks.";
        return render();
      }
      const outcome = await session.runChecks(step.id);
      results = outcome.status === "ran" ? outcome.results : undefined;
      message = outcome.status === "tooling-missing" ? outcome.message : undefined;
      tree.refresh();
      await saveProgress();
      render();
    } else if (msg.action === "markDone") {
      session.markDone(step.id);
      tree.refresh();
      await saveProgress();
      render();
    } else if (msg.action === "next") {
      await session.detectProviders();
      const next = session.advance(step.id);
      tree.refresh();
      if (next) openStepById(next.id);
      else if (session.providerChoiceNeeded()) await askProviderChoice();
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

  /** Quick pick of the Providers that have a key. A single one is preselected but still confirmed. */
  const askProviderChoice = async () => {
    if (!session) return;
    const available = session.getAvailableProviders();
    const picked = await vscode.window.showQuickPick(
      available.map((p) => ({ label: p, picked: available.length === 1 })),
      {
        title: "Choose your Provider for the rest of this Track",
        placeHolder: "Later Steps will show only this Provider",
        canPickMany: false,
      },
    );
    if (!picked) return;
    const next = session.chooseProvider(picked.label);
    tree.refresh();
    await saveProgress();
    if (next) openStepById(next.id);
  };

  const render = () => {
    if (!session || !current) return;
    const step = current;
    const state: PanelState = {
      done: session.isDone(step.id),
      hasNext: session.advance(step.id) !== undefined,
      results,
      message,
      readOnly: session.isDone(step.id) && session.getCurrentStep() !== step.id,
      noKeyProvider: session.missingProvider(step.id),
    };
    showDocument(step.title, (nonce, cspSource) => renderPanelDocument(step, state, nonce, cspSource));
  };

  const showStep = (step: Step) => {
    current = step;
    results = undefined;
    message = undefined;
    render();
  };

  /** Open a Step in the panel. The engine moves the current Step only for an unfinished Step. */
  const openStepById = (stepId: string): Step | undefined => {
    const step = session?.openStep(stepId);
    if (step) {
      void session?.detectProviders().then(render);
      showStep(step);
      void saveProgress();
    }
    return step;
  };

  /** Open the panel at the current Step, where the Learner left off. */
  const resume = () => {
    const id = session?.getCurrentStep();
    if (id) openStepById(id);
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
      const opened = result.session;
      session = opened;
      current = undefined;
      tree.setTrack(
        opened.track,
        (id) => opened.isDone(id),
        (id) => opened.isVisible(id),
      );
      if (workspace) {
        await attachWorkspace(workspace);
        resume();
      }
      await vscode.commands.executeCommand("touchingGrass.track.focus");
      return { title: opened.track.title, lessons: opened.track.lessons.length };
    }),
    vscode.commands.registerCommand("touchingGrass.chooseWorkspace", async () => {
      if (!session) {
        void vscode.window.showErrorMessage("Open a Track first.");
        return undefined;
      }
      const folder = await pickWorkspace();
      if (folder) resume();
      return folder;
    }),
    vscode.commands.registerCommand("touchingGrass.openStep", (stepId: string) => openStepById(stepId)?.title),
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
