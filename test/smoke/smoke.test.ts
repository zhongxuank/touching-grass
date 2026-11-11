import * as assert from "node:assert";
import * as path from "node:path";
import * as vscode from "vscode";

suite("touching-grass smoke", () => {
  test("activates and opens a fixture Track", async () => {
    const folder = vscode.Uri.file(path.resolve(__dirname, "..", "..", "test", "fixtures", "valid-track"));
    const opened = await vscode.commands.executeCommand<{ title: string; lessons: number }>(
      "touchingGrass.openTrack",
      folder,
    );
    assert.deepStrictEqual(opened, { title: "Fixture Track", lessons: 2 });
    const step = await vscode.commands.executeCommand("touchingGrass.openStep", "01-first/1");
    assert.strictEqual(step, "Say hello");
  });
});
