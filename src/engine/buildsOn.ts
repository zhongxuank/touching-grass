import { promises as fs } from "node:fs";
import * as path from "node:path";
import { parseTrackFile } from "./parse";

/** Folder inside a Track folder that holds the Track's finished project, as it stands after the last Step. */
export const REFERENCE_DIR = "reference";

/**
 * Find the Track whose title is `title` among the folders next to `trackFolder` (the built-in Tracks sit side by
 * side), skipping `trackFolder` itself. Returns its folder, or undefined when no sibling has that title.
 */
export async function findSiblingTrack(trackFolder: string, title: string): Promise<string | undefined> {
  const root = path.dirname(trackFolder);
  const names = await fs.readdir(root).catch(() => [] as string[]);
  for (const name of names.sort()) {
    const folder = path.join(root, name);
    if (path.resolve(folder) === path.resolve(trackFolder)) continue;
    const text = await fs.readFile(path.join(folder, "track.md"), "utf8").catch(() => undefined);
    if (text === undefined) continue;
    if (parseTrackFile("track.md", text).value?.title === title) return folder;
  }
  return undefined;
}
