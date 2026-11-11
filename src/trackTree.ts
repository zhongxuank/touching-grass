import * as vscode from "vscode";
import type { Lesson, Step, Track } from "./engine";

type Node = { kind: "lesson"; lesson: Lesson } | { kind: "step"; step: Step };

/** Sidebar tree of a Track's Lessons and Steps. Pure presentation of the engine's structure. */
export class TrackTree implements vscode.TreeDataProvider<Node> {
  private readonly changed = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this.changed.event;
  private track: Track | undefined;
  private isDone: (stepId: string) => boolean = () => false;

  /** `isDone` tells the tree which Steps to show with a check icon. */
  setTrack(track: Track | undefined, isDone: (stepId: string) => boolean = () => false): void {
    this.track = track;
    this.isDone = isDone;
    this.changed.fire();
  }

  /** Redraw after progress changes. */
  refresh(): void {
    this.changed.fire();
  }

  getChildren(node?: Node): Node[] {
    if (!this.track) return [];
    if (!node) return this.track.lessons.map((lesson) => ({ kind: "lesson", lesson }));
    return node.kind === "lesson" ? node.lesson.steps.map((step) => ({ kind: "step", step })) : [];
  }

  getTreeItem(node: Node): vscode.TreeItem {
    if (node.kind === "lesson") {
      const item = new vscode.TreeItem(node.lesson.title, vscode.TreeItemCollapsibleState.Expanded);
      item.contextValue = "lesson";
      return item;
    }
    const item = new vscode.TreeItem(node.step.title, vscode.TreeItemCollapsibleState.None);
    item.contextValue = "step";
    if (this.isDone(node.step.id)) item.iconPath = new vscode.ThemeIcon("check");
    item.command = { command: "touchingGrass.openStep", title: "Open Step", arguments: [node.step.id] };
    return item;
  }
}
