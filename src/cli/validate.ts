import { formatValidationError, loadTrack } from "../engine";

/** Validates a Track folder with the engine's loader. Prints each problem; returns the exit code. */
async function validateTrackCli(args: string[]): Promise<number> {
  const [folder] = args;
  if (!folder) {
    console.error("Usage: npm run validate-track -- <track-folder>");
    return 2;
  }
  const result = await loadTrack(folder);
  if (!result.ok) {
    for (const error of result.errors) console.error(formatValidationError(error));
    console.error(`${result.errors.length} problem(s) found in ${folder}. Fix them and run again.`);
    return 1;
  }
  const { track } = result.session;
  const steps = track.lessons.reduce((count, lesson) => count + lesson.steps.length, 0);
  const lessons = track.lessons.length;
  console.log(
    `OK: "${track.title}" is valid: ${lessons} ${lessons === 1 ? "Lesson" : "Lessons"}, ${steps} ${steps === 1 ? "Step" : "Steps"}.`,
  );
  return 0;
}

void validateTrackCli(process.argv.slice(2)).then((code) => {
  process.exitCode = code;
});
