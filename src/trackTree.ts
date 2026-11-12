import * as vscode from "vscode";
import type { Lesson, Page, TrackSession } from "./engine";

type Node =
  | { kind: "about" }
  | { kind: "lesson"; lesson: Lesson }
  | { kind: "page"; page: Page };

/** Sidebar tree of a Track's overview, Lessons and pages. Pure presentation of the engine's structure. */
export class TrackTree implements vscode.TreeDataProvider<Node> {
  private readonly changed = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this.changed.event;
  private session: TrackSession | undefined;
  /** The page open in the panel, drawn as the current one. */
  private open: string | undefined;
  /** Nodes by key, so `reveal` gets the same object `getChildren` returned. */
  private readonly nodes = new Map<string, Node>();

  setSession(session: TrackSession | undefined): void {
    this.session = session;
    this.open = undefined;
    this.nodes.clear();
    this.changed.fire();
  }

  /** Mark a page as the one open in the panel (or none), and redraw. */
  setOpenPage(pageId: string | undefined): void {
    this.open = pageId;
    this.changed.fire();
  }

  /** Redraw after progress changes. */
  refresh(): void {
    this.changed.fire();
  }

  /** The node for a page id, to reveal it. */
  nodeFor(pageId: string): Node | undefined {
    const session = this.session;
    const page = session?.getPages().find((p) => session.pageId(p) === pageId);
    return page ? this.node(`page:${pageId}`, { kind: "page", page }) : undefined;
  }

  private node(key: string, make: Node): Node {
    const known = this.nodes.get(key);
    if (known) return known;
    this.nodes.set(key, make);
    return make;
  }

  private lessonOf(page: Page): Lesson | undefined {
    return page.kind === "reflection" ? page.lesson : this.session?.track.lessons.find((l) => l.steps.includes(page.step));
  }

  getParent(node: Node): Node | undefined {
    if (node.kind !== "page") return undefined;
    const lesson = this.lessonOf(node.page);
    return lesson ? this.node(`lesson:${lesson.id}`, { kind: "lesson", lesson }) : undefined;
  }

  getChildren(node?: Node): Node[] {
    const session = this.session;
    if (!session) return [];
    if (!node) {
      return [
        this.node("about", { kind: "about" }),
        ...session.track.lessons.map((lesson) => this.node(`lesson:${lesson.id}`, { kind: "lesson", lesson })),
      ];
    }
    if (node.kind !== "lesson") return [];
    return session
      .getPages()
      .filter((page) => this.lessonOf(page) === node.lesson)
      .map((page) => this.node(`page:${session.pageId(page)}`, { kind: "page", page }));
  }

  getTreeItem(node: Node): vscode.TreeItem {
    const session = this.session;
    if (node.kind === "about" || !session) {
      const item = new vscode.TreeItem("About this Track", vscode.TreeItemCollapsibleState.None);
      item.contextValue = "about";
      item.command = { command: "touchingGrass.openTrackOverview", title: "About this Track" };
      return item;
    }
    if (node.kind === "lesson") {
      const item = new vscode.TreeItem(node.lesson.title, vscode.TreeItemCollapsibleState.Expanded);
      const { done, total } = session.progressCount(node.lesson.id);
      item.description = `${done} / ${total}`;
      item.contextValue = "lesson";
      return item;
    }
    const id = session.pageId(node.page);
    const isOpen = this.open === id;
    if (node.page.kind === "reflection") {
      const item = new vscode.TreeItem("Reflection", vscode.TreeItemCollapsibleState.None);
      item.id = id;
      item.contextValue = "reflection";
      item.iconPath = new vscode.ThemeIcon(isOpen ? "arrow-right" : "circle-outline");
      item.command = { command: "touchingGrass.openReflection", title: "Open Reflection", arguments: [node.page.lesson.id] };
      return item;
    }
    const { step } = node.page;
    const item = new vscode.TreeItem(`${session.pageNumber(id)} ${step.title}`, vscode.TreeItemCollapsibleState.None);
    item.id = id;
    item.contextValue = "step";
    // One icon per state: skipped (no key), done, current, not started.
    const isCurrent = !session.isDone(id) && (isOpen || (this.open === undefined && session.getCurrentStep() === id));
    item.iconPath = session.isSkipped(id)
      ? new vscode.ThemeIcon("circle-slash")
      : session.isDone(id)
        ? new vscode.ThemeIcon("pass", new vscode.ThemeColor("testing.iconPassed"))
        : new vscode.ThemeIcon(isCurrent ? "arrow-right" : "circle-outline");
    item.command = { command: "touchingGrass.openStep", title: "Open Step", arguments: [id] };
    return item;
  }
}
