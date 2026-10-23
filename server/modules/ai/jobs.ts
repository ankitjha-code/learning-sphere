// Background job handlers for the AI module.
import { registerJob } from '../../jobs/queue';
import { runEvalRun } from '../../ai/evals';

/** Runs the evaluation dataset for one ai_eval_runs row. Idempotent: completed runs are skipped. */
registerJob('ai.eval', async (payload) => {
  const runId = String(payload.runId ?? '');
  if (!runId) return { skipped: 'missing runId' };
  return runEvalRun(runId);
});
