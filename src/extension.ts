import * as vscode from "vscode";
import {
  formatValidationError,
  loadTrack,
  TUTOR_PROMPT,
  writeCurrentStep,
  writeTutorGuide,
  type Lesson,
  type Page,
  type Step,
  type TrackSession,
} from "./engine";
import { randomBytes } from "node:crypto";
import { promises as fs } from "node:fs";
import * as path from "node:path";
import { showValidationErrors } from "./diagnostics";
import { registerPasteNudge } from "./pasteNudge";
import {
  pageNav,
  pageTitle,
  renderPanelDocument,
  renderReflectionDocument,
  renderTrackDocument,
  type PanelState,
} from "./stepHtml";
import { TrackTree } from "./trackTree";
import { parseTutorOpenMode, routeTutor, type ContributedCommand } from "./tutorLaunch";

/** globalState key: agent workspace path -> the Track folder last used in it. */
const TRACK_BY_WORKSPACE = "touchingGrass.trackByWorkspace";

const exists = (p: string) =>
  fs.stat(p).then(
    () => true,
    () => false,
  );

/** The folder open in this window, if any. */
const windowFolder = () => vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

export function activate(context: vscode.ExtensionContext): void {
  const tree = new TrackTree();
  const treeView = vscode.window.createTreeView("touchingGrass.track", { treeDataProvider: tree });
  let session: TrackSession | undefined;
  let panel: vscode.WebviewPanel | undefined;
  const problems = vscode.languages.createDiagnosticCollection("touching-grass");

  let current: Step | undefined;
  /** Id of the page in the panel: a Step, or a Reflection. Undefined on the Track overview. */
  let shownPage: string | undefined;
  let results: PanelState["results"];
  let message: string | undefined;
  let ranAt: Date | undefined;
  /** Guard: a second Run Checks click while Checks run is ignored. */
  let running = false;
  /** The Learner's agent workspace. Kept across Tracks, so a Track opened later resumes in it. */
  let workspace: string | undefined;
  /** The open Track's folder, named in the Tutor guide. */
  let trackFolder: string | undefined;
  /** The terminal running Claude Code as the Tutor, reused while it is open. */
  let tutorTerminal: vscode.Terminal | undefined;
  let tutorFolder: string | undefined;
  /** The terminal that runs Steps' `run:` commands, reused while it is open. */
  let runTerminal: vscode.Terminal | undefined;
  let runFolder: string | undefined;

  /** Keep the Tutor's copy of the current Step up to date. Silent unless writing fails. */
  const syncCurrentStep = async () => {
    const folder = session?.getWorkspace();
    if (!folder || !current) return;
    const error = await writeCurrentStep(folder, current, results);
    if (error) void vscode.window.showWarningMessage(error);
  };

  /**
   * Ask Claude about the current Step: copy the question to the Claude Code extension's chat, or run Claude Code
   * in a terminal, as the touchingGrass.tutor.open setting says.
   */
  /** Copy the question and run the Claude Code extension's open command. False when the command fails. */
  const openClaudeExtension = async (command: string): Promise<boolean> => {
    try {
      await vscode.env.clipboard.writeText(TUTOR_PROMPT);
      await vscode.commands.executeCommand(command);
      return true;
    } catch {
      return false;
    }
  };

  const askTutor = async () => {
    const folder = session?.getWorkspace();
    if (!folder) return;
    const mode = parseTutorOpenMode(vscode.workspace.getConfiguration("touchingGrass.tutor").get("open"));
    const claude = vscode.extensions.getExtension("anthropic.claude-code");
    const claudeCommands = claude ? ((claude.packageJSON?.contributes?.commands as ContributedCommand[]) ?? []) : undefined;
    const route = routeTutor(mode, claudeCommands);
    if (route.kind === "error") {
      void vscode.window.showErrorMessage(route.message);
    } else if (route.kind === "extension" && (await openClaudeExtension(route.command))) {
      void vscode.window.showInformationMessage("Question copied. Paste it into Claude.");
    } else {
      if (!tutorTerminal || tutorTerminal.exitStatus !== undefined || tutorFolder !== folder) {
        tutorTerminal = vscode.window.createTerminal({ name: "Claude tutor", cwd: folder });
        tutorFolder = folder;
        tutorTerminal.sendText(`claude "${TUTOR_PROMPT}"`);
      }
      tutorTerminal.show();
    }
  };

  /** Run a Step's command in the "touching grass" terminal in the agent workspace, reusing it while it is open. */
  const runCommand = (command: string) => {
    const folder = session?.getWorkspace();
    if (!folder) return;
    if (!runTerminal || runTerminal.exitStatus !== undefined || runFolder !== folder) {
      runTerminal = vscode.window.createTerminal({ name: "touching grass", cwd: folder });
      runFolder = folder;
    }
    runTerminal.show();
    runTerminal.sendText(command);
  };

  /** Wait for progress to reach the workspace, and say so if it could not be saved. */
  const saveProgress = async () => {
    const error = await session?.flush();
    if (error) void vscode.window.showErrorMessage(error);
  };

  /** Use a folder as the agent workspace and load the progress saved in it. */
  const attachWorkspace = async (folder: string) => {
    if (!session) return;
    workspace = folder;
    if (trackFolder) {
      const map = context.globalState.get<Record<string, string>>(TRACK_BY_WORKSPACE, {});
      await context.globalState.update(TRACK_BY_WORKSPACE, { ...map, [folder]: trackFolder });
    }
    const { notice } = await session.openWorkspace(folder);
    if (notice) void vscode.window.showWarningMessage(notice);
    if (trackFolder) {
      const error = await writeTutorGuide(folder, { trackTitle: session.track.title, trackFolder });
      if (error) void vscode.window.showWarningMessage(error);
    }
    tree.refresh();
    await saveProgress();
    await syncCurrentStep();
  };

  const pickWorkspace = async (): Promise<string | undefined> => {
    const here = windowFolder();
    if (here && here !== trackFolder) {
      const choice = await vscode.window.showQuickPick(
        [
          { label: "Use this window's folder", description: here, folder: here },
          { label: "Choose another folder...", folder: undefined },
        ],
        { title: "Where will you write your code?" },
      );
      if (!choice) return undefined;
      if (choice.folder) {
        await attachWorkspace(choice.folder);
        return choice.folder;
      }
    }
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

  /** Open any page of the Track's sequence. */
  const openPage = (page: Page) => {
    if (page.kind === "step") openStepById(page.step.id);
    else showReflection(page.lesson);
  };

  const onPanelMessage = async (msg: { action: string; check?: string }) => {
    if (!session) return;
    if (msg.action === "previous" && shownPage) {
      const page = session.previousPage(shownPage);
      if (page) openPage(page);
      return;
    }
    if (msg.action === "next" && shownPage) {
      await session.detectProviders();
      const page = session.nextPage(shownPage);
      tree.refresh();
      if (page) openPage(page);
      else if (session.providerChoiceNeeded()) await askProviderChoice();
      return;
    }
    if (!current) return;
    const step = current;
    if (msg.action === "runChecks") {
      if (running) return;
      if (!session.getWorkspace() && !(await pickWorkspace())) {
        message = "Choose your agent workspace to run Checks.";
        return render();
      }
      if (running) return;
      running = true;
      try {
        const dirty = vscode.workspace.textDocuments.filter((d) => d.isDirty).length;
        await vscode.workspace.saveAll(false);
        message = dirty ? `Saved ${dirty} ${dirty === 1 ? "file" : "files"} before running Checks.` : undefined;
        render();
        const outcome = await session.runChecks(step.id);
        results = outcome.status === "ran" ? outcome.results : undefined;
        ranAt = outcome.status === "ran" ? new Date() : undefined;
        if (outcome.status === "tooling-missing") message = outcome.message;
        tree.refresh();
        await saveProgress();
        await syncCurrentStep();
      } finally {
        running = false;
        render();
      }
    } else if (msg.action === "runCommand" && step.run) {
      if (!session.getWorkspace() && !(await pickWorkspace())) {
        message = "Choose your agent workspace to run your code.";
        return render();
      }
      runCommand(step.run);
    } else if (msg.action === "markDone") {
      session.markDone(step.id);
      tree.refresh();
      await saveProgress();
      render();
    } else if (msg.action === "askTutor") {
      if (!session.getWorkspace() && !(await pickWorkspace())) {
        message = "Choose your agent workspace to ask Claude.";
        return render();
      }
      await syncCurrentStep();
      await askTutor();
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
      nav: pageNav(session, step.id),
      results,
      message,
      running,
      ranAt,
      noKeyProvider: session.missingProvider(step.id),
    };
    showDocument(pageTitle(session, step.id) ?? step.title, (nonce, cspSource) => renderPanelDocument(step, state, nonce, cspSource));
  };

  /** Show which page is open: in the sidebar tree, and for the Previous/Next buttons. */
  const markOpen = (pageId: string | undefined) => {
    shownPage = pageId;
    tree.setOpenPage(pageId);
    const node = pageId ? tree.nodeFor(pageId) : undefined;
    if (node && treeView.visible) {
      void Promise.resolve(treeView.reveal(node, { select: true, focus: false })).catch(() => {});
    }
  };

  const showStep = (step: Step) => {
    current = step;
    markOpen(step.id);
    results = undefined;
    ranAt = undefined;
    message = undefined;
    render();
    void syncCurrentStep();
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
  const showOverview = (title: string, document: (nonce: string, cspSource: string) => string, pageId?: string) => {
    current = undefined;
    markOpen(pageId);
    showDocument(title, document);
  };

  const showReflection = (lesson: Lesson) => {
    if (!session) return;
    const id = `${lesson.id}/reflection`;
    const nav = pageNav(session, id);
    const title = pageTitle(session, id) ?? `Reflection: ${lesson.title}`;
    showOverview(title, (n, c) => renderReflectionDocument(lesson, n, c, nav), id);
  };

  /** Track folders shipped inside the extension, under `tracks/`. */
  const builtInTracks = async (): Promise<string[]> => {
    const root = path.join(context.extensionPath, "tracks");
    const names = await fs.readdir(root).catch(() => [] as string[]);
    const folders = names.map((n) => path.join(root, n));
    const ok = await Promise.all(folders.map((f) => exists(path.join(f, "track.md"))));
    return folders.filter((_, i) => ok[i]);
  };

  /** Pick a built-in Track, or browse for a Track folder. */
  const pickTrack = async (): Promise<string | undefined> => {
    const builtIn = await builtInTracks();
    if (builtIn.length) {
      const choice = await vscode.window.showQuickPick(
        [
          ...builtIn.map((f) => ({ label: path.basename(f), description: "built in", folder: f as string | undefined })),
          { label: "Browse for a Track folder...", description: "", folder: undefined },
        ],
        { title: "Open Track" },
      );
      if (!choice) return undefined;
      if (choice.folder) return choice.folder;
    }
    return (
      await vscode.window.showOpenDialog({
        canSelectFolders: true,
        canSelectFiles: false,
        canSelectMany: false,
        openLabel: "Open Track",
      })
    )?.[0]?.fsPath;
  };

  /**
   * Load a Track and show it. The agent workspace is, in order: the one already chosen, this window's folder
   * if it was last used with this Track, or none yet (Run Checks asks). `quiet` skips error popups (startup).
   */
  const openTrackAt = async (folder: string, quiet = false) => {
    const result = await loadTrack(folder);
    if (!result.ok) {
      if (!quiet) {
        void vscode.window.showErrorMessage(
          `Cannot open Track:\n${result.errors.map(formatValidationError).join("\n")}`,
        );
      }
      return undefined;
    }
    const opened = result.session;
    session = opened;
    trackFolder = folder;
    current = undefined;
    shownPage = undefined;
    tree.setSession(opened);
    const here = windowFolder();
    const map = context.globalState.get<Record<string, string>>(TRACK_BY_WORKSPACE, {});
    const target = workspace ?? (here && map[here] === folder ? here : undefined);
    if (target) {
      await attachWorkspace(target);
      resume();
    }
    await vscode.commands.executeCommand("touchingGrass.track.focus");
    return { title: opened.track.title, lessons: opened.track.lessons.length };
  };

  /** On startup in a folder used as an agent workspace before, reopen its Track where the Learner left off. */
  const restore = async () => {
    const here = windowFolder();
    if (!here || session) return;
    const last = context.globalState.get<Record<string, string>>(TRACK_BY_WORKSPACE, {})[here];
    if (last && (await exists(path.join(last, "track.md")))) await openTrackAt(last, true);
  };

  context.subscriptions.push(
    vscode.window.onDidCloseTerminal((t) => {
      if (t === tutorTerminal) tutorTerminal = undefined;
      if (t === runTerminal) runTerminal = undefined;
    }),
    treeView,
    registerPasteNudge(() => current),
    vscode.commands.registerCommand("touchingGrass.openTrack", async (folder?: vscode.Uri) => {
      const picked = folder?.fsPath ?? (await pickTrack());
      return picked ? openTrackAt(picked) : undefined;
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
      if (lesson) showReflection(lesson);
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
  void restore();
}

export function deactivate(): void {}
