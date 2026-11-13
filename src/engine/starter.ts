import { constants, promises as fs } from "node:fs";
import * as path from "node:path";

/** Folder names never copied out of a reference folder: caches and virtual environments, not the project. */
const NOT_COPIED = new Set(["__pycache__", ".venv"]);

export interface CopyReferenceResult {
  /** Files written into the workspace, relative to it, with `/` separators, in sorted order. */
  copied: string[];
  /** Files left alone because the workspace already had one at that path. */
  skipped: string[];
}

async function listFiles(root: string, rel = ""): Promise<string[]> {
  const entries = await fs.readdir(path.join(root, rel), { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    if (NOT_COPIED.has(entry.name)) continue;
    const child = rel ? `${rel}/${entry.name}` : entry.name;
    if (entry.isDirectory()) files.push(...(await listFiles(root, child)));
    else if (entry.isFile()) files.push(child);
  }
  return files.sort();
}

/**
 * Copy every file of `sourceFolder` into `targetFolder` without overwriting: a file that already exists there is
 * skipped, and reported so the Learner can see what was left alone. Folders are created as needed. The result's
 * paths are relative to the two folders.
 */
export async function copyFolderInto(sourceFolder: string, targetFolder: string): Promise<CopyReferenceResult> {
  const result: CopyReferenceResult = { copied: [], skipped: [] };
  for (const rel of await listFiles(sourceFolder)) {
    const target = path.join(targetFolder, ...rel.split("/"));
    await fs.mkdir(path.dirname(target), { recursive: true });
    try {
      await fs.copyFile(path.join(sourceFolder, ...rel.split("/")), target, constants.COPYFILE_EXCL);
      result.copied.push(rel);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
      result.skipped.push(rel);
    }
  }
  return result;
}

/** Copy a Track's `reference/` folder into the Learner's workspace, never overwriting. See `copyFolderInto`. */
export function copyReferenceFolder(referenceFolder: string, workspace: string): Promise<CopyReferenceResult> {
  return copyFolderInto(referenceFolder, workspace);
}
