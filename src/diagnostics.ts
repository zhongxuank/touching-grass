import * as path from "node:path";
import * as vscode from "vscode";
import type { ValidationError } from "./engine";

/** Shows validation errors in the Problems panel, one diagnostic per error, at its file and line. */
export function showValidationErrors(
  collection: vscode.DiagnosticCollection,
  folder: string,
  errors: ValidationError[],
): void {
  collection.clear();
  const byFile = new Map<string, vscode.Diagnostic[]>();
  for (const error of errors) {
    const uri = vscode.Uri.file(path.join(folder, error.file));
    const line = Math.max((error.line ?? 1) - 1, 0);
    const diagnostic = new vscode.Diagnostic(
      new vscode.Range(line, 0, line, 0),
      error.message,
      vscode.DiagnosticSeverity.Error,
    );
    diagnostic.source = "touching grass";
    const list = byFile.get(uri.toString()) ?? [];
    list.push(diagnostic);
    byFile.set(uri.toString(), list);
  }
  for (const [uri, diagnostics] of byFile) collection.set(vscode.Uri.parse(uri), diagnostics);
}
