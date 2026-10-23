import { registerJob } from '../../jobs/queue';
import { pullRuntimeImage, runtimePullStatus } from '../../exec/runner';

/**
 * exec.pull_image { language, image }: pulls a Docker sandbox image (admin action only;
 * learners' runs never pull). Large images can take minutes, so the handler waits up to
 * 20 s and then lets the pull continue in the background; progress is visible in
 * GET /api/practice/admin/runtimes (pull status per image).
 */
registerJob('exec.pull_image', async (payload) => {
  const language = String(payload.language ?? '');
  const pull = pullRuntimeImage(language);
  const settled = await Promise.race([pull.then((s) => ({ done: true as const, s })), new Promise<{ done: false }>((r) => setTimeout(() => r({ done: false }), 20_000).unref())]);
  if (!settled.done) {
    pull.catch(() => {}); // outcome is reported through the pull status
    return { status: 'pulling', note: 'The pull continues in the background. Check the CodeLab runtimes page for progress.', pull: runtimePullStatus(language) };
  }
  if (settled.s.status === 'failed') throw new Error(settled.s.message ?? 'docker pull failed');
  return { status: settled.s.status, message: settled.s.message, image: settled.s.image };
});
