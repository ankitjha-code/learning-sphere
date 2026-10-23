import { PageHeader } from '@/components/ui';
import { AuditLogView } from './AuditLogView';

export default function AuditPage() {
  return (
    <div>
      <PageHeader
        title="Audit log"
        description="Every recorded sensitive action across the platform: role changes, suspensions, exports, plan and policy changes, grading and hiring decisions. Entries cannot be edited. Older entries are pruned by the retention policy (never before 90 days)."
      />
      <AuditLogView endpoint="/admin/audit" orgPicker />
    </div>
  );
}
