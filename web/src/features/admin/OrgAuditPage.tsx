import { useSession } from '@/lib/session';
import { Banner, PageHeader } from '@/components/ui';
import { AuditLogView } from './AuditLogView';

/**
 * Audit log for organization admins (their active organization only). Lives under
 * /app/admin/org-audit but does not need the platform admin workspace: the server
 * checks the org_admin role on every request.
 */
export default function OrgAuditPage() {
  const me = useSession();
  const org = me.activeOrg;
  const isOrgAdmin = !!org?.roles.includes('org_admin');
  return (
    <div>
      <PageHeader
        title="Organization audit log"
        description={
          org
            ? `Sensitive actions recorded in ${org.orgName}: invitations, role changes, grading and hiring decisions, exports, and changes platform staff made to the organization. IP addresses are not shown.`
            : 'Sensitive actions recorded in your organization.'
        }
      />
      {!org && (
        <Banner tone="info" className="mb-4">
          Select an organization in the workspace switcher to see its audit log.
        </Banner>
      )}
      {org && !isOrgAdmin && (
        <Banner tone="warning" className="mb-4">
          Only organization admins can view this log. Ask an admin of {org.orgName} if you need a record of a specific action.
        </Banner>
      )}
      {org && isOrgAdmin && <AuditLogView endpoint="/admin/org-audit" />}
    </div>
  );
}
