import type { SeedTrack } from '../types';

export const interviewReadiness: SeedTrack = {
  slug: 'interview-readiness',
  title: 'Interview Readiness',
  category: 'career',
  summary: 'Write an honest, evidence-based resume, search strategically and handle behavioral, technical and system design interviews through to the offer.',
  description: `**Who it's for:** students, graduates and early-career engineers and analysts preparing for internships or first jobs.

**Prerequisites:** some projects, coursework or work experience to talk about. For the technical topics, basic data structures and complexity help.

**You will be able to:**
- write a resume where every claim is true and backed by evidence
- run a focused job search instead of mass-applying
- tell clear STAR stories about real experiences
- solve coding problems out loud with a repeatable process
- structure a system design conversation
- evaluate and negotiate offers professionally

**Honesty first:** this track never asks you to invent experience, metrics, titles or credentials. Interviewers probe claims, background checks verify them, and fabrication can cost you an offer or a job. Our goal is to help you present what you have actually done as clearly as possible.

**Milestones:** *Evidence-based resume* (topic 1) and *Technical problem-solving process* (topic 4).`,
  level: 'beginner',
  estimatedHours: 18,
  roles: ['software engineer', 'sde intern', 'data analyst', 'graduate trainee', 'frontend developer', 'backend developer', 'full-stack developer', 'data scientist'],
  contentStatus: 'complete',
  topics: [
    {
      slug: 'evidence-based-resumes',
      title: 'Evidence-based resumes',
      module: 'Applications',
      skill: 'resume-writing',
      minutes: 50,
      milestone: true,
      completionCriteria: 'Pass the quiz (70%+) and produce a one-page resume where every bullet follows action + what + result, with every claim true and explainable in an interview.',
      objectives: [
        'Structure a one-page resume that is easy to scan and parse',
        'Write bullets as action + what you did + verifiable result',
        'Quantify impact honestly, or describe concrete outcomes when you have no numbers',
        'Tailor the resume to a specific role without misrepresenting anything',
      ],
      body: `A recruiter often spends well under a minute on a first pass. Your resume's job is to make it easy to see, quickly, that you can do the role, using **evidence**, not adjectives.

### Structure (early career)
1. **Header:** name, email, phone, city, and links to GitHub, portfolio or LinkedIn that actually work.
2. **Education:** degree, institution, expected graduation; relevant coursework if it adds signal.
3. **Experience:** internships, jobs, research, teaching assistant roles, freelance work.
4. **Projects:** two to four of your strongest, with links.
5. **Skills:** languages, frameworks and tools you can genuinely use in an interview.

Keep it to one page, use a simple single-column layout and standard section headings so applicant tracking systems can parse it, and export to PDF.

### The bullet formula
**Action verb + what you did (and how) + result.**

| Weak | Strong |
|---|---|
| Worked on the backend | Built a REST API in Node.js and PostgreSQL for a student club's event sign-ups, used by about 200 members in one semester |
| Responsible for testing | Added 45 unit tests to a Python data pipeline, catching 3 date-parsing bugs before release |
| Helped improve performance | Reduced page load time from about 4 s to 1.5 s by lazy-loading images and caching API responses (measured with Lighthouse) |

### Honest numbers only
Metrics make bullets credible **only if they are true**. Good sources: analytics, test reports, before and after measurements, user counts you can verify, grades or rankings.

If you do not have a number, do **not** invent one. Describe the concrete outcome instead: "adopted by the club committee for all events", "merged into the main project", "used in the final-year lab". An interviewer will ask "how did you measure that?", and you must be able to answer.

### Never misrepresent
- Do not claim skills you cannot discuss at interview depth. If you used something briefly, say "familiar with" or leave it off.
- Do not inflate titles, dates, team roles ("led" when you contributed) or credentials.
- For team projects, describe **your** part: "Implemented the authentication module in a team of four".
- Fabrication is easy to detect through follow-up questions and background checks, and can lead to withdrawn offers or dismissal.

### Tailoring
For each application, reorder projects and skills so the most relevant come first, and use the job description's wording **where it truthfully describes your work**. Tailoring is choosing emphasis; it is not adding things you have not done.

### Common mistakes
- A skills list of twenty technologies with nothing in the bullets to back them up.
- Paragraphs instead of scannable bullets.
- Typos, broken links and inconsistent date formats.
- Photos, full home address or personal details not needed for the role (norms vary by country; follow local guidance).`,
      practice: [
        { title: 'Rewrite five bullets', kind: 'exercise', prompt: 'Take five bullets from your current resume and rewrite each as action + what + result. For every number you include, write down where it comes from. If you cannot source it, replace it with a concrete, verifiable outcome.' },
        { title: 'Tailor for one job', kind: 'exercise', prompt: 'Pick a real job posting. Highlight its top five requirements, then reorder your resume so your strongest truthful evidence for each appears in the top half. Do not add anything you have not done.' },
        { title: 'Interview-proof check', kind: 'exercise', prompt: 'Ask a friend to pick any three lines on your resume and question you for two minutes on each. Remove or rephrase anything you could not explain confidently.' },
      ],
      resources: [
        { title: 'Resume guide', url: 'https://www.techinterviewhandbook.org/resume/', source: 'Tech Interview Handbook', kind: 'article' },
        { title: 'Resumes', url: 'https://capd.mit.edu/resources/resumes/', source: 'MIT Career Advising and Professional Development', kind: 'article' },
      ],
      quiz: [
        {
          key: 'q1',
          type: 'single',
          title: 'Strongest bullet',
          prompt: 'Which resume bullet is strongest?',
          options: [
            { id: 'a', text: 'Hard-working team player with excellent coding skills' },
            { id: 'b', text: 'Worked on a website project' },
            { id: 'c', text: 'Built a React dashboard for a campus food bank to track donations, replacing a shared spreadsheet used by 12 volunteers' },
          ],
          correct: ['c'],
          explanation: 'It states the action, the technology, the context and a concrete, checkable outcome.',
        },
        {
          key: 'q2',
          type: 'single',
          title: 'No metrics',
          prompt: 'Your project had a real outcome but you never measured anything. What should you do?',
          options: [
            { id: 'a', text: 'Estimate an impressive percentage; nobody will check' },
            { id: 'b', text: 'Describe the concrete outcome truthfully, such as who used it or what it replaced' },
            { id: 'c', text: 'Leave the project off entirely' },
          ],
          correct: ['b'],
          explanation: 'Invented numbers collapse under follow-up questions. A specific, true outcome is credible without a metric.',
        },
        {
          key: 'q3',
          type: 'true_false',
          title: 'Tailoring',
          prompt: 'Tailoring a resume means adding the exact skills from the job description even if you have not used them.',
          options: [
            { id: 'true', text: 'True' },
            { id: 'false', text: 'False' },
          ],
          correct: ['false'],
          explanation: 'Tailoring means emphasising and reordering your genuine experience. Adding skills you lack is misrepresentation.',
        },
        {
          key: 'q4',
          type: 'single',
          title: 'Team projects',
          prompt: 'You contributed the database layer to a four-person project. How should the bullet read?',
          options: [
            { id: 'a', text: 'Led development of a full-stack application' },
            { id: 'b', text: 'Designed the PostgreSQL schema and data access layer for a four-person team project' },
            { id: 'c', text: 'Built a full-stack application single-handedly' },
          ],
          correct: ['b'],
          explanation: 'Describe your actual contribution and the team context. Interviewers will ask about your part specifically.',
        },
        {
          key: 'q5',
          type: 'multi',
          title: 'Parsing-friendly',
          prompt: 'Which choices help applicant tracking systems and recruiters read your resume? Select all that apply.',
          options: [
            { id: 'a', text: 'Standard section headings like Education, Experience, Projects' },
            { id: 'b', text: 'A simple single-column layout' },
            { id: 'c', text: 'Key information placed inside images or graphics' },
            { id: 'd', text: 'Consistent date formats' },
          ],
          correct: ['a', 'b', 'd'],
          explanation: 'Text in images is often unreadable to parsers. Clear headings, simple layout and consistency help both software and people.',
        },
      ],
    },
    {
      slug: 'job-search-strategy',
      title: 'Job search strategy and applications',
      module: 'Applications',
      skill: 'job-search',
      minutes: 40,
      objectives: [
        'Define target roles and companies based on your skills and goals',
        'Use referrals, networking and direct applications effectively and ethically',
        'Track applications and follow up professionally',
        'Recognise and avoid recruitment scams',
      ],
      body: `A focused search beats sending hundreds of identical applications. Quality, targeting and follow-up matter more than volume.

### 1. Define your target
Write down two or three role titles (for example "software engineer intern", "junior data analyst", "graduate trainee: technology") and what each typically requires. Compare against your evidence. Where there is a gap, decide whether to build a project, take a course, or target a better-matched role first.

### 2. Build a target list
List 20 to 40 organisations across a range: large companies, mid-size firms, startups, public sector and non-profits. For each, note the careers page, typical hiring season (campus roles often open months before the start date) and any contacts.

### 3. Channels, roughly in order of effectiveness
- **Referrals:** an employee recommends you internally. Ask people who know your work, and make it easy: send your resume, the job link and two lines on why you fit. Never pressure anyone, and do not ask strangers to vouch for work they have not seen.
- **Networking:** informational conversations, meetups, alumni groups, open-source communities. Ask for advice and insight, not a job, in the first message.
- **Direct applications** through careers pages, with a tailored resume.
- **Campus placement** and university career services.
- **Job boards** for discovery; then apply on the company's own site where possible.

### A short outreach message

\`\`\`text
Hi Priya, I'm a final-year CS student and enjoyed your talk on data
pipelines at PyCon. I'm applying for the data engineering internship on
your team. Could I ask you two or three questions about what the team
values in interns? 15 minutes at your convenience would be great.
Thanks, Arjun
\`\`\`

### 4. Track everything
Use a simple spreadsheet: company, role, link, date applied, contact, status, next action, follow-up date. Follow up politely about a week after an interview if you have not heard back.

### 5. Look after yourself
Rejection is normal and rarely personal. Set weekly targets you control (applications sent, people contacted, practice problems solved) rather than outcomes you do not.

### Avoid scams
Legitimate employers do not ask you to pay for training, equipment or "registration" before hiring, and do not interview only by chat with unofficial email addresses. Verify job postings on the company's official careers page.

### Common mistakes
- Applying to everything with one generic resume.
- Waiting for the perfect resume before applying anywhere.
- Asking for a referral in the first message to a stranger.
- Exaggerating your experience in cover letters or messages; the same honesty rules apply as for your resume.`,
      practice: [
        { title: 'Target list', kind: 'exercise', prompt: 'Create an application tracker with columns for company, role, link, deadline, contact, status and next action. Add 20 organisations that match your target role, with at least five you could reach through someone you know.' },
        { title: 'Three outreach messages', kind: 'exercise', prompt: 'Write three short, personalised outreach messages (under 100 words each) asking for advice, not a job. Each must mention something specific about the person or team.' },
        { title: 'Gap plan', kind: 'exercise', prompt: 'Compare three real job descriptions with your evidence. List the top two gaps and a concrete two-week plan to close one of them with a real project or course.' },
      ],
      resources: [
        { title: 'Software engineering interview guide', url: 'https://www.techinterviewhandbook.org/software-engineering-interview-guide/', source: 'Tech Interview Handbook', kind: 'article' },
        { title: 'Career resources', url: 'https://capd.mit.edu/resources/', source: 'MIT Career Advising and Professional Development', kind: 'article' },
        { title: 'National Internship Portal', url: 'https://internship.aicte-india.org/', source: 'AICTE, Government of India', kind: 'interactive' },
      ],
      quiz: [
        {
          key: 'q1',
          type: 'single',
          title: 'Referral request',
          prompt: 'What is the best way to ask a former project teammate (now at a company) for a referral?',
          options: [
            { id: 'a', text: 'Send only "Can you refer me?"' },
            { id: 'b', text: 'Send the job link, your resume and two lines on why you fit, and make it easy to say no' },
            { id: 'c', text: 'Ask them to describe work of yours they have never seen' },
          ],
          correct: ['b'],
          explanation: 'Give the context they need and respect their choice. Referrers should only vouch for what they know.',
        },
        {
          key: 'q2',
          type: 'single',
          title: 'Scam warning sign',
          prompt: 'Which is a strong warning sign of a recruitment scam?',
          options: [
            { id: 'a', text: 'A multi-round interview process' },
            { id: 'b', text: 'Being asked to pay a fee for training or registration before you are hired' },
            { id: 'c', text: 'A posting listed on the company\'s official careers page' },
          ],
          correct: ['b'],
          explanation: 'Legitimate employers do not charge candidates to be hired. Verify postings on official channels.',
        },
        {
          key: 'q3',
          type: 'true_false',
          title: 'Volume vs targeting',
          prompt: 'Sending the same resume to as many jobs as possible is generally more effective than a targeted search.',
          options: [
            { id: 'true', text: 'True' },
            { id: 'false', text: 'False' },
          ],
          correct: ['false'],
          explanation: 'Targeted, tailored applications and referrals usually convert far better than mass applications.',
        },
        {
          key: 'q4',
          type: 'multi',
          title: 'Controllable goals',
          prompt: 'Which weekly goals are within your control? Select all that apply.',
          options: [
            { id: 'a', text: 'Send 8 tailored applications' },
            { id: 'b', text: 'Get 3 offers' },
            { id: 'c', text: 'Have 2 informational conversations' },
            { id: 'd', text: 'Solve 10 practice problems' },
          ],
          correct: ['a', 'c', 'd'],
          explanation: 'Offers depend on others. Focusing on inputs you control keeps momentum through rejections.',
        },
      ],
    },
    {
      slug: 'behavioral-interviews-star',
      title: 'Behavioral interviews with STAR',
      module: 'Interviews',
      skill: 'behavioral-interviews',
      minutes: 45,
      objectives: [
        'Explain why interviewers ask behavioral questions',
        'Structure answers with Situation, Task, Action, Result (STAR)',
        'Build a bank of true stories that cover common themes',
        'Answer failure and conflict questions with honesty and reflection',
      ],
      body: `Behavioral questions ("Tell me about a time when...") assume that past behaviour predicts future behaviour. Interviewers want evidence of how you work: ownership, collaboration, handling ambiguity, learning from mistakes.

### The STAR structure
- **Situation:** brief context. Where, when, what was going on? (1 to 2 sentences)
- **Task:** your responsibility or goal. (1 sentence)
- **Action:** what **you** did, step by step. This is the longest part. Say "I", not only "we".
- **Result:** the outcome, ideally measurable, plus what you learned.

### Example: "Tell me about a time you handled a tight deadline."

\`\`\`text
S: In my third-year software engineering course, our team of four had
   two weeks left to deliver a working library management app, and our
   backend developer fell ill.
T: I had built the frontend, and I volunteered to take over the API so
   we could still demo on time.
A: I listed the remaining endpoints and split them into must-have and
   nice-to-have with the team. I paired with the teammate who knew the
   database for two evenings to understand the schema, wrote the four
   must-have endpoints with tests, and posted a short daily update so
   everyone knew what was blocked.
R: We demoed all core features on time and scored an A-minus. The
   nice-to-have search feature was cut. I learned to agree on scope
   early and to communicate progress daily when plans change.
\`\`\`

Aim for about two minutes. The interviewer will ask follow-up questions, so know the details.

### Build a story bank
Prepare six to eight **true** stories from projects, internships, part-time jobs, clubs, sports or volunteering. Map each to several themes:

| Theme | Example prompt |
|---|---|
| Ownership | A time you went beyond your assigned task |
| Collaboration and conflict | A disagreement with a teammate |
| Failure | A mistake you made and what you changed |
| Learning | Something you learned quickly |
| Ambiguity | A problem with no clear instructions |
| Impact | Work you are proud of |

### Honesty and reflection
Use real experiences, even small ones. A genuine story about a class project is far stronger than an impressive invented one, because follow-up questions ("What did your teammate say then?", "What exactly did you change?") quickly expose fabrication. For failure questions, pick a real mistake, own it without blaming others, and focus on what you changed afterwards.

### Common mistakes
- Spending most of the answer on Situation and almost none on Action.
- "We did..." throughout, so the interviewer cannot see your contribution.
- No result or reflection at the end.
- Choosing a "failure" that is really a disguised strength ("I work too hard").
- Inventing or exaggerating stories. Never do this.`,
      practice: [
        { title: 'Write 3 STAR stories', kind: 'exercise', prompt: 'Write three STAR stories from your real experience: one about teamwork or conflict, one about a mistake, and one about something you are proud of. Keep each under 250 words, with Action as the longest section.' },
        { title: 'Story bank matrix', kind: 'exercise', prompt: 'Make a table with your 6 to 8 true stories as rows and themes (ownership, conflict, failure, learning, ambiguity, impact) as columns. Tick which stories fit each theme and fill any empty column.' },
        { title: 'Record and review', kind: 'exercise', prompt: 'Record yourself answering "Tell me about a time you disagreed with a teammate." Check the length (about two minutes), how often you said "I" for your actions, and whether you stated a result and lesson.' },
      ],
      resources: [
        { title: 'Behavioral interviews', url: 'https://www.techinterviewhandbook.org/behavioral-interview/', source: 'Tech Interview Handbook', kind: 'article' },
        { title: 'Behavioral interview questions', url: 'https://www.techinterviewhandbook.org/behavioral-interview-questions/', source: 'Tech Interview Handbook', kind: 'article' },
        { title: 'Leadership Principles', url: 'https://www.amazon.jobs/content/en/our-workplace/leadership-principles', source: 'Amazon Jobs', kind: 'article' },
      ],
      quiz: [
        {
          key: 'q1',
          type: 'single',
          title: 'Longest section',
          prompt: 'In a STAR answer, which part should usually take the most time?',
          options: [
            { id: 'a', text: 'Situation' },
            { id: 'b', text: 'Action' },
            { id: 'c', text: 'Result' },
          ],
          correct: ['b'],
          explanation: 'Action shows what you actually did, which is what the interviewer is assessing.',
        },
        {
          key: 'q2',
          type: 'single',
          title: 'Failure question',
          prompt: 'Which is the best approach to "Tell me about a time you failed"?',
          options: [
            { id: 'a', text: 'Say you have never really failed' },
            { id: 'b', text: 'Describe a real mistake, own it, and explain what you changed afterwards' },
            { id: 'c', text: 'Describe a time a teammate\'s failure affected you' },
          ],
          correct: ['b'],
          explanation: 'Interviewers look for self-awareness and learning. Deflecting or blaming others is a red flag.',
        },
        {
          key: 'q3',
          type: 'true_false',
          title: 'Invented stories',
          prompt: 'If you lack strong experiences, it is acceptable to invent a realistic story for a behavioral interview.',
          options: [
            { id: 'true', text: 'True' },
            { id: 'false', text: 'False' },
          ],
          correct: ['false'],
          explanation: 'Fabrication is dishonest and usually falls apart under follow-up questions. Small but real experiences work well when told clearly.',
        },
        {
          key: 'q4',
          type: 'matching',
          title: 'STAR parts',
          prompt: 'Match each sentence to its STAR component.',
          pairs: {
            left: [
              { id: 'l1', text: '"Our team\'s demo was in two weeks and our backend developer fell ill."' },
              { id: 'l2', text: '"I volunteered to take over the API."' },
              { id: 'l3', text: '"I wrote the four must-have endpoints with tests and posted daily updates."' },
              { id: 'l4', text: '"We demoed on time, and I learned to agree on scope early."' },
            ],
            right: [
              { id: 'r1', text: 'Situation' },
              { id: 'r2', text: 'Task' },
              { id: 'r3', text: 'Action' },
              { id: 'r4', text: 'Result' },
            ],
          },
          matches: { l1: 'r1', l2: 'r2', l3: 'r3', l4: 'r4' },
          explanation: 'Context, responsibility, your steps, then outcome and learning.',
        },
      ],
    },
    {
      slug: 'technical-interview-process',
      title: 'Technical interview problem-solving process',
      module: 'Interviews',
      skill: 'technical-interviews',
      minutes: 60,
      milestone: true,
      completionCriteria: 'Pass the quiz (70%+) and complete two timed mock problems out loud, following all six steps, with a partner or recording.',
      objectives: [
        'Follow a repeatable process: clarify, examples, approach, code, test, analyse',
        'Think out loud so the interviewer can follow and help',
        'State time and space complexity and discuss trade-offs',
        'Recover gracefully when stuck',
      ],
      body: `Coding interviews assess **how you solve problems**, not only whether you reach the answer. A clear process shows structured thinking and communication, and helps you when you are stuck.

### The six steps

**1. Clarify (2 to 3 minutes).** Restate the problem. Ask about input size, types, duplicates, negative numbers, empty input and expected output format.

**2. Examples.** Work through a normal example and an edge case by hand. This confirms understanding and gives you test cases.

**3. Approach.** Start with a brute-force idea and its complexity, then look for something better. Talk through it *before* coding and get a nod from the interviewer.

**4. Code.** Write clean code with meaningful names. Narrate key decisions.

**5. Test.** Trace your examples through the code line by line. Then check edge cases.

**6. Analyse.** State time and space complexity and mention trade-offs or follow-ups.

### Worked example
> Given a list of integers and a target, return the indices of two numbers that add up to the target.

*Clarify:* exactly one solution? Can I use the same element twice? (Assume one solution, no reuse.)

*Brute force:* check every pair, O(n²) time, O(1) space.

*Better:* as we scan, store each value's index in a hash map and look up \`target - x\`.

\`\`\`python
def two_sum(nums, target):
    seen = {}                      # value -> index
    for i, x in enumerate(nums):
        need = target - x
        if need in seen:
            return [seen[need], i]
        seen[x] = i
    return []                      # no pair found
\`\`\`

*Test:* \`nums = [2, 7, 11, 15], target = 9\`: i=0 stores 2; i=1 needs 2, found, return [0, 1]. Edge case: \`[3, 3], target 6\` returns [0, 1] because we check before inserting.

*Analyse:* O(n) time, O(n) extra space. We traded memory for speed.

### When you are stuck
Say so and think aloud: "I'm considering sorting first, but that loses the original indices." Try a smaller example, recall similar patterns (hash map, two pointers, sliding window, BFS), or ask for a hint. Interviewers often value how you take a hint.

### Honest practice
Practise regularly on varied problems and review solutions you could not finish. If you have seen a problem before, it is fair and honest to say so. Using unauthorised help during a live or take-home assessment, including AI tools where they are not allowed, is cheating; it misrepresents your ability and can lead to disqualification.

### Common mistakes
- Coding immediately without clarifying.
- Silence for minutes at a time.
- Declaring "done" without testing.
- Ignoring complexity until asked.`,
      practice: [
        { title: 'Two Sum with the full process', kind: 'problem', ref: 'two-sum' },
        { title: 'Timed mock, out loud', kind: 'exercise', prompt: 'Set a 30-minute timer, pick a medium problem you have not seen, and solve it out loud following all six steps while recording yourself. Afterwards note where you went silent or skipped a step.' },
        { title: 'Edge case lists', kind: 'exercise', prompt: 'For five common problem types (arrays, strings, linked lists, trees, intervals), write the edge cases you will always check, such as empty input, one element, duplicates and negative numbers.' },
      ],
      resources: [
        { title: 'Coding interview techniques', url: 'https://www.techinterviewhandbook.org/coding-interview-techniques/', source: 'Tech Interview Handbook', kind: 'article' },
        { title: 'Coding interview cheatsheet', url: 'https://www.techinterviewhandbook.org/coding-interview-cheatsheet/', source: 'Tech Interview Handbook', kind: 'cheatsheet' },
        { title: 'Algorithms study cheatsheet', url: 'https://www.techinterviewhandbook.org/algorithms/study-cheatsheet/', source: 'Tech Interview Handbook', kind: 'cheatsheet' },
      ],
      quiz: [
        {
          key: 'q1',
          type: 'single',
          title: 'First step',
          prompt: 'The interviewer finishes describing a problem. What should you do first?',
          options: [
            { id: 'a', text: 'Start coding the optimal solution' },
            { id: 'b', text: 'Restate the problem and ask clarifying questions about inputs and edge cases' },
            { id: 'c', text: 'Ask for the answer' },
          ],
          correct: ['b'],
          explanation: 'Clarifying avoids solving the wrong problem and shows structured thinking.',
        },
        {
          key: 'q2',
          type: 'single',
          title: 'Complexity',
          prompt: 'What are the time and space complexities of the hash map two-sum solution?',
          options: [
            { id: 'a', text: 'O(n²) time, O(1) space' },
            { id: 'b', text: 'O(n) time, O(n) space' },
            { id: 'c', text: 'O(n log n) time, O(1) space' },
          ],
          correct: ['b'],
          explanation: 'One pass with constant-time lookups gives O(n) time; the map can hold up to n entries.',
        },
        {
          key: 'q3',
          type: 'true_false',
          title: 'Seen it before',
          prompt: 'If you recognise an interview problem you have solved before, it is honest and acceptable to tell the interviewer.',
          options: [
            { id: 'true', text: 'True' },
            { id: 'false', text: 'False' },
          ],
          correct: ['true'],
          explanation: 'Interviewers appreciate honesty. They may give you a different problem or ask you to explain the solution in depth.',
        },
        {
          key: 'q4',
          type: 'multi',
          title: 'Getting unstuck',
          prompt: 'Which are good strategies when you are stuck? Select all that apply.',
          options: [
            { id: 'a', text: 'Think out loud about what you have tried and why it fails' },
            { id: 'b', text: 'Work through a smaller example by hand' },
            { id: 'c', text: 'Stay silent until you have the full answer' },
            { id: 'd', text: 'Consider common patterns such as hash maps or two pointers' },
          ],
          correct: ['a', 'b', 'd'],
          explanation: 'Visible reasoning lets the interviewer help, and small examples and known patterns often reveal the approach.',
        },
      ],
    },
    {
      slug: 'system-design-interview-approach',
      title: 'System design interview approach',
      module: 'Interviews',
      skill: 'system-design-basics',
      minutes: 55,
      objectives: [
        'Structure a system design discussion from requirements to trade-offs',
        'Do rough capacity estimates to guide design choices',
        'Sketch a high-level architecture with clients, APIs, services, data stores and caches',
        'Discuss bottlenecks, scaling options and trade-offs clearly',
      ],
      body: `System design interviews are open-ended conversations: "Design a URL shortener" or "Design a news feed". There is no single right answer. Interviewers assess how you gather requirements, make reasonable decisions and explain trade-offs. Entry-level candidates usually get simpler versions or none at all, but the structure helps for project discussions too.

### A five-step framework

**1. Requirements (5 minutes).**
- *Functional:* what must it do? (Shorten a URL; redirect; optional custom aliases and expiry.)
- *Non-functional:* scale, latency, availability, consistency. (Redirects must be fast and highly available.)

**2. Estimates (3 to 5 minutes).** Rough numbers guide choices:

\`\`\`text
100 million new URLs per month  ->  about 40 writes per second
Reads 100x writes                ->  about 4,000 redirects per second
Each record about 500 bytes      ->  about 50 GB per month, 3 TB over 5 years
\`\`\`

Order of magnitude is enough. State your assumptions out loud.

**3. API and data model.**

\`\`\`text
POST /urls        { longUrl }   ->  { shortCode }
GET  /{shortCode}               ->  301 or 302 redirect to longUrl

urls(short_code PK, long_url, created_at, expires_at, owner_id)
\`\`\`

**4. High-level design.** Draw boxes: clients, load balancer, stateless application servers, database, and a cache (for hot short codes). Walk one request through the diagram.

**5. Deep dives and trade-offs.** Pick the interesting parts:
- How to generate unique short codes (counter with base-62 encoding vs random strings with collision checks)
- Read scaling with caching and read replicas
- Database choice: relational vs key-value, and why
- What happens when a component fails

### Talking about trade-offs
Every choice costs something. Say it explicitly: "A cache cuts read latency and database load, but adds invalidation complexity and stale data if a URL is deleted." Interviewers look for this reasoning more than for specific technologies.

### Honesty in design interviews
If you have not used a technology, say so and reason from principles: "I haven't run Kafka in production, but I'd want a durable queue here because..." This is far better than bluffing, which experienced interviewers spot quickly.

### Common mistakes
- Jumping to a complex architecture before clarifying requirements.
- Naming technologies without explaining why.
- Ignoring failure modes and single points of failure.
- Designing in silence instead of collaborating with the interviewer.`,
      practice: [
        { title: 'Design a URL shortener', kind: 'exercise', prompt: 'In 35 minutes, work through all five steps for a URL shortener on paper or a whiteboard tool: requirements, estimates, API and data model, a diagram, and two deep dives with trade-offs.' },
        { title: 'Explain your own project', kind: 'exercise', prompt: 'Draw the architecture of a project you built. Identify its single points of failure and the first bottleneck at 100 times the load, and explain how you would address each.' },
        { title: 'Estimation drills', kind: 'exercise', prompt: 'Estimate storage and requests per second for: a photo-sharing app with 1 million daily users, and a chat app with 10 million messages per day. Write down every assumption.' },
      ],
      resources: [
        { title: 'The System Design Primer', url: 'https://github.com/donnemartin/system-design-primer', source: 'GitHub (donnemartin)', kind: 'book' },
        { title: 'System design interviews', url: 'https://www.techinterviewhandbook.org/system-design/', source: 'Tech Interview Handbook', kind: 'article' },
        { title: 'System Design roadmap', url: 'https://roadmap.sh/system-design', source: 'roadmap.sh', kind: 'interactive' },
      ],
      quiz: [
        {
          key: 'q1',
          type: 'single',
          title: 'First step',
          prompt: 'What should you do first in a system design interview?',
          options: [
            { id: 'a', text: 'Draw a microservices architecture' },
            { id: 'b', text: 'Clarify functional and non-functional requirements' },
            { id: 'c', text: 'Choose a database' },
          ],
          correct: ['b'],
          explanation: 'Requirements drive every later decision. Designing without them risks solving the wrong problem.',
        },
        {
          key: 'q2',
          type: 'single',
          title: 'Estimation',
          prompt: 'About 8.6 million requests arrive per day, evenly spread. Roughly how many per second is that?',
          options: [
            { id: 'a', text: 'About 10' },
            { id: 'b', text: 'About 100' },
            { id: 'c', text: 'About 10,000' },
          ],
          correct: ['b'],
          explanation: 'A day has about 86,400 seconds, so 8.6 million / 86,400 is about 100 per second.',
        },
        {
          key: 'q3',
          type: 'single',
          title: 'Unfamiliar technology',
          prompt: 'The interviewer asks about a technology you have never used. What is the best response?',
          options: [
            { id: 'a', text: 'Pretend you have used it and describe it vaguely' },
            { id: 'b', text: 'Say you have not used it and reason about the problem from principles' },
            { id: 'c', text: 'Change the subject' },
          ],
          correct: ['b'],
          explanation: 'Honest reasoning from fundamentals is valued; bluffing is usually obvious and damages trust.',
        },
        {
          key: 'q4',
          type: 'multi',
          title: 'Cache trade-offs',
          prompt: 'Which are real costs of adding a cache in front of a database? Select all that apply.',
          options: [
            { id: 'a', text: 'Possible stale data' },
            { id: 'b', text: 'Cache invalidation complexity' },
            { id: 'c', text: 'An extra component to operate and monitor' },
            { id: 'd', text: 'Guaranteed slower reads' },
          ],
          correct: ['a', 'b', 'c'],
          explanation: 'Caches usually speed up reads, but they bring staleness, invalidation logic and operational overhead.',
        },
      ],
    },
    {
      slug: 'offers-and-negotiation',
      title: 'Offers and negotiation',
      module: 'Offers',
      skill: 'job-search',
      minutes: 40,
      objectives: [
        'Understand the parts of an offer: base pay, bonus, equity, benefits and conditions',
        'Research fair compensation ranges for a role and location',
        'Negotiate politely, honestly and with evidence',
        'Accept or decline offers professionally and keep your commitments',
      ],
      body: `Receiving an offer is the start of a conversation, not always the end. Negotiating respectfully is normal in many industries and rarely leads to an offer being withdrawn when done professionally.

### Read the whole offer
- **Base salary** and how often it is reviewed
- **Bonus:** joining, performance or retention, and any clawback conditions (repaying if you leave early)
- **Equity:** stock or options, the vesting schedule and cliff
- **Benefits:** health insurance, leave, learning budget, remote work, relocation
- **Conditions:** start date, probation, location, notice period, service agreements or bonds, background checks

Ask for the offer in writing and ask questions about anything unclear. Compare **total compensation** and the learning opportunity, not only base pay.

### Research your market
Use salary data sites, university placement reports, peers and mentors to understand typical ranges for the role, level and city. Data is noisy; look for ranges, not single numbers.

### Negotiating
1. **Express enthusiasm** for the role.
2. **Ask** whether there is flexibility, giving evidence: market data, a competing offer, or relevant skills.
3. **Be specific** and reasonable.
4. **Consider non-salary items** if base pay is fixed: joining bonus, start date, learning budget, remote days.

\`\`\`text
Thank you, I'm excited about joining the platform team. Based on my
research for similar graduate roles in Bengaluru and the offer I've
received from another company, I was hoping for a base salary closer
to X. Is there flexibility there? Either way, I'm keen to make this work.
\`\`\`

### Honesty in negotiation
Never invent a competing offer or inflate your current pay. Recruiters may ask for proof, and being caught can end the offer and damage your reputation in a small industry. If you have no competing offer, negotiate on market data and your skills. In some places it is also illegal for employers to ask about salary history; you can politely decline to share it and give your expectations instead.

### Campus placements
Many campus programmes have fixed packages and rules (for example, one offer per student, or no declining after accepting). Learn your institution's policy before interviewing and follow it.

### Accepting and declining
Accept in writing once you are satisfied. Decline other offers promptly and politely; you may meet these people again. **Do not accept an offer while intending to back out** for a later one unless you are prepared to handle it honestly and early; reneging harms the employer, other candidates and sometimes your institution.

### Common mistakes
- Accepting verbally on the call before reading the written offer.
- Focusing only on base salary and ignoring bonds, clawbacks or vesting.
- Ultimatums or aggressive tone.
- Bluffing about other offers.`,
      practice: [
        { title: 'Offer comparison sheet', kind: 'exercise', prompt: 'Build a spreadsheet comparing two real or sample offers on base, bonus, equity, benefits, conditions (bonds, notice period), location and learning opportunity. Decide which you prefer and write two sentences explaining why.' },
        { title: 'Negotiation script', kind: 'exercise', prompt: 'Write and rehearse a short, honest negotiation message for a sample offer using only true evidence (market research and your skills). Practise it aloud with a friend playing the recruiter.' },
        { title: 'Know your rules', kind: 'exercise', prompt: 'Find your institution\'s placement policy (or local norms for off-campus hiring) on accepting, declining and multiple offers. Summarise the three rules that matter most to you.' },
      ],
      resources: [
        { title: 'Negotiation', url: 'https://www.techinterviewhandbook.org/negotiation/', source: 'Tech Interview Handbook', kind: 'article' },
        { title: 'Understanding compensation', url: 'https://www.techinterviewhandbook.org/understanding-compensation/', source: 'Tech Interview Handbook', kind: 'article' },
        { title: 'Levels.fyi salary data', url: 'https://www.levels.fyi/', source: 'Levels.fyi', kind: 'interactive' },
      ],
      quiz: [
        {
          key: 'q1',
          type: 'single',
          title: 'Competing offers',
          prompt: 'You have no competing offer but want to negotiate. What should you do?',
          options: [
            { id: 'a', text: 'Mention a made-up offer to create pressure' },
            { id: 'b', text: 'Negotiate using market research and your relevant skills' },
            { id: 'c', text: 'Never negotiate without another offer' },
          ],
          correct: ['b'],
          explanation: 'Invented offers are dishonest and risky. Market data and real skills are legitimate evidence.',
        },
        {
          key: 'q2',
          type: 'single',
          title: 'Clawback',
          prompt: 'An offer includes a joining bonus with a 12-month clawback. What does that usually mean?',
          options: [
            { id: 'a', text: 'You receive the bonus twice' },
            { id: 'b', text: 'You may have to repay it if you leave within 12 months' },
            { id: 'c', text: 'The bonus is paid after 12 months' },
          ],
          correct: ['b'],
          explanation: 'Clawback terms require repayment if you leave before the stated period. Read the conditions carefully.',
        },
        {
          key: 'q3',
          type: 'multi',
          title: 'Offer components',
          prompt: 'Which should you check before accepting an offer? Select all that apply.',
          options: [
            { id: 'a', text: 'Service agreement or bond conditions' },
            { id: 'b', text: 'Equity vesting schedule' },
            { id: 'c', text: 'Notice period and probation terms' },
            { id: 'd', text: 'Only the base salary' },
          ],
          correct: ['a', 'b', 'c'],
          explanation: 'Total compensation and conditions matter. Bonds, vesting and notice periods can significantly affect your choices.',
        },
        {
          key: 'q4',
          type: 'true_false',
          title: 'Written offer',
          prompt: 'It is good practice to read the written offer in full before formally accepting.',
          options: [
            { id: 'true', text: 'True' },
            { id: 'false', text: 'False' },
          ],
          correct: ['true'],
          explanation: 'Verbal summaries can omit conditions. Accept only once you have read and understood the written terms.',
        },
      ],
    },
  ],
};

