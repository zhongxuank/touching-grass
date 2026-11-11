import * as vscode from "vscode";
import type { Lesson, Step, Track } from "./engine";

type Node =
  | { kind: "about" }
  | { kind: "lesson"; lesson: Lesson }
  | { kind: "step"; step: Step }
  | { kind: "reflection"; lesson: Lesson };

/** Sidebar tree of a Track's overview, Lessons and Steps. Pure presentation of the engine's structure. */
export class TrackTree implements vscode.TreeDataProvider<Node> {
  private readonly changed = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this.changed.event;
  private track: Track | undefined;

  setTrack(track: Track | undefined): void {
    this.track = track;
    this.changed.fire();
  }

  getChildren(node?: Node): Node[] {
    if (!this.track) return [];
    if (!node) {
      return [{ kind: "about" }, ...this.track.lessons.map((lesson): Node => ({ kind: "lesson", lesson }))];
    }
    if (node.kind !== "lesson") return [];
    const steps: Node[] = node.lesson.steps.map((step) => ({ kind: "step", step }));
    // The Reflection comes last, after the Lesson's final Step.
    return node.lesson.reflection.length ? [...steps, { kind: "reflection", lesson: node.lesson }] : steps;
  }

  getTreeItem(node: Node): vscode.TreeItem {
    if (node.kind === "about") {
      const item = new vscode.TreeItem("About this Track", vscode.TreeItemCollapsibleState.None);
      item.contextValue = "about";
      item.command = { command: "touchingGrass.openTrackOverview", title: "About this Track" };
      return item;
    }
    if (node.kind === "lesson") {
      const item = new vscode.TreeItem(node.lesson.title, vscode.TreeItemCollapsibleState.Expanded);
      item.contextValue = "lesson";
      return item;
    }
    if (node.kind === "reflection") {
      const item = new vscode.TreeItem("Reflection", vscode.TreeItemCollapsibleState.None);
      item.contextValue = "reflection";
      item.command = {
        command: "touchingGrass.openReflection",
        title: "Open Reflection",
        arguments: [node.lesson.id],
      };
      return item;
    }
    const item = new vscode.TreeItem(node.step.title, vscode.TreeItemCollapsibleState.None);
    item.contextValue = "step";
    item.command = { command: "touchingGrass.openStep", title: "Open Step", arguments: [node.step.id] };
    return item;
  }
}
