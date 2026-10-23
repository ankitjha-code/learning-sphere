# Role Matrix

Permissions are enforced on the server for every request. A workspace is only a view: switching workspaces never grants anything. A user can hold several roles; each organization role applies only inside that organization.

## Roles

| Role | Scope | Typical person | Demo account |
|---|---|---|---|
| (signed-in user) | personal | any learner or job seeker | learner@demo.learnsphere.test |
| Student | college / training org | enrolled student | student@demo.learnsphere.test |
| Faculty | college / training org | instructor | faculty@demo.learnsphere.test |
| Faculty admin | college / training org | head of department | orgadmin@ (also org admin) |
| Placement officer | college org | training & placement cell | placement@demo.learnsphere.test |
| Organization admin | any org | institution or company administrator | orgadmin@demo.learnsphere.test |
| Recruiter | company org | recruiter | — |
| Recruiter admin | company org | hiring lead | recruiter@demo.learnsphere.test |
| Interviewer | company org | engineer who interviews | interviewer@demo.learnsphere.test |
| Mentor | org role or approved mentor profile | volunteer or alumni mentor | mentor@demo.learnsphere.test |
| Content creator | org role | educator publishing content | creator@demo.learnsphere.test |
| Support | platform | support staff (read-only operations) | — |
| Platform admin | platform | operator | admin@demo.learnsphere.test |

## Workspaces

| Workspace | Who sees it |
|---|---|
| Learn, Career | everyone |
| Teach | faculty, faculty admin, org admin (active org) |
| Campus | placement officer, org admin, faculty admin (college org) |
| Hire | recruiter, recruiter admin, interviewer, org admin (company org) |
| Mentor | approved mentor profile or org mentor role |
| Create | creator, faculty, faculty admin, org admin |
| Admin | platform admin, support |

## Capabilities

`✓` allowed · `own` only their own records · `org` only within their organization · `assigned` only where they are assigned · `—` not allowed

| Capability | Learner | Student | Faculty | Placement | Org admin | Recruiter | Interviewer | Mentor | Creator | Platform admin |
|---|---|---|---|---|---|---|---|---|---|---|
| Roadmaps, CodeLab, practice, diagnostics | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Own Skill DNA, notes, workspace, portfolio, resumes, applications | own | own | own | own | own | own | own | own | own | own |
| AI Council (general assistants) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Faculty teaching assistant (AI) | — | — | org | — | org | — | — | — | — | — |
| Recruiter assessment designer (AI) | — | — | — | — | org | org | — | — | — | — |
| Take classroom assessments | — | org (cohort/invited) | — | — | — | — | — | — | — | — |
| Take recruitment/placement assessments | invited | invited | — | — | — | — | — | — | — | — |
| Create/manage classroom assessments, question bank | — | — | org | — | org | — | — | — | org | public bank |
| Create/manage recruitment assessments | — | — | — | — | org | org | view results | — | — | — |
| Create/manage placement assessments | — | — | — | org | org | — | — | — | — | — |
| Grade answers, accept AI proposals, release results | — | — | org | org (placement) | org | org (recruitment) | — | — | — | — |
| Assignments: submit, view own feedback, request regrade | — | own cohort | — | — | — | — | — | — | — | — |
| Assignments: create, grade, re-evaluate, integrity reports | — | — | assigned cohorts | — | org | — | — | — | — | — |
| Cohorts, courses, rubrics, attendance, interventions | — | — | assigned / org | — | org | — | — | — | — | — |
| Student records, eligibility, corrections review | — | own record (view, request correction) | — | org | org | — | — | — | — | — |
| Placement drives, candidates, interviews, outcome reports | — | own drives | — | org | org | — | — | — | — | — |
| Job postings, pipeline, offers, analytics | — | — | — | — | org | org | — | — | — | — |
| Interview feedback | — | — | — | — | — | org | assigned | — | — | — |
| Search candidates | — | — | — | — | org (company) | org (consented/applied only) | — | — | — | — |
| Mentees' progress | — | — | — | — | — | — | — | consented data only | — | — |
| Mentor private notes | — | — | — | — | — | — | — | own | — | — |
| Publish org library resources and learning paths | — | — | org | — | org | — | — | — | org | — |
| Publish to public library | — | — | — | — | — | — | — | — | submit for review | ✓ (approve) |
| Community: post, vote, report, block | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Community moderation | — | — | org spaces they moderate | — | org spaces | — | — | — | — | ✓ |
| Members, invites, role changes | — | — | faculty admin: faculty/student/mentor | — | org (all roles) | recruiter admin: recruiter/interviewer | — | — | — | ✓ |
| Org audit log | — | — | — | — | own org | — | — | — | — | ✓ |
| Users, orgs, plans, feature flags, retention, incidents, jobs, AI providers | — | — | — | — | — | — | — | — | — | ✓ (support: read-only) |

## Data boundaries that always hold

- Records in organization A are invisible to organization B, including to B's administrators. Cross-organization requests get 404 (tests in `tests/isolation.test.ts` and each module's test file).
- Answer keys, hidden tests and reference solutions are never sent to candidates.
- Mentors see only what the mentee chose to share, and lose access when the mentorship ends. Mentor private notes are never shown to the mentee.
- Recruiters see only candidates who applied, were invited through a placement drive, or opted in to being discoverable; candidate profiles never include protected attributes.
- AI never verifies skills, sets grades or makes hiring decisions. Proposals require a human.
- Platform admins cannot impersonate users.