export const communicationWriting: SeedTrack = {
  slug: 'communication-and-writing',
  title: 'Communication and Technical Writing',
  category: 'professional',
  summary: 'Write clearly, document your work and decisions, present technical ideas and collaborate effectively with teammates and stakeholders.',
  description: `**Who it's for:** students and early-career professionals who want their ideas and work to be understood and trusted.

**Prerequisites:** none. Having one project of your own (a coursework project is fine) makes the exercises more useful.

**You will be able to:**
- write concise messages, emails and updates that get read and acted on
- ask questions that get fast, useful answers
- write READMEs and documentation that help others use your work
- record technical decisions in short design docs and decision records
- present technical work to technical and non-technical audiences
- give and receive feedback constructively in a team
- manage stakeholder expectations with clear, honest updates

**Honesty first:** clear writing is never a way to overstate. Describe features, results and your own contribution exactly as they are.

**Milestone:** *A README others can follow* (topic 2).`,
  level: 'beginner',
  estimatedHours: 15,
  roles: ['software engineer', 'sde intern', 'data analyst', 'graduate trainee', 'product manager', 'technical writer', 'business analyst'],
  contentStatus: 'complete',
  topics: [
    {
      slug: 'clear-written-communication',
      title: 'Clear written communication',
      module: 'Writing',
      skill: 'communication',
      minutes: 40,
      objectives: [
        'Lead with the main point or request (bottom line up front)',
        'Write short sentences and paragraphs in plain language',
        'Ask questions with enough context to get a useful answer in one reply',
        'Structure messages so readers can act without a follow-up',
        'Choose the right channel and edit before sending',
      ],
      body: `At work, most communication is written: chat, email, tickets, pull requests. Readers are busy and often skim, so make your message easy to understand and act on.

### Bottom line up front
Put the conclusion or request in the first sentence, then the supporting detail.

\`\`\`text
Weak:
  Hi, so yesterday I was looking at the deploy and noticed some things
  with the config, and after checking with Ravi it seems like maybe...

Clear:
  Request: please approve PR #482 by 3 pm so we can deploy today.
  Why: it fixes the checkout timeout customers reported this morning.
  Risk: low; the change is one config value and is covered by tests.
\`\`\`

### Worked example: rewriting an email
**Before**

\`\`\`text
Subject: Charts

Hi team, hope everyone is well. As you know we have been discussing the
dashboard for a while and there were a lot of opinions about libraries.
I spent some time comparing a few. They all have pros and cons and it is
hard to say, but I think one of them might be better. Let me know your
thoughts.
\`\`\`

**After**

\`\`\`text
Subject: Decision needed by Thursday: charting library for the dashboard

Hi team,

I recommend Library A for the reporting dashboard. Please reply with any
objections by Thursday 5 pm; if there are none, I will start on Friday.

Why A:
- Supports all four chart types we need (B has no heatmaps)
- Open-source licence that allows commercial use
- About half the bundle size of C, measured in a test build

Full comparison: <link>
Meera
\`\`\`

What changed: a subject that states the decision and deadline, the recommendation in the first line, a clear default if nobody replies, and evidence in a scannable list with its source.

### Plain language
| Wordy | Plain |
|---|---|
| utilise | use |
| in order to | to |
| at this point in time | now |
| due to the fact that | because |
| it is recommended that you restart | restart |

- One idea per sentence; aim for short sentences.
- Use active voice: "The script deletes old logs" rather than "Old logs are deleted by the script".
- Define acronyms the first time you use them.

### Asking a question that gets answered

\`\`\`text
The staging API returns 401 for GET /orders with the token from
npm run login. I checked that the token has not expired (exp is tomorrow)
and that the header is "Authorization: Bearer <token>". Does staging
expect a different audience claim than local? Full error: <link>
\`\`\`

It says what you are trying to do, what happened, what you already checked and the specific question. Do not send "Hi" and wait; write the full question in one message.

### Fit the channel
Chat for quick, informal coordination; email or documents for decisions and anything that needs a record; a call when a thread has gone back and forth more than a few times. Afterwards, write the outcome of the call down where everyone can find it.

### Edit before sending
Is the request in the first two lines? Can a sentence be cut? Will the reader know what to do next? Are names, dates and links correct? Would the tone be fine if forwarded to your manager?

### Common mistakes
- Burying the request in the last paragraph.
- Walls of text with no structure.
- Vague asks like "thoughts?" without saying what decision is needed or by when.
- Sending while frustrated; reread anything tense after a short break.`,
      practice: [
        { title: 'Rewrite a message', kind: 'exercise', prompt: 'Find a long message or email you sent recently. Rewrite it with the request or conclusion in the first sentence, then bullets for context, and cut its length by at least a third.' },
        { title: 'Status update', kind: 'exercise', prompt: 'Write a weekly status update for a project in under 120 words using the headings Done, Next, Blocked and Decisions needed.' },
        { title: 'Ask a better question', kind: 'exercise', prompt: 'Take a technical question you recently asked or want to ask. Rewrite it to include the goal, what happened, what you already tried and one specific question, then compare it with the original.' },
      ],
      resources: [
        { title: 'Technical Writing One', url: 'https://developers.google.com/tech-writing/one', source: 'Google for Developers', kind: 'course' },
        { title: 'Short, clear sentences', url: 'https://developers.google.com/tech-writing/one/clear-sentences', source: 'Google for Developers', kind: 'course' },
        { title: 'Writing for Web Accessibility', url: 'https://www.w3.org/WAI/tips/writing/', source: 'W3C WAI', kind: 'article' },
      ],
      quiz: [
        {
          key: 'q1',
          type: 'single',
          title: 'Bottom line up front',
          prompt: 'Where should the main request go in a work email?',
          options: [
            { id: 'a', text: 'In the first sentence or two' },
            { id: 'b', text: 'At the end, after all the context' },
            { id: 'c', text: 'In an attachment' },
          ],
          correct: ['a'],
          explanation: 'Busy readers may only read the start. Leading with the request makes action more likely.',
          difficulty: 'easy',
        },
        {
          key: 'q2',
          type: 'single',
          title: 'Active voice',
          prompt: 'Which sentence uses active voice?',
          options: [
            { id: 'a', text: 'The bug was fixed by the team.' },
            { id: 'b', text: 'The team fixed the bug.' },
            { id: 'c', text: 'The bug has been fixed.' },
          ],
          correct: ['b'],
          explanation: 'Active voice puts the actor first, which is usually clearer and shorter.',
        },
        {
          key: 'q3',
          type: 'multi',
          title: 'Good questions',
          prompt: 'Which details make a technical question easier to answer in one reply? Select all that apply.',
          options: [
            { id: 'a', text: 'What you are trying to achieve' },
            { id: 'b', text: 'The exact error or unexpected result' },
            { id: 'c', text: 'What you have already tried' },
            { id: 'd', text: 'A separate "Hi, are you there?" message first' },
          ],
          correct: ['a', 'b', 'c'],
          explanation: 'Goal, symptom and attempts let the reader answer immediately. A bare greeting makes them wait for the real question.',
        },
        {
          key: 'q4',
          type: 'fill_blank',
          title: 'Plain words',
          prompt: 'Rewrite in plain language: "We will utilise the cache." becomes "We will ___ the cache."',
          accepted: [['use']],
          explanation: 'Prefer the common word. "Use" says the same thing with less effort for the reader.',
          difficulty: 'easy',
        },
        {
          key: 'q5',
          type: 'matching',
          title: 'Choosing a channel',
          prompt: 'Match each situation with the most suitable channel.',
          pairs: {
            left: [
              { id: 'l1', text: 'Checking whether a teammate has pushed their branch' },
              { id: 'l2', text: 'Recording the decision to switch databases' },
              { id: 'l3', text: 'A disagreement that has gone back and forth for 20 messages' },
            ],
            right: [
              { id: 'r1', text: 'A short call, then a written summary' },
              { id: 'r2', text: 'Team chat' },
              { id: 'r3', text: 'A document or email that others can find later' },
            ],
          },
          matches: { l1: 'r2', l2: 'r3', l3: 'r1' },
          explanation: 'Quick coordination fits chat, decisions need a durable record, and long debates resolve faster by voice, with the outcome written down.',
        },
      ],
    },
    {
      slug: 'technical-writing-readmes',
      title: 'Technical writing and READMEs',
      module: 'Writing',
      skill: 'technical-writing',
      minutes: 50,
      milestone: true,
      completionCriteria: 'Write a README for one of your projects that a classmate can follow from clone to running app without asking you any questions.',
      objectives: [
        'Identify your audience and what they need to accomplish',
        'Write a README with purpose, setup, usage, configuration and contribution sections',
        'Write exact, ordered setup steps with expected results',
        'Distinguish tutorials, how-to guides, reference and explanation',
        'Test documentation by having someone else follow it',
      ],
      body: `Documentation turns code into something others can use. A **README** is the front door of a project; it is often the first thing recruiters, reviewers and collaborators read.

### Know your audience
Ask: who is reading (new contributor, user, future you), what do they already know, and what are they trying to do? A README for a library user and one for a contributor emphasise different things.

### A solid README skeleton

\`\`\`markdown
# Notes API

A small REST API for personal notes, built with Node.js and PostgreSQL.

## Features
- Create, edit and delete notes
- Session-based login

## Getting started
### Prerequisites
- Node.js 22+
- PostgreSQL 16+

### Setup
    git clone https://github.com/<you>/notes-api.git
    cd notes-api
    cp .env.example .env    # then set DATABASE_URL
    npm install
    npm run migrate
    npm run dev             # http://localhost:3000

## Usage
    curl -X POST localhost:3000/api/notes -H "Content-Type: application/json" -d '{"title":"Hi"}'

## Running tests
    npm test

## Configuration
| Variable | Required | Example |
|---|---|---|
| DATABASE_URL | yes | postgres://app:app@localhost:5432/notes |

## Project structure / Design notes
## Contributing
## License
MIT
\`\`\`

### Worked example: fixing a setup step
**Before:** "Install the dependencies, set up the database and run the app."

**After:**

\`\`\`text
1. Start PostgreSQL:   docker compose up -d db
2. Create the schema:  npm run migrate
   You should see: "3 migrations applied"
3. Start the app:      npm run dev
   Open http://localhost:3000; you should see the login page.
\`\`\`

The "after" version names the exact commands, the order, and what success looks like at each step, so a reader knows immediately if something went wrong.

### Four kinds of documentation
| Type | Reader's question | Example |
|---|---|---|
| Tutorial | "Teach me, I am new" | Build your first note in 10 minutes |
| How-to guide | "How do I do this task?" | How to reset a user's password |
| Reference | "What exactly does this do?" | Every API endpoint, parameter and error code |
| Explanation | "Why does it work like this?" | Why we use sessions instead of tokens |

Mixing them makes each worse. A README usually holds a short tutorial (getting started) and links to the rest.

### Comments versus docs
Code comments should explain **why**, not repeat what the code says. \`page += 1  # the API numbers pages from 1, not 0\` is useful; \`i += 1  # add one to i\` is noise.

### Writing tips
- Lead with **what it is and why it exists** in one or two sentences.
- Give exact, copy-pasteable commands, in order.
- Use one term per concept; do not switch between "note", "entry" and "item".
- Show expected output or a screenshot where it helps, with alt text.
- Keep it current: a wrong README is worse than a short one.

### Test it
Ask someone to follow your README on a fresh machine without help. Every question they ask is a gap to fix.

### Common mistakes
- A README containing only the project name.
- Setup steps that assume tools or environment variables you never mention.
- Describing features that do not exist yet as if they do. Put plans under a clearly labelled "Roadmap".
- Pasting secrets or real credentials into examples.`,
      practice: [
        { title: 'README makeover', kind: 'exercise', prompt: 'Rewrite the README of one of your projects using the skeleton above. Then ask a classmate to follow it from a fresh clone; fix every place they got stuck.' },
        { title: 'Expected results', kind: 'exercise', prompt: 'Take the setup section of any README you wrote and add, after each command, one line describing what the reader should see if it worked.' },
        { title: 'Sort the docs', kind: 'exercise', prompt: 'Find the documentation of an open-source tool you use. Classify five of its pages as tutorial, how-to, reference or explanation, and note one page that mixes types.' },
      ],
      resources: [
        { title: 'Make a README', url: 'https://www.makeareadme.com/', source: 'makeareadme.com', kind: 'article' },
        { title: 'About READMEs', url: 'https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/about-readmes', source: 'GitHub Docs', kind: 'docs' },
        { title: 'Technical Writing Two', url: 'https://developers.google.com/tech-writing/two', source: 'Google for Developers', kind: 'course' },
        { title: 'Diataxis: a systematic approach to technical documentation', url: 'https://diataxis.fr/', source: 'diataxis.fr', kind: 'article' },
      ],
      quiz: [
        {
          key: 'q1',
          type: 'single',
          title: 'README priority',
          prompt: 'What should a README communicate first?',
          options: [
            { id: 'a', text: 'The full list of dependencies' },
            { id: 'b', text: 'What the project is and why it exists' },
            { id: 'c', text: 'The license text' },
          ],
          correct: ['b'],
          explanation: 'Readers decide within seconds whether the project is relevant. Start with purpose.',
          difficulty: 'easy',
        },
        {
          key: 'q2',
          type: 'true_false',
          title: 'Testing docs',
          prompt: 'Having someone else follow your setup instructions is an effective way to find gaps in documentation.',
          options: [
            { id: 'true', text: 'True' },
            { id: 'false', text: 'False' },
          ],
          correct: ['true'],
          explanation: 'Authors unconsciously fill in missing steps. A fresh reader exposes them.',
        },
        {
          key: 'q3',
          type: 'matching',
          title: 'Documentation types',
          prompt: 'Match each page with its documentation type.',
          pairs: {
            left: [
              { id: 'l1', text: 'Build your first dashboard in 15 minutes' },
              { id: 'l2', text: 'How to rotate the API key' },
              { id: 'l3', text: 'List of every CLI flag and its default' },
              { id: 'l4', text: 'Why the service uses event sourcing' },
            ],
            right: [
              { id: 'r1', text: 'Reference' },
              { id: 'r2', text: 'Explanation' },
              { id: 'r3', text: 'Tutorial' },
              { id: 'r4', text: 'How-to guide' },
            ],
          },
          matches: { l1: 'r3', l2: 'r4', l3: 'r1', l4: 'r2' },
          explanation: 'Tutorials teach, how-to guides solve a task, reference describes precisely, and explanation gives the reasoning.',
        },
        {
          key: 'q4',
          type: 'multi',
          title: 'Followable setup',
          prompt: 'Which make setup instructions easier to follow? Select all that apply.',
          options: [
            { id: 'a', text: 'Exact commands in the order they must be run' },
            { id: 'b', text: 'What the reader should see after each step' },
            { id: 'c', text: 'Listing prerequisites and their versions' },
            { id: 'd', text: '"Set up the environment as usual"' },
          ],
          correct: ['a', 'b', 'c'],
          explanation: 'Precise, ordered steps with checkpoints and stated prerequisites remove guesswork. "As usual" assumes knowledge the reader may not have.',
        },
        {
          key: 'q5',
          type: 'single',
          title: 'Useful comments',
          prompt: 'Which code comment is most useful?',
          options: [
            { id: 'a', text: '`total += price  # add price to total`' },
            { id: 'b', text: '`retries = 3  # the payment provider recommends at most 3 retries`' },
            { id: 'c', text: '`x = 0  # set x to zero`' },
          ],
          correct: ['b'],
          explanation: 'It explains why the value is what it is, which the code alone cannot say.',
        },
      ],
    },
    {
      slug: 'design-docs-and-decision-records',
      title: 'Design docs and decision records',
      module: 'Writing',
      skill: 'technical-writing',
      minutes: 40,
      objectives: [
        'Decide when a decision deserves a written design doc',
        'Structure a design doc with context, goals, non-goals, proposal and alternatives',
        'Write a short architecture decision record (ADR)',
        'Present trade-offs honestly, including the downsides of your preferred option',
      ],
      body: `Code shows **what** a system does. Design docs and decision records capture **why**, so teammates can review a plan before work starts and future readers understand choices that look strange out of context.

### When to write one
Write a design doc when a decision is hard to reverse, affects other people or teams, or has several reasonable options. You do not need one for a small bug fix. For student and personal projects, a one-page doc is plenty.

### A design doc template

\`\`\`text
Title, author, date, status (draft / in review / accepted)

1. Context and problem   What is happening now and why it needs to change
2. Goals                 What success looks like, measurable where possible
3. Non-goals             What this deliberately will not do
4. Proposed design       How it works: components, data, a diagram
5. Alternatives          Other options and why they were not chosen
6. Risks and open questions
7. Rollout and testing   How it ships safely and how you will know it works
\`\`\`

**Non-goals** are underrated: "This design does not cover mobile offline support" prevents weeks of scope debate.

### Architecture decision records
An **ADR** is a short record of one decision. Keep them numbered in the repository (for example \`docs/adr/\`) so the history travels with the code.

\`\`\`markdown
# ADR 003: Use PostgreSQL for the notes app

Status: Accepted (2025-02-10)

## Context
Notes belong to users and are shared within groups, so the data is
relational. We need full-text search on note titles and bodies. The team
has used PostgreSQL in coursework; nobody has run MongoDB in production.

## Decision
Use PostgreSQL 16 with its built-in full-text search.

## Consequences
+ Joins and constraints keep sharing rules consistent.
+ One database to run; no separate search service yet.
- Schema changes need migrations.
- If search needs grow (typo tolerance, ranking), we may add a search engine later.
\`\`\`

When a later decision replaces this one, do not edit history: write a new ADR and mark this one **Superseded by ADR 007**.

### Writing it well
- Lead with the problem, not the solution you already like.
- Compare alternatives on the same criteria (cost, complexity, team experience, risk), ideally in a table.
- State the downsides of your proposal. Reviewers trust a doc that admits trade-offs, and they will find them anyway.
- Ask for specific feedback: "I am least sure about the caching approach in section 4."
- Keep it short enough to be read. Link to detail instead of pasting it.

### Common mistakes
- Writing the doc after building, purely to justify what was done.
- Listing alternatives as weak straw men nobody would choose.
- No clear decision or owner at the end.
- Letting the doc go stale; update the status when plans change.`,
      practice: [
        { title: 'Write an ADR', kind: 'exercise', prompt: 'Pick a real decision from one of your projects (a database, framework, hosting choice or library). Write an ADR with context, decision and at least two positive and two negative consequences.' },
        { title: 'One-page design doc', kind: 'exercise', prompt: 'Before your next feature, write a one-page design doc with goals, non-goals, the proposed design and one alternative. Ask a classmate to review it and record what changed as a result.' },
      ],
      resources: [
        { title: 'Architectural Decision Records', url: 'https://adr.github.io/', source: 'adr.github.io', kind: 'article' },
        { title: 'Documenting Architecture Decisions', url: 'https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions', source: 'Michael Nygard, Cognitect', kind: 'article' },
        { title: 'Design Docs at Google', url: 'https://www.industrialempathy.com/posts/design-docs-at-google/', source: 'Malte Ubl, Industrial Empathy', kind: 'article' },
      ],
      quiz: [
        {
          key: 'q1',
          type: 'single',
          title: 'Purpose of an ADR',
          prompt: 'What does an architecture decision record primarily capture?',
          options: [
            { id: 'a', text: 'A full user manual for the system' },
            { id: 'b', text: 'One decision, its context and its consequences' },
            { id: 'c', text: 'The weekly status of every task' },
          ],
          correct: ['b'],
          explanation: 'ADRs are short and focused on a single decision, so future readers understand why the system is the way it is.',
          difficulty: 'easy',
        },
        {
          key: 'q2',
          type: 'single',
          title: 'Non-goals',
          prompt: 'Why include a non-goals section in a design doc?',
          options: [
            { id: 'a', text: 'To make the document longer' },
            { id: 'b', text: 'To state clearly what the design will not cover, which prevents scope creep and misunderstandings' },
            { id: 'c', text: 'To list features that were badly implemented' },
          ],
          correct: ['b'],
          explanation: 'Explicit non-goals align expectations early and keep reviews focused on what is actually proposed.',
        },
        {
          key: 'q3',
          type: 'true_false',
          title: 'Hiding downsides',
          prompt: 'A design doc is more likely to be approved, and is better, if it leaves out the weaknesses of the proposed option.',
          options: [
            { id: 'true', text: 'True' },
            { id: 'false', text: 'False' },
          ],
          correct: ['false'],
          explanation: 'Honest trade-offs build trust and let reviewers help with the risks. Hidden downsides surface later at higher cost.',
        },
        {
          key: 'q4',
          type: 'multi',
          title: 'Design doc sections',
          prompt: 'Which sections belong in a typical design doc? Select all that apply.',
          options: [
            { id: 'a', text: 'Context and problem' },
            { id: 'b', text: 'Alternatives considered' },
            { id: 'c', text: 'Risks and open questions' },
            { id: 'd', text: 'The author\'s full resume' },
          ],
          correct: ['a', 'b', 'c'],
          explanation: 'Context, alternatives and risks are what reviewers need to evaluate a proposal.',
        },
        {
          key: 'q5',
          type: 'fill_blank',
          title: 'ADR status',
          prompt: 'When a newer ADR replaces an older decision, the older ADR is kept and its status is changed to ___.',
          accepted: [['superseded', 'superseded by a newer adr']],
          explanation: 'Keeping superseded records preserves the history of why the system changed.',
        },
      ],
    },
    {
      slug: 'presenting-technical-work',
      title: 'Presenting technical work',
      module: 'Speaking',
      skill: 'communication',
      minutes: 45,
      objectives: [
        'Structure a talk or demo around one clear message',
        'Open with the problem in a way the audience cares about',
        'Adapt depth and vocabulary for technical and non-technical audiences',
        'Design simple, readable, accessible slides and reliable live demos',
        'Handle questions honestly, including "I don\'t know"',
      ],
      body: `Project demos, viva voce exams, sprint reviews and interview presentations all reward the same skills: a clear message, a logical story and calm delivery.

### Start with one message
If the audience remembers one sentence, what should it be? For example: "Our app cuts the time to find a lost item from days to minutes." Build everything around it and cut what does not support it.

### A simple structure for a project presentation

\`\`\`text
1. Problem      (who has it, why it matters)          1 minute
2. Solution     (what you built, in one sentence)      30 seconds
3. Demo         (the main user journey)                2 to 3 minutes
4. How it works (architecture, one key decision)       2 minutes
5. Results      (what works, what you measured)        1 minute
6. Lessons and next steps                              1 minute
\`\`\`

### Worked example: the opening
**Weak:** "Hi, I'm Arjun. Our project is called FindIt. We used React, Node.js, PostgreSQL and Docker. First let me show the folder structure..."

**Strong:** "Last semester, our hostel's lost-and-found was a WhatsApp group with 400 people and no search. Finding anything meant scrolling through days of messages. We built FindIt, where students post and search lost items. Let me show you finding a lost ID card in three clicks."

The strong opening starts with a real problem the audience can picture, then promises a concrete demo. The tech stack comes later, in "How it works".

### Know your audience
For non-technical listeners, focus on the problem, the outcome and an analogy ("the cache is like keeping your most-used books on your desk instead of in the library"). For engineers, include architecture, trade-offs and what you would do differently.

### Slides
- One idea per slide, with a headline that states the point ("Search takes under a second" rather than "Performance").
- Large text (at least about 24 pt), strong colour contrast, and never colour alone to carry meaning.
- Diagrams instead of bullet walls. Never paste a full screen of code; highlight the five lines that matter.

### Demos
Rehearse the exact steps, use prepared test data, increase the font size, close notifications, and keep a recording or screenshots as a backup if the network fails.

### Results: honest numbers only
Present what you actually measured and how ("median search time 0.4 s on our test data of 2,000 items"). If you did not measure something, say what you observed instead of inventing a figure.

### Questions
Repeat or rephrase the question so everyone hears it, answer briefly, and if you do not know, say so: "I haven't measured that; I'd expect X because Y, and I can follow up." Honesty builds more trust than guessing.

### Common mistakes
- Spending half the time on background before showing anything.
- Reading slides aloud word for word.
- Overrunning the time limit. Rehearse with a timer and know what you will cut.
- Claiming results or features you have not actually achieved.`,
      practice: [
        { title: 'Five-minute demo', kind: 'exercise', prompt: 'Prepare a five-minute presentation of one of your projects using the six-part structure. Record it, check the timing, and cut anything that does not support your one main message.' },
        { title: 'Rewrite your opening', kind: 'exercise', prompt: 'Write the first 30 seconds of a presentation about your project twice: once starting with the tech stack and once starting with the problem. Read both aloud to a friend and ask which made them want to hear more.' },
        { title: 'Two audiences', kind: 'exercise', prompt: 'Explain the same project in 60 seconds to a non-technical friend and in 3 minutes to an engineer. Note what you changed between versions.' },
      ],
      resources: [
        { title: 'speaking.io', url: 'https://speaking.io/', source: 'speaking.io (Zach Holman)', kind: 'article' },
        { title: 'Audience (Technical Writing One)', url: 'https://developers.google.com/tech-writing/one/audience', source: 'Google for Developers', kind: 'course' },
        { title: 'How to Make Your Presentations Accessible to All', url: 'https://www.w3.org/WAI/teach-advocate/accessible-presentations/', source: 'W3C WAI', kind: 'article' },
      ],
      quiz: [
        {
          key: 'q1',
          type: 'single',
          title: 'Unknown answer',
          prompt: 'Someone asks a question you cannot answer during your project demo. What is best?',
          options: [
            { id: 'a', text: 'Make up a plausible answer' },
            { id: 'b', text: 'Say you do not know, share what you do know, and offer to follow up' },
            { id: 'c', text: 'Ignore the question' },
          ],
          correct: ['b'],
          explanation: 'Admitting limits while offering what you know builds credibility. Guessing can mislead and damage trust.',
          difficulty: 'easy',
        },
        {
          key: 'q2',
          type: 'single',
          title: 'Demo backup',
          prompt: 'Why prepare a recording or screenshots of a live demo?',
          options: [
            { id: 'a', text: 'To avoid rehearsing' },
            { id: 'b', text: 'As a fallback if the network, data or environment fails' },
            { id: 'c', text: 'To make the talk longer' },
          ],
          correct: ['b'],
          explanation: 'Live demos fail for many reasons outside your control. A backup keeps the presentation on track.',
        },
        {
          key: 'q3',
          type: 'single',
          title: 'Strong opening',
          prompt: 'Which opening is most likely to engage a mixed audience?',
          options: [
            { id: 'a', text: '"We used React, Node.js and PostgreSQL. Here is our folder structure."' },
            { id: 'b', text: '"Finding a lost item in our hostel meant scrolling through days of chat messages. Here is how we fixed that."' },
            { id: 'c', text: '"This project was very hard and we did not have much time."' },
          ],
          correct: ['b'],
          explanation: 'A concrete problem the audience can picture creates interest. Technology details belong later, for those who want them.',
        },
        {
          key: 'q4',
          type: 'multi',
          title: 'Readable slides',
          prompt: 'Which choices make slides easier to read for everyone? Select all that apply.',
          options: [
            { id: 'a', text: 'Large text and strong colour contrast' },
            { id: 'b', text: 'Headlines that state the point of the slide' },
            { id: 'c', text: 'Highlighting the few lines of code that matter' },
            { id: 'd', text: 'Using only red and green to show good and bad results' },
          ],
          correct: ['a', 'b', 'c'],
          explanation: 'Size, contrast, clear headlines and focus help all viewers. Colour alone excludes people with colour vision deficiencies; add labels or icons.',
        },
        {
          key: 'q5',
          type: 'true_false',
          title: 'Reading slides',
          prompt: 'Reading every word on your slides aloud is an effective way to deliver a talk.',
          options: [
            { id: 'true', text: 'True' },
            { id: 'false', text: 'False' },
          ],
          correct: ['false'],
          explanation: 'The audience reads faster than you speak and stops listening. Slides should support what you say, not duplicate it.',
        },
      ],
    },
    {
      slug: 'teamwork-and-feedback',
      title: 'Teamwork and feedback',
      module: 'Collaboration',
      skill: 'teamwork',
      minutes: 45,
      objectives: [
        'Agree on roles, expectations and working norms at the start of a project',
        'Give specific, behaviour-focused feedback using Situation, Behaviour, Impact',
        'Write code review comments that are kind, clear and actionable',
        'Receive feedback openly and act on it',
        'Resolve disagreements with shared criteria and blameless problem-solving',
      ],
      body: `Most software is built by teams. Technical skill matters, but so do reliability, communication and how you treat people.

### Start with a team agreement
In the first meeting, agree on: who owns what, how you communicate (channel, expected response time), how decisions are made, meeting times, and what "done" means. Write it down and revisit it if it stops working.

### Giving feedback: Situation, Behaviour, Impact (SBI)

\`\`\`text
Situation: In yesterday's stand-up,
Behaviour: you shared that the API was blocked on the schema decision,
Impact:    which let us resolve it the same day instead of losing a week.
           Thank you.

Situation: In the last two code reviews,
Behaviour: the PRs had no description,
Impact:    so reviewing took me much longer. Could you add a short
           "what and why" next time?
\`\`\`

Describe observable behaviour, not personality ("you are lazy"). Give corrective feedback privately and soon after the event; give appreciation freely, including in public.

### Worked example: code review comments
| Before | After |
|---|---|
| "This is wrong." | "This returns null when the list is empty, and the caller on line 40 doesn't check. Could we return an empty list instead?" |
| "Why would you do it this way?" | "I'm not sure why this loads every user before filtering. Is there a reason not to filter in the query?" |
| "Fix naming." | "Nit: \`d\` could be \`dueDate\`, which would make line 12 easier to follow. Not blocking." |

Good comments say what you noticed, why it matters, and suggest a next step. Label minor points as "nit" or "not blocking", and ask questions when you might be missing context.

### Receiving feedback
Listen fully, ask clarifying questions, thank the person, and decide what to change. You do not have to agree with everything, but consider it seriously before dismissing it. "Thanks, I hadn't seen that case; I'll add a test" ends a review well.

### Worked example: a disagreement
Two teammates disagree about using a new framework for the course project.
1. **Restate each view fairly:** "Priya wants the new framework for its routing; Sam is worried nobody knows it and the deadline is in four weeks."
2. **Agree on criteria:** deadline risk, what the team already knows, what the project needs.
3. **Timebox an experiment:** one evening building the login page with the new framework.
4. **Decide and commit:** whatever the result, the team records the decision and everyone supports it, including the person who disagreed.

Make disagreement about the problem, not the person. When something goes wrong, use a **blameless** approach: ask what in the process allowed the problem, rather than who to blame.

### Being a reliable teammate
Do what you said you would, flag risks early ("I may miss Friday because..."), make sure quieter teammates are heard in meetings, and give credit generously. On team projects, describe your own contribution honestly and never claim others' work.

### Common mistakes
- Silence about problems until the deadline.
- Feedback that is vague ("good job") or personal ("you're careless").
- Defensiveness that shuts down future feedback.
- Taking credit for teammates' work, in the team or on your resume.`,
      practice: [
        { title: 'Team agreement', kind: 'exercise', prompt: 'Draft a one-page team agreement for your next group project covering roles, communication channels and response times, decision-making, meeting schedule and definition of done.' },
        { title: 'SBI practice', kind: 'exercise', prompt: 'Write two pieces of feedback using Situation, Behaviour, Impact: one appreciative and one corrective, about real (anonymised) situations from a team you have worked in.' },
        { title: 'Rewrite review comments', kind: 'exercise', prompt: 'Find five code review comments you have written or received (or invent realistic ones). Rewrite each to state what was noticed, why it matters and a suggested next step, and mark minor ones as not blocking.' },
      ],
      resources: [
        { title: 'Postmortem Culture: Learning from Failure', url: 'https://sre.google/sre-book/postmortem-culture/', source: 'Google SRE', kind: 'book' },
        { title: 'How to write code review comments', url: 'https://google.github.io/eng-practices/review/reviewer/comments.html', source: 'Google Engineering Practices', kind: 'article' },
        { title: 'Building Welcoming Communities', url: 'https://opensource.guide/building-community/', source: 'Open Source Guides', kind: 'article' },
      ],
      quiz: [
        {
          key: 'q1',
          type: 'single',
          title: 'Behaviour-focused feedback',
          prompt: 'Which feedback focuses on behaviour rather than personality?',
          options: [
            { id: 'a', text: '"You\'re so disorganised."' },
            { id: 'b', text: '"The last two PRs had no description, which slowed down review."' },
            { id: 'c', text: '"You never care about the team."' },
          ],
          correct: ['b'],
          explanation: 'It describes something observable and its impact, so the person knows what to change.',
          difficulty: 'easy',
        },
        {
          key: 'q2',
          type: 'true_false',
          title: 'Blameless',
          prompt: 'A blameless review asks what in the process allowed a mistake, rather than who to punish.',
          options: [
            { id: 'true', text: 'True' },
            { id: 'false', text: 'False' },
          ],
          correct: ['true'],
          explanation: 'Blameless reviews encourage honesty about mistakes and lead to systemic fixes.',
        },
        {
          key: 'q3',
          type: 'single',
          title: 'Review comment',
          prompt: 'Which code review comment is most helpful?',
          options: [
            { id: 'a', text: '"This is wrong."' },
            { id: 'b', text: '"This crashes when the list is empty because the caller does not check for null. Could we return an empty list instead?"' },
            { id: 'c', text: '"Rewrite this."' },
          ],
          correct: ['b'],
          explanation: 'It says what the problem is, why it matters and suggests a fix, without judging the author.',
        },
        {
          key: 'q4',
          type: 'matching',
          title: 'SBI parts',
          prompt: 'Match each part of this feedback to the SBI model: "In Monday\'s demo, you explained the caching trade-off clearly, which helped the client approve the plan."',
          pairs: {
            left: [
              { id: 'l1', text: 'Situation' },
              { id: 'l2', text: 'Behaviour' },
              { id: 'l3', text: 'Impact' },
            ],
            right: [
              { id: 'r1', text: '"which helped the client approve the plan"' },
              { id: 'r2', text: '"In Monday\'s demo"' },
              { id: 'r3', text: '"you explained the caching trade-off clearly"' },
            ],
          },
          matches: { l1: 'r2', l2: 'r3', l3: 'r1' },
          explanation: 'Situation sets the context, behaviour describes what the person did, and impact explains the effect.',
        },
        {
          key: 'q5',
          type: 'multi',
          title: 'Resolving disagreement',
          prompt: 'Which steps help a team resolve a technical disagreement? Select all that apply.',
          options: [
            { id: 'a', text: 'Restate the other person\'s view fairly' },
            { id: 'b', text: 'Agree on the criteria for deciding' },
            { id: 'c', text: 'Run a short, timeboxed experiment when facts are missing' },
            { id: 'd', text: 'Keep arguing until the other person gives up' },
          ],
          correct: ['a', 'b', 'c'],
          explanation: 'Fair restatement, shared criteria and evidence lead to decisions people can commit to. Winning by attrition damages trust.',
        },
      ],
    },
    {
      slug: 'working-with-stakeholders',
      title: 'Working with stakeholders',
      module: 'Collaboration',
      skill: 'communication',
      minutes: 40,
      objectives: [
        'Identify stakeholders and what each cares about',
        'Clarify requirements and acceptance criteria before building',
        'Explain technical issues to non-technical audiences in terms of impact',
        'Communicate progress, risks and trade-offs honestly and early',
        'Say no or "not yet" constructively by offering options',
      ],
      body: `**Stakeholders** are people affected by or influencing your work: managers, product owners, clients, other teams, end users. Good engineers translate between what stakeholders need and what is technically sensible.

### Understand needs, not just requests
Ask *why*: "What problem does this solve? How will we know it worked?" The real need often has a simpler solution than the first request. A request for "an export to Excel" may really be "the finance team needs monthly totals", which a scheduled email report might solve better.

### Write acceptance criteria

\`\`\`text
As a support agent, I want to search tickets by customer email
so that I can find a customer's history quickly.

Acceptance criteria:
- Search returns matching tickets within 2 seconds for 100k tickets
- Partial email matches are supported
- No results shows "No tickets found" with a clear-search link
\`\`\`

Agreeing on this before building prevents "that's not what I meant" at the end.

### Worked example: explaining an outage to a non-technical manager
**Before:** "The connection pool got exhausted because a migration held a lock on the orders table, so the API threw 500s until we killed the query."

**After:** "Between 2:10 and 2:35 pm, customers could not place orders. A database update we ran blocked the orders system. We stopped the update and service recovered. About 120 orders failed; support is contacting those customers. To prevent a repeat, we will run this kind of update outside business hours and test it on a copy first."

The after version covers **what happened, impact, current status, and next steps**, in plain words and with numbers the team actually measured.

### Communicate trade-offs as options

\`\`\`text
We can deliver by the 15th if we skip CSV export, or include export
and deliver on the 22nd. Which matters more for the launch?
\`\`\`

Options let stakeholders make informed decisions instead of hearing a flat "no".

### Report honestly and early
Share bad news as soon as you know it, with a plan: "We're about three days behind because the payment API docs were wrong. I've contacted their support; the new estimate is Thursday." Never hide delays or report work as done when it is not; trust, once lost, is hard to rebuild.

### Meeting notes that create alignment

\`\`\`text
Meeting: Search feature check-in, 12 March
Decisions:
- Partial email match is in scope; phone number search is not (for now)
Action items:
- Asha: share the search demo link by Friday
- Ravi: confirm the 100k ticket test data with support by Wednesday
Open questions:
- Should results include closed tickets? (owner: product, by next check-in)
\`\`\`

Decisions, owners and dates are what people need from a meeting. Send notes the same day. On larger projects, a RACI chart (who is Responsible, Accountable, Consulted and Informed) clarifies ownership.

### Common mistakes
- Building exactly what was asked without understanding why.
- Saying yes to everything, then missing every deadline.
- Using jargon with non-technical stakeholders.
- Surprising people with delays on the due date.`,
      practice: [
        { title: 'Requirements interview', kind: 'exercise', prompt: 'Pick a feature request (real or from a friend\'s project). Write five "why" or "how will we know" questions, then turn the answers into a user story with three acceptance criteria.' },
        { title: 'Translate for impact', kind: 'exercise', prompt: 'Take a technical problem you have fixed and explain it in under 100 words for a non-technical manager, covering what happened, impact, current status and next steps, with no jargon.' },
        { title: 'Delivering bad news', kind: 'exercise', prompt: 'Write a short, honest message telling a stakeholder that a feature will be a week late. Include the cause, the impact, the new estimate and two options to reduce the delay.' },
      ],
      resources: [
        { title: 'User stories with examples and a template', url: 'https://www.atlassian.com/agile/project-management/user-stories', source: 'Atlassian', kind: 'article' },
        { title: 'RACI chart', url: 'https://www.atlassian.com/work-management/project-management/raci-chart', source: 'Atlassian', kind: 'article' },
        { title: 'Writing good CL descriptions', url: 'https://google.github.io/eng-practices/review/developer/cl-descriptions.html', source: 'Google', kind: 'article' },
      ],
      quiz: [
        {
          key: 'q1',
          type: 'single',
          title: 'Saying not yet',
          prompt: 'A stakeholder asks for a new feature with an unrealistic deadline. What is the most constructive response?',
          options: [
            { id: 'a', text: 'Agree and hope it works out' },
            { id: 'b', text: 'Refuse without explanation' },
            { id: 'c', text: 'Explain the trade-off and offer options, such as reduced scope or a later date' },
          ],
          correct: ['c'],
          explanation: 'Options let the stakeholder choose with full information, which protects both quality and trust.',
        },
        {
          key: 'q2',
          type: 'true_false',
          title: 'Early bad news',
          prompt: 'It is better to report a likely delay as soon as you know about it than to wait until the deadline.',
          options: [
            { id: 'true', text: 'True' },
            { id: 'false', text: 'False' },
          ],
          correct: ['true'],
          explanation: 'Early warning gives stakeholders time to adjust plans. Late surprises damage trust.',
          difficulty: 'easy',
        },
        {
          key: 'q3',
          type: 'single',
          title: 'Non-technical update',
          prompt: 'Which incident summary suits a non-technical manager best?',
          options: [
            { id: 'a', text: '"The pool was exhausted due to a lock held by a migration, causing 500s."' },
            { id: 'b', text: '"For 25 minutes customers could not place orders. We fixed the cause, 120 orders failed and support is contacting those customers, and we are changing how we run updates to prevent a repeat."' },
            { id: 'c', text: '"Something broke but it is fine now."' },
          ],
          correct: ['b'],
          explanation: 'It covers impact, status and next steps in plain language, with measured numbers. The others are either jargon or too vague to act on.',
        },
        {
          key: 'q4',
          type: 'multi',
          title: 'Meeting notes',
          prompt: 'Which items make meeting notes most useful? Select all that apply.',
          options: [
            { id: 'a', text: 'Decisions that were made' },
            { id: 'b', text: 'Action items with an owner and a date' },
            { id: 'c', text: 'Open questions and who will answer them' },
            { id: 'd', text: 'A word-for-word transcript of every comment' },
          ],
          correct: ['a', 'b', 'c'],
          explanation: 'Readers need outcomes and responsibilities. A full transcript buries them.',
        },
        {
          key: 'q5',
          type: 'fill_blank',
          title: 'RACI',
          prompt: 'In a RACI chart, R stands for Responsible, A for Accountable, C for Consulted and I for ___.',
          accepted: [['informed']],
          explanation: 'Informed people are kept up to date on progress and decisions but do not need to be consulted beforehand.',
        },
      ],
    },
  ],
};

