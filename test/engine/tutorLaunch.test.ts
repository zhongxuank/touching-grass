import { describe, expect, it } from "vitest";
import { findClaudeOpenCommand, parseTutorOpenMode, routeTutor } from "../../src/tutorLaunch";

describe("parseTutorOpenMode", () => {
  it("keeps the three known values", () => {
    expect(parseTutorOpenMode("auto")).toBe("auto");
    expect(parseTutorOpenMode("extension")).toBe("extension");
    expect(parseTutorOpenMode("terminal")).toBe("terminal");
  });

  it("treats a missing or unknown value as auto", () => {
    expect(parseTutorOpenMode(undefined)).toBe("auto");
    expect(parseTutorOpenMode("panel")).toBe("auto");
  });
});

describe("findClaudeOpenCommand", () => {
  it("finds the command that opens Claude Code", () => {
    expect(findClaudeOpenCommand([{ command: "claude-vscode.sidebar.open", title: "Open Claude Code" }])).toBe(
      "claude-vscode.sidebar.open",
    );
  });

  it("prefers the sidebar or panel over an editor tab", () => {
    const commands = [
      { command: "claude-vscode.editor.open", title: "Open in New Tab" },
      { command: "claude-vscode.sidebar.open", title: "Open in Side Bar" },
    ];
    expect(findClaudeOpenCommand(commands)).toBe("claude-vscode.sidebar.open");
  });

  it("prefers a panel command over a plain command, whatever the order", () => {
    const commands = [
      { command: "claude-code.open", title: "Open Claude" },
      { command: "claude-code.openPanel", title: "Open Claude Panel" },
    ];
    expect(findClaudeOpenCommand(commands)).toBe("claude-code.openPanel");
  });

  it("ignores Claude commands whose title is not about opening", () => {
    expect(findClaudeOpenCommand([{ command: "claude-vscode.newConversation", title: "New Conversation" }])).toBeUndefined();
  });

  it("ignores open commands that are not about Claude", () => {
    expect(findClaudeOpenCommand([{ command: "workbench.action.openSettings", title: "Open Settings" }])).toBeUndefined();
  });

  it("returns undefined for an empty list", () => {
    expect(findClaudeOpenCommand([])).toBeUndefined();
  });

  it("returns the first of equally good matches", () => {
    const commands = [
      { command: "claude-a.open", title: "Open Claude A" },
      { command: "claude-b.open", title: "Open Claude B" },
    ];
    expect(findClaudeOpenCommand(commands)).toBe("claude-a.open");
  });
});

describe("routeTutor", () => {
  const match = [{ command: "claude-vscode.sidebar.open", title: "Open Claude Code" }];
  const noMatch = [{ command: "claude-vscode.newConversation", title: "New Conversation" }];

  it("always uses the terminal in terminal mode", () => {
    expect(routeTutor("terminal", match)).toEqual({ kind: "terminal" });
  });

  it("falls back to the terminal in auto mode when the extension is not installed", () => {
    expect(routeTutor("auto", undefined)).toEqual({ kind: "terminal" });
  });

  it("falls back to the terminal in auto mode when no command matches", () => {
    expect(routeTutor("auto", noMatch)).toEqual({ kind: "terminal" });
  });

  it("opens the extension in auto mode when a command matches", () => {
    expect(routeTutor("auto", match)).toEqual({ kind: "extension", command: "claude-vscode.sidebar.open" });
  });

  it("errors in extension mode when the extension is not installed, naming the setting", () => {
    const route = routeTutor("extension", undefined);
    expect(route.kind).toBe("error");
    expect(route.kind === "error" && route.message).toContain("touchingGrass.tutor.open");
  });

  it("errors in extension mode when no command matches", () => {
    expect(routeTutor("extension", noMatch).kind).toBe("error");
  });

  it("opens the extension in extension mode when a command matches", () => {
    expect(routeTutor("extension", match)).toEqual({ kind: "extension", command: "claude-vscode.sidebar.open" });
  });
});
