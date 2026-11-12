/**
 * Decides how "Ask Claude about this Step" opens the Tutor. Pure: no vscode import, so it is unit tested.
 * The shell reads the setting and the Claude Code extension's contributed commands, then acts on the route.
 */

export const TUTOR_OPEN_MODES = ["auto", "extension", "terminal"] as const;
export type TutorOpenMode = (typeof TUTOR_OPEN_MODES)[number];

/** A command as listed under `contributes.commands` in an extension's package.json. */
export interface ContributedCommand {
  command: string;
  title?: string;
}

export type TutorRoute =
  | { kind: "terminal" }
  | { kind: "extension"; command: string }
  | { kind: "error"; message: string };

/** The setting's value, or "auto" when it is missing or not one of the known modes. */
export function parseTutorOpenMode(value: unknown): TutorOpenMode {
  return (TUTOR_OPEN_MODES as readonly unknown[]).includes(value) ? (value as TutorOpenMode) : "auto";
}

/**
 * The command that opens the Claude Code chat: its id mentions Claude and its title says open.
 * A sidebar or panel command wins over an editor tab. Ties go to the first listed.
 */
export function findClaudeOpenCommand(commands: readonly ContributedCommand[]): string | undefined {
  let best: { command: string; score: number } | undefined;
  for (const { command, title = "" } of commands) {
    if (!/claude/i.test(command) || !/open/i.test(title)) continue;
    const where = `${command} ${title}`;
    const score = (/side ?bar|panel/i.test(where) ? 2 : 0) - (/editor|tab/i.test(where) ? 1 : 0);
    if (!best || score > best.score) best = { command, score };
  }
  return best?.command;
}

/**
 * Where "Ask Claude" goes. `claudeCommands` is the Claude Code extension's contributed commands, or undefined
 * when the extension is not installed. `auto` falls back to the terminal; `extension` reports an error instead.
 */
export function routeTutor(
  mode: TutorOpenMode,
  claudeCommands: readonly ContributedCommand[] | undefined,
): TutorRoute {
  if (mode === "terminal") return { kind: "terminal" };
  const command = claudeCommands ? findClaudeOpenCommand(claudeCommands) : undefined;
  if (command) return { kind: "extension", command };
  if (mode === "auto") return { kind: "terminal" };
  const reason = claudeCommands
    ? "the Claude Code extension has no command to open its chat"
    : "the Claude Code extension is not installed";
  return {
    kind: "error",
    message: `Cannot open Claude from the extension: ${reason}. Install it, or set "touchingGrass.tutor.open" to "terminal".`,
  };
}
