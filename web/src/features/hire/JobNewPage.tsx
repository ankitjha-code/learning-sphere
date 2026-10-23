import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeftIcon } from '@phosphor-icons/react';
import { PageHeader } from '@/components/ui';
import { JobForm } from './JobForm';

export default function JobNewPage() {
  const nav = useNavigate();
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        breadcrumb={
          <Link to="/app/hire/jobs" className="inline-flex items-center gap-1 hover:text-fg">
            <ArrowLeftIcon size={13} /> Jobs
          </Link>
        }
        title="New job"
        description="Saved as a draft. Publish from the job page once the checklist is complete."
      />
      <JobForm onSaved={(job) => nav(`/app/hire/jobs/${job.id}?tab=details`)} />
    </div>
  );
}
