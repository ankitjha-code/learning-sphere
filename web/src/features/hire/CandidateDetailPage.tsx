import { useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeftIcon, ArrowRightIcon, CalendarPlusIcon, EyeSlashIcon, LockSimpleIcon, SealCheckIcon, VideoCameraIcon } from '@phosphor-icons/react';
import { api } from '@/lib/api';
import { formatDate, formatDateTime } from '@/lib/format';
import { Badge, Banner, Button, ButtonLink, Card, CardAction, CardBody, CardHeader, EmptyState, ErrorState, PageHeader, ProvenanceTag, SkeletonRows, StatusBadge, Tabs } from '@/components/ui';
import { SOURCE_LABEL, type CandidateDetail } from './api';
import { FairnessNote, FeedbackCard, MatchBreakdown, MessageThread, ScheduleInterviewDialog, StageMoveDialog } from './components';
import { OfferActions, OfferFormDialog } from './offer-ui';

function ResumeView({ resume }: { resume: CandidateDetail['application']['resume'] }) {
  const d = resume?.data;
  if (!d) return <p className="text-[13px] text-muted">No resume was attached to this application.</p>;
  return (
    <div className="space-y-3 text-[13.5px]">
      {d.basics?.headline && <p className="font-medium">{d.basics.headline}</p>}
      {d.summary && <p className="text-muted">{d.summary}</p>}
      {!!d.experience?.length && (
        <div>
          <h4 className="text-[12.5px] font-semibold text-subtle">Experience</h4>
          <ul className="mt-1 space-y-2">
            {d.experience.map((e) => (
              <li key={e.id}>
                <div className="font-medium">
                  {e.title}, {e.company} <span className="font-normal text-subtle">{[e.start, e.end].filter(Boolean).join(' to ')}</span>
                </div>
                <ul className="ml-4 list-disc text-muted">
                  {e.bullets.map((b, i) => (
                    <li key={i}>{b}</li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </div>
      )}
      {!!d.projects?.length && (
        <div>
          <h4 className="text-[12.5px] font-semibold text-subtle">Projects</h4>
          <ul className="mt-1 space-y-1">
            {d.projects.map((p) => (
              <li key={p.id}>
                <span className="font-medium">{p.name}</span>
                <span className="text-muted"> · {p.bullets.join(' ')}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {!!d.education?.length && (
        <div>
          <h4 className="text-[12.5px] font-semibold text-subtle">Education</h4>
          <ul className="mt-1">
            {d.education.map((e) => (
              <li key={e.id}>
                {[e.degree, e.field].filter(Boolean).join(', ')} {e.institution && `· ${e.institution}`} {e.end && <span className="text-subtle">({e.end})</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
      {!!d.skills?.length && (
        <div>
          <h4 className="text-[12.5px] font-semibold text-subtle">Listed skills (self-reported)</h4>
          <p className="text-muted">{d.skills.flatMap((s) => s.items).join(', ')}</p>
        </div>
      )}
      <p className="text-[12px] text-subtle">Snapshot taken when they applied. Contact details are hidden; use Messages.</p>
    </div>
  );
}

export default function CandidateDetailPage() {
  const { applicationId = '' } = useParams();
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') ?? 'overview';
  const q = useQuery({ queryKey: ['hire', 'application', applicationId], queryFn: () => api.get<CandidateDetail>(`/hire/applications/${applicationId}`) });
  const [move, setMove] = useState<string | null>(null);
  const [schedule, setSchedule] = useState(false);
  const [offer, setOffer] = useState(false);
  if (q.isLoading) return <SkeletonRows rows={8} />;
  if (q.error) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const d = q.data!;
  const { canManage, canMove } = d.permissions;
  const openOffer = d.offers.find((o) => o.status === 'draft' || o.status === 'extended');
  const nextKey = d.job.stages[d.job.stages.indexOf(d.application.stage) + 1];
  const tabs = [
    { value: 'overview', label: 'Profile and match' },
    { value: 'assessments', label: 'Assessments', count: d.assessments.length },
    { value: 'portfolio', label: 'Portfolio' },
    { value: 'interviews', label: 'Interviews', count: d.interviews.length },
    ...(canManage
      ? [
          { value: 'offers', label: 'Offers', count: d.offers.length },
          { value: 'messages', label: d.unreadMessages ? `Messages (${d.unreadMessages} new)` : 'Messages' },
          { value: 'timeline', label: 'Decisions', count: d.decisions.length },
        ]
      : []),
  ];
  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <PageHeader
        breadcrumb={
          <Link to={`/app/hire/jobs/${d.job.id}`} className="inline-flex items-center gap-1 hover:text-fg">
            <ArrowLeftIcon size={13} /> {d.job.title}
          </Link>
        }
        title={d.candidate.name}
        badge={
          <>
            <StatusBadge status={d.application.stage} />
            {d.application.status !== 'active' && d.application.status !== d.application.stage && <StatusBadge status={d.application.status} />}
          </>
        }
        description={[d.candidate.headline, d.candidate.location, `Applied ${formatDate(d.application.appliedAt)}`, SOURCE_LABEL[d.application.source]].filter(Boolean).join(' · ')}
        actions={
          canMove && (
            <>
              {d.application.status === 'active' && (
                <Button icon={<CalendarPlusIcon size={15} />} onClick={() => setSchedule(true)}>
                  Schedule interview
                </Button>
              )}
              {d.application.stage === 'offer' && d.application.status === 'active' && !openOffer && (
                <Button icon={<SealCheckIcon size={15} />} onClick={() => setOffer(true)}>
                  Draft offer
                </Button>
              )}
              <Button onClick={() => setMove('rejected')} disabled={d.application.stage === 'rejected'} disabledReason="Already rejected">
                Reject
              </Button>
              {nextKey && d.application.status === 'active' ? (
                <Button variant="primary" icon={<ArrowRightIcon size={15} />} onClick={() => setMove(nextKey)}>
                  Move to {d.job.stageLabels[nextKey] ?? nextKey}
                </Button>
              ) : (
                <Button variant="primary" onClick={() => setMove('')}>
                  Change stage
                </Button>
              )}
            </>
          )
        }
      />
      {!canManage && <Banner tone="info">You can see this candidate because you are an interviewer for them. Decisions, offers and messages are visible to recruiters only.</Banner>}
      {d.application.status === 'withdrawn' && <Banner tone="warning">The candidate withdrew this application.</Banner>}
      {d.application.status === 'declined' && <Banner tone="warning">The candidate declined the offer.</Banner>}
      <Tabs value={tab} onValueChange={(v) => setParams({ tab: v })} tabs={tabs} />

      {tab === 'overview' && (
        <div className="grid grid-cols-[minmax(0,1fr)] gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
          <Card className="min-w-0">
            <CardHeader title="Match against this job" description="Requirements from the posting, evidence from the candidate's Skill DNA. Recomputed now." />
            <CardBody>
              <MatchBreakdown match={d.match} />
              {d.application.matchAtApply && <p className="mt-3 text-[12.5px] text-subtle">Score when they applied: {d.application.matchAtApply.score}/100.</p>}
              <FairnessNote className="mt-4" />
            </CardBody>
          </Card>
          <div className="space-y-5">
            {d.application.coverNote && (
              <Card>
                <CardHeader title="Cover note" />
                <CardBody>
                  <p className="whitespace-pre-wrap text-[13.5px]">{d.application.coverNote}</p>
                </CardBody>
              </Card>
            )}
            <Card>
              <CardHeader title="Resume" />
              <CardBody>
                <ResumeView resume={d.application.resume} />
              </CardBody>
            </Card>
          </div>
        </div>
      )}

      {tab === 'assessments' &&
        (!d.assessments.length ? (
          <EmptyState
            icon={<SealCheckIcon size={22} />}
            title="Not invited to an assessment"
            description="Invite this candidate from the job's pipeline or applicants table."
            action={<ButtonLink to={`/app/hire/jobs/${d.job.id}`}>Open pipeline</ButtonLink>}
          />
        ) : (
          <Card className="overflow-hidden">
            <ul className="divide-y divide-border">
              {d.assessments.map((a) => (
                <li key={a.assessmentId} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
                  <div>
                    <div className="text-[14px] font-semibold">{a.title}</div>
                    <div className="text-[12.5px] text-muted">
                      Invited {formatDate(a.invitedAt)}
                      {a.dueAt ? ` · due ${formatDate(a.dueAt)}` : ''}
                      {a.submittedAt ? ` · submitted ${formatDateTime(a.submittedAt)}` : ''}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <StatusBadge status={a.attemptStatus ?? a.inviteStatus} />
                    {a.percent !== null && <span className="text-[18px] font-semibold tabular-nums">{a.percent}%</span>}
                    {a.attemptStatus === 'graded' || a.attemptStatus === 'released' ? <ProvenanceTag kind="verified" /> : null}
                    {canManage && <CardAction to={a.resultsLink}>Review evidence</CardAction>}
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        ))}

      {tab === 'portfolio' && (
        <div className="space-y-3">
          <Banner tone={d.portfolio ? 'info' : 'warning'}>{d.portfolioNote}</Banner>
          {d.portfolio ? (
            <div className="grid gap-4 lg:grid-cols-2">
              <Card>
                <CardHeader
                  title="Projects"
                  description={d.portfolio.publicUrl ? undefined : 'Shared with this application only.'}
                  action={
                    d.portfolio.publicUrl && (
                      <a href={d.portfolio.publicUrl} target="_blank" rel="noopener noreferrer" className="-mr-2 inline-flex h-7 items-center rounded-md px-2 text-[13px] font-medium text-accent-text transition-colors hover:bg-accent-soft">
                        Public portfolio
                      </a>
                    )
                  }
                />
                <CardBody>
                  {!d.portfolio.projects.length ? (
                    <p className="text-[13px] text-muted">No projects shared.</p>
                  ) : (
                    <ul className="space-y-3">
                      {d.portfolio.projects.map((p) => (
                        <li key={p.id} className="text-[13.5px]">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-medium">{p.title}</span>
                            {p.verification === 'verified_by_reviewer' ? <ProvenanceTag kind="reviewer" /> : <ProvenanceTag kind="self" />}
                          </div>
                          <p className="text-muted">{p.summary}</p>
                          <div className="text-[12px] text-subtle">
                            {p.skills.join(', ')}
                            {p.reviewerName ? ` · reviewed by ${p.reviewerName}` : ''}
                          </div>
                          <div className="flex gap-3 text-[12.5px]">
                            {p.repoUrl && (
                              <a href={p.repoUrl} target="_blank" rel="noopener noreferrer" className="text-accent-text hover:underline">
                                Repository
                              </a>
                            )}
                            {p.demoUrl && (
                              <a href={p.demoUrl} target="_blank" rel="noopener noreferrer" className="text-accent-text hover:underline">
                                Demo
                              </a>
                            )}
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </CardBody>
              </Card>
              <Card>
                <CardHeader title="Skills and results they chose to show" />
                <CardBody className="space-y-3 text-[13px]">
                  <ul className="space-y-1">
                    {d.portfolio.skills.map((s) => (
                      <li key={s.slug} className="flex justify-between gap-2">
                        <span>{s.name}</span>
                        <span className="text-muted">{s.label}</span>
                      </li>
                    ))}
                  </ul>
                  {d.portfolio.assessments.length > 0 && (
                    <ul className="space-y-1 border-t border-border pt-2">
                      {d.portfolio.assessments.map((a, i) => (
                        <li key={i} className="flex justify-between">
                          <span>{a.title}</span>
                          <span className="tabular-nums">{a.scorePercent}%</span>
                        </li>
                      ))}
                    </ul>
                  )}
                  {d.portfolio.certificates.length > 0 && (
                    <ul className="space-y-1 border-t border-border pt-2">
                      {d.portfolio.certificates.map((c, i) => (
                        <li key={i}>
                          {c.title} <span className="text-subtle">· {c.label}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </CardBody>
              </Card>
            </div>
          ) : (
            <EmptyState icon={<EyeSlashIcon size={22} />} title="Portfolio not shared" description="Review the resume, assessments and interviews instead." />
          )}
        </div>
      )}

      {tab === 'interviews' &&
        (!d.interviews.length ? (
          <EmptyState
            icon={<CalendarPlusIcon size={22} />}
            title="No interviews yet"
            description="Schedule a structured interview with one or more interviewers."
            action={
              canMove &&
              d.application.status === 'active' && (
                <Button variant="primary" onClick={() => setSchedule(true)}>
                  Schedule interview
                </Button>
              )
            }
          />
        ) : (
          <div className="space-y-3">
            {d.interviews.map((i) => (
              <Card key={i.id}>
                <CardHeader
                  title={
                    <Link to={`/app/hire/interviews/${i.id}`} className="hover:underline">
                      {i.title}
                    </Link>
                  }
                  description={`${formatDateTime(i.scheduledAt)} · ${i.durationMinutes} min · ${i.interviewers.map((x) => x.name).join(', ')}`}
                  action={<StatusBadge status={i.status} />}
                />
                <CardBody className="space-y-3">
                  {i.meetingUrl && i.status === 'scheduled' && (
                    <a href={i.meetingUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[13px] text-accent-text hover:underline">
                      <VideoCameraIcon size={14} /> Join meeting
                    </a>
                  )}
                  {i.hiddenFeedbackCount > 0 && (
                    <p className="flex items-center gap-1.5 text-[13px] text-muted">
                      <LockSimpleIcon size={14} /> {i.hiddenFeedbackCount} colleague feedback hidden until you submit yours.
                    </p>
                  )}
                  {i.feedback.length ? (
                    <div className="grid gap-3 md:grid-cols-2">
                      {i.feedback.map((f) => (
                        <FeedbackCard key={f.id} f={f} />
                      ))}
                    </div>
                  ) : (
                    <p className="text-[13px] text-muted">No feedback submitted yet.</p>
                  )}
                  {i.iAmInterviewer && !i.mySubmitted && i.status !== 'cancelled' && (
                    <ButtonLink to={`/app/hire/interviews/${i.id}`} variant="primary" size="sm">
                      Submit your feedback
                    </ButtonLink>
                  )}
                </CardBody>
              </Card>
            ))}
          </div>
        ))}

      {tab === 'offers' && canManage && (
        <div className="space-y-3">
          {!d.offers.length ? (
            <EmptyState
              icon={<SealCheckIcon size={22} />}
              title="No offers"
              description={d.application.stage === 'offer' ? 'Draft an offer, then extend it to the candidate.' : 'Move the candidate to the Offer stage to draft an offer.'}
              action={
                d.application.stage === 'offer' &&
                d.application.status === 'active' && (
                  <Button variant="primary" onClick={() => setOffer(true)}>
                    Draft offer
                  </Button>
                )
              }
            />
          ) : (
            d.offers.map((o) => (
              <Card key={o.id}>
                <CardHeader title={o.title} description={o.compensationText} action={<StatusBadge status={o.status} />} />
                <CardBody className="space-y-3">
                  <div className="text-[13px] text-muted">
                    {o.startDate ? `Starts ${formatDate(o.startDate)}` : 'Start date to be agreed'}
                    {o.expiresAt ? ` · respond by ${formatDate(o.expiresAt)}` : ''}
                  </div>
                  <OfferActions offer={o} candidateName={d.candidate.name} />
                </CardBody>
              </Card>
            ))
          )}
        </div>
      )}

      {tab === 'messages' && canManage && (
        <Card>
          <CardHeader title={`Messages with ${d.candidate.name}`} description="Only your hiring team and the candidate can read this thread." />
          <CardBody>
            <MessageThread path={`/hire/applications/${d.application.id}/messages`} queryKey={['hire', 'messages', d.application.id]} emptyHint="Send a note about next steps. The candidate is notified in the app." />
          </CardBody>
        </Card>
      )}

      {tab === 'timeline' && canManage && (
        <Card>
          <CardHeader title="Decision log" description="Every stage change with who made it and why. Also written to the organization audit log." />
          <CardBody>
            {!d.decisions.length ? (
              <p className="text-[13px] text-muted">No decisions yet. The application is in Applied.</p>
            ) : (
              <ol className="space-y-3 border-l border-border pl-4">
                {d.decisions.map((x) => (
                  <li key={x.id} className="text-[13.5px]">
                    <div className="font-medium">
                      {x.fromLabel} to {x.toLabel}
                      {x.visibleToCandidate && (
                        <Badge tone="info" className="ml-2">
                          Shared with candidate
                        </Badge>
                      )}
                    </div>
                    <p className="text-muted">{x.reason}</p>
                    <div className="text-[12px] text-subtle">
                      {x.decidedBy} · {formatDateTime(x.createdAt)}
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </CardBody>
        </Card>
      )}

      <StageMoveDialog
        open={move !== null}
        onOpenChange={(v) => !v && setMove(null)}
        applicationIds={[d.application.id]}
        stages={d.nextStages.map((s) => ({ key: s.key, label: s.label, blocked: s.blocked }))}
        initialStage={move || undefined}
        needsReasonFor={(s) => d.nextStages.find((x) => x.key === s)?.why ?? null}
        candidateLabel={d.candidate.name}
      />
      {canMove && <ScheduleInterviewDialog open={schedule} onOpenChange={setSchedule} applicationId={d.application.id} candidateName={d.candidate.name} />}
      {canManage && <OfferFormDialog open={offer} onOpenChange={setOffer} applicationId={d.application.id} defaultTitle={d.job.title} />}
    </div>
  );
}
