import * as vscode from "vscode";
import { formatValidationError, loadTrack, type Step, type TrackSession } from "./engine";
import { randomBytes } from "node:crypto";
import { registerPasteNudge } from "./pasteNudge";
import { renderPanelDocument, type PanelState } from "./stepHtml";
import { TrackTree } from "./trackTree";

export function activate(context: vscode.ExtensionContext): void {
  const tree = new TrackTree();
  let session: TrackSession | undefined;
  let panel: vscode.WebviewPanel | undefined;

  let current: Step | undefined;
  let results: PanelState["results"];
  let message: string | undefined;

  const render = () => {
    if (!panel || !session || !current) return;
    const state: PanelState = {
      done: session.isDone(current.id),
      hasNext: session.advance(current.id) !== undefined,
      results,
      message,
    };
    panel.title = current.title;
    panel.webview.html = renderPanelDocument(current, state, randomBytes(16).toString("hex"), panel.webview.cspSource);
  };

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

  const showStep = (step: Step) => {
    if (!panel) {
      panel = vscode.window.createWebviewPanel("touchingGrass.step", step.title, vscode.ViewColumn.Beside, {
        enableScripts: true,
      });
      panel.onDidDispose(() => (panel = undefined), null, context.subscriptions);
      panel.webview.onDidReceiveMessage(onPanelMessage, null, context.subscriptions);
    }
    current = step;
    results = undefined;
    message = undefined;
    render();
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
  );
}

export function deactivate(): void {}
