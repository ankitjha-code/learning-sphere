// Importing a module's jobs file registers its background job handlers with the queue.
import '../lib/notify';
import '../modules/assessments/jobs';
import '../modules/practice/jobs';
import '../modules/ai/jobs';
import '../modules/workspace/jobs';
import '../modules/library/jobs';
import '../modules/create/jobs';
import '../modules/files/jobs';
import '../modules/privacy/jobs';
import '../modules/teach/jobs';
import '../modules/campus/jobs';
import '../modules/hire/jobs';
import '../modules/career/jobs';
import '../modules/jobs/jobs';
import '../modules/projects/jobs';
import '../modules/portfolio/jobs';
import '../modules/mentorship/jobs';
import '../modules/community/jobs';
import '../modules/motivation/jobs';
import '../modules/admin/jobs';
import '../modules/org/jobs';
import '../modules/billing/jobs';
import '../modules/calendar/jobs';
import '../modules/market/jobs';

export function registerAllJobs() {
  // Handlers register on import; this function is the explicit hook used by the entry point and tests.
}