export const placementPrep: SeedTrack = {
  slug: 'campus-placement-prep',
  title: 'Campus Placement Preparation',
  category: 'career',
  summary: 'Prepare for campus recruitment: aptitude tests, coding rounds, group discussions, company research, the placement process and a portfolio that shows your real work.',
  description: `**Who it's for:** college students preparing for campus placement drives, especially in engineering, computer applications and science programmes.

**Prerequisites:** none for the aptitude, discussion and research topics. For the coding round topic, basic programming in one language helps. Pair this track with Interview Readiness for resumes and interviews.

**You will be able to:**
- practise quantitative aptitude and logical reasoning efficiently, with a plan based on your own baseline
- approach online coding rounds and technical MCQs with a repeatable process
- contribute effectively and respectfully in group discussions
- research companies and roles before applying and interviewing
- understand typical placement drive stages, eligibility criteria, offer terms and policies
- build a portfolio that honestly showcases your projects

**Honesty first:** never misstate marks, backlogs, eligibility details or project contributions, and never take online tests with outside help. Placement cells and employers verify documents and monitor tests, and misrepresentation can lead to disqualification or withdrawn offers. This track helps you present what you have genuinely done, as clearly as possible.

**Milestones:** *Aptitude baseline* (topic 1) and *Portfolio ready* (topic 6).`,
  level: 'beginner',
  estimatedHours: 18,
  roles: ['graduate trainee', 'sde intern', 'software engineer', 'data analyst', 'business analyst'],
  contentStatus: 'complete',
  topics: [
    {
      slug: 'aptitude-and-reasoning',
      title: 'Aptitude and analytical reasoning',
      module: 'Tests',
      skill: 'analytical-reasoning',
      minutes: 70,
      milestone: true,
      completionCriteria: 'Take a timed baseline aptitude test, identify your three weakest areas, and improve your score on a second test after two weeks of targeted practice.',
      objectives: [
        'Recognise the common sections of aptitude tests: quantitative, logical and verbal',
        'Apply core techniques for percentages, ratios, profit and loss, interest, time and work, and speed and distance',
        'Solve seating arrangements, syllogisms and data sufficiency questions with structured notes',
        'Manage time and accuracy under test conditions, including negative marking',
      ],
      body: `Many campus drives start with an online aptitude test that filters large applicant pools. Scores improve quickly with structured practice because the question types repeat.

### Typical sections
- **Quantitative:** percentages, profit and loss, ratios, averages, time and work, speed and distance, simple and compound interest, probability basics.
- **Logical reasoning:** series, coding and decoding, blood relations, seating arrangements, syllogisms, data sufficiency.
- **Verbal:** reading comprehension, grammar, sentence correction, vocabulary.
- Sometimes **technical MCQs** or a **coding round** (see the next topic).

### Worked examples: quantitative

\`\`\`text
Percentage change:
  Price rises from 400 to 500. Change = 100 / 400 = 25% increase.
  Then falls by 20%: 500 x 0.8 = 400. Back to the start.
  (A rise of 25% is cancelled by a fall of 20%, not 25%.)

Ratio:
  640 is shared between A and B in the ratio 3 : 5.
  One part = 640 / (3 + 5) = 80. A = 3 x 80 = 240, B = 5 x 80 = 400.

Profit and loss:
  Cost 750, marked price 1000, discount 10%.
  Selling price = 1000 x 0.9 = 900. Profit = 150 = 150 / 750 = 20% of cost.

Simple vs compound interest (10,000 at 8% per year for 3 years):
  Simple:   10,000 x 8 x 3 / 100 = 2,400
  Compound: 10,000 x 1.08^3 = 12,597.12, so interest = 2,597.12

Time and work:
  A finishes a job in 10 days, B in 15 days.
  Per day: 1/10 + 1/15 = 3/30 + 2/30 = 5/30 = 1/6. Together: 6 days.

Average speed:
  60 km/h for 2 h, then 40 km/h for 3 h.
  Total distance / total time = (120 + 120) / 5 = 48 km/h, not 50.
\`\`\`

### Worked example: seating arrangement
Five people A, B, C, D and E sit in a row of seats 1 to 5, numbered left to right. C sits in the middle. B sits immediately to the right of C. A sits at the left end. D does not sit next to B. Who sits at the right end?

\`\`\`text
Fixed clues first:   C = 3, B = 4, A = 1      ->  A _ C B _
Remaining seats 2, 5 for D and E.
D is not next to B (seat 4), so D cannot be in 5  ->  D = 2, E = 5
Answer: A D C B E, so E sits at the right end.
\`\`\`

Draw the seats, place definite clues, then apply negative clues to eliminate.

### Syllogisms and data sufficiency
- "All coders are students. Some students are athletes." Does "some coders are athletes" follow? **No.** Draw circles: the athletes might overlap only the students who are not coders.
- "What is x? (1) 2x + 3 = 11. (2) x squared = 16." Statement 1 alone gives x = 4. Statement 2 alone allows 4 or -4. So **statement 1 alone is sufficient**. You do not need to solve fully; you need to know whether you *could*.
- Series: 2, 6, 12, 20, 30, ? Differences are 4, 6, 8, 10, so the next difference is 12 and the answer is 42.

### Test strategy
- Do a timed baseline test, then practise your weakest topics first.
- Attempt easy questions first; mark and skip time sinks.
- **Negative marking:** work out the expected value. With four options and a penalty of one third of a mark, a blind guess gains nothing on average (1/4 x 1 - 3/4 x 1/3 = 0). If you can eliminate one or two options, a guess among the rest gains on average.
- Review every mistake and write down the trick or formula you missed.

### Integrity
Take online tests yourself, without impersonation, shared answers or unauthorised tools. Proctoring systems detect many violations, and companies disqualify candidates for malpractice.

### Common mistakes
- Averaging speeds or percentages directly.
- Practising only easy topics you already know.
- Spending five minutes on one question in a test that allows about one minute each.
- Not reading whether the question asks for profit, selling price or profit percentage.`,
      practice: [
        { title: 'Baseline test', kind: 'exercise', prompt: 'Take a timed 30-question mixed aptitude test. Record your score per topic and list your three weakest topics.' },
        { title: 'Targeted drills', kind: 'exercise', prompt: 'For each weak topic, solve 20 questions over the next week. For every mistake, write the formula or trick you missed in a personal formula sheet.' },
        { title: 'Explain a solution', kind: 'exercise', prompt: 'Pick three questions you got wrong and write a step-by-step solution for each, as if teaching a friend. If you cannot explain a step, revisit the concept.' },
      ],
      resources: [
        { title: 'Aptitude questions and answers', url: 'https://www.indiabix.com/aptitude/questions-and-answers/', source: 'IndiaBIX', kind: 'interactive' },
        { title: 'Logical reasoning questions and answers', url: 'https://www.indiabix.com/logical-reasoning/questions-and-answers/', source: 'IndiaBIX', kind: 'interactive' },
        { title: 'Arithmetic', url: 'https://www.khanacademy.org/math/arithmetic', source: 'Khan Academy', kind: 'course' },
      ],
      quiz: [
        {
          key: 'q1',
          type: 'single',
          title: 'Work rate',
          prompt: 'A can finish a task in 12 days and B in 6 days. How long do they take working together?',
          options: [
            { id: 'a', text: '9 days' },
            { id: 'b', text: '4 days' },
            { id: 'c', text: '3 days' },
          ],
          correct: ['b'],
          explanation: '1/12 + 1/6 = 1/12 + 2/12 = 3/12 = 1/4 of the task per day, so 4 days.',
          difficulty: 'easy',
        },
        {
          key: 'q2',
          type: 'single',
          title: 'Successive percentages',
          prompt: 'A price increases by 10% and then decreases by 10%. What is the net change?',
          options: [
            { id: 'a', text: 'No change' },
            { id: 'b', text: '1% decrease' },
            { id: 'c', text: '1% increase' },
          ],
          correct: ['b'],
          explanation: '1.1 x 0.9 = 0.99, a 1% decrease overall.',
        },
        {
          key: 'q3',
          type: 'single',
          title: 'Average speed',
          prompt: 'You travel 60 km at 30 km/h and return 60 km at 60 km/h. What is the average speed for the round trip?',
          options: [
            { id: 'a', text: '45 km/h' },
            { id: 'b', text: '40 km/h' },
            { id: 'c', text: '50 km/h' },
          ],
          correct: ['b'],
          explanation: 'Total distance 120 km; total time 2 h + 1 h = 3 h; 120 / 3 = 40 km/h.',
        },
        {
          key: 'q4',
          type: 'fill_blank',
          title: 'Number series',
          prompt: 'Find the next number: 3, 5, 9, 17, 33, ___',
          accepted: [['65']],
          explanation: 'The differences double: 2, 4, 8, 16, so the next difference is 32 and 33 + 32 = 65.',
          difficulty: 'medium',
        },
        {
          key: 'q5',
          type: 'single',
          title: 'Negative marking',
          prompt: 'Each question has four options. A correct answer earns 1 mark and a wrong answer loses 1/3 mark. You eliminate two options and guess between the remaining two. What is the expected score for that question?',
          options: [
            { id: 'a', text: '0' },
            { id: 'b', text: '1/3' },
            { id: 'c', text: '1/2' },
          ],
          correct: ['b'],
          explanation: '1/2 x 1 - 1/2 x 1/3 = 1/2 - 1/6 = 1/3. Elimination turns a guess from neutral into worthwhile.',
          difficulty: 'hard',
        },
      ],
    },
    {
      slug: 'online-coding-and-technical-mcqs',
      title: 'Online coding rounds and technical MCQs',
      module: 'Tests',
      skill: 'technical-interviews',
      minutes: 60,
      objectives: [
        'Describe the typical format of an online coding assessment',
        'Use input constraints to choose an algorithm that runs in time',
        'Read input and print output in exactly the required format',
        'Answer output-prediction and CS fundamentals MCQs on OS, DBMS, networks and OOP',
      ],
      body: `Many companies follow or replace the aptitude test with an **online assessment**: often two or three coding problems in 60 to 90 minutes, sometimes with technical MCQs. Your code is run against **hidden test cases**, and many platforms give partial credit for each test case passed. Formats vary, so read the instructions and any practice test the company provides.

### A process for each problem
1. **Read the whole statement**, including input format, output format and constraints.
2. **Use the constraints** to pick an approach. As a rough rule of thumb, aim for about 10^8 simple operations or fewer:

| Constraint | Usually acceptable |
|---|---|
| n up to about 20 | exponential, such as trying all subsets |
| n up to about 5,000 | O(n squared) |
| n up to about 10^5 or 10^6 | O(n log n) or O(n) |

3. Work the **sample input by hand** to confirm you understand it.
4. Write a simple, correct solution first. Optimise only if the constraints demand it.
5. **Test edge cases** before submitting: smallest input, all equal values, negative numbers, the largest values.

### Worked example: first non-repeating character
*Read a string and print its first character that appears exactly once, or -1 if there is none.*

\`\`\`python
import sys
from collections import Counter

def main():
    s = sys.stdin.readline().strip()
    counts = Counter(s)                 # one pass to count: O(n)
    for ch in s:                        # second pass keeps the original order
        if counts[ch] == 1:
            print(ch)
            return
    print(-1)

main()
\`\`\`

Checks before submitting: "aabbc" gives c; "aabb" gives -1; "z" gives z. A nested loop comparing every pair would be O(n squared), too slow for a string of 10^5 characters.

### Input and output pitfalls
- Print **exactly** what is asked: no "Enter a number:" prompts, no extra spaces or debug lines. The checker compares output text.
- For large inputs, use fast reading: \`sys.stdin\` in Python, \`BufferedReader\` instead of \`Scanner\` in Java.
- Watch for overflow: in C, C++ and Java, sums of many large numbers may need a 64-bit type (\`long long\` or \`long\`).

### Technical MCQs: output prediction

\`\`\`text
Python:  x = [1, 2, 3]; y = x; y.append(4); print(x)
         -> [1, 2, 3, 4]   (y and x name the same list)

Java:    System.out.println(1 + 2 + "3");   -> 33   (3 is computed first, then joined)
         System.out.println("1" + 2 + 3);   -> 123  (string joining from the left)

C:       printf("%d", 7 / 2);   -> 3   (integer division)
         printf("%d", 7 % 3);   -> 1
\`\`\`

### CS fundamentals that appear often
- **Operating systems:** process vs thread, scheduling, the four deadlock conditions (mutual exclusion, hold and wait, no preemption, circular wait), paging.
- **DBMS:** keys, normal forms, ACID, joins, indexes. Practise SQL queries too.
- **Networks:** layers, TCP vs UDP, DNS, HTTP status codes.
- **OOP:** encapsulation, inheritance, polymorphism, abstraction, with a small example of each.

### Integrity
Solve assessments yourself. Copying code from others, sharing questions during a live test, or having someone else take it is malpractice, and similarity checks and proctoring often detect it.

### Common mistakes
- Starting to code before reading the constraints and output format.
- Hard-coding the sample output, which fails every hidden test.
- Spending the whole test on the hardest problem instead of securing the easier ones first.
- Leaving debug prints in the submitted code.`,
      practice: [
        { title: 'Second largest distinct value', kind: 'problem', ref: 'second-largest-distinct' },
        { title: 'Balanced brackets', kind: 'problem', ref: 'valid-parentheses' },
        { title: 'Two Sum under time pressure', kind: 'problem', ref: 'two-sum' },
        { title: 'SQL: department headcount', kind: 'sql', ref: 'sql-department-headcount' },
        { title: 'Mock assessment', kind: 'exercise', prompt: 'Set a 75-minute timer and solve three problems of increasing difficulty in this platform\'s practice section. Afterwards, note for each problem how long you spent reading, coding and testing, and which edge cases you missed.' },
      ],
      resources: [
        { title: 'Coding interview prep', url: 'https://www.techinterviewhandbook.org/coding-interview-prep/', source: 'Tech Interview Handbook', kind: 'article' },
        { title: 'Algorithms study cheatsheet', url: 'https://www.techinterviewhandbook.org/algorithms/study-cheatsheet/', source: 'Tech Interview Handbook', kind: 'cheatsheet' },
        { title: 'CS50x: Introduction to Computer Science', url: 'https://cs50.harvard.edu/x/', source: 'Harvard University', kind: 'course' },
      ],
      quiz: [
        {
          key: 'q1',
          type: 'single',
          title: 'Constraints',
          prompt: 'A problem has n up to 100,000. Which time complexity should you aim for?',
          options: [
            { id: 'a', text: 'O(n squared), about 10^10 operations' },
            { id: 'b', text: 'O(n log n) or better' },
            { id: 'c', text: 'O(2^n)' },
          ],
          correct: ['b'],
          explanation: 'O(n squared) would be about 10 billion operations, far too slow. O(n log n) is under 2 million.',
        },
        {
          key: 'q2',
          type: 'fill_blank',
          title: 'Java output',
          prompt: 'What does `System.out.println(1 + 2 + "3");` print in Java? ___',
          accepted: [['33']],
          explanation: 'Evaluation goes left to right: 1 + 2 is the number 3, then joining with "3" gives the string "33".',
          difficulty: 'medium',
        },
        {
          key: 'q3',
          type: 'multi',
          title: 'Deadlock conditions',
          prompt: 'Which are among the four necessary conditions for deadlock? Select all that apply.',
          options: [
            { id: 'a', text: 'Mutual exclusion' },
            { id: 'b', text: 'Hold and wait' },
            { id: 'c', text: 'Circular wait' },
            { id: 'd', text: 'Round-robin scheduling' },
          ],
          correct: ['a', 'b', 'c'],
          explanation: 'The four conditions are mutual exclusion, hold and wait, no preemption and circular wait. Round-robin is a scheduling algorithm.',
        },
        {
          key: 'q4',
          type: 'true_false',
          title: 'Prompts in output',
          prompt: 'In an online coding test, printing "Enter the number:" before reading input is harmless.',
          options: [
            { id: 'true', text: 'True' },
            { id: 'false', text: 'False' },
          ],
          correct: ['false'],
          explanation: 'Automated checkers compare your output exactly. Any extra text makes correct answers fail.',
          difficulty: 'easy',
        },
        {
          key: 'q5',
          type: 'matching',
          title: 'Protocols and layers',
          prompt: 'Match each protocol with the layer it is usually associated with.',
          pairs: {
            left: [
              { id: 'l1', text: 'HTTP' },
              { id: 'l2', text: 'TCP' },
              { id: 'l3', text: 'IP' },
            ],
            right: [
              { id: 'r1', text: 'Network layer' },
              { id: 'r2', text: 'Application layer' },
              { id: 'r3', text: 'Transport layer' },
            ],
          },
          matches: { l1: 'r2', l2: 'r3', l3: 'r1' },
          explanation: 'HTTP is an application protocol, TCP provides reliable transport, and IP handles addressing and routing at the network layer.',
        },
      ],
    },
    {
      slug: 'group-discussions',
      title: 'Group discussions',
      module: 'Selection rounds',
      skill: 'communication',
      minutes: 45,
      objectives: [
        'Understand what evaluators look for in a group discussion',
        'Structure a point with a claim, reasoning and an example',
        'Initiate, build on others\' points and summarise effectively',
        'Enter a discussion politely when others dominate, and bring quieter members in',
        'Prepare facts you can cite accurately',
      ],
      body: `Some recruiters use **group discussions (GDs)**: 6 to 12 candidates discuss a topic for 10 to 20 minutes while evaluators observe. Topics can be factual or current affairs ("Should India adopt a four-day work week?"), abstract ("Is technology making us lonely?"), or case-based, where the group must recommend a decision.

### What evaluators usually assess
- **Content:** relevant, logical points backed by facts or examples
- **Communication:** clarity, brevity, listening
- **Teamwork and leadership:** building on others, moving the group forward, inclusion
- **Composure:** staying calm and respectful under disagreement

Talking the most is not the goal. Quality and contribution to the group matter more than airtime.

### Structure each point

\`\`\`text
Claim:     Remote work can widen access to tech jobs.
Reasoning: Candidates in smaller cities no longer have to relocate,
           which removes a major cost barrier.
Example:   Many companies now advertise fully remote roles.
Link:      Building on Meera's point about cost of living, that also
           helps companies retain staff.
\`\`\`

### Worked example: a strong opening
"Let me suggest a way to approach this. 'A four-day work week' could mean the same hours in fewer days, or fewer total hours. I'd propose we look at three angles: productivity, employee well-being and which industries it suits. On productivity, ..."

It defines the terms, gives the group a structure, and then makes a first point. Only initiate if you can do this clearly; a confused opening is worse than a strong second contribution.

### Useful moves
- **Build:** "Adding to what Rahul said, ..."
- **Redirect:** "We've covered the economic side; should we look at the social impact?"
- **Include:** "Ananya, we haven't heard your view yet."
- **Disagree respectfully:** "I see it differently. The cost savings may not apply to hospitals, where shifts must be covered every day."
- **Enter when one person dominates:** wait for a breath, acknowledge, then add: "That's a fair point about cost, Rohit. I'd like to add a different angle: ..."

### Summarising
If asked to summarise, or if the group ends without one, give a balanced 30 to 45 second summary that covers the main viewpoints, including ones you disagreed with, and any consensus reached. Do not use it to repeat only your own points.

### Online GDs
Keep your camera on and microphone muted until you speak, use the raise-hand feature if the group agrees to it, and keep points even shorter, since talking over each other is worse on a call.

### Preparation
Read news and explainers regularly and keep notes of facts you can cite accurately, with their source. If you are unsure of a statistic, do not invent one; make the point qualitatively instead. Practise with friends using a timer and an observer.

### Common mistakes
- Shouting over others or interrupting repeatedly.
- Making up figures to sound authoritative.
- Staying silent for the whole discussion.
- Repeating someone else's point without adding anything.
- Treating the GD as a debate to win rather than a problem to explore together.`,
      practice: [
        { title: 'Mock GD', kind: 'exercise', prompt: 'With 5 to 8 friends, run a 15-minute GD on a current topic with one observer scoring content, communication, teamwork and composure. Rotate roles over three sessions.' },
        { title: 'Point bank', kind: 'exercise', prompt: 'For three common GD themes (technology and jobs, education, environment), write three claim, reasoning, example points each, using only facts you have verified and noting each source.' },
        { title: 'Summary drill', kind: 'exercise', prompt: 'Watch or read a debate on a public issue. Write a balanced 45-second summary covering at least two opposing views, then time yourself saying it aloud.' },
      ],
      resources: [
        { title: 'Active listening', url: 'https://en.wikipedia.org/wiki/Active_listening', source: 'Wikipedia', kind: 'article' },
        { title: 'Toulmin argument', url: 'https://owl.purdue.edu/owl/general_writing/academic_writing/historical_perspectives_on_argumentation/toulmin_argument.html', source: 'Purdue OWL', kind: 'article' },
      ],
      quiz: [
        {
          key: 'q1',
          type: 'single',
          title: 'What counts',
          prompt: 'Which behaviour is most likely to impress GD evaluators?',
          options: [
            { id: 'a', text: 'Speaking the most, regardless of content' },
            { id: 'b', text: 'Making relevant points with examples and building on others\' ideas' },
            { id: 'c', text: 'Agreeing with everyone' },
          ],
          correct: ['b'],
          explanation: 'Evaluators look for quality content, listening and moving the group forward, not airtime.',
          difficulty: 'easy',
        },
        {
          key: 'q2',
          type: 'true_false',
          title: 'Statistics',
          prompt: 'If you cannot remember an exact statistic, it is fine to make up a realistic-sounding number.',
          options: [
            { id: 'true', text: 'True' },
            { id: 'false', text: 'False' },
          ],
          correct: ['false'],
          explanation: 'Invented figures are dishonest and can be challenged. Make the point qualitatively instead.',
        },
        {
          key: 'q3',
          type: 'single',
          title: 'Entering the discussion',
          prompt: 'One participant has spoken for several minutes and you have not had a chance to speak. What is the best approach?',
          options: [
            { id: 'a', text: 'Raise your voice and talk over them' },
            { id: 'b', text: 'Wait for a brief pause, acknowledge their point, then add a new angle' },
            { id: 'c', text: 'Stay silent for the rest of the GD' },
          ],
          correct: ['b'],
          explanation: 'Acknowledging and then adding shows listening and composure while still getting your point in.',
        },
        {
          key: 'q4',
          type: 'multi',
          title: 'A good summary',
          prompt: 'Which features make a strong GD summary? Select all that apply.',
          options: [
            { id: 'a', text: 'It covers the main viewpoints, including ones you disagreed with' },
            { id: 'b', text: 'It mentions any consensus the group reached' },
            { id: 'c', text: 'It is brief, around 30 to 45 seconds' },
            { id: 'd', text: 'It repeats only your own points' },
          ],
          correct: ['a', 'b', 'c'],
          explanation: 'A summary should be balanced and concise. Using it to restate only your views signals poor listening.',
        },
        {
          key: 'q5',
          type: 'matching',
          title: 'GD moves',
          prompt: 'Match each phrase with the move it represents.',
          pairs: {
            left: [
              { id: 'l1', text: '"Adding to what Rahul said, ..."' },
              { id: 'l2', text: '"Ananya, we haven\'t heard your view yet."' },
              { id: 'l3', text: '"We\'ve covered cost; should we look at social impact?"' },
            ],
            right: [
              { id: 'r1', text: 'Redirect' },
              { id: 'r2', text: 'Build' },
              { id: 'r3', text: 'Include' },
            ],
          },
          matches: { l1: 'r2', l2: 'r3', l3: 'r1' },
          explanation: 'Building extends a point, including invites a quieter member, and redirecting moves the group to an uncovered angle.',
        },
      ],
    },
    {
      slug: 'company-research',
      title: 'Company research',
      module: 'Preparation',
      skill: 'job-search',
      minutes: 40,
      objectives: [
        'Research a company\'s products, customers, business model and recent news',
        'Understand the specific role, team, location, training and offer terms',
        'Prepare a tailored "Why this company?" answer and thoughtful questions',
        'Use research to decide whether a company is a good fit for you',
        'Recognise recruitment scams',
      ],
      body: `Research helps you decide whether to apply, tailor your resume, and answer "Why do you want to join us?" convincingly. It also shows respect for the interviewer's time.

### What to find out
- **What they do:** main products or services, customers, how they make money.
- **Recent news:** launches, acquisitions, funding, results, layoffs.
- **Technology:** engineering blog posts, open-source projects, tech talks, the stack listed in job descriptions.
- **The role:** day-to-day work, team, required and preferred skills, location, training programme.
- **Terms:** compensation structure, any service agreement or bond, joining timeline.
- **Culture and values:** published values, employee talks, how they describe their teams.

### Where to look
Official website and careers page, annual reports (for listed companies), engineering blogs, the company's GitHub, recent news articles, pre-placement talks, and alumni who work there. Treat anonymous forum posts as unverified opinions, not facts.

### Worked example: a research summary
For a fictional payments company, "Acme Pay":

\`\`\`text
Company:   Acme Pay (fictional)
Products:  payment links and checkout for small online shops
Customers: small and mid-size businesses     Revenue: fee per transaction
Recent:    1. Launched recurring payments (company blog, March)
           2. Opened an office in Pune (press release)
Tech:      Java and Kotlin services, PostgreSQL, Kafka (engineering blog)
Role:      Graduate engineer, payments platform team, Bengaluru
           Skills I match: Java, SQL, REST APIs (final-year project)
           Gaps: no Kafka experience yet; reading their event-driven posts
Why me:    I built a REST API with PostgreSQL for our college fest's ticketing.
Why them:  I want to work on systems where correctness matters, like payments.
Questions: 1. How do graduates learn the payments domain in the first months?
           2. How does the team test changes to money-moving code?
\`\`\`

Every line is either sourced or a true statement about yourself. Listing a gap honestly, with what you are doing about it, is far stronger than claiming skills you lack.

### Using it in the interview
A good "Why this company?" answer connects **one specific fact about them** with **one real experience of yours**, in two or three sentences. Your self-introduction can end by linking to the role: "...which is why the payments platform role interests me."

### Good questions to ask interviewers
- "What does a typical first six months look like for a graduate on this team?"
- "How do new engineers get feedback and mentoring?"
- "What is a challenge the team is working on right now?"

### Is it a fit for you?
Research is also for your own decision: the kind of work, location, training, growth, and offer terms such as bonds. A role that matches your interests is easier to prepare for and to succeed in.

### Recruitment scams
Legitimate employers do not ask candidates to pay for interviews, training, equipment or "security deposits" to secure a job. Be cautious of offers with no interview, personal email domains, or pressure to pay quickly. Verify through the official careers page or your placement cell.

### Common mistakes
- Generic answers: "It's a reputed company with good growth."
- Asking about things clearly stated on the careers page or in the pre-placement talk.
- Relying on rumours or unverified forum posts as facts.
- Overstating your interest in a product you have never used; be genuine instead.`,
      practice: [
        { title: 'Research three companies', kind: 'exercise', prompt: 'Fill in the research summary template for three companies visiting your campus or on your target list. Include at least one recent news item, one technical detail and the source of each fact.' },
        { title: 'Why this company?', kind: 'exercise', prompt: 'Write and rehearse a 45-second honest answer to "Why do you want to join us?" for your top company, connecting a specific fact about them with a real experience of yours.' },
        { title: 'Spot the scam', kind: 'exercise', prompt: 'List five warning signs of a fake job offer. Then check one offer or posting you have received against the list and verify it through the company\'s official careers page.' },
      ],
      resources: [
        { title: 'Questions to ask your interviewer', url: 'https://www.techinterviewhandbook.org/final-questions/', source: 'Tech Interview Handbook', kind: 'article' },
        { title: 'Self introduction', url: 'https://www.techinterviewhandbook.org/self-introduction/', source: 'Tech Interview Handbook', kind: 'article' },
        { title: 'National Cyber Crime Reporting Portal', url: 'https://www.cybercrime.gov.in/', source: 'Ministry of Home Affairs, Government of India', kind: 'interactive' },
      ],
      quiz: [
        {
          key: 'q1',
          type: 'single',
          title: 'Strong answer',
          prompt: 'Which "Why this company?" answer is strongest?',
          options: [
            { id: 'a', text: '"It is a big company with good pay."' },
            { id: 'b', text: '"Your team\'s recent move to real-time payments matches the event-driven project I built for my final year, and I want to learn how it works at scale."' },
            { id: 'c', text: '"My friends are applying here."' },
          ],
          correct: ['b'],
          explanation: 'It is specific to the company and links honestly to your own experience.',
        },
        {
          key: 'q2',
          type: 'multi',
          title: 'Reliable sources',
          prompt: 'Which are reliable sources for company research? Select all that apply.',
          options: [
            { id: 'a', text: 'The company\'s official website and careers page' },
            { id: 'b', text: 'The company\'s engineering blog' },
            { id: 'c', text: 'An anonymous rumour in a group chat' },
            { id: 'd', text: 'Published annual reports' },
          ],
          correct: ['a', 'b', 'd'],
          explanation: 'Official and published sources are verifiable. Treat rumours as unconfirmed.',
        },
        {
          key: 'q3',
          type: 'true_false',
          title: 'Paying for a job',
          prompt: 'It is normal for a legitimate employer to ask a selected candidate to pay a training or security fee before joining.',
          options: [
            { id: 'true', text: 'True' },
            { id: 'false', text: 'False' },
          ],
          correct: ['false'],
          explanation: 'Requests for payment are a common sign of a recruitment scam. Verify through official channels or your placement cell.',
          difficulty: 'easy',
        },
        {
          key: 'q4',
          type: 'single',
          title: 'Handling a gap',
          prompt: 'The role lists Kafka, which you have not used. What should your research summary and answers say?',
          options: [
            { id: 'a', text: 'Claim Kafka experience, since you can learn it later' },
            { id: 'b', text: 'Acknowledge the gap honestly and mention what you are doing to learn it' },
            { id: 'c', text: 'Avoid applying to the role' },
          ],
          correct: ['b'],
          explanation: 'Interviewers probe claimed skills. An honest gap with a learning plan shows self-awareness and initiative.',
        },
        {
          key: 'q5',
          type: 'matching',
          title: 'Where to find it',
          prompt: 'Match each piece of information with a good place to find it.',
          pairs: {
            left: [
              { id: 'l1', text: 'The technologies the team uses' },
              { id: 'l2', text: 'Compensation structure and selection process for campus hires' },
              { id: 'l3', text: 'Revenue and business results of a listed company' },
            ],
            right: [
              { id: 'r1', text: 'Annual report' },
              { id: 'r2', text: 'Engineering blog and job descriptions' },
              { id: 'r3', text: 'Pre-placement talk and official offer documents' },
            ],
          },
          matches: { l1: 'r2', l2: 'r3', l3: 'r1' },
          explanation: 'Use the source closest to the information: engineers write about their stack, recruiters explain process and terms, and annual reports give audited results.',
        },
      ],
    },
    {
      slug: 'placement-drive-process',
      title: 'Placement drive process and eligibility',
      module: 'Preparation',
      skill: 'job-search',
      minutes: 45,
      objectives: [
        'Describe the typical stages of a campus placement drive',
        'Check eligibility criteria such as marks, backlogs and branch accurately',
        'Answer common HR interview questions honestly',
        'Read an offer letter: CTC versus take-home pay, bonds and conditions',
        'Understand placement cell policies on offers, dream companies and conduct',
      ],
      body: `Campus placement processes vary by institution and employer, but most follow a similar pattern.

### Typical stages
1. **Registration** with the placement cell, including your resume and academic details.
2. **Pre-placement talk (PPT):** the company presents its roles, compensation and process. Attend; many questions are answered here.
3. **Eligibility shortlisting** based on criteria the company sets.
4. **Online assessment:** aptitude, technical MCQs and/or coding.
5. **Group discussion** (some employers).
6. **Technical interviews:** one or more rounds.
7. **HR interview:** motivation, fit, relocation, policies.
8. **Offer letter**, followed later by onboarding and document verification.

Many students also find internships and apprenticeships through national portals and off-campus applications.

### Eligibility criteria
Common criteria include minimum percentage or CGPA (sometimes for 10th, 12th and degree), no active backlogs, specific branches and graduation year.

\`\`\`text
Example criteria:
  CGPA >= 7.0, 10th and 12th >= 60%, no active backlogs,
  branches: CSE, IT, ECE, graduating in 2026
Check: every number exactly as on your official mark sheets.
\`\`\`

**Report your details exactly as they appear on official records.** Misstating marks or hiding backlogs is detected at document verification and can lead to offers being revoked and disciplinary action.

### The HR interview: honest answers
| Question | A good, honest approach |
|---|---|
| Tell me about yourself | 60 to 90 seconds: studies, one or two real projects, what you want to do next |
| Why should we hire you? | Two strengths with real evidence, linked to the role |
| Are you willing to relocate or work shifts? | Answer truthfully; saying yes and refusing later harms you and the next batch |
| Do you have any backlogs or gaps? | State the facts briefly and what you did about them |
| Do you have other offers? | Be truthful; you do not need to share every detail |

### Reading an offer letter
- **CTC (cost to company)** is often larger than what you receive each month. It may include variable pay, joining or retention bonuses, and employer contributions such as provident fund or insurance. Ask for, or work out, the **fixed monthly take-home** after deductions.
- **Service agreement or bond:** minimum period, penalty amount, and what triggers it.
- **Conditions:** final marks, background verification, joining date, location and training.

\`\`\`text
Example: CTC 6,00,000 per year = fixed 5,10,000 + variable up to 60,000
         + employer PF and insurance 30,000.
Monthly gross from the fixed part = 5,10,000 / 12 = 42,500,
before employee deductions such as PF and income tax.
\`\`\`

### Placement cell policies
Learn your institution's rules before the season starts: how many offers you can hold, "dream" or "super dream" company rules, whether you may skip a registered drive, and conduct expectations. Breaking them can bar you from later drives.

### Document checklist
Updated resume (PDF), mark sheets, ID proof, photographs, certificates for claimed achievements, and a working laptop and internet connection for online rounds.

### Common mistakes
- Missing registration deadlines.
- Skipping the pre-placement talk, then asking questions it already answered.
- Registering for companies you would not join, taking a slot from someone who would.
- Comparing offers by CTC alone, or ignoring the service agreement or bond terms.`,
      practice: [
        { title: 'Eligibility audit', kind: 'exercise', prompt: 'Collect the eligibility criteria for five companies that visited your campus last year (from your placement cell or seniors). Check each against your official marks and list which you are eligible for.' },
        { title: 'Policy summary', kind: 'exercise', prompt: 'Read your placement cell\'s policy document and summarise in under 150 words the rules on registration, multiple offers, dream companies and conduct.' },
        { title: 'Decode an offer', kind: 'exercise', prompt: 'Using a sample offer letter from your placement cell or a senior (with personal details removed), separate the fixed, variable and one-time components, estimate the fixed monthly gross, and list any bond or conditions.' },
      ],
      resources: [
        { title: 'National Internship Portal', url: 'https://internship.aicte-india.org/', source: 'AICTE, Government of India', kind: 'interactive' },
        { title: 'National Apprenticeship Training Scheme (NATS)', url: 'https://nats.education.gov.in/', source: 'Ministry of Education, Government of India', kind: 'interactive' },
        { title: 'National Career Service', url: 'https://ncs.gov.in/', source: 'Ministry of Labour and Employment, Government of India', kind: 'interactive' },
      ],
      quiz: [
        {
          key: 'q1',
          type: 'true_false',
          title: 'Reporting marks',
          prompt: 'Rounding your CGPA up slightly to meet a company\'s cutoff is acceptable because it is close.',
          options: [
            { id: 'true', text: 'True' },
            { id: 'false', text: 'False' },
          ],
          correct: ['false'],
          explanation: 'Report details exactly as on official records. Document verification catches discrepancies, and offers can be revoked.',
          difficulty: 'easy',
        },
        {
          key: 'q2',
          type: 'single',
          title: 'Pre-placement talk',
          prompt: 'Why should you attend a company\'s pre-placement talk?',
          options: [
            { id: 'a', text: 'It is where offers are handed out' },
            { id: 'b', text: 'It explains the roles, process and expectations, and lets you ask informed questions' },
            { id: 'c', text: 'Attendance replaces the online test' },
          ],
          correct: ['b'],
          explanation: 'The PPT gives you context you can use in interviews and helps you decide whether the role suits you.',
        },
        {
          key: 'q3',
          type: 'single',
          title: 'CTC vs take-home',
          prompt: 'An offer states a CTC of 6,00,000 per year. Why might your monthly take-home pay be less than 50,000?',
          options: [
            { id: 'a', text: 'CTC can include variable pay, one-time bonuses and employer contributions, and deductions such as tax apply' },
            { id: 'b', text: 'The company has made a calculation error' },
            { id: 'c', text: 'CTC is always paid in one lump sum at the end of the year' },
          ],
          correct: ['a'],
          explanation: 'Read the breakdown. Only the fixed component is paid monthly, and employee deductions come out of it.',
          difficulty: 'medium',
        },
        {
          key: 'q4',
          type: 'single',
          title: 'Relocation question',
          prompt: 'In an HR interview you are asked if you can relocate. You cannot, for family reasons. What should you do?',
          options: [
            { id: 'a', text: 'Say yes to get the offer and decide later' },
            { id: 'b', text: 'Answer truthfully and explain briefly, mentioning any locations that do work for you' },
            { id: 'c', text: 'Refuse to answer' },
          ],
          correct: ['b'],
          explanation: 'Honest answers let the company find a fit, if one exists. Accepting and then refusing harms you, the company and future students from your college.',
        },
        {
          key: 'q5',
          type: 'multi',
          title: 'Offer letter checks',
          prompt: 'Which should you check carefully in an offer letter before accepting? Select all that apply.',
          options: [
            { id: 'a', text: 'Service agreement or bond terms and penalties' },
            { id: 'b', text: 'The fixed and variable parts of the compensation' },
            { id: 'c', text: 'Conditions such as final marks and background verification' },
            { id: 'd', text: 'The font used in the letter' },
          ],
          correct: ['a', 'b', 'c'],
          explanation: 'Bonds, compensation structure and conditions determine what you are agreeing to. Ask HR or your placement cell if anything is unclear.',
        },
      ],
    },
    {
      slug: 'preparing-a-portfolio',
      title: 'Preparing a portfolio',
      module: 'Showcase',
      skill: 'job-search',
      minutes: 55,
      milestone: true,
      completionCriteria: 'Publish a portfolio (GitHub profile or personal site) with two to four well-documented projects, each with a README, a demo or screenshots, and an honest description of your contribution.',
      objectives: [
        'Choose two to four projects that best show your skills for target roles',
        'Present each project with a clear README, demo and explanation of your role',
        'Set up a professional GitHub profile or simple personal site',
        'Record a short, focused demo video',
        'Keep every claim accurate and attribute others\' work and tutorials',
      ],
      body: `A portfolio lets employers see your work instead of taking your resume on trust. For students, it can matter as much as grades.

### Quality over quantity
Two to four solid projects beat twenty unfinished tutorial copies. Good portfolio projects:
- solve a real problem (for you, a club, a local business, an open dataset)
- are complete enough to use or demo
- show skills relevant to your target role (a dashboard for data analyst roles, an API and frontend for developer roles)

### Choosing projects: a quick scoring table

\`\`\`text
Project              Relevance  Complete  Documented  Total (out of 15)
Lost and Found app       5         4          2            11
Weather CLI              2         5          3            10
ML course notebook       4         3          1             8
\`\`\`

Score each from 1 to 5. Polish the top scorers first; documentation is usually the cheapest score to raise.

### Present each project well
For every project, include:
- a one-line description and the problem it solves
- a live demo link, short video or screenshots
- the tech stack and one interesting technical decision
- how to run it (see the README guidance in Communication and Writing)
- **your role**, if it was a team project

\`\`\`markdown
## Campus Lost and Found
A web app where students post and claim lost items. Used by our hostel
during the 2025 spring semester.

- Stack: React, Node.js, PostgreSQL
- My role: built the API and authentication in a team of three
- Interesting decision: image uploads go to object storage with signed URLs
- Demo: (link)   Screenshots: below
\`\`\`

### Worked example: honest descriptions
| Overstated | Honest and still strong |
|---|---|
| "Built a full-stack app used by thousands" | "Built the API for a hostel lost-and-found app used during one semester (about 60 posts)" |
| "Developed an AI model with 99% accuracy" | "Trained a logistic regression baseline (82% accuracy on a held-out test set) following a course, then added feature engineering that raised it to 85%" |
| "Expert in React, Docker, Kubernetes, AWS" | "Used React and Docker in two projects; currently learning Kubernetes" |

Only include numbers you can show the source for, such as test results, analytics or a count of real posts. Interviewers ask "how did you measure that?"

### Profile and site
Use a professional GitHub username, a short profile README, and pinned repositories for your best work.

\`\`\`markdown
# Hi, I'm Asha
Final-year computer science student interested in backend development.

- Building: a REST API for our college library (Node.js, PostgreSQL)
- Learning: testing and CI with GitHub Actions
- Contact: asha.dev@example.com
\`\`\`

A simple personal site on free static hosting such as GitHub Pages can link everything together.

### Demo videos
Keep it to about two minutes: state the problem in one sentence, show the main user journey, mention one technical decision. Use test data, zoom in so text is readable, and add captions if you can.

### Honesty and attribution
- If a project followed a tutorial or course, say so and describe what you added or changed.
- Credit teammates, templates, datasets and libraries.
- Do not copy someone else's project and present it as yours; interviewers ask detailed questions and plagiarism checks exist.

### Common mistakes
- Repositories with no README, or only the default text.
- Broken demo links.
- Secrets committed in public repositories. If it happens, rotate the secret immediately.
- Many forks with no changes, which add noise without showing your work.`,
      practice: [
        { title: 'Portfolio audit', kind: 'exercise', prompt: 'List all your projects and score each from 1 to 5 on relevance, completeness and documentation. Choose your top two to four and write down what each needs before it is portfolio-ready.' },
        { title: 'Publish', kind: 'exercise', prompt: 'Set up a GitHub profile README, pin your best repositories, and add a README with demo links or screenshots and an honest "my role" line to each. Ask a friend to review it as if they were a recruiter.' },
        { title: 'Two-minute demo', kind: 'exercise', prompt: 'Record a two-minute demo video of your strongest project: problem, main user journey, one technical decision. Watch it back and cut anything that does not help a viewer understand the project.' },
      ],
      resources: [
        { title: 'GitHub Pages', url: 'https://pages.github.com/', source: 'GitHub', kind: 'docs' },
        { title: 'Managing your profile README', url: 'https://docs.github.com/en/account-and-profile/how-tos/profile-customization/managing-your-profile-readme', source: 'GitHub Docs', kind: 'docs' },
        { title: 'Make a README', url: 'https://www.makeareadme.com/', source: 'makeareadme.com', kind: 'article' },
      ],
      quiz: [
        {
          key: 'q1',
          type: 'single',
          title: 'Tutorial projects',
          prompt: 'You built a project by following a video tutorial and then added two features of your own. How should you present it?',
          options: [
            { id: 'a', text: 'As an original project entirely your own' },
            { id: 'b', text: 'Credit the tutorial and clearly describe the features you added' },
            { id: 'c', text: 'Hide it from your portfolio' },
          ],
          correct: ['b'],
          explanation: 'Attribution is honest and still shows initiative through your additions.',
          difficulty: 'easy',
        },
        {
          key: 'q2',
          type: 'single',
          title: 'Quality vs quantity',
          prompt: 'Which portfolio is likely to make the stronger impression?',
          options: [
            { id: 'a', text: '25 repositories, most unfinished and undocumented' },
            { id: 'b', text: '3 complete, documented projects with demos relevant to the target role' },
            { id: 'c', text: 'Only forks of popular repositories' },
          ],
          correct: ['b'],
          explanation: 'Reviewers have limited time. A few strong, relevant, documented projects show more than many unfinished ones.',
        },
        {
          key: 'q3',
          type: 'multi',
          title: 'Project entry',
          prompt: 'Which belong in a portfolio entry for a team project? Select all that apply.',
          options: [
            { id: 'a', text: 'The problem it solves, in one line' },
            { id: 'b', text: 'Your specific role in the team' },
            { id: 'c', text: 'A demo link, video or screenshots' },
            { id: 'd', text: 'A claim that you built the whole thing yourself' },
          ],
          correct: ['a', 'b', 'c'],
          explanation: 'Purpose, your real contribution and evidence of it working make the entry credible. Claiming the whole team\'s work is misrepresentation.',
        },
        {
          key: 'q4',
          type: 'true_false',
          title: 'Unmeasured numbers',
          prompt: 'If you do not know how many people used your app, writing "used by about 1,000 users" is acceptable because it sounds realistic.',
          options: [
            { id: 'true', text: 'True' },
            { id: 'false', text: 'False' },
          ],
          correct: ['false'],
          explanation: 'Only include numbers you can source. Describe the real context instead, such as "used by our hostel during one semester".',
        },
        {
          key: 'q5',
          type: 'single',
          title: 'Leaked secret',
          prompt: 'You notice your public portfolio repository contains a real API key in an old commit. What should you do first?',
          options: [
            { id: 'a', text: 'Make the repository private and forget about it' },
            { id: 'b', text: 'Revoke and rotate the key, then remove it from the code and history' },
            { id: 'c', text: 'Add a comment asking people not to use it' },
          ],
          correct: ['b'],
          explanation: 'Assume anything public has been copied. Rotating the key makes the leaked copy useless.',
        },
      ],
    },
  ],
};
