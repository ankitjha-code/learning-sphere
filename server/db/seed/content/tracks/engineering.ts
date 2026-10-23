import type { SeedTrack } from '../types';

export const gitCollaboration: SeedTrack = {
  slug: 'git-and-collaboration',
  title: 'Git and Collaboration',
  category: 'collaboration',
  summary: 'Use the command line and Git with confidence, collaborate through pull requests and contribute to open source.',
  description: `**Who it's for:** students and new developers who have written some code but have not yet worked on a shared codebase.

**Prerequisites:** none beyond basic computer use. You need a terminal and a free GitHub account.

**You will be able to:**
- navigate and manage files from the command line
- record, inspect and undo changes with Git
- branch, merge and resolve conflicts
- collaborate with remotes, GitHub and pull requests
- give and receive code review respectfully and usefully
- make your first open-source contribution

**Milestones:** *Branching and merging* (topic 3) and *Your first open-source contribution* (topic 6).`,
  level: 'beginner',
  estimatedHours: 16,
  roles: ['software engineer', 'sde intern', 'frontend developer', 'backend developer', 'full-stack developer', 'data scientist', 'devops engineer', 'graduate trainee'],
  contentStatus: 'complete',
  topics: [
    {
      slug: 'command-line-essentials',
      title: 'Command line essentials',
      module: 'Foundations',
      skill: 'command-line',
      minutes: 40,
      objectives: [
        'Navigate the file system with pwd, ls and cd using relative and absolute paths',
        'Create, copy, move and delete files and directories safely',
        'Combine commands with pipes and redirect output to files',
        'Find help for any command with --help and man',
      ],
      body: `The **shell** is a program that reads commands you type and runs them. Developers use it daily because it is fast, scriptable and the same on servers as on your laptop. These examples use a POSIX shell such as bash or zsh (macOS, Linux, or WSL and Git Bash on Windows).

### Where am I?

\`\`\`bash
pwd                 # print working directory, e.g. /home/asha/projects
ls                  # list files
ls -la              # long format, including hidden files (names starting with .)
cd projects/site    # relative path: from where you are now
cd /etc             # absolute path: from the root of the file system
cd ..               # up one level
cd ~                # your home directory
\`\`\`

### Working with files

\`\`\`bash
mkdir -p notes/2025     # make a directory (and parents if missing)
touch notes/todo.txt    # create an empty file
cp todo.txt backup.txt  # copy
mv backup.txt old/      # move (also used to rename)
rm old/backup.txt       # delete a file: there is no recycle bin
rm -r old               # delete a directory and everything in it
\`\`\`

Be careful with \`rm -r\`. Run \`ls\` on the same path first to see exactly what will be deleted.

### Reading files

\`\`\`bash
cat README.md          # print a whole file
less server.log        # scroll through a long file (q to quit)
head -n 20 data.csv    # first 20 lines
tail -f server.log     # follow new lines as they are written
\`\`\`

### Pipes and redirection
Each command reads input and writes output. A **pipe** \`|\` sends one command's output into the next. \`>\` writes output to a file (overwriting it); \`>>\` appends.

\`\`\`bash
grep "ERROR" server.log | wc -l        # count lines containing ERROR
ls -1 *.py > python-files.txt          # save a list of Python files
history | grep git | tail -n 5         # last 5 git commands you ran
\`\`\`

### Getting help
\`ls --help\` prints a summary; \`man ls\` opens the full manual. Press **Tab** to autocomplete file names and the **Up** arrow to repeat earlier commands.

### Common mistakes
- Spaces in file names: \`cd My Documents\` fails. Use quotes: \`cd "My Documents"\`, or press Tab to autocomplete.
- Using \`>\` when you meant \`>>\` and overwriting a file.
- Running commands you copied from the internet without understanding them, especially with \`sudo\` or \`rm\`.`,
      practice: [
        { title: 'Organise a project folder', kind: 'exercise', prompt: 'Using only the terminal, create a folder structure project/{src,docs,tests}, create three files, move one into docs, rename another, and list the whole tree with ls -R.' },
        { title: 'Log detective', kind: 'exercise', prompt: 'Create a text file with 20 lines of fake log entries using INFO, WARN and ERROR levels. Use grep, wc and sort to count each level and save the ERROR lines to errors.txt.' },
      ],
      resources: [
        { title: 'The Missing Semester: Course overview and the shell', url: 'https://missing.csail.mit.edu/2020/course-shell/', source: 'MIT CSAIL', kind: 'course' },
        { title: 'The Missing Semester: Shell Tools and Scripting', url: 'https://missing.csail.mit.edu/2020/shell-tools/', source: 'MIT CSAIL', kind: 'course' },
        { title: 'The Linux Command Line (free book)', url: 'https://linuxcommand.org/tlcl.php', source: 'linuxcommand.org', kind: 'book' },
      ],
      quiz: [
        {
          key: 'q1',
          type: 'single',
          title: 'Parent directory',
          prompt: 'You are in `/home/asha/projects/site`. Which command moves you to `/home/asha/projects`?',
          options: [
            { id: 'a', text: '`cd ..`' },
            { id: 'b', text: '`cd ~`' },
            { id: 'c', text: '`cd /projects`' },
          ],
          correct: ['a'],
          explanation: '`..` means the parent directory. `~` is your home directory, and `/projects` is an absolute path from the root.',
        },
        {
          key: 'q2',
          type: 'single',
          title: 'Redirection',
          prompt: 'What does `echo "hello" >> notes.txt` do?',
          options: [
            { id: 'a', text: 'Replaces the contents of notes.txt with hello' },
            { id: 'b', text: 'Appends hello as a new line at the end of notes.txt' },
            { id: 'c', text: 'Prints the contents of notes.txt' },
          ],
          correct: ['b'],
          explanation: '`>>` appends. A single `>` would overwrite the file.',
        },
        {
          key: 'q3',
          type: 'single',
          title: 'Pipes',
          prompt: 'In `cat access.log | grep 404 | wc -l`, what is the final output?',
          options: [
            { id: 'a', text: 'Every line of the log' },
            { id: 'b', text: 'The lines containing 404' },
            { id: 'c', text: 'The number of lines containing 404' },
          ],
          correct: ['c'],
          explanation: 'grep keeps only matching lines, then `wc -l` counts them.',
        },
        {
          key: 'q4',
          type: 'true_false',
          title: 'rm and recovery',
          prompt: 'Files deleted with `rm` go to the trash and can be easily restored.',
          options: [
            { id: 'true', text: 'True' },
            { id: 'false', text: 'False' },
          ],
          correct: ['false'],
          explanation: '`rm` removes files immediately with no trash folder. Double-check paths before deleting.',
        },
      ],
    },
    {
      slug: 'git-basics-commits-history',
      title: 'Git basics: commits and history',
      module: 'Git fundamentals',
      skill: 'git',
      minutes: 50,
      objectives: [
        'Explain the working tree, staging area and repository',
        'Create a repository and make focused commits with clear messages',
        'Inspect history and changes with git log, git status and git diff',
        'Undo common mistakes safely with restore, commit --amend and revert',
      ],
      body: `**Git** is a version control system: it records snapshots of your project so you can see what changed, when, why and by whom, and go back if something breaks.

### The three areas
- **Working tree:** the files you edit.
- **Staging area (index):** changes you have selected for the next commit.
- **Repository:** the committed history, stored in the hidden \`.git\` folder.

\`\`\`bash
git init                     # start tracking the current folder
git status                   # what changed? what is staged?
git add index.html           # stage one file
git add -p                   # stage chosen parts of files interactively
git commit -m "Add landing page header"
\`\`\`

Set your identity once per machine:

\`\`\`bash
git config --global user.name "Asha Rao"
git config --global user.email "asha@example.com"
\`\`\`

### Looking at history

\`\`\`bash
git log --oneline --graph    # compact history
git diff                     # unstaged changes
git diff --staged            # staged changes, about to be committed
git show a1b2c3d             # one commit in full
\`\`\`

### Good commits
A commit should be **one logical change** that you could describe in one line. Good messages use the imperative mood and say *what* and *why*:

\`\`\`text
Fix total when cart is empty

The checkout page crashed with a division by zero when
the cart had no items. Return 0 early instead.
\`\`\`

Compare with "fixed stuff" or "changes". Future you, reading \`git log\` during an outage, will be grateful.

### Ignoring files
Create a \`.gitignore\` so build output, dependencies and secrets are never committed:

\`\`\`text
node_modules/
dist/
.env
__pycache__/
\`\`\`

### Undoing things

| Situation | Command |
|---|---|
| Discard unstaged edits to a file | \`git restore file.txt\` |
| Unstage a file but keep the edits | \`git restore --staged file.txt\` |
| Fix the last commit's message or add a forgotten file (not yet pushed) | \`git commit --amend\` |
| Undo a commit that is already shared | \`git revert <hash>\` (creates a new commit that reverses it) |

### Common mistakes
- Committing everything with \`git add .\` without reading \`git status\` first, including secrets or large files.
- Huge commits that mix a bug fix, a refactor and formatting changes.
- Rewriting history (\`--amend\`, reset) on commits that others have already pulled.`,
      practice: [
        { title: 'First repository', kind: 'exercise', prompt: 'Create a repository for a small project, add a .gitignore, and make at least five focused commits with clear imperative messages. Show your history with git log --oneline.' },
        { title: 'Undo drills', kind: 'exercise', prompt: 'In a scratch repository, practise each undo: restore an edited file, unstage a file, amend the last commit message, and revert an older commit. Note what git status and git log show after each step.' },
      ],
      resources: [
        { title: 'Pro Git: Recording Changes to the Repository', url: 'https://git-scm.com/book/en/v2/Git-Basics-Recording-Changes-to-the-Repository', source: 'git-scm.com', kind: 'book' },
        { title: 'Pro Git: Viewing the Commit History', url: 'https://git-scm.com/book/en/v2/Git-Basics-Viewing-the-Commit-History', source: 'git-scm.com', kind: 'book' },
        { title: 'Pro Git: Undoing Things', url: 'https://git-scm.com/book/en/v2/Git-Basics-Undoing-Things', source: 'git-scm.com', kind: 'book' },
        { title: 'The Missing Semester: Version Control (Git)', url: 'https://missing.csail.mit.edu/2020/version-control/', source: 'MIT CSAIL', kind: 'course' },
      ],
      quiz: [
        {
          key: 'q1',
          type: 'single',
          title: 'Staging area',
          prompt: 'You edited three files but only want to commit one. What do you do?',
          options: [
            { id: 'a', text: '`git commit -a`' },
            { id: 'b', text: '`git add <that-file>` then `git commit`' },
            { id: 'c', text: 'Delete the other two files first' },
          ],
          correct: ['b'],
          explanation: 'The staging area lets you choose exactly what goes into the next commit. `commit -a` stages every tracked change.',
        },
        {
          key: 'q2',
          type: 'single',
          title: 'Undo a shared commit',
          prompt: 'A commit that broke production was pushed and teammates have pulled it. What is the safest way to undo it?',
          options: [
            { id: 'a', text: '`git reset --hard` and force push' },
            { id: 'b', text: '`git revert <hash>` and push the new commit' },
            { id: 'c', text: '`git commit --amend`' },
          ],
          correct: ['b'],
          explanation: 'Revert adds a new commit that reverses the change without rewriting shared history.',
        },
        {
          key: 'q3',
          type: 'single',
          title: 'Commit messages',
          prompt: 'Which is the most useful commit message?',
          options: [
            { id: 'a', text: '`update`' },
            { id: 'b', text: '`Fix login redirect loop when session cookie expires`' },
            { id: 'c', text: '`Changed some files in auth folder`' },
          ],
          correct: ['b'],
          explanation: 'It states what changed and the situation it fixes, in the imperative mood.',
        },
        {
          key: 'q4',
          type: 'matching',
          title: 'Diff commands',
          prompt: 'Match each command with what it shows.',
          pairs: {
            left: [
              { id: 'l1', text: '`git diff`' },
              { id: 'l2', text: '`git diff --staged`' },
              { id: 'l3', text: '`git log --oneline`' },
            ],
            right: [
              { id: 'r1', text: 'Changes staged for the next commit' },
              { id: 'r2', text: 'Changes not yet staged' },
              { id: 'r3', text: 'A compact list of commits' },
            ],
          },
          matches: { l1: 'r2', l2: 'r1', l3: 'r3' },
          explanation: 'Plain `git diff` compares the working tree to the index; `--staged` compares the index to the last commit.',
        },
      ],
    },
    {
      slug: 'branching-and-merging',
      title: 'Branching and merging',
      module: 'Git fundamentals',
      skill: 'git',
      minutes: 55,
      milestone: true,
      completionCriteria: 'Pass the quiz (70%+) and resolve a merge conflict in a practice repository, with a clean history afterwards.',
      objectives: [
        'Create, switch and delete branches',
        'Explain fast-forward and three-way merges',
        'Resolve merge conflicts calmly and correctly',
        'Describe what rebase does and when not to use it',
      ],
      body: `A **branch** is a lightweight, movable pointer to a commit. Branches let you work on a feature without disturbing the main line of development.

\`\`\`bash
git switch -c feature/search    # create and switch to a new branch
# ...edit, add, commit...
git switch main                 # go back to main
git branch                      # list branches; * marks the current one
git branch -d feature/search    # delete after merging
\`\`\`

(Older tutorials use \`git checkout -b\`; \`git switch\` does the same job with a clearer name.)

### Merging

\`\`\`bash
git switch main
git merge feature/search
\`\`\`

- **Fast-forward:** if main has not moved since you branched, Git just moves the main pointer forward. No merge commit.
- **Three-way merge:** if both branches have new commits, Git combines them and creates a **merge commit** with two parents.

### Resolving conflicts
A conflict happens when both branches changed the same lines. Git stops and marks the file:

\`\`\`text
<<<<<<< HEAD
const TAX_RATE = 0.18;
=======
const TAX_RATE = 0.12;
>>>>>>> feature/pricing
\`\`\`

To resolve:
1. Run \`git status\` to see the conflicted files.
2. Edit each file to the correct final content. This may be one side, the other, or a combination. Delete the markers.
3. Run the tests. A clean merge can still be wrong.
4. \`git add\` the files, then \`git commit\` to finish the merge.

If you get lost, \`git merge --abort\` returns you to the state before the merge.

### Rebase in one paragraph
\`git rebase main\` replays your branch's commits on top of the latest main, giving a straight history as if you had started from there. It **rewrites** those commits (new hashes). Rule of thumb: rebase your own local branch to tidy it up; never rebase commits other people have already based work on.

### Keeping conflicts small
- Keep branches short-lived (days, not weeks).
- Pull the latest main into your branch regularly.
- Make small, focused pull requests.

### Common mistakes
- Committing directly to main on a team project.
- Leaving conflict markers in the file and committing them.
- Picking "ours" or "theirs" for a whole file without reading what the other side changed.`,
      practice: [
        { title: 'Create and resolve a conflict', kind: 'exercise', prompt: 'In a scratch repository, create two branches that change the same line of a file differently. Merge one into main, then merge the other and resolve the conflict by combining both intents. Show the result with git log --oneline --graph.' },
        { title: 'Feature branch workflow', kind: 'exercise', prompt: 'Build a small feature on a branch with at least three commits, update it with the latest main, merge it back, and delete the branch.' },
        { title: 'Interactive branching tutorial', kind: 'exercise', prompt: 'Complete the introductory levels of an interactive Git branching visualiser (such as Learn Git Branching) and write down one thing that surprised you.' },
      ],
      resources: [
        { title: 'Pro Git: Basic Branching and Merging', url: 'https://git-scm.com/book/en/v2/Git-Branching-Basic-Branching-and-Merging', source: 'git-scm.com', kind: 'book' },
        { title: 'Pro Git: Rebasing', url: 'https://git-scm.com/book/en/v2/Git-Branching-Rebasing', source: 'git-scm.com', kind: 'book' },
        { title: 'Learn Git Branching', url: 'https://learngitbranching.js.org/', source: 'learngitbranching.js.org', kind: 'interactive' },
      ],
      quiz: [
        {
          key: 'q1',
          type: 'single',
          title: 'Fast-forward',
          prompt: 'You branched from main, made two commits, and nobody changed main. What happens when you merge your branch into main?',
          options: [
            { id: 'a', text: 'A fast-forward: main simply moves to your latest commit' },
            { id: 'b', text: 'A merge conflict' },
            { id: 'c', text: 'Git refuses to merge' },
          ],
          correct: ['a'],
          explanation: 'With no divergent commits on main, Git can move the pointer forward without a merge commit.',
        },
        {
          key: 'q2',
          type: 'single',
          title: 'Conflict cause',
          prompt: 'When does a merge conflict occur?',
          options: [
            { id: 'a', text: 'Whenever two branches touch the same file' },
            { id: 'b', text: 'When both branches changed the same lines (or one edited what the other deleted)' },
            { id: 'c', text: 'Whenever a branch has more than one commit' },
          ],
          correct: ['b'],
          explanation: 'Git merges changes to different parts of a file automatically. It needs help only when changes overlap.',
        },
        {
          key: 'q3',
          type: 'multi',
          title: 'Resolving',
          prompt: 'Which steps are part of resolving a conflict correctly? Select all that apply.',
          options: [
            { id: 'a', text: 'Edit the file to the intended final content and remove the markers' },
            { id: 'b', text: 'Run the tests' },
            { id: 'c', text: '`git add` the resolved file and commit' },
            { id: 'd', text: 'Delete the branch you were merging before finishing' },
          ],
          correct: ['a', 'b', 'c'],
          explanation: 'Fix the content, verify it works, then stage and commit. Deleting the branch is unrelated to resolving.',
        },
        {
          key: 'q4',
          type: 'true_false',
          title: 'Rebase shared work',
          prompt: 'It is safe to rebase and force push a branch that several teammates are actively committing to.',
          options: [
            { id: 'true', text: 'True' },
            { id: 'false', text: 'False' },
          ],
          correct: ['false'],
          explanation: 'Rebase rewrites commit hashes. Teammates who based work on the old commits will face confusing duplicate history.',
        },
      ],
    },
    {
      slug: 'remotes-github-pull-requests',
      title: 'Remotes, GitHub and pull requests',
      module: 'Collaborating',
      skill: 'git',
      minutes: 50,
      objectives: [
        'Clone, fetch, pull and push with a remote repository',
        'Explain the difference between git fetch and git pull',
        'Open a pull request with a clear title, description and small diff',
        'Update a pull request after review feedback',
      ],
      body: `A **remote** is another copy of the repository, usually on a hosting service like GitHub. By convention the main remote is called \`origin\`.

\`\`\`bash
git clone https://github.com/acme/webapp.git   # copy a repo and set origin
git remote -v                                  # list remotes
git fetch origin                               # download new commits; do not change your files
git pull                                       # fetch, then merge into your current branch
git push -u origin feature/search              # publish a branch and track it
\`\`\`

**fetch vs pull:** \`fetch\` only updates your knowledge of the remote (\`origin/main\`). \`pull\` also integrates those changes into your current branch. When unsure, fetch first and look with \`git log --oneline main..origin/main\`.

### Authentication
GitHub no longer accepts account passwords for Git over HTTPS. Use SSH keys or a personal access token through a credential manager, or sign in through the GitHub CLI.

### The pull request workflow
A **pull request (PR)** proposes merging one branch into another and gives the team a place to review and discuss.

1. Update main: \`git switch main && git pull\`.
2. Create a branch: \`git switch -c fix/empty-cart-total\`.
3. Make small, focused commits and push the branch.
4. Open a PR on GitHub against main.
5. Address review comments with new commits and push again; the PR updates automatically.
6. After approval and passing checks, merge, then delete the branch.

### A good PR description

\`\`\`markdown
## What
Return 0 for the cart total when the cart is empty.

## Why
Checkout crashed with a division by zero for empty carts (issue #214).

## How to test
1. Open /checkout with an empty cart.
2. Total shows 0.00 and no error appears.

## Notes
Added a unit test for the empty case.
\`\`\`

Small PRs (a few hundred lines at most) get reviewed faster and more carefully than large ones.

### Merge strategies on GitHub
- **Merge commit:** keeps every commit plus a merge commit.
- **Squash and merge:** combines the PR into one commit on main; popular for tidy history.
- **Rebase and merge:** replays the commits onto main without a merge commit.

Follow whatever your team or project has chosen.

### Common mistakes
- Opening a PR from your local main instead of a feature branch.
- Force pushing over a teammate's commits on a shared branch.
- A PR titled "changes" with no description, leaving reviewers to guess.`,
      practice: [
        { title: 'Publish and open a PR', kind: 'exercise', prompt: 'Push a project to a new GitHub repository. Create a branch with a small improvement, push it, and open a pull request using the What, Why, How to test template. Merge it yourself after reviewing the diff on GitHub.' },
        { title: 'Pair PR review', kind: 'exercise', prompt: 'With a friend, each fork or join the other\'s repository, open a PR with a small change, leave at least two review comments on each other\'s PR, and update your PR in response.' },
      ],
      resources: [
        { title: 'Pro Git: Working with Remotes', url: 'https://git-scm.com/book/en/v2/Git-Basics-Working-with-Remotes', source: 'git-scm.com', kind: 'book' },
        { title: 'Pull requests (reference)', url: 'https://docs.github.com/en/pull-requests/reference/pull-requests', source: 'GitHub Docs', kind: 'docs' },
        { title: 'About Git (GitHub Docs)', url: 'https://docs.github.com/en/get-started/using-git/about-git', source: 'GitHub Docs', kind: 'docs' },
      ],
      quiz: [
        {
          key: 'q1',
          type: 'single',
          title: 'fetch vs pull',
          prompt: 'Which command downloads new commits from the remote without changing your current branch or files?',
          options: [
            { id: 'a', text: '`git pull`' },
            { id: 'b', text: '`git fetch`' },
            { id: 'c', text: '`git push`' },
          ],
          correct: ['b'],
          explanation: 'fetch updates remote-tracking branches such as origin/main. pull also merges or rebases them into your branch.',
        },
        {
          key: 'q2',
          type: 'single',
          title: 'Updating a PR',
          prompt: 'A reviewer asks for changes on your open PR. How do you update it?',
          options: [
            { id: 'a', text: 'Close it and open a new PR' },
            { id: 'b', text: 'Commit the changes on the same branch and push; the PR updates' },
            { id: 'c', text: 'Email the reviewer a patch' },
          ],
          correct: ['b'],
          explanation: 'A PR tracks its branch. New pushes appear in the PR automatically, keeping the discussion in one place.',
        },
        {
          key: 'q3',
          type: 'multi',
          title: 'Good PRs',
          prompt: 'Which make a pull request easier to review? Select all that apply.',
          options: [
            { id: 'a', text: 'A focused change with a small diff' },
            { id: 'b', text: 'A description of what, why and how to test' },
            { id: 'c', text: 'Mixing a feature, a refactor and reformatting of unrelated files' },
            { id: 'd', text: 'Linking the related issue' },
          ],
          correct: ['a', 'b', 'd'],
          explanation: 'Reviewers need context and a manageable diff. Unrelated changes hide the important parts.',
        },
        {
          key: 'q4',
          type: 'fill_blank',
          title: 'Default remote',
          prompt: 'By convention, the remote created by `git clone` is named ____.',
          accepted: [['origin']],
          explanation: '`git clone` names the source remote `origin` unless you choose otherwise.',
        },
      ],
    },
    {
      slug: 'code-review-etiquette',
      title: 'Code review etiquette',
      module: 'Collaborating',
      skill: 'code-review',
      minutes: 40,
      objectives: [
        'Explain the goals of code review beyond catching bugs',
        'Review in a sensible order: design, correctness, tests, then readability',
        'Write kind, specific, actionable comments and label their severity',
        'Receive feedback without defensiveness and resolve disagreements',
      ],
      body: `Code review is a conversation about code, not a judgement of the person who wrote it. Its goals: catch defects early, keep the codebase understandable, share knowledge across the team and keep standards consistent.

### As a reviewer: what to look at, in order
1. **Design:** does this change belong here? Is the approach reasonable?
2. **Correctness:** edge cases, error handling, concurrency, security (input validation, authorization, secrets).
3. **Tests:** do they cover the change and would they fail if the code were wrong?
4. **Readability:** names, comments that explain *why*, unnecessary complexity.
5. **Style:** let linters and formatters handle this automatically rather than debating it by hand.

### Writing good comments
Comment on the code, not the person; be specific; explain why; suggest a path forward.

| Instead of | Try |
|---|---|
| "This is wrong." | "If \`items\` is empty, \`total / items.length\` divides by zero. Could we return 0 early?" |
| "Why did you do it this way?" | "I'm curious why a loop here rather than \`filter\`. Is there a performance reason?" |
| "Use a map." | "nit: a \`Map\` keyed by id would avoid the nested loop. Not blocking." |

Label severity so authors know what must change: **blocking** issues, **suggestions**, **nit** (minor, optional) and **questions**. Praise good work too: "Nice test for the timezone edge case."

### Practical habits for reviewers
- Respond promptly. A day of waiting slows the whole team.
- Review a manageable amount at once; very large PRs get shallow reviews, so it is fair to ask for them to be split.
- Approve when the change improves the codebase overall, even if it is not exactly how you would have written it.

### As an author
- Review your own diff first and remove debug code.
- Keep PRs small and explain context in the description.
- Assume good intent. Reply to every comment: make the change, or explain your reasoning.
- If a thread goes back and forth more than twice, talk synchronously (a call or chat), then summarise the decision in the PR.

### Common mistakes
- Rubber-stamping ("LGTM") without reading.
- Bikeshedding: long debates about naming or style while missing a logic bug.
- Using review to show off or to block for personal preference.
- Taking comments personally. The code is being reviewed, not you.`,
      practice: [
        { title: 'Rewrite harsh comments', kind: 'exercise', prompt: 'Rewrite these comments to be specific, kind and actionable, and label each as blocking, suggestion or nit: "This is messy", "Wrong variable name", "Did you even test this?", "Why not just use a library?".' },
        { title: 'Review an open-source PR', kind: 'exercise', prompt: 'Find a merged pull request in an open-source project you use. Read the review comments and note three examples of effective feedback and how the author responded.' },
        { title: 'Self-review checklist', kind: 'exercise', prompt: 'Write a personal 8 to 10 item checklist you will run on your own diff before requesting review (for example: no debug logs, tests added, description explains why).' },
      ],
      resources: [
        { title: 'Google Engineering Practices: Code Review', url: 'https://google.github.io/eng-practices/review/', source: 'Google', kind: 'docs' },
        { title: 'How to write code review comments', url: 'https://google.github.io/eng-practices/review/reviewer/comments.html', source: 'Google', kind: 'article' },
        { title: 'Pull request reviews (reference)', url: 'https://docs.github.com/en/pull-requests/reference/pull-request-reviews', source: 'GitHub Docs', kind: 'docs' },
      ],
      quiz: [
        {
          key: 'q1',
          type: 'single',
          title: 'Best comment',
          prompt: 'Which review comment is most helpful?',
          options: [
            { id: 'a', text: '"This function is bad."' },
            { id: 'b', text: '"`parseDate` returns null for invalid input, but line 42 calls `.getTime()` on it without a check. Could we handle the null case?"' },
            { id: 'c', text: '"I would have written this differently."' },
          ],
          correct: ['b'],
          explanation: 'It identifies the exact problem, explains the impact and suggests a direction.',
        },
        {
          key: 'q2',
          type: 'single',
          title: 'Style debates',
          prompt: 'Your team keeps arguing about formatting in reviews. What is the best fix?',
          options: [
            { id: 'a', text: 'Have the most senior engineer decide each time' },
            { id: 'b', text: 'Adopt an automatic formatter and linter and run them in CI' },
            { id: 'c', text: 'Stop reviewing code' },
          ],
          correct: ['b'],
          explanation: 'Automating style removes the debate and frees reviewers to focus on design and correctness.',
        },
        {
          key: 'q3',
          type: 'true_false',
          title: 'Approval standard',
          prompt: 'A reviewer should block a PR until it matches exactly how they would have written it.',
          options: [
            { id: 'true', text: 'True' },
            { id: 'false', text: 'False' },
          ],
          correct: ['false'],
          explanation: 'Approve changes that improve the codebase overall. Personal preferences can be offered as non-blocking suggestions.',
        },
        {
          key: 'q4',
          type: 'single',
          title: 'Long threads',
          prompt: 'A comment thread has gone back and forth four times without agreement. What should you do?',
          options: [
            { id: 'a', text: 'Keep replying until the other person gives up' },
            { id: 'b', text: 'Have a quick call or chat, then record the decision in the PR' },
            { id: 'c', text: 'Merge without resolving it' },
          ],
          correct: ['b'],
          explanation: 'Synchronous conversation resolves disagreements faster, and writing the outcome down keeps the context for others.',
        },
      ],
    },
    {
      slug: 'contributing-to-open-source',
      title: 'Contributing to open source',
      module: 'Collaborating',
      skill: 'open-source',
      minutes: 50,
      milestone: true,
      completionCriteria: 'Open a pull request (code, docs or tests) to a public repository you do not own, following its contributing guide.',
      objectives: [
        'Find a suitable project and issue for a first contribution',
        'Read README, CONTRIBUTING and CODE_OF_CONDUCT files before starting',
        'Use the fork, branch and pull request workflow and keep your fork in sync',
        'Communicate with maintainers respectfully and patiently',
      ],
      body: `Open-source projects publish their code so anyone can use, study and improve it. Contributing builds real skills (reading unfamiliar code, working with strangers, meeting quality standards) and leaves public evidence of your work.

### Contributions are not only code
Documentation fixes, clearer error messages, tests, bug reports with reproduction steps, translations and answering questions are all valuable. Many first contributions are documentation.

### Choosing a project and issue
- Start with tools you already use; you understand the problems they solve.
- Look for labels like **good first issue** or **help wanted**.
- Check signs of a healthy project: recent commits, maintainers responding to issues, a CONTRIBUTING file.
- Read the README, **CONTRIBUTING.md** and **CODE_OF_CONDUCT.md** first. They explain how to set up, test and submit changes.

### Claim before you build
Comment on the issue to say you would like to work on it and briefly describe your approach. This avoids duplicate work and lets maintainers redirect you early.

### The fork workflow

\`\`\`bash
# 1. Fork on GitHub, then clone YOUR fork
git clone https://github.com/<you>/project.git
cd project
git remote add upstream https://github.com/<owner>/project.git

# 2. Branch from an up-to-date main
git fetch upstream
git switch -c fix/typo-in-install-docs upstream/main

# 3. Commit, push to your fork, open a PR to the original repository
git push -u origin fix/typo-in-install-docs
\`\`\`

To sync later: \`git fetch upstream\` then merge or rebase \`upstream/main\` into your branch.

### Writing the PR
Link the issue ("Fixes #123"), explain what and why, show how you tested, and follow the project's templates and style. Run the project's tests and linters locally first.

### Communicating with maintainers
Maintainers are often volunteers. Be patient: a week without a reply is normal. A polite follow-up after a week or two is fine. Accept that some PRs are declined; ask what would make a future contribution more useful.

### Licences in brief
The licence (MIT, Apache 2.0, GPL and so on) defines how the code can be used. Some projects require you to agree to a Contributor License Agreement (CLA) or sign off commits (DCO). Read what you are agreeing to.

### Common mistakes
- Opening a large, unrequested PR that changes architecture without discussing it first.
- Ignoring the contributing guide's test, lint or commit-message rules.
- Submitting low-value or automated changes just to collect contributions; maintainers notice and it wastes their time.
- Demanding a fast review.`,
      practice: [
        { title: 'Project scouting', kind: 'exercise', prompt: 'List three open-source projects you use. For each, find the contributing guide, the code of conduct, the most recent commit date and one open issue labelled for newcomers. Pick one to work on.' },
        { title: 'First contribution', kind: 'exercise', prompt: 'Make a real contribution: a documentation fix, a test, or a small bug fix. Claim the issue first, follow the contributing guide, and open a PR with a clear description. Record what feedback you received.' },
        { title: 'Bug report', kind: 'exercise', prompt: 'Write a high-quality bug report for a real or practice project: expected vs actual behaviour, minimal reproduction steps, environment details and what you have already tried.' },
      ],
      resources: [
        { title: 'How to Contribute to Open Source', url: 'https://opensource.guide/how-to-contribute/', source: 'Open Source Guides', kind: 'article' },
        { title: 'Contributing to a project', url: 'https://docs.github.com/en/get-started/exploring-projects-on-github/contributing-to-a-project', source: 'GitHub Docs', kind: 'docs' },
        { title: 'Choose an open source license', url: 'https://choosealicense.com/', source: 'choosealicense.com', kind: 'article' },
      ],
      quiz: [
        {
          key: 'q1',
          type: 'single',
          title: 'Before coding',
          prompt: 'You found an issue you want to fix in a popular project. What should you do first?',
          options: [
            { id: 'a', text: 'Rewrite the module and open a large PR' },
            { id: 'b', text: 'Read CONTRIBUTING.md and comment on the issue to say you would like to work on it' },
            { id: 'c', text: 'Email the maintainers asking for a review date' },
          ],
          correct: ['b'],
          explanation: 'The contributing guide explains the process, and claiming the issue avoids duplicated or unwanted work.',
        },
        {
          key: 'q2',
          type: 'single',
          title: 'upstream remote',
          prompt: 'In the fork workflow, what does the `upstream` remote usually point to?',
          options: [
            { id: 'a', text: 'Your fork on GitHub' },
            { id: 'b', text: 'The original project repository' },
            { id: 'c', text: 'Your local machine' },
          ],
          correct: ['b'],
          explanation: '`origin` is your fork; `upstream` is the original repository you sync from and open PRs against.',
        },
        {
          key: 'q3',
          type: 'multi',
          title: 'Valid contributions',
          prompt: 'Which are genuine open-source contributions? Select all that apply.',
          options: [
            { id: 'a', text: 'Fixing unclear installation docs' },
            { id: 'b', text: 'Adding a missing test' },
            { id: 'c', text: 'Filing a bug report with clear reproduction steps' },
            { id: 'd', text: 'Opening many PRs that only change whitespace to boost your activity graph' },
          ],
          correct: ['a', 'b', 'c'],
          explanation: 'Useful docs, tests and bug reports help projects. Low-value changes made only to collect contributions waste maintainers\' time.',
        },
        {
          key: 'q4',
          type: 'true_false',
          title: 'Patience',
          prompt: 'If a maintainer has not reviewed your PR within two days, it is reasonable to post repeated reminders.',
          options: [
            { id: 'true', text: 'True' },
            { id: 'false', text: 'False' },
          ],
          correct: ['false'],
          explanation: 'Many maintainers are volunteers. Wait at least a week or two before a single polite follow-up.',
        },
      ],
    },
  ],
};

export const devopsCloud: SeedTrack = {
  slug: 'devops-and-cloud',
  title: 'DevOps and Cloud Fundamentals',
  category: 'devops',
  summary: 'Automate, package, deploy and observe software using Linux, containers, CI/CD, networking basics and the cloud.',
  description: `**Who it's for:** developers who can build an application and want to learn how it is built, shipped and run in production.

**Prerequisites:** comfort with the command line and Git (see Git and Collaboration). A small web app of your own to practise on helps a lot, because every topic ends with exercises you apply to it.

**You will be able to:**
- work productively on Linux and write safe, readable shell scripts
- containerise applications with Docker and run multi-service stacks with Compose
- build CI/CD pipelines that test every change and deploy automatically
- trace a request from a browser through DNS, TLS and a reverse proxy to your app
- explain core cloud services, regions and the shared responsibility model
- read infrastructure as code and review a plan before it changes anything
- define SLOs and use logs, metrics and traces to investigate problems

**Free-tier friendly:** everything here can be practised on your own laptop with Docker and a free GitHub account. Cloud exercises only need a free-tier account with a budget alert switched on first.

**Milestones:** *Containerise an app* (topic 2) and *Automated pipeline* (topic 3).`,
  level: 'intermediate',
  estimatedHours: 30,
  roles: ['devops engineer', 'site reliability engineer', 'cloud engineer', 'backend developer', 'software engineer', 'platform engineer'],
  contentStatus: 'complete',
  topics: [
    {
      slug: 'linux-and-shell-scripting',
      title: 'Linux and shell scripting',
      module: 'Foundations',
      skill: 'command-line',
      minutes: 55,
      objectives: [
        'Read and change Linux file permissions in symbolic and numeric form',
        'Inspect a running system: processes, ports, disk, memory and service logs',
        'Write bash scripts with arguments, defaults, conditionals, functions and exit codes',
        'Make scripts safer with set -euo pipefail, quoting and ShellCheck',
        'Schedule a script to run automatically with cron',
      ],
      body: `Most servers and containers run Linux. Being comfortable there makes deployments and debugging far less scary. These examples use bash on a typical Linux distribution; most also work on macOS.

### Users, permissions and processes

\`\`\`bash
whoami; id                  # who am I, and which groups am I in?
ls -l deploy.sh             # -rwxr-x--- : owner rwx, group r-x, others nothing
chmod 750 deploy.sh         # the same permissions in numeric form
chmod +x deploy.sh          # add execute permission
ps aux | grep node          # find running node processes
kill -TERM 4821             # ask process 4821 to shut down cleanly
kill -KILL 4821             # force it, only if TERM did not work
\`\`\`

Each permission digit is a sum: **read 4, write 2, execute 1**. So 7 is rwx, 6 is rw-, 5 is r-x and 0 is nothing. \`750\` means owner 7, group 5, others 0.

### Inspecting a system

\`\`\`bash
df -h                       # free disk space per filesystem
du -sh /var/log/*           # which logs are taking the space?
free -h                     # memory
top                         # live CPU and memory view (q to quit)
ss -tlnp                    # which programs listen on which TCP ports
journalctl -u nginx -n 50   # last 50 log lines for a systemd service
\`\`\`

### Exit codes and chaining
Every command returns an **exit code**: 0 means success, anything else means failure. \`$?\` holds the last one. \`a && b\` runs b only if a succeeded; \`a || b\` runs b only if a failed.

\`\`\`bash
npm test && echo "tests passed" || echo "tests failed"
\`\`\`

### Worked example: a safe log cleanup script

\`\`\`bash
#!/usr/bin/env bash
set -euo pipefail                      # stop on errors, unset variables and failed pipes

LOG_DIR="\${1:?usage: clean-logs.sh <log-dir>}"
DAYS="\${DAYS:-7}"                      # environment override with a default

log() { echo "[$(date +%H:%M:%S)] $*"; }

[[ -d "$LOG_DIR" ]] || { log "not a directory: $LOG_DIR"; exit 1; }

log "compressing .log files older than $DAYS days in $LOG_DIR"
find "$LOG_DIR" -name '*.log' -mtime +"$DAYS" -exec gzip {} +
find "$LOG_DIR" -name '*.log.gz' -mtime +30 -delete
log "done"
\`\`\`

What each piece does:
- \`\${1:?message}\` stops with a usage message if no argument is given.
- \`\${DAYS:-7}\` uses the DAYS environment variable, or 7 if it is not set.
- Every variable is **quoted**, so a path with spaces stays one argument.
- The directory check fails fast with a clear message instead of running \`find\` somewhere unexpected.

Run it with \`DAYS=14 ./clean-logs.sh /var/log/myapp\`. To run it every night at 03:00, add a cron entry with \`crontab -e\`:

\`\`\`text
0 3 * * * /opt/scripts/clean-logs.sh /var/log/myapp >> /var/log/clean-logs.out 2>&1
\`\`\`

### Check and know your limits
Run scripts through **ShellCheck** to catch quoting and logic bugs. Once a script needs complex data structures, careful error handling or tests, switch to Python or another general-purpose language.

### Common mistakes
- Running everything as root with \`sudo\`, which turns small mistakes into disasters.
- Unquoted variables, especially in \`rm\` commands: \`rm -rf $DIR/\` with an empty DIR targets \`/\`.
- \`chmod 777\` to "fix" a permission error, which lets every user modify the file.
- Reaching for \`kill -KILL\` first, which gives the process no chance to finish writes or release locks.
- Scripts saved with Windows line endings, which fail with a confusing "bad interpreter" error.`,
      practice: [
        { title: 'Log rotation script', kind: 'exercise', prompt: 'Write a bash script that compresses .log files older than 7 days in a given directory and deletes compressed files older than 30 days. Use set -euo pipefail, quote all variables, print a usage message when no directory is given, and make it pass ShellCheck.' },
        { title: 'System health report', kind: 'exercise', prompt: 'Write a script that prints disk usage, memory usage, the top 5 processes by CPU, the listening TCP ports and the last 10 lines of a log file, with a clear heading for each section. Exit with code 1 if any filesystem is more than 90% full.' },
        { title: 'Schedule it', kind: 'exercise', prompt: 'Schedule your health report with cron to run every 15 minutes and append its output to a file. Explain each of the five time fields in your crontab line.' },
      ],
      resources: [
        { title: 'The Missing Semester: Shell Tools and Scripting', url: 'https://missing.csail.mit.edu/2020/shell-tools/', source: 'MIT CSAIL', kind: 'course' },
        { title: 'GNU Bash Reference Manual', url: 'https://www.gnu.org/software/bash/manual/bash.html', source: 'GNU', kind: 'docs' },
        { title: 'ShellCheck', url: 'https://www.shellcheck.net/', source: 'shellcheck.net', kind: 'interactive' },
      ],
      quiz: [
        {
          key: 'q1',
          type: 'single',
          title: 'Exit codes',
          prompt: 'What exit code conventionally means a command succeeded?',
          options: [
            { id: 'a', text: '0' },
            { id: 'b', text: '1' },
            { id: 'c', text: '-1' },
          ],
          correct: ['a'],
          explanation: 'Zero means success; any non-zero value signals an error. This is why `&&` and `set -e` work the way they do.',
          difficulty: 'easy',
        },
        {
          key: 'q2',
          type: 'single',
          title: 'set -e',
          prompt: 'What does `set -e` do in a bash script?',
          options: [
            { id: 'a', text: 'Echoes each command before running it' },
            { id: 'b', text: 'Exits the script when a command fails' },
            { id: 'c', text: 'Enables environment variables' },
          ],
          correct: ['b'],
          explanation: 'Without it, a script continues after errors, which can cause damage. `set -x` is the option that echoes commands.',
        },
        {
          key: 'q3',
          type: 'fill_blank',
          title: 'Numeric permissions',
          prompt: 'Which three-digit numeric mode gives the owner read, write and execute, the group read and execute, and others no access? `chmod ___ deploy.sh`',
          accepted: [['750']],
          explanation: 'Owner rwx = 4+2+1 = 7, group r-x = 4+1 = 5, others none = 0, so 750.',
          difficulty: 'medium',
        },
        {
          key: 'q4',
          type: 'multi',
          title: 'Safer scripts',
          prompt: 'Which practices make a bash script safer? Select all that apply.',
          options: [
            { id: 'a', text: 'Quoting variables, as in `"$file"`' },
            { id: 'b', text: 'Starting with `set -euo pipefail`' },
            { id: 'c', text: 'Running the script through ShellCheck' },
            { id: 'd', text: 'Running `chmod 777` on files the script touches' },
          ],
          correct: ['a', 'b', 'c'],
          explanation: 'Quoting, strict mode and linting prevent common bugs. `chmod 777` lets every user modify the file and creates a security problem.',
        },
        {
          key: 'q5',
          type: 'true_false',
          title: 'Stopping processes',
          prompt: '`kill -KILL` should be your first choice for stopping a misbehaving server process.',
          options: [
            { id: 'true', text: 'True' },
            { id: 'false', text: 'False' },
          ],
          correct: ['false'],
          explanation: 'Send TERM first so the process can finish requests, flush data and clean up. KILL cannot be caught and is a last resort.',
        },
      ],
    },
    {
      slug: 'docker-containers',
      title: 'Containers with Docker',
      module: 'Packaging',
      skill: 'docker',
      minutes: 65,
      milestone: true,
      completionCriteria: 'Containerise an app with a database using a Dockerfile and Compose, so a teammate can run it with one command.',
      objectives: [
        'Explain images, containers, layers and registries',
        'Write an efficient Dockerfile that uses the build cache and multi-stage builds',
        'Run multi-container apps with Docker Compose, volumes and health checks',
        'Debug a running container with logs, exec and inspect',
        'Apply basic container security: small base images, non-root users, no secrets in images',
      ],
      body: `A **container** packages an application with its dependencies so it runs the same on any machine. An **image** is the read-only template; a container is a running instance of it. A **registry** (such as Docker Hub or GitHub Container Registry) stores and shares images.

Containers are not virtual machines: they share the host's kernel and isolate processes, which makes them start in seconds and use little memory.

### A first Dockerfile for a Node app

\`\`\`dockerfile
FROM node:22-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev          # cached unless dependencies change
COPY . .
USER node                      # do not run as root
EXPOSE 3000
CMD ["node", "server.js"]
\`\`\`

Each instruction creates a **layer**. Docker reuses cached layers, so copy files that change rarely (dependency manifests) before files that change often (source code). Add a \`.dockerignore\` so local junk and secrets never reach the build:

\`\`\`text
node_modules
.git
.env
dist
*.log
\`\`\`

### Worked example: a multi-stage build
If your app has a build step (TypeScript, a frontend bundle), build in one stage and copy only the output into a small runtime stage:

\`\`\`dockerfile
FROM node:22-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
USER node
EXPOSE 3000
CMD ["node", "dist/server.js"]
\`\`\`

The final image contains no compilers, dev dependencies or source maps you did not need, so it is smaller and has less to attack.

\`\`\`bash
docker build -t notes-api:1.0.0 .
docker run --rm -p 3000:3000 -e DATABASE_URL=postgres://... notes-api:1.0.0
docker ps                       # running containers
docker logs -f <id>             # follow container output
docker exec -it <id> sh         # open a shell inside a running container
docker inspect <id>             # full config: env, mounts, network, health
\`\`\`

### Compose for multi-container apps

\`\`\`yaml
# compose.yaml
services:
  api:
    build: .
    ports: ["3000:3000"]
    environment:
      DATABASE_URL: postgres://app:app@db:5432/app
    depends_on:
      db:
        condition: service_healthy
  db:
    image: postgres:16
    environment:
      POSTGRES_USER: app
      POSTGRES_PASSWORD: app
    volumes: ["dbdata:/var/lib/postgresql/data"]
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U app"]
      interval: 5s
      retries: 5
volumes:
  dbdata:
\`\`\`

\`docker compose up --build\` starts both. Services reach each other by service name (\`db\`), the health check makes the API wait until PostgreSQL accepts connections, and the named volume keeps data when containers are recreated. These credentials are for local development only.

### Common mistakes
- Copying the whole project before installing dependencies, so every code change reinstalls everything.
- Baking secrets into the image with \`COPY .env\` or \`ENV API_KEY=...\`. Anyone who can pull the image can read them.
- Storing data inside the container filesystem without a volume, then losing it on \`docker compose down\`.
- Using the \`latest\` tag in production, so you never know exactly what is running.
- An app that listens on 127.0.0.1 inside the container, which makes it unreachable from the published port. Listen on 0.0.0.0.`,
      practice: [
        { title: 'Containerise your API', kind: 'exercise', prompt: 'Write a Dockerfile and .dockerignore for a web app you built. Build and run it, then change one source file, rebuild, and confirm from the build output that the dependency layer was reused from cache.' },
        { title: 'Shrink the image', kind: 'exercise', prompt: 'Convert your Dockerfile to a multi-stage build. Compare the image sizes with docker images before and after, and list what is no longer in the final image.' },
        { title: 'Compose stack', kind: 'exercise', prompt: 'Add a compose.yaml that runs your app with PostgreSQL, a named volume and a database health check. Show that data survives docker compose down followed by docker compose up.' },
      ],
      resources: [
        { title: 'Docker overview', url: 'https://docs.docker.com/get-started/docker-overview/', source: 'Docker Docs', kind: 'docs' },
        { title: 'Building best practices', url: 'https://docs.docker.com/build/building/best-practices/', source: 'Docker Docs', kind: 'docs' },
        { title: 'Docker Compose', url: 'https://docs.docker.com/compose/', source: 'Docker Docs', kind: 'docs' },
      ],
      quiz: [
        {
          key: 'q1',
          type: 'single',
          title: 'Image vs container',
          prompt: 'What is the relationship between an image and a container?',
          options: [
            { id: 'a', text: 'They are the same thing' },
            { id: 'b', text: 'A container is a running instance of an image' },
            { id: 'c', text: 'An image is a running instance of a container' },
          ],
          correct: ['b'],
          explanation: 'Images are templates. You can start many containers from one image.',
          difficulty: 'easy',
        },
        {
          key: 'q2',
          type: 'single',
          title: 'Layer caching',
          prompt: 'Why copy `package*.json` and install dependencies before copying the rest of the source?',
          options: [
            { id: 'a', text: 'Docker requires that order' },
            { id: 'b', text: 'So the dependency layer is cached and reused when only source code changes' },
            { id: 'c', text: 'It makes the image run faster' },
          ],
          correct: ['b'],
          explanation: 'A changed file invalidates its layer and all later layers. Dependencies change less often than code.',
        },
        {
          key: 'q3',
          type: 'matching',
          title: 'Docker commands',
          prompt: 'Match each command with what it does.',
          pairs: {
            left: [
              { id: 'l1', text: '`docker logs -f <id>`' },
              { id: 'l2', text: '`docker exec -it <id> sh`' },
              { id: 'l3', text: '`docker build -t app:1.0 .`' },
              { id: 'l4', text: '`docker compose up`' },
            ],
            right: [
              { id: 'r1', text: 'Create an image from the Dockerfile in the current directory' },
              { id: 'r2', text: 'Follow the output of a running container' },
              { id: 'r3', text: 'Start every service defined in compose.yaml' },
              { id: 'r4', text: 'Open an interactive shell inside a running container' },
            ],
          },
          matches: { l1: 'r2', l2: 'r4', l3: 'r1', l4: 'r3' },
          explanation: 'logs shows output, exec runs a command in an existing container, build creates an image, and compose up starts the whole stack.',
        },
        {
          key: 'q4',
          type: 'multi',
          title: 'Container security',
          prompt: 'Which choices improve container security? Select all that apply.',
          options: [
            { id: 'a', text: 'Running the app as a non-root user with `USER`' },
            { id: 'b', text: 'Using a multi-stage build so build tools are not in the final image' },
            { id: 'c', text: 'Adding `.env` to `.dockerignore`' },
            { id: 'd', text: 'Setting `ENV DB_PASSWORD=...` in the Dockerfile' },
          ],
          correct: ['a', 'b', 'c'],
          explanation: 'Non-root users, smaller images and keeping secrets out of the build all reduce risk. ENV values are stored in the image and visible to anyone who can pull it.',
        },
        {
          key: 'q5',
          type: 'true_false',
          title: 'Data persistence',
          prompt: 'Data written inside a container\'s filesystem, without a volume, survives when the container is removed and recreated.',
          options: [
            { id: 'true', text: 'True' },
            { id: 'false', text: 'False' },
          ],
          correct: ['false'],
          explanation: 'The writable container layer is deleted with the container. Use a named volume or bind mount for data that must persist.',
        },
      ],
    },
    {
      slug: 'ci-cd-pipelines',
      title: 'CI/CD pipelines',
      module: 'Automation',
      skill: 'ci-cd',
      minutes: 60,
      milestone: true,
      completionCriteria: 'A pipeline runs lint and tests on every pull request and deploys automatically from main after checks pass.',
      objectives: [
        'Distinguish continuous integration, continuous delivery and continuous deployment',
        'Write a GitHub Actions workflow with jobs, steps, caching, a matrix and secrets',
        'Gate merges on passing checks with branch protection',
        'Build one artifact and promote it through environments',
        'Plan safe releases with rollbacks and progressive rollout',
      ],
      body: `- **Continuous integration (CI):** every change is merged often and automatically built and tested.
- **Continuous delivery:** every change that passes is ready to release with one click.
- **Continuous deployment:** every change that passes is released automatically.

### Vocabulary (GitHub Actions)
A **workflow** is a YAML file in \`.github/workflows/\`. It runs on **events** (a push, a pull request, a schedule). It contains **jobs**, which run in parallel on **runners** (fresh virtual machines) unless one \`needs\` another. Each job is a list of **steps**: shell commands (\`run\`) or reusable **actions** (\`uses\`).

### Worked example: test, build, deploy

\`\`\`yaml
name: CI
on:
  pull_request:
  push:
    branches: [main]

permissions:
  contents: read                 # least privilege for the workflow token

concurrency:
  group: \${{ github.workflow }}-\${{ github.ref }}
  cancel-in-progress: true       # a new push cancels the older run

jobs:
  test:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        node: [20, 22]           # run the suite on two Node versions
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: \${{ matrix.node }}
          cache: npm
      - run: npm ci
      - run: npm run lint
      - run: npm test

  deploy:
    needs: test                  # only runs if every test job passed
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    environment: production      # can require a manual approval
    steps:
      - uses: actions/checkout@v4
      - run: ./scripts/deploy.sh "\${{ github.sha }}"
        env:
          DEPLOY_TOKEN: \${{ secrets.DEPLOY_TOKEN }}
\`\`\`

Reading it top to bottom: pull requests run lint and tests on two Node versions; pushes to main run the same tests and then deploy the exact commit, identified by its SHA. The deploy token comes from the encrypted secret store and is masked in logs.

### Pipeline principles
- **Fast feedback:** aim for CI under about ten minutes. Cache dependencies and split slow suites into parallel jobs.
- **Reproducible:** use lockfiles (\`npm ci\`, not \`npm install\`) and pinned tool versions.
- **Gate merges:** branch protection requires named checks to pass before merging into main.
- **Secrets** live in the CI provider's encrypted store, never in the repository, and each job gets only what it needs.
- **Build once, deploy many:** build one artifact, for example an image tagged with the commit SHA, and promote that same artifact from staging to production.

### Releasing safely
- **Feature flags** separate deploying code from turning a feature on.
- **Canary releases** send a small share of traffic to the new version first and watch error rates.
- **Rollback** should be one command: redeploy the previous image tag. Practise it before you need it.
- Database migrations should be backward compatible, so the old version still works if you roll back.

### Common mistakes
- Flaky tests that everyone learns to re-run and ignore, so real failures slip through.
- Printing secrets in logs while debugging a pipeline, or echoing them into files that become artifacts.
- Rebuilding separately for each environment, so production runs something that was never tested.
- Giving the workflow token write access to everything when it only needs to read code.
- Deploying from a developer's laptop "just this once", which skips every check.`,
      practice: [
        { title: 'CI for your project', kind: 'exercise', prompt: 'Add a workflow that installs dependencies with caching and runs lint and tests on pull requests. Turn on branch protection for main requiring the check to pass, then open a pull request to see it work.' },
        { title: 'Deploy job', kind: 'exercise', prompt: 'Add a deploy job that runs only on main after tests pass and uses a secret from the CI secret store. Break a test on purpose and confirm in the Actions tab that the deploy job is skipped.' },
        { title: 'Rollback drill', kind: 'exercise', prompt: 'Write down the exact steps to roll back your app to the previous version. Deploy a harmless change, then perform the rollback and time how long it takes.' },
      ],
      resources: [
        { title: 'GitHub Actions documentation', url: 'https://docs.github.com/en/actions', source: 'GitHub Docs', kind: 'docs' },
        { title: 'Continuous Integration', url: 'https://martinfowler.com/articles/continuousIntegration.html', source: 'martinfowler.com', kind: 'article' },
        { title: 'The Missing Semester: Metaprogramming (build systems and CI)', url: 'https://missing.csail.mit.edu/2020/metaprogramming/', source: 'MIT CSAIL', kind: 'course' },
      ],
      quiz: [
        {
          key: 'q1',
          type: 'single',
          title: 'Delivery vs deployment',
          prompt: 'What is the difference between continuous delivery and continuous deployment?',
          options: [
            { id: 'a', text: 'Delivery keeps every passing change releasable; deployment releases it automatically' },
            { id: 'b', text: 'They are identical' },
            { id: 'c', text: 'Deployment skips the tests' },
          ],
          correct: ['a'],
          explanation: 'Both run the full pipeline. Continuous deployment removes the manual release step.',
        },
        {
          key: 'q2',
          type: 'true_false',
          title: 'Build once',
          prompt: 'It is good practice to rebuild the application separately for staging and production.',
          options: [
            { id: 'true', text: 'True' },
            { id: 'false', text: 'False' },
          ],
          correct: ['false'],
          explanation: 'Build one artifact and promote it, so production runs exactly what was tested.',
        },
        {
          key: 'q3',
          type: 'matching',
          title: 'Workflow vocabulary',
          prompt: 'Match each GitHub Actions term with its meaning.',
          pairs: {
            left: [
              { id: 'l1', text: 'Workflow' },
              { id: 'l2', text: 'Job' },
              { id: 'l3', text: 'Step' },
              { id: 'l4', text: 'Runner' },
            ],
            right: [
              { id: 'r1', text: 'A single command or action inside a job' },
              { id: 'r2', text: 'The machine that executes a job' },
              { id: 'r3', text: 'A YAML file in .github/workflows triggered by events' },
              { id: 'r4', text: 'A group of steps that runs on one runner' },
            ],
          },
          matches: { l1: 'r3', l2: 'r4', l3: 'r1', l4: 'r2' },
          explanation: 'A workflow contains jobs; each job runs its steps in order on a runner.',
        },
        {
          key: 'q4',
          type: 'fill_blank',
          title: 'Job dependencies',
          prompt: 'In a GitHub Actions workflow, which job key makes `deploy` wait until `test` has succeeded? `___: test`',
          accepted: [['needs']],
          explanation: '`needs` creates a dependency. Without it, jobs run in parallel.',
        },
        {
          key: 'q5',
          type: 'multi',
          title: 'Handling secrets in CI',
          prompt: 'Which are good practices for secrets in a pipeline? Select all that apply.',
          options: [
            { id: 'a', text: 'Store them in the CI provider\'s encrypted secret store' },
            { id: 'b', text: 'Give each job only the secrets it needs' },
            { id: 'c', text: 'Commit them to the repository in a config file so the pipeline can read them' },
            { id: 'd', text: 'Rotate a secret if it ever appears in a log' },
          ],
          correct: ['a', 'b', 'd'],
          explanation: 'Encrypted storage, least privilege and rotation after exposure keep secrets safe. Anything committed to Git should be treated as public.',
        },
      ],
    },
    {
      slug: 'networking-for-deployment',
      title: 'Networking for deployment',
      module: 'Infrastructure',
      skill: 'networking',
      minutes: 50,
      objectives: [
        'Trace a request from the browser through DNS, TCP, TLS and a reverse proxy to an app',
        'Use dig, curl and ss to diagnose why a service is unreachable',
        'Configure a reverse proxy in front of an application',
        'Explain which ports to expose publicly and why HTTPS is required',
      ],
      body: `"It works on my machine but not on the server" is very often a networking problem. Knowing the path a request takes lets you check each hop instead of guessing.

### The journey of a request to https://notes.example.com
1. **DNS:** the browser asks a resolver for the IP address of \`notes.example.com\`. An **A record** maps a name to an IPv4 address; a **CNAME** points one name at another.
2. **TCP connection** to that IP on port **443**.
3. **TLS handshake:** the server presents a certificate for \`notes.example.com\`, signed by a certificate authority the browser trusts. Traffic is now encrypted.
4. **Load balancer or reverse proxy** (for example nginx) receives the HTTP request and forwards it to your app on an internal port such as 3000.
5. Your **app** responds, and the response travels back the same way.

### Worked example: diagnosing "site not loading"

\`\`\`bash
dig +short notes.example.com          # 1. does the name resolve, and to the right IP?
curl -I https://notes.example.com     # 2. status line and headers from outside
curl -v https://notes.example.com     # 3. verbose: connection, TLS and certificate details
ss -tlnp                              # 4. on the server: is anything listening on 443 and 3000?
curl -I http://127.0.0.1:3000         # 5. on the server: does the app answer directly?
\`\`\`

Read the results in order. No DNS answer means a DNS problem. A connection timeout usually means a firewall or security group is blocking the port. "Connection refused" means nothing is listening on that port. A TLS error points at the certificate. A **502 Bad Gateway** from the proxy means the proxy is fine but cannot reach your app.

### A reverse proxy in front of your app

\`\`\`nginx
server {
    listen 80;
    server_name notes.example.com;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
\`\`\`

The proxy handles TLS, compression and static files, and passes the original host and client address to the app in headers. Free certificates from Let's Encrypt can be obtained and renewed automatically, so there is no reason to serve a login page over plain HTTP.

### Ports and exposure
| Port | Usual service | Expose to the internet? |
|---|---|---|
| 443 / 80 | HTTPS / HTTP (redirect to HTTPS) | Yes |
| 22 | SSH | Only to your IP, with keys, or not at all |
| 3000, 8080 | App servers behind the proxy | No |
| 5432, 3306, 6379 | PostgreSQL, MySQL, Redis | Never |

Open the smallest set of ports, using the firewall or the cloud provider's security groups. Databases belong on a private network that only the app can reach.

### Common mistakes
- Updating a DNS record and expecting instant change. Records are cached for their TTL, so plan changes ahead.
- Binding the app to 127.0.0.1 inside a container, then wondering why the published port does not respond.
- Opening a database port to the whole internet "temporarily".
- Ignoring certificate expiry until users see a browser warning. Automate renewal and alert before expiry.`,
      practice: [
        { title: 'Trace a real site', kind: 'exercise', prompt: 'Pick any public website. Use dig to find its addresses, then curl -v to see the TLS handshake and response headers. Write a short explanation of each step of the request using what you observed.' },
        { title: 'Proxy your app locally', kind: 'exercise', prompt: 'Run your app on port 3000 and nginx in Docker on port 8080 with a proxy_pass configuration. Confirm requests reach the app through the proxy, then stop the app and observe the 502 response.' },
        { title: 'Exposure review', kind: 'exercise', prompt: 'List every port your app stack uses. For each, state who needs to reach it and whether it should be public, private or closed.' },
      ],
      resources: [
        { title: 'What is DNS?', url: 'https://www.cloudflare.com/learning/dns/what-is-dns/', source: 'Cloudflare Learning Center', kind: 'article' },
        { title: 'Beginner\'s Guide', url: 'https://nginx.org/en/docs/beginners_guide.html', source: 'nginx.org', kind: 'docs' },
        { title: 'How It Works', url: 'https://letsencrypt.org/how-it-works/', source: 'Let\'s Encrypt', kind: 'docs' },
      ],
      quiz: [
        {
          key: 'q1',
          type: 'single',
          title: '502 Bad Gateway',
          prompt: 'Your reverse proxy returns 502 Bad Gateway. What is the most likely cause?',
          options: [
            { id: 'a', text: 'The domain name does not resolve' },
            { id: 'b', text: 'The proxy is running but cannot reach the upstream app' },
            { id: 'c', text: 'The user typed the wrong password' },
          ],
          correct: ['b'],
          explanation: 'A 502 comes from the proxy itself, so DNS and the proxy are working. Check whether the app is running and listening on the address in proxy_pass.',
        },
        {
          key: 'q2',
          type: 'matching',
          title: 'Diagnostic tools',
          prompt: 'Match each command with the question it answers.',
          pairs: {
            left: [
              { id: 'l1', text: '`dig +short example.com`' },
              { id: 'l2', text: '`ss -tlnp`' },
              { id: 'l3', text: '`curl -v https://example.com`' },
            ],
            right: [
              { id: 'r1', text: 'Which processes are listening on which TCP ports on this machine?' },
              { id: 'r2', text: 'What IP address does this name resolve to?' },
              { id: 'r3', text: 'What happens during the connection, TLS handshake and HTTP response?' },
            ],
          },
          matches: { l1: 'r2', l2: 'r1', l3: 'r3' },
          explanation: 'Check DNS with dig, local listeners with ss, and the full request from the client side with curl -v.',
        },
        {
          key: 'q3',
          type: 'multi',
          title: 'Public ports',
          prompt: 'For a typical web app on a single server, which ports should be reachable from the whole internet? Select all that apply.',
          options: [
            { id: 'a', text: '443 (HTTPS)' },
            { id: 'b', text: '80 (HTTP, redirecting to HTTPS)' },
            { id: 'c', text: '5432 (PostgreSQL)' },
            { id: 'd', text: '3000 (the app server behind the proxy)' },
          ],
          correct: ['a', 'b'],
          explanation: 'Only the proxy ports need to be public. The app and database should be reachable only from inside the server or private network.',
        },
        {
          key: 'q4',
          type: 'true_false',
          title: 'DNS changes',
          prompt: 'After you change a DNS record, every user sees the new address immediately.',
          options: [
            { id: 'true', text: 'True' },
            { id: 'false', text: 'False' },
          ],
          correct: ['false'],
          explanation: 'Resolvers cache records for their TTL. Some users keep the old address until the cached answer expires.',
        },
      ],
    },
    {
      slug: 'cloud-fundamentals',
      title: 'Cloud fundamentals',
      module: 'Infrastructure',
      skill: 'cloud-basics',
      minutes: 55,
      objectives: [
        'Explain IaaS, PaaS, SaaS and serverless with examples',
        'Describe core building blocks: compute, storage, databases, networking and identity',
        'Explain regions, availability zones and the shared responsibility model',
        'Map a simple web application onto cloud services',
        'Apply least-privilege access and basic cost controls',
      ],
      body: `Cloud computing means renting computing resources on demand, over the network, instead of buying and running your own hardware. You pay for what you use and can scale up or down in minutes.

### Service models
| Model | You manage | Example use |
|---|---|---|
| IaaS | OS, runtime, app, data | virtual machines you patch yourself |
| PaaS | your app and data | managed app hosting, managed databases |
| Serverless / FaaS | functions and configuration | event-driven functions billed per invocation |
| SaaS | just your usage and data | email, CRM, hosted tools |

Moving down the table, the provider manages more and you control less. Managed services usually save time; virtual machines give flexibility.

### Core building blocks (names vary by provider)
- **Compute:** virtual machines, container services, functions
- **Storage:** object storage for files and backups, block storage for disks
- **Databases:** managed relational and NoSQL databases with automated backups
- **Networking:** virtual private networks, subnets, load balancers, DNS, CDNs
- **Identity and access management (IAM):** who can do what to which resource

### Regions and availability zones
A **region** is a geographic area; it contains several isolated **availability zones**, each with its own power and networking. Running across zones protects you from a single data-centre failure. Choose a region close to your users and one that meets any data-residency rules you must follow.

### Worked example: a notes app in the cloud
\`\`\`text
Users --> CDN --> static frontend files in object storage
      +--> load balancer (public subnet, HTTPS)
             +--> 2 app containers in different zones (private subnet)
                    +--> managed PostgreSQL, automated backups (private subnet)
                    +--> object storage bucket for uploads (private, signed URLs)
                    +--> secrets manager for the database password
\`\`\`

Design choices to notice: only the load balancer is public; the app runs in two zones so one failure does not cause an outage; the database is managed so backups and patching are handled; uploads are private and shared through short-lived signed URLs.

### Scaling
**Vertical scaling** means a bigger machine; simple, but it has a ceiling and usually a restart. **Horizontal scaling** means more machines behind a load balancer; it needs a **stateless** app, with sessions and files stored outside the app server.

### Shared responsibility
The provider secures the physical infrastructure and the services it runs. **You** secure your configuration, identities, data and code. Many breaches come from customer misconfiguration, such as publicly readable storage buckets.

### Least privilege

\`\`\`json
{
  "Effect": "Allow",
  "Action": ["s3:GetObject"],
  "Resource": "arn:aws:s3:::my-app-uploads/*"
}
\`\`\`

This AWS-style policy grants read access to one bucket's objects, not admin access to everything.

### Cost control
Set a budget alert before creating anything, tag resources by project, delete what you are not using, size services for your real load, and use free tiers for learning.

### Common mistakes
- Using the root or admin account for daily work, without multi-factor authentication.
- Leaving storage buckets or databases open to the internet.
- Storing sessions or uploads on one server's disk, which breaks as soon as you add a second server.
- No budget alert, then a surprise bill from a resource left running.`,
      practice: [
        { title: 'Map an app to the cloud', kind: 'exercise', prompt: 'Draw an architecture for one of your apps on any cloud provider: where the frontend, API, database, file uploads and secrets live, which subnet each is in, and which parts you are responsible for securing.' },
        { title: 'Safe free-tier setup', kind: 'exercise', prompt: 'Create a free-tier cloud account, enable multi-factor authentication, create a non-admin user for daily work and set a low budget alert before creating any resources.' },
        { title: 'Make it stateless', kind: 'exercise', prompt: 'List everything your app stores on local disk or in memory between requests (sessions, uploads, caches). For each, name a cloud service that could hold it so the app can run on two servers.' },
      ],
      resources: [
        { title: 'The NIST Definition of Cloud Computing (SP 800-145)', url: 'https://csrc.nist.gov/pubs/sp/800/145/final', source: 'NIST', kind: 'docs' },
        { title: 'What is cloud computing?', url: 'https://aws.amazon.com/what-is-cloud-computing/', source: 'Amazon Web Services', kind: 'article' },
        { title: 'DevOps roadmap', url: 'https://roadmap.sh/devops', source: 'roadmap.sh', kind: 'interactive' },
      ],
      quiz: [
        {
          key: 'q1',
          type: 'single',
          title: 'Shared responsibility',
          prompt: 'Under the shared responsibility model, who is responsible for making sure a storage bucket is not publicly readable?',
          options: [
            { id: 'a', text: 'The cloud provider' },
            { id: 'b', text: 'The customer' },
            { id: 'c', text: 'Nobody; buckets are always private' },
          ],
          correct: ['b'],
          explanation: 'The provider secures the infrastructure; customers secure their own configuration and data.',
        },
        {
          key: 'q2',
          type: 'single',
          title: 'Availability zones',
          prompt: 'Why deploy across multiple availability zones?',
          options: [
            { id: 'a', text: 'To survive the failure of a single data centre' },
            { id: 'b', text: 'To reduce code size' },
            { id: 'c', text: 'Because it is always cheaper' },
          ],
          correct: ['a'],
          explanation: 'Zones are isolated from each other, so a failure in one does not take down the others.',
        },
        {
          key: 'q3',
          type: 'matching',
          title: 'Service models',
          prompt: 'Match each service model with an example.',
          pairs: {
            left: [
              { id: 'l1', text: 'IaaS' },
              { id: 'l2', text: 'PaaS' },
              { id: 'l3', text: 'Serverless functions' },
              { id: 'l4', text: 'SaaS' },
            ],
            right: [
              { id: 'r1', text: 'A hosted email service your team logs into' },
              { id: 'r2', text: 'A virtual machine where you install and patch the OS' },
              { id: 'r3', text: 'Code that runs when a file is uploaded, billed per invocation' },
              { id: 'r4', text: 'A managed platform where you push code and it runs your app' },
            ],
          },
          matches: { l1: 'r2', l2: 'r4', l3: 'r3', l4: 'r1' },
          explanation: 'Each step from IaaS to SaaS hands more management to the provider.',
        },
        {
          key: 'q4',
          type: 'single',
          title: 'Horizontal scaling',
          prompt: 'What must be true of an app before you can run several copies behind a load balancer?',
          options: [
            { id: 'a', text: 'It must be written in a compiled language' },
            { id: 'b', text: 'It should be stateless, keeping sessions and files in shared services' },
            { id: 'c', text: 'It must use a NoSQL database' },
          ],
          correct: ['b'],
          explanation: 'If each server keeps its own sessions or files, users see different data depending on which copy answers. Shared stores fix that.',
        },
        {
          key: 'q5',
          type: 'multi',
          title: 'Safe account setup',
          prompt: 'Which steps belong in a safe setup for a new cloud account? Select all that apply.',
          options: [
            { id: 'a', text: 'Enable multi-factor authentication on the root account' },
            { id: 'b', text: 'Create a separate, less privileged identity for daily work' },
            { id: 'c', text: 'Set a budget alert before creating resources' },
            { id: 'd', text: 'Share the root password with teammates so anyone can fix problems' },
          ],
          correct: ['a', 'b', 'c'],
          explanation: 'MFA, least privilege and budget alerts prevent the most common account disasters. Shared root credentials cannot be audited or revoked per person.',
        },
      ],
    },
    {
      slug: 'infrastructure-as-code',
      title: 'Infrastructure as code overview',
      module: 'Infrastructure',
      skill: 'cloud-basics',
      minutes: 45,
      objectives: [
        'Explain why teams define infrastructure in code instead of clicking in consoles',
        'Read a declarative configuration with variables and outputs',
        'Interpret plan output, including replacements that may destroy data',
        'Describe state, drift and why state must be stored safely',
        'Review infrastructure changes through pull requests with a checklist',
      ],
      body: `**Infrastructure as code (IaC)** means describing servers, networks, databases and permissions in version-controlled files, then letting a tool create or update them.

### Why
- **Repeatable:** create identical staging and production environments.
- **Reviewable:** infrastructure changes go through pull requests like application code.
- **Recoverable:** rebuild after a disaster from the code.
- **Documented:** the code shows what exists and why.

### Declarative example (Terraform syntax)

\`\`\`hcl
variable "env" {
  type        = string
  description = "Environment name, for example staging or prod"
}

resource "aws_s3_bucket" "uploads" {
  bucket = "notes-app-uploads-\${var.env}"
  tags = {
    app = "notes"
    env = var.env
  }
}

output "uploads_bucket" {
  value = aws_s3_bucket.uploads.bucket
}
\`\`\`

You declare the **desired state**; the tool works out the steps. Variables let one configuration serve several environments, and outputs expose values (such as a bucket name) to other tools.

\`\`\`bash
terraform init                      # download providers, configure state storage
terraform plan -var env=staging     # show what would change, without changing anything
terraform apply -var env=staging    # make the changes after you confirm
\`\`\`

### Worked example: reading a plan
Suppose someone renames the bucket in the code. The plan says:

\`\`\`text
  # aws_s3_bucket.uploads must be replaced
-/+ resource "aws_s3_bucket" "uploads" {
      ~ bucket = "notes-app-uploads-prod" -> "notes-uploads-prod" # forces replacement
        ...
    }

Plan: 1 to add, 0 to change, 1 to destroy.
\`\`\`

The symbols matter: \`+\` create, \`-\` destroy, \`~\` update in place, and \`-/+\` destroy then recreate. Bucket names cannot be changed in place, so this plan would delete the old bucket, and every uploaded file with it. The right response is to stop, migrate the data or revert the rename, and only then apply.

### State and drift
The tool records what it manages in a **state** file. Store it remotely with locking (so two people cannot apply at once) and treat it as sensitive, since it can contain secrets. **Drift** happens when someone changes resources by hand in the console; the next plan will try to undo it.

### Reviewing an IaC pull request
- Any **destroy** or **replace**? Is data at risk?
- Anything newly **public**: buckets, security group rules open to 0.0.0.0/0, databases?
- **IAM** changes: are permissions as narrow as possible?
- **Cost:** new large instances, extra environments?
- Tags, naming, and no secrets written in plain text.

### The landscape
Terraform and OpenTofu (multi-cloud, HCL), Pulumi (general-purpose languages), and provider-specific tools such as AWS CloudFormation. Configuration tools like Ansible focus on configuring machines rather than creating cloud resources.

### Common mistakes
- Applying without reading the plan, or approving a plan in CI without opening it.
- Committing state files or secrets to Git.
- Mixing manual console changes with IaC-managed resources.
- One giant configuration for everything, so a small change risks the whole estate.`,
      practice: [
        { title: 'Read a plan', kind: 'exercise', prompt: 'Find an example Terraform or OpenTofu configuration in the official tutorials and its plan output. Explain in your own words what will be created, changed and destroyed, and which change would worry you most.' },
        { title: 'IaC review checklist', kind: 'exercise', prompt: 'Write a checklist for reviewing infrastructure pull requests: destructive changes, public exposure, IAM permissions, cost, tagging and secrets. Apply it to a sample configuration and note one issue you find.' },
        { title: 'Parameterise environments', kind: 'exercise', prompt: 'Using any local provider in a tutorial (for example one that writes local files), create a configuration with a variable for the environment name and an output. Run plan for two environments and compare the results.' },
      ],
      resources: [
        { title: 'What is Terraform?', url: 'https://developer.hashicorp.com/terraform/intro', source: 'HashiCorp', kind: 'docs' },
        { title: 'OpenTofu documentation', url: 'https://opentofu.org/docs/', source: 'OpenTofu', kind: 'docs' },
      ],
      quiz: [
        {
          key: 'q1',
          type: 'single',
          title: 'Plan first',
          prompt: 'What does `terraform plan` do?',
          options: [
            { id: 'a', text: 'Creates all resources immediately' },
            { id: 'b', text: 'Shows the changes that would be made, without making them' },
            { id: 'c', text: 'Deletes the state file' },
          ],
          correct: ['b'],
          explanation: 'plan is a dry run. Review it before running apply.',
          difficulty: 'easy',
        },
        {
          key: 'q2',
          type: 'true_false',
          title: 'Drift',
          prompt: 'Changing an IaC-managed resource by hand in the cloud console can cause drift that the next apply may revert.',
          options: [
            { id: 'true', text: 'True' },
            { id: 'false', text: 'False' },
          ],
          correct: ['true'],
          explanation: 'The code is the source of truth. Manual changes are overwritten unless the code is updated too.',
        },
        {
          key: 'q3',
          type: 'single',
          title: 'Replacement',
          prompt: 'A plan marks your production database with `-/+` and the note "forces replacement". What does that mean?',
          options: [
            { id: 'a', text: 'The database will be updated in place with no downtime' },
            { id: 'b', text: 'The database will be destroyed and a new one created, which can lose data' },
            { id: 'c', text: 'Nothing will change' },
          ],
          correct: ['b'],
          explanation: '`-/+` means destroy then create. For stateful resources, stop and plan a migration before applying.',
          difficulty: 'medium',
        },
        {
          key: 'q4',
          type: 'multi',
          title: 'What goes in Git',
          prompt: 'Which belong in the Git repository for your infrastructure code? Select all that apply.',
          options: [
            { id: 'a', text: 'Configuration files (.tf)' },
            { id: 'b', text: 'Variable definitions and descriptions' },
            { id: 'c', text: 'The state file' },
            { id: 'd', text: 'Plain-text cloud access keys' },
          ],
          correct: ['a', 'b'],
          explanation: 'Code and variable definitions are reviewed in Git. State can contain secrets and belongs in locked remote storage; keys belong in a secret store.',
        },
        {
          key: 'q5',
          type: 'matching',
          title: 'Workflow commands',
          prompt: 'Match each command with its purpose.',
          pairs: {
            left: [
              { id: 'l1', text: '`terraform init`' },
              { id: 'l2', text: '`terraform plan`' },
              { id: 'l3', text: '`terraform apply`' },
            ],
            right: [
              { id: 'r1', text: 'Make the changes after confirmation' },
              { id: 'r2', text: 'Download providers and set up state storage' },
              { id: 'r3', text: 'Preview the changes without making them' },
            ],
          },
          matches: { l1: 'r2', l2: 'r3', l3: 'r1' },
          explanation: 'init prepares the working directory, plan previews and apply executes.',
        },
      ],
    },
    {
      slug: 'observability-sre-basics',
      title: 'Observability and SRE basics',
      module: 'Operations',
      skill: 'observability',
      minutes: 60,
      objectives: [
        'Explain logs, metrics and traces and what each is good for',
        'Use latency percentiles instead of averages',
        'Define SLIs, SLOs and error budgets for a service',
        'Write alerts on user-facing symptoms rather than every cause',
        'Run an incident and write a blameless postmortem',
      ],
      body: `**Observability** is how well you can understand what a system is doing from the outside, especially when something unexpected happens.

### The three pillars
- **Logs:** timestamped events. Use structured JSON with a request id so you can search and correlate.
- **Metrics:** numbers over time (request rate, error rate, latency percentiles, CPU). Cheap to store, great for dashboards and alerts.
- **Traces:** the path of one request across services, showing where time is spent.

\`\`\`json
{"ts":"2025-03-02T10:15:04Z","level":"error","reqId":"8f2c","route":"POST /api/orders","status":500,"ms":812,"msg":"payment provider timeout"}
\`\`\`

With a request id in every log line, you can search for \`reqId:8f2c\` and see everything that happened during one failing request. OpenTelemetry is a vendor-neutral standard for producing all three signals.

A useful starting set of metrics for any web service is **rate, errors and duration**: requests per second, the share that fail, and how long they take.

### Worked example: why percentiles beat averages
Ten requests took (ms): 80, 90, 95, 100, 110, 120, 130, 150, 900, 2000.

\`\`\`text
Average:     3775 / 10 = 377.5 ms   (describes no real request)
Median, p50: about 115 ms           (half the requests were faster)
p90:         900 ms                 (1 in 10 users waited this long or longer)
\`\`\`

The average hides that some users waited two seconds. Track **p50, p95 and p99**, and alert on the tail that users feel.

### SLIs, SLOs and error budgets
- **SLI (indicator):** a measurement users care about, such as the share of requests that succeed in under 300 ms.
- **SLO (objective):** the target, for example 99.9% over 30 days.
- **Error budget:** the allowed failure, here 0.1%. In time, 0.1% of 30 days (43,200 minutes) is about 43 minutes. In requests, 0.1% of 2,000,000 requests is 2,000 failed or slow requests.

While budget remains, ship features. When it is spent, prioritise reliability work. This turns arguments about "how reliable is enough" into a shared number.

### Alerting
Page a human only for **symptoms users feel** (high error rate, slow responses, fast SLO burn) and only when action is needed. Send causes (high CPU on one node) to dashboards or tickets. Every page should link to a runbook that says what to check first.

### Incidents and postmortems
During an incident: assign an incident lead, communicate status on a regular schedule, **mitigate first** (roll back, fail over) and investigate later.

\`\`\`text
10:02  Alert: checkout error rate 12% (SLO threshold 1%)
10:05  Incident lead assigned; status page updated
10:11  Errors started at 09:58, matching deploy v2.14
10:14  Rolled back to v2.13; error rate back to 0.2% by 10:17
\`\`\`

Afterwards, write a **blameless postmortem**: summary, impact, timeline, root causes and contributing factors, what went well, and action items with owners and dates. Focus on how the system allowed the failure, not who to blame.

### Common mistakes
- Logs without request ids, so you cannot follow one user's failing request.
- Averages instead of percentiles; the average hides the slow tail users notice.
- Alert fatigue from noisy, non-actionable pages, until real alerts get ignored.
- Logging passwords, tokens or personal data, which turns your log store into a breach risk.
- Postmortems with action items but no owners, so nothing changes.`,
      practice: [
        { title: 'Define SLOs', kind: 'exercise', prompt: 'For a web API you built, define two SLIs and SLOs (availability and latency), calculate the monthly error budget in minutes and in requests for your expected traffic, and describe what the team should do when it is exhausted.' },
        { title: 'Structured logs', kind: 'exercise', prompt: 'Change your app to write JSON logs with a timestamp, level, request id, route, status and duration. Generate a failing request and find all of its log lines with a single search.' },
        { title: 'Write a postmortem', kind: 'exercise', prompt: 'Write a blameless postmortem for a realistic fictional incident (for example an expired TLS certificate) with summary, impact, timeline, root causes and three action items with owners and dates.' },
      ],
      resources: [
        { title: 'Service Level Objectives (SRE book)', url: 'https://sre.google/sre-book/service-level-objectives/', source: 'Google SRE', kind: 'book' },
        { title: 'Postmortem Culture: Learning from Failure', url: 'https://sre.google/sre-book/postmortem-culture/', source: 'Google SRE', kind: 'book' },
        { title: 'Observability primer', url: 'https://opentelemetry.io/docs/concepts/observability-primer/', source: 'OpenTelemetry', kind: 'docs' },
      ],
      quiz: [
        {
          key: 'q1',
          type: 'single',
          title: 'Error budget',
          prompt: 'A service has a 99.9% availability SLO over 30 days. Roughly how much full downtime does the error budget allow?',
          options: [
            { id: 'a', text: 'About 43 minutes' },
            { id: 'b', text: 'About 7 hours' },
            { id: 'c', text: 'About 4 minutes' },
          ],
          correct: ['a'],
          explanation: '30 days is 43,200 minutes, and 0.1% of that is about 43 minutes.',
        },
        {
          key: 'q2',
          type: 'single',
          title: 'What to page on',
          prompt: 'Which condition is the best candidate for paging an on-call engineer at night?',
          options: [
            { id: 'a', text: 'CPU on one server above 70%' },
            { id: 'b', text: 'Checkout error rate above the SLO threshold for 10 minutes' },
            { id: 'c', text: 'A new deployment started' },
          ],
          correct: ['b'],
          explanation: 'Page on user-facing symptoms that need action. Resource metrics belong on dashboards.',
        },
        {
          key: 'q3',
          type: 'matching',
          title: 'Three pillars',
          prompt: 'Match each signal with the question it answers best.',
          pairs: {
            left: [
              { id: 'l1', text: 'Logs' },
              { id: 'l2', text: 'Metrics' },
              { id: 'l3', text: 'Traces' },
            ],
            right: [
              { id: 'r1', text: 'Which service in the chain made this request slow?' },
              { id: 'r2', text: 'What exactly happened, with details, during this one event?' },
              { id: 'r3', text: 'How has the error rate changed over the last hour?' },
            ],
          },
          matches: { l1: 'r2', l2: 'r3', l3: 'r1' },
          explanation: 'Logs give event detail, metrics show trends cheaply, and traces follow one request across services.',
        },
        {
          key: 'q4',
          type: 'fill_blank',
          title: 'Percentiles',
          prompt: 'The 50th percentile (p50) of a set of latencies is also called the ___.',
          accepted: [['median']],
          explanation: 'Half of the values are below the median and half above. Unlike the mean, it is not dragged up by a few very slow requests.',
          difficulty: 'easy',
        },
        {
          key: 'q5',
          type: 'multi',
          title: 'Blameless postmortems',
          prompt: 'Which belong in a blameless postmortem? Select all that apply.',
          options: [
            { id: 'a', text: 'A timeline of detection, mitigation and resolution' },
            { id: 'b', text: 'Root causes and contributing factors in the system and process' },
            { id: 'c', text: 'Action items with owners and due dates' },
            { id: 'd', text: 'The name of the engineer who should be disciplined' },
          ],
          correct: ['a', 'b', 'c'],
          explanation: 'Blameless reviews focus on how the system allowed the failure, which encourages honest reporting and lasting fixes.',
        },
      ],
    },
  ],
};

export const qualityEngineering: SeedTrack = {
  slug: 'testing-security-debugging',
  title: 'Testing, Security and Debugging',
  category: 'quality',
  summary: 'Find bugs systematically, prove code works with tests, refactor safely, and write software that resists common attacks.',
  description: `**Who it's for:** developers who can write working programs and want them to be reliable, maintainable and secure.

**Prerequisites:** comfortable in at least one programming language. Examples use Python and JavaScript; the ideas apply to any language. Basic HTTP knowledge helps for the security topics.

**You will be able to:**
- debug systematically instead of guessing, and turn every bug into a regression test
- write clear unit tests with fixtures and test doubles
- design test cases with partitions and boundaries, and use test-driven development where it helps
- choose between unit, integration and end-to-end tests and keep them reliable
- recognise and fix common OWASP Top 10 weaknesses such as broken access control, injection and XSS
- handle secrets, passwords and dependencies safely
- refactor code in small, test-protected steps

**Practise safely:** only run security tests against applications you own or have explicit written permission to test.

**Milestones:** *Unit testing in practice* (topic 2) and *Security review* (topic 5).`,
  level: 'intermediate',
  estimatedHours: 26,
  roles: ['software engineer', 'sde intern', 'qa engineer', 'backend developer', 'frontend developer', 'security engineer', 'full-stack developer'],
  contentStatus: 'complete',
  topics: [
    {
      slug: 'systematic-debugging',
      title: 'Systematic debugging',
      module: 'Debugging',
      skill: 'debugging',
      minutes: 50,
      objectives: [
        'Reproduce a bug reliably and reduce it to a minimal case',
        'Read stack traces to locate where and why a failure happened',
        'Form and test hypotheses one at a time, keeping notes',
        'Use a debugger: breakpoints, stepping and inspecting variables',
        'Narrow down regressions with git bisect and lock fixes in with a test',
      ],
      body: `Debugging is a skill, not luck. The loop is: **reproduce, isolate, hypothesise, test, fix, verify**.

### 1. Reproduce
Get exact steps, inputs, versions and environment. If you cannot reproduce it, you cannot confirm a fix. Turn the reproduction into the smallest script or test you can.

### 2. Read the error
Stack traces tell you the exception type, the message and the chain of calls. Find the first line that is in **your** code.

\`\`\`text
Traceback (most recent call last):
  File "report.py", line 14, in <module>
    print(average(scores))
  File "report.py", line 3, in average
    return sum(xs) / len(xs)
ZeroDivisionError: division by zero
\`\`\`

The crash is in \`average\`, but the real question is *why* \`scores\` is empty. The same habit applies in JavaScript: \`TypeError: Cannot read properties of undefined (reading 'email')\` means the object before \`.email\` was undefined, so look at where that object came from.

### 3. Worked example: a wrong cart total
Bug report: "Single-item carts show a total of 0."

\`\`\`python
def cart_total(items):
    total = 0
    for i in range(1, len(items)):
        total += items[i]["price"] * items[i]["qty"]
    return total
\`\`\`

- **Reproduce:** \`cart_total([{"price": 250, "qty": 2}])\` returns 0; expected 500.
- **Hypothesis 1:** prices arrive as strings. Check: print \`items\`. Prices are integers, so rejected.
- **Hypothesis 2:** the loop skips an item. Check with a breakpoint inside the loop: it never runs for one item, and for two items it only visits index 1. Confirmed.
- **Root cause:** \`range(1, ...)\` starts at the second element. **Fix:** \`for item in items:\` and use \`item\`.
- **Prevent:** add a test for one item and for several items, watch the one-item test fail before the fix and pass after.

Write each hypothesis and its result down. Notes stop you going in circles and make a great pull request description.

### 4. Use the right tool
- **Print or log statements** for quick checks; include the variable name and value.
- **A debugger** to see state at the exact moment it goes wrong: set a breakpoint, step over or into calls, watch variables.

\`\`\`python
def average(xs):
    breakpoint()          # Python drops into pdb here: p xs, n, s, c
    return sum(xs) / len(xs)
\`\`\`

- **git bisect** to find the commit that introduced a regression by binary search. With 100 commits between good and bad, it needs about 7 tests.

\`\`\`bash
git bisect start
git bisect bad              # current commit is broken
git bisect good v1.4.0      # this release worked
# test each commit Git checks out, mark it good or bad, then:
git bisect reset
\`\`\`

- **Explain it out loud** (rubber duck debugging). Describing what the code should do line by line often reveals where it does not.

### 5. Fix the cause and verify
Fix the root cause, not the symptom, run the full test suite, and confirm the original reproduction now behaves correctly.

### Common mistakes
- Changing several things at once, then not knowing which one helped.
- Fixing the symptom (catching the exception) instead of the cause (why the list is empty).
- Assuming instead of checking. Print the value; do not guess it.
- Debugging for hours without a minimal reproduction or written notes.
- Leaving debug prints and breakpoints in the committed code.`,
      practice: [
        { title: 'Debugging journal', kind: 'exercise', prompt: 'For your next real bug, keep a short journal: reproduction steps, each hypothesis, how you tested it, the root cause and the regression test you added.' },
        { title: 'Debugger drill', kind: 'exercise', prompt: 'Take a small buggy function (for example an off-by-one loop) and find the bug using only breakpoints and variable inspection in your editor\'s debugger, with no print statements.' },
        { title: 'Bisect a regression', kind: 'exercise', prompt: 'In a scratch repository, make ten commits where commit 6 introduces a bug that a small test script detects. Use git bisect (and optionally git bisect run with the script) to find it.' },
        { title: 'Handle errors safely', kind: 'problem', ref: 'safe-division' },
      ],
      resources: [
        { title: 'The Missing Semester: Debugging and Profiling', url: 'https://missing.csail.mit.edu/2020/debugging-profiling/', source: 'MIT CSAIL', kind: 'course' },
        { title: 'pdb: The Python Debugger', url: 'https://docs.python.org/3/library/pdb.html', source: 'Python Software Foundation', kind: 'docs' },
        { title: 'git-bisect documentation', url: 'https://git-scm.com/docs/git-bisect', source: 'git-scm.com', kind: 'docs' },
      ],
      quiz: [
        {
          key: 'q1',
          type: 'single',
          title: 'First step',
          prompt: 'A user reports a crash. What should you do first?',
          options: [
            { id: 'a', text: 'Rewrite the module that seems most likely' },
            { id: 'b', text: 'Reproduce the crash reliably' },
            { id: 'c', text: 'Wrap the code in a try/except and ignore errors' },
          ],
          correct: ['b'],
          explanation: 'Without a reproduction you cannot isolate the cause or confirm that a fix works.',
          difficulty: 'easy',
        },
        {
          key: 'q2',
          type: 'single',
          title: 'git bisect',
          prompt: 'What does `git bisect` help you find?',
          options: [
            { id: 'a', text: 'The commit that introduced a bug' },
            { id: 'b', text: 'Merge conflicts' },
            { id: 'c', text: 'Unused files' },
          ],
          correct: ['a'],
          explanation: 'It binary-searches history between a good and a bad commit.',
        },
        {
          key: 'q3',
          type: 'single',
          title: 'Reading a TypeError',
          prompt: 'JavaScript throws `TypeError: Cannot read properties of undefined (reading \'email\')` on the line `send(user.email)`. What does this tell you?',
          options: [
            { id: 'a', text: 'The email address is invalid' },
            { id: 'b', text: '`user` is undefined at that point, so find where it should have been set' },
            { id: 'c', text: 'The send function is missing' },
          ],
          correct: ['b'],
          explanation: 'The property being read is `email`, and the value it was read from is undefined. The fix is upstream, where `user` came from.',
        },
        {
          key: 'q4',
          type: 'multi',
          title: 'Good debugging habits',
          prompt: 'Which are good debugging habits? Select all that apply.',
          options: [
            { id: 'a', text: 'Change one thing at a time and observe the result' },
            { id: 'b', text: 'Write down each hypothesis and what you found' },
            { id: 'c', text: 'Add a regression test that fails before the fix' },
            { id: 'd', text: 'Catch and silence the exception so the crash stops' },
          ],
          correct: ['a', 'b', 'c'],
          explanation: 'Controlled changes, notes and regression tests lead to real fixes. Silencing exceptions hides the cause and often creates worse bugs later.',
        },
        {
          key: 'q5',
          type: 'fill_blank',
          title: 'Bisect steps',
          prompt: 'About how many test runs does git bisect need to find the bad commit among 1,000 commits? Answer with a whole number. ___',
          accepted: [['10']],
          explanation: 'Binary search halves the range each time: 2 to the power 10 is 1,024, so about 10 tests.',
          difficulty: 'medium',
        },
      ],
    },
    {
      slug: 'unit-testing-fundamentals',
      title: 'Unit testing',
      module: 'Testing',
      skill: 'unit-testing',
      minutes: 55,
      milestone: true,
      completionCriteria: 'Write a test suite for a module with at least eight tests covering normal, edge and error cases, all passing in CI.',
      objectives: [
        'Write tests with the Arrange, Act, Assert structure',
        'Use a test runner (pytest or the Node test runner) and read its output',
        'Test edge cases and expected errors',
        'Share setup with fixtures',
        'Choose between stubs, fakes and mocks, and inject dependencies to make code testable',
      ],
      body: `A **unit test** checks one small piece of behaviour, usually a function or class, in isolation. Good unit tests are **fast, independent, repeatable and readable**.

### Arrange, Act, Assert (pytest)

\`\`\`python
# pricing.py
def apply_discount(price: float, percent: float) -> float:
    if not 0 <= percent <= 100:
        raise ValueError("percent must be between 0 and 100")
    return round(price * (1 - percent / 100), 2)

# test_pricing.py
import pytest
from pricing import apply_discount

def test_applies_percentage_discount():
    price, percent = 200.0, 25                  # arrange
    result = apply_discount(price, percent)     # act
    assert result == 150.0                      # assert

def test_zero_discount_returns_original_price():
    assert apply_discount(99.99, 0) == 99.99

def test_rejects_discount_over_100():
    with pytest.raises(ValueError, match="between 0 and 100"):
        apply_discount(50.0, 120)
\`\`\`

Run with \`pytest -q\`. Test names describe the behaviour, so a failure reads like a bug report: *test_rejects_discount_over_100 FAILED*.

### The same idea in JavaScript

\`\`\`js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyDiscount } from './pricing.js';

test('applies percentage discount', () => {
  assert.equal(applyDiscount(200, 25), 150);
});

test('rejects discount over 100', () => {
  assert.throws(() => applyDiscount(50, 120), RangeError);
});
\`\`\`

Run with \`node --test\`.

### What to test
- Typical inputs, **edge cases** (empty, zero, one item, maximum, negative) and **error cases**.
- Behaviour visible to callers, not private implementation details. Tests tied to internals break on every refactor.

### Fixtures: shared setup without shared state

\`\`\`python
@pytest.fixture
def cart():
    return Cart()                    # a fresh cart for every test

def test_new_cart_is_empty(cart):
    assert cart.total() == 0

def test_adding_item_updates_total(cart):
    cart.add("pen", price=20, qty=3)
    assert cart.total() == 60
\`\`\`

### Test doubles
When code talks to a network, clock, database or email service, replace that dependency so the test stays fast and deterministic.
- **Stub:** returns canned answers ("the exchange rate is 83").
- **Fake:** a simple working implementation, such as an in-memory repository.
- **Mock:** records calls so you can verify an interaction happened.

\`\`\`python
from datetime import datetime
from unittest.mock import Mock

class FakeClock:
    def __init__(self, now): self._now = now
    def now(self): return self._now

def greeting(clock):
    return "Good morning" if clock.now().hour < 12 else "Good afternoon"

def test_morning_greeting():
    assert greeting(FakeClock(datetime(2025, 1, 6, 9, 0))) == "Good morning"

def test_registration_sends_welcome_email():
    mailer = Mock()
    register_user("a@test.dev", mailer=mailer)
    mailer.send.assert_called_once_with("a@test.dev", subject="Welcome")
\`\`\`

Passing dependencies in (**dependency injection**) is simpler and clearer than patching globals.

### Common mistakes
- Tests that pass even when the code is wrong (no real assertion, or asserting on the mock itself).
- One giant test checking ten things; when it fails you cannot tell which.
- Tests that depend on order, the current time, random values or shared state.
- Mocking the code under test, so the test only proves the mock works.
- Chasing 100% coverage instead of meaningful cases. Coverage shows what ran, not what was checked.`,
      practice: [
        { title: 'Test a module', kind: 'exercise', prompt: 'Pick a module you wrote and add at least eight unit tests: three typical cases, three edge cases and two error cases. Make one test fail on purpose to check its message is clear, then run the suite in CI.' },
        { title: 'Inject the clock', kind: 'exercise', prompt: 'Write a function is_weekend() that depends on the current date. Refactor it to accept the date (or a clock) as a parameter and test Saturday, Sunday and Monday deterministically.' },
        { title: 'Test a palindrome checker', kind: 'problem', ref: 'palindrome-check' },
      ],
      resources: [
        { title: 'pytest: Get Started', url: 'https://docs.pytest.org/en/stable/getting-started.html', source: 'pytest', kind: 'docs' },
        { title: 'Node.js test runner', url: 'https://nodejs.org/docs/latest/api/test.html', source: 'nodejs.org', kind: 'docs' },
        { title: 'unittest.mock: mock object library', url: 'https://docs.python.org/3/library/unittest.mock.html', source: 'Python Software Foundation', kind: 'docs' },
      ],
      quiz: [
        {
          key: 'q1',
          type: 'multi',
          title: 'Edge cases',
          prompt: 'For a function that returns the largest number in a list, which are useful edge cases? Select all that apply.',
          options: [
            { id: 'a', text: 'An empty list' },
            { id: 'b', text: 'A list with one element' },
            { id: 'c', text: 'A list of all negative numbers' },
            { id: 'd', text: 'A list of five ordinary positive numbers only' },
          ],
          correct: ['a', 'b', 'c'],
          explanation: 'Empty, single-element and all-negative lists catch common bugs such as starting the maximum at 0. Ordinary inputs are a typical case, not an edge case.',
        },
        {
          key: 'q2',
          type: 'true_false',
          title: 'Independent tests',
          prompt: 'Unit tests should be able to run in any order and still pass.',
          options: [
            { id: 'true', text: 'True' },
            { id: 'false', text: 'False' },
          ],
          correct: ['true'],
          explanation: 'Order-dependent tests hide bugs and fail unpredictably when run in parallel or individually.',
          difficulty: 'easy',
        },
        {
          key: 'q3',
          type: 'matching',
          title: 'Test doubles',
          prompt: 'Match each kind of test double with its description.',
          pairs: {
            left: [
              { id: 'l1', text: 'Stub' },
              { id: 'l2', text: 'Fake' },
              { id: 'l3', text: 'Mock' },
            ],
            right: [
              { id: 'r1', text: 'Records calls so the test can verify an interaction' },
              { id: 'r2', text: 'Returns fixed, canned answers' },
              { id: 'r3', text: 'A lightweight working implementation, such as an in-memory store' },
            ],
          },
          matches: { l1: 'r2', l2: 'r3', l3: 'r1' },
          explanation: 'Stubs supply data, fakes behave like the real thing in a simple way, and mocks check how they were called.',
        },
        {
          key: 'q4',
          type: 'single',
          title: 'Testable time',
          prompt: 'A function calls `datetime.now()` internally, so its tests pass in the morning and fail in the afternoon. What is the best fix?',
          options: [
            { id: 'a', text: 'Only run the tests in the morning' },
            { id: 'b', text: 'Pass the clock or current time in as a parameter and use a fixed value in tests' },
            { id: 'c', text: 'Delete the tests' },
          ],
          correct: ['b'],
          explanation: 'Injecting the dependency makes the behaviour deterministic and the test meaningful at any time of day.',
        },
        {
          key: 'q5',
          type: 'true_false',
          title: 'Coverage',
          prompt: '100% line coverage proves that the code has no bugs.',
          options: [
            { id: 'true', text: 'True' },
            { id: 'false', text: 'False' },
          ],
          correct: ['false'],
          explanation: 'Coverage shows which lines ran, not whether the results were checked or whether important inputs were tried.',
        },
      ],
    },
    {
      slug: 'test-design-and-tdd',
      title: 'Test design and TDD',
      module: 'Testing',
      skill: 'unit-testing',
      minutes: 50,
      objectives: [
        'Design test cases with equivalence partitioning and boundary value analysis',
        'Follow the red, green, refactor cycle of test-driven development',
        'Use parametrised tests to cover many cases concisely',
        'Write the failing test first when fixing a bug',
        'Judge when TDD helps and when it gets in the way',
      ],
      body: `Writing tests is easy; choosing tests that find bugs is the skill.

### Equivalence partitions and boundaries
Group inputs that should behave the same, test one from each group, and test the **boundaries** between groups, where off-by-one bugs live.

For "a password must be 8 to 64 characters":
- Partitions: too short (0 to 7), valid (8 to 64), too long (65 and above).
- Boundaries: 7, 8, 64, 65 characters. Also consider 0 (empty).

### Parametrised tests

\`\`\`python
import pytest
from validation import is_valid_password_length

@pytest.mark.parametrize("length, expected", [
    (0, False), (7, False), (8, True), (30, True), (64, True), (65, False),
])
def test_password_length_rules(length, expected):
    assert is_valid_password_length("x" * length) is expected
\`\`\`

One test function, six cases, and each case is reported separately when it fails.

### Test-driven development
1. **Red:** write a small failing test for the next bit of behaviour.
2. **Green:** write the simplest code that makes it pass.
3. **Refactor:** clean up the code and tests while they stay green.

### Worked example: leap years in three cycles
The rule: divisible by 4 is a leap year, except centuries, except centuries divisible by 400.

\`\`\`python
# Cycle 1. Red: test is_leap(2024) is True (fails: is_leap does not exist).
# Green:
def is_leap(year):
    return year % 4 == 0

# Cycle 2. Red: test is_leap(1900) is False (fails: 1900 % 4 == 0).
# Green:
def is_leap(year):
    return year % 4 == 0 and year % 100 != 0

# Cycle 3. Red: test is_leap(2000) is True (fails: 2000 % 100 == 0).
# Green:
def is_leap(year):
    return year % 4 == 0 and (year % 100 != 0 or year % 400 == 0)

# Refactor: merge the tests into one parametrised test with 2023, 2024, 1900, 2000.
\`\`\`

Each test drove exactly one new piece of the rule, and the final suite documents every case. Notice the tests include the tricky boundaries (1900, 2000), not just ordinary years.

### Bugs first get a test
When a bug is reported, write a test that reproduces it and **watch it fail**. Then fix the code. The failing test proves you understood the bug; the passing test proves the fix and stops it returning.

### When TDD fits
It works well for business rules, parsers, algorithms and bug fixes. It fits less well for exploratory prototypes or visual layout, where you do not yet know what you want. Use it as a tool, not a rule for every line.

### Common mistakes
- Writing many tests up front instead of one at a time.
- Writing more code than the current test needs, so untested behaviour creeps in.
- Skipping the refactor step, leaving messy code behind passing tests.
- Only testing the happy path and never the boundaries.
- Never seeing a new test fail, so you cannot be sure it tests anything.`,
      practice: [
        { title: 'TDD kata', kind: 'exercise', prompt: 'Use strict red, green, refactor to build a function that converts integers 1 to 3999 into Roman numerals. Commit after each green step so your history shows the cycle.' },
        { title: 'Boundary analysis', kind: 'exercise', prompt: 'For a shipping rule (free for orders of 500 or more, a flat 40 below that, not available above 50 kg), list the partitions and boundaries and write a parametrised test covering all of them.' },
        { title: 'Grade boundaries', kind: 'problem', ref: 'grade-calculator' },
      ],
      resources: [
        { title: 'Test Driven Development', url: 'https://martinfowler.com/bliki/TestDrivenDevelopment.html', source: 'martinfowler.com', kind: 'article' },
        { title: 'pytest: Parametrizing tests', url: 'https://docs.pytest.org/en/stable/how-to/parametrize.html', source: 'pytest', kind: 'docs' },
      ],
      quiz: [
        {
          key: 'q1',
          type: 'single',
          title: 'TDD order',
          prompt: 'What is the correct order of the TDD cycle?',
          options: [
            { id: 'a', text: 'Green, red, refactor' },
            { id: 'b', text: 'Red, green, refactor' },
            { id: 'c', text: 'Refactor, red, green' },
          ],
          correct: ['b'],
          explanation: 'Write a failing test (red), make it pass (green), then clean up (refactor).',
          difficulty: 'easy',
        },
        {
          key: 'q2',
          type: 'multi',
          title: 'Boundary values',
          prompt: 'A field accepts ages 18 to 60 inclusive. Which values are boundary tests? Select all that apply.',
          options: [
            { id: 'a', text: '17' },
            { id: 'b', text: '18' },
            { id: 'c', text: '35' },
            { id: 'd', text: '61' },
          ],
          correct: ['a', 'b', 'd'],
          explanation: 'Test just below, at and just above each boundary (17, 18, 60, 61). 35 is a typical value from the valid partition.',
        },
        {
          key: 'q3',
          type: 'single',
          title: 'Leap year test',
          prompt: 'Your `is_leap` passes for 2024 and 1900. Which test year is most likely to reveal a missing rule?',
          options: [
            { id: 'a', text: '2023' },
            { id: 'b', text: '2000' },
            { id: 'c', text: '2028' },
          ],
          correct: ['b'],
          explanation: '2000 is a century divisible by 400, the boundary case that a "divisible by 4 and not by 100" rule gets wrong.',
          difficulty: 'medium',
        },
        {
          key: 'q4',
          type: 'true_false',
          title: 'Bug fixes',
          prompt: 'When fixing a reported bug, it is good practice to first write a test that reproduces it and confirm it fails.',
          options: [
            { id: 'true', text: 'True' },
            { id: 'false', text: 'False' },
          ],
          correct: ['true'],
          explanation: 'Seeing it fail proves the test captures the bug. After the fix it passes and guards against regressions.',
        },
        {
          key: 'q5',
          type: 'fill_blank',
          title: 'Partitions',
          prompt: 'Grouping inputs that the program should treat the same way, and testing one value from each group, is called equivalence ___.',
          accepted: [['partitioning', 'partitions', 'partition', 'class partitioning']],
          explanation: 'Equivalence partitioning reduces the number of tests while still covering each distinct behaviour. Pair it with boundary value analysis.',
        },
      ],
    },
    {
      slug: 'integration-and-e2e-tests',
      title: 'Integration and end-to-end tests',
      module: 'Testing',
      skill: 'unit-testing',
      minutes: 50,
      objectives: [
        'Explain what integration and end-to-end tests catch that unit tests miss',
        'Test code against real dependencies such as a database in a controlled environment',
        'Test an HTTP API through its real routing and validation',
        'Write stable browser tests with user-facing locators',
        'Reduce flakiness and keep a healthy test pyramid',
      ],
      body: `Unit tests prove pieces work alone. **Integration tests** prove pieces work together. **End-to-end (E2E) tests** prove a real user journey works through the whole system.

### Integration test: real database, controlled data

\`\`\`python
@pytest.fixture
def db(test_engine):
    conn = test_engine.connect()
    tx = conn.begin()             # start a transaction for this test
    yield conn
    tx.rollback()                 # undo everything the test wrote
    conn.close()

def test_create_and_fetch_user(db):
    repo = UserRepository(db)
    created = repo.create(email="a@test.dev", name="Asha")
    assert repo.get(created.id).email == "a@test.dev"

def test_duplicate_email_is_rejected(db):
    repo = UserRepository(db)
    repo.create(email="a@test.dev", name="Asha")
    with pytest.raises(DuplicateEmail):
        repo.create(email="a@test.dev", name="Another")
\`\`\`

These catch wrong SQL, missing migrations, broken constraints, serialization bugs and misconfigured connections, which mocks hide. Use a disposable database (for example a container started for the test run; Testcontainers libraries automate this) and reset data between tests, here by rolling back a transaction.

### API test: real routing and validation

\`\`\`js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { app } from '../src/app.js';

test('POST /api/notes rejects an empty title', async () => {
  const res = await request(app).post('/api/notes').send({ title: '' });
  assert.equal(res.status, 400);
  assert.match(res.body.error, /title/i);
});
\`\`\`

This exercises middleware, routing, validation and error formatting together without opening a browser.

### E2E test in a browser

\`\`\`js
import { test, expect } from '@playwright/test';

test('visitor can sign up', async ({ page }) => {
  await page.goto('/signup');
  await page.getByLabel('Email').fill(\`new-\${Date.now()}@test.dev\`);
  await page.getByLabel('Password').fill('a-long-test-password');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByRole('heading', { name: 'Welcome' })).toBeVisible();
});
\`\`\`

The unique email means the test never collides with data from a previous run.

### Keeping tests reliable
- Locate elements by role, label or text, not brittle CSS paths like \`div > div:nth-child(3)\`.
- Wait for conditions (\`await expect(locator).toBeVisible()\`), never fixed sleeps like \`waitForTimeout(2000)\`.
- Each test creates its own data; no shared accounts.
- Stub third-party services (payments, email) at the boundary in most runs.
- Quarantine and fix flaky tests quickly. A flaky suite trains people to ignore failures.

### Balance: the test pyramid
Many fast unit tests, a solid layer of integration tests, and a handful of E2E tests for the journeys that would hurt most if broken (sign up, log in, pay). When a bug escapes, ask which is the lowest level that could have caught it, and add the test there.

### Common mistakes
- Mocking everything, so tests pass while the real integration is broken.
- Hundreds of slow E2E tests covering edge cases better tested lower down.
- Tests that hit real third-party services and fail when those are down or rate-limited.
- Tests that share a database without cleanup, so results depend on run order.`,
      practice: [
        { title: 'Repository integration tests', kind: 'exercise', prompt: 'Write integration tests for your data access layer against a real disposable database: create, read, update, delete and a uniqueness violation. Make each test clean up after itself.' },
        { title: 'API contract tests', kind: 'exercise', prompt: 'For one resource in your API, write tests for a successful create, a validation error, a missing resource (404) and an unauthenticated request (401), checking both status codes and response bodies.' },
        { title: 'Two critical journeys', kind: 'exercise', prompt: 'Identify the two user journeys that would hurt most if broken in an app you built and write an E2E test for each using role and label locators and no fixed sleeps.' },
      ],
      resources: [
        { title: 'The Practical Test Pyramid', url: 'https://martinfowler.com/articles/practical-test-pyramid.html', source: 'martinfowler.com', kind: 'article' },
        { title: 'Playwright: Getting started', url: 'https://playwright.dev/docs/intro', source: 'Playwright', kind: 'docs' },
        { title: 'Playwright: Locators', url: 'https://playwright.dev/docs/locators', source: 'Playwright', kind: 'docs' },
      ],
      quiz: [
        {
          key: 'q1',
          type: 'single',
          title: 'What integration tests catch',
          prompt: 'Which bug is most likely to be caught by an integration test but missed by unit tests with mocks?',
          options: [
            { id: 'a', text: 'An off-by-one error in a pure function' },
            { id: 'b', text: 'A SQL query that references a column renamed in a migration' },
            { id: 'c', text: 'A typo in a variable name inside one function' },
          ],
          correct: ['b'],
          explanation: 'Only running against a real database reveals schema mismatches that mocks hide.',
        },
        {
          key: 'q2',
          type: 'true_false',
          title: 'E2E for everything',
          prompt: 'The best strategy is to test every edge case through end-to-end browser tests.',
          options: [
            { id: 'true', text: 'True' },
            { id: 'false', text: 'False' },
          ],
          correct: ['false'],
          explanation: 'E2E tests are slow and harder to debug. Test edge cases at the unit level and keep E2E for critical journeys.',
        },
        {
          key: 'q3',
          type: 'single',
          title: 'Stable locators',
          prompt: 'Which Playwright locator is most robust to layout changes?',
          options: [
            { id: 'a', text: '`page.locator(\'div > div:nth-child(3) > button\')`' },
            { id: 'b', text: '`page.getByRole(\'button\', { name: \'Create account\' })`' },
            { id: 'c', text: '`page.locator(\'.btn-x7f2\')`' },
          ],
          correct: ['b'],
          explanation: 'Role and accessible name reflect what users see, so they survive styling and structure changes. They also encourage accessible markup.',
        },
        {
          key: 'q4',
          type: 'multi',
          title: 'Fixing flakiness',
          prompt: 'Which changes reduce flaky tests? Select all that apply.',
          options: [
            { id: 'a', text: 'Replace fixed sleeps with waits for a specific condition' },
            { id: 'b', text: 'Give each test its own data instead of shared accounts' },
            { id: 'c', text: 'Stub unreliable third-party services at the boundary' },
            { id: 'd', text: 'Automatically retry failing tests until they pass and never investigate' },
          ],
          correct: ['a', 'b', 'c'],
          explanation: 'Deterministic waits, isolated data and controlled dependencies remove the causes. Blind retries hide real bugs.',
        },
        {
          key: 'q5',
          type: 'matching',
          title: 'Test levels',
          prompt: 'Match each scenario with the most suitable test level.',
          pairs: {
            left: [
              { id: 'l1', text: 'A tax calculation for 20 input combinations' },
              { id: 'l2', text: 'A repository saving and loading rows in PostgreSQL' },
              { id: 'l3', text: 'A new user signing up and reaching the dashboard' },
            ],
            right: [
              { id: 'r1', text: 'End-to-end test' },
              { id: 'r2', text: 'Unit test' },
              { id: 'r3', text: 'Integration test' },
            ],
          },
          matches: { l1: 'r2', l2: 'r3', l3: 'r1' },
          explanation: 'Pure logic belongs in fast unit tests, database code in integration tests, and critical journeys in a few E2E tests.',
        },
      ],
    },
    {
      slug: 'owasp-top-10',
      title: 'OWASP Top 10',
      module: 'Security',
      skill: 'web-security',
      minutes: 60,
      milestone: true,
      completionCriteria: 'Review an application against the OWASP Top 10 and fix at least one access control or injection issue with a test that proves it.',
      objectives: [
        'Describe the main OWASP Top 10 risk categories',
        'Prevent broken access control with server-side checks on every request',
        'Prevent SQL injection with parameterised queries',
        'Prevent cross-site scripting with output encoding and safe DOM APIs',
        'Recognise security misconfiguration and vulnerable dependencies',
      ],
      body: `The **OWASP Top 10** is a widely used awareness list of the most critical web application security risks, updated every few years from real-world data. Categories that appear in recent editions include:

- **Broken access control:** users can act outside their permissions, such as viewing another user's records by changing an id in the URL.
- **Cryptographic failures:** sensitive data sent or stored without proper protection.
- **Injection:** untrusted input interpreted as code or queries (SQL, OS commands, and cross-site scripting).
- **Insecure design:** missing security controls in the design itself, such as no rate limiting on login.
- **Security misconfiguration:** default passwords, verbose error pages, open cloud storage.
- **Vulnerable and outdated components:** dependencies with known vulnerabilities.
- **Authentication failures:** weak passwords allowed, broken session handling.
- **Software and data integrity failures** and **logging and monitoring failures**.

Check the current edition on the OWASP site, since categories are renamed, merged and reordered between editions. Broken access control has been at or near the top in recent editions.

### Broken access control: the classic bug

\`\`\`js
// Vulnerable: any logged-in user can read any invoice
app.get('/api/invoices/:id', requireAuth, async (req, res) => {
  res.json(await db.invoice.find(req.params.id));
});

// Fixed: scope the query to the current user
app.get('/api/invoices/:id', requireAuth, async (req, res) => {
  const inv = await db.invoice.findFirst({ where: { id: req.params.id, ownerId: req.user.id } });
  if (!inv) return res.status(404).end();
  res.json(inv);
});
\`\`\`

Prove the fix with a test: log in as user B, request user A's invoice, and assert a 404 (or 403).

### SQL injection

\`\`\`python
# Vulnerable: input becomes part of the SQL text
cur.execute(f"SELECT * FROM users WHERE email = '{email}'")
# email = "' OR '1'='1" turns the condition into one that matches every row

# Fixed: a parameterised query keeps data separate from code
cur.execute("SELECT * FROM users WHERE email = %s", (email,))
\`\`\`

Parameters cannot be used for column names, so for things like a sort column, check the value against an **allow-list** (\`{"created_at", "title"}\`) before using it.

### Cross-site scripting (XSS)

\`\`\`js
// Vulnerable: a query like <img src=x onerror=alert(1)> runs as code
results.innerHTML = \`<p>No results for \${query}</p>\`;

// Fixed: textContent treats the value as text, never as HTML
const p = document.createElement('p');
p.textContent = \`No results for \${query}\`;
results.replaceChildren(p);
\`\`\`

Frameworks like React escape text by default; the risk returns when you use raw HTML APIs (\`dangerouslySetInnerHTML\`, \`v-html\`) with untrusted data. A **Content Security Policy** header such as \`Content-Security-Policy: default-src 'self'\` adds defence in depth by blocking scripts from unexpected sources.

### A quick review routine
1. List every endpoint and who may call it; check the server enforces it.
2. Search for string-built SQL, shell commands and raw HTML insertion.
3. Check error pages, default credentials and debug flags in production config.
4. Run a dependency audit.

### Common mistakes
- Hiding a button in the UI and assuming that protects the endpoint.
- Trusting input from "internal" sources, hidden form fields or the client's idea of its own role.
- Escaping input once on the way in instead of encoding for the context on the way out.
- Never updating dependencies.
- Testing systems you do not own. Practise on deliberately vulnerable apps instead.`,
      practice: [
        { title: 'Access control audit', kind: 'exercise', prompt: 'List every API endpoint in an app you built. For each, write who should be allowed to call it and whether the code enforces that on the server. Fix any gap and add a test that a different user gets 403 or 404.' },
        { title: 'Injection hunt', kind: 'exercise', prompt: 'Search your own codebase for SQL built with string concatenation or template strings and for innerHTML or equivalent raw HTML APIs. Rewrite each with parameters or safe DOM APIs and add a test with a malicious input.' },
        { title: 'Practise safely', kind: 'exercise', prompt: 'Run a deliberately vulnerable training application (such as OWASP Juice Shop) locally and complete three beginner challenges. Only test applications you own or have explicit permission to test.' },
      ],
      resources: [
        { title: 'OWASP Top Ten', url: 'https://owasp.org/projects/top-ten', source: 'OWASP', kind: 'docs' },
        { title: 'SQL Injection Prevention Cheat Sheet', url: 'https://cheatsheetseries.owasp.org/cheatsheets/SQL_Injection_Prevention_Cheat_Sheet.html', source: 'OWASP', kind: 'cheatsheet' },
        { title: 'Cross Site Scripting Prevention Cheat Sheet', url: 'https://cheatsheetseries.owasp.org/cheatsheets/Cross_Site_Scripting_Prevention_Cheat_Sheet.html', source: 'OWASP', kind: 'cheatsheet' },
        { title: 'OWASP Juice Shop', url: 'https://owasp.org/projects/juice-shop', source: 'OWASP', kind: 'interactive' },
      ],
      quiz: [
        {
          key: 'q1',
          type: 'single',
          title: 'IDOR',
          prompt: 'Changing `/api/orders/1001` to `/api/orders/1002` shows another customer\'s order. Which category is this?',
          options: [
            { id: 'a', text: 'Broken access control' },
            { id: 'b', text: 'Cryptographic failure' },
            { id: 'c', text: 'Security logging failure' },
          ],
          correct: ['a'],
          explanation: 'The server does not check that the order belongs to the requester. This is often called an insecure direct object reference.',
        },
        {
          key: 'q2',
          type: 'single',
          title: 'Preventing SQL injection',
          prompt: 'What is the primary defence against SQL injection?',
          options: [
            { id: 'a', text: 'Hiding database error messages' },
            { id: 'b', text: 'Parameterised queries' },
            { id: 'c', text: 'Using HTTPS' },
          ],
          correct: ['b'],
          explanation: 'Parameterised queries keep data separate from SQL code. The other measures are useful but do not prevent injection.',
        },
        {
          key: 'q3',
          type: 'single',
          title: 'Safe DOM updates',
          prompt: 'You need to show a user-supplied search term on the page. Which is safest?',
          options: [
            { id: 'a', text: '`el.innerHTML = term`' },
            { id: 'b', text: '`el.textContent = term`' },
            { id: 'c', text: '`document.write(term)`' },
          ],
          correct: ['b'],
          explanation: 'textContent inserts the value as plain text, so any HTML or script in it is displayed rather than executed.',
        },
        {
          key: 'q4',
          type: 'true_false',
          title: 'Hidden buttons',
          prompt: 'Hiding the Delete button from non-admin users in the UI is enough to stop them deleting records.',
          options: [
            { id: 'true', text: 'True' },
            { id: 'false', text: 'False' },
          ],
          correct: ['false'],
          explanation: 'Anyone can send the HTTP request directly. Authorization must be checked on the server for every request.',
        },
        {
          key: 'q5',
          type: 'matching',
          title: 'Weakness and fix',
          prompt: 'Match each weakness with its primary fix.',
          pairs: {
            left: [
              { id: 'l1', text: 'SQL injection' },
              { id: 'l2', text: 'Stored XSS' },
              { id: 'l3', text: 'Insecure direct object reference' },
              { id: 'l4', text: 'Vulnerable dependency' },
            ],
            right: [
              { id: 'r1', text: 'Scope every query to the requesting user and check ownership' },
              { id: 'r2', text: 'Upgrade the package and audit dependencies regularly' },
              { id: 'r3', text: 'Use parameterised queries' },
              { id: 'r4', text: 'Encode output for its context and avoid raw HTML APIs' },
            ],
          },
          matches: { l1: 'r3', l2: 'r4', l3: 'r1', l4: 'r2' },
          explanation: 'Each weakness has a direct, primary defence. Layered controls such as CSP and monitoring add depth on top.',
        },
      ],
    },
    {
      slug: 'secure-coding-and-secrets',
      title: 'Secure coding and secrets',
      module: 'Security',
      skill: 'web-security',
      minutes: 50,
      objectives: [
        'Keep secrets out of source code and rotate them when exposed',
        'Load configuration from environment variables or a secrets manager',
        'Store passwords with a slow, salted hashing algorithm',
        'Validate input with allow-lists and return safe error messages',
        'Keep dependencies updated and scan them for known vulnerabilities',
      ],
      body: `A **secret** is anything that grants access: API keys, database passwords, signing keys, tokens. Leaked secrets are one of the most common causes of breaches, and automated scanners search public repositories for them constantly.

### Keep secrets out of code

\`\`\`python
import os

API_KEY = os.environ["PAYMENTS_API_KEY"]   # fails loudly at startup if missing
\`\`\`

\`\`\`text
# .gitignore
.env
*.pem
\`\`\`

Commit a \`.env.example\` with variable names and fake values so others know what to set. In production, use your platform's secret store or a secrets manager, and give each environment its own keys.

### If a secret leaks
1. **Revoke and rotate it immediately.** Deleting the commit is not enough; history, forks and scrapers keep it.
2. Check logs and billing for misuse.
3. Turn on secret scanning (for example GitHub secret scanning or a pre-commit tool such as gitleaks) so it is caught next time.

### Passwords: hash, never encrypt or store

\`\`\`python
from argon2 import PasswordHasher      # pip install argon2-cffi

ph = PasswordHasher()
hashed = ph.hash("correct horse battery staple")   # store only this
ph.verify(hashed, attempt)                         # raises an error if it does not match
\`\`\`

Use a slow, salted algorithm designed for passwords (Argon2id, scrypt or bcrypt). Fast hashes like plain SHA-256 can be guessed billions of times per second on a GPU.

### Validate input with allow-lists

\`\`\`python
ALLOWED_SORT = {"created_at", "title"}

def list_notes(sort: str):
    if sort not in ALLOWED_SORT:
        raise ValueError("invalid sort field")
    ...
\`\`\`

Describe what **is** allowed (types, lengths, formats, known values) rather than trying to block every bad pattern. Validate on the server even if the browser also validates.

### Safe error handling

\`\`\`js
app.use((err, req, res, next) => {
  logger.error({ err, reqId: req.id });                    // full details stay in server logs
  res.status(500).json({ error: 'Something went wrong', reqId: req.id });
});
\`\`\`

Users get a generic message and a reference id; stack traces, SQL and file paths never reach the browser.

### Dependencies
Most code in your app is other people's. Keep a lockfile, update regularly, and scan:

\`\`\`bash
npm audit          # Node.js
pip-audit          # Python
\`\`\`

Enable automated dependency update pull requests and review them like any other change. Read each finding: does the vulnerable code path affect how you use the package?

### Secure defaults checklist
- Least privilege for database users, cloud roles and API tokens.
- Never log passwords, tokens or full card numbers.
- Use well-reviewed libraries for crypto and authentication instead of writing your own.

### Common mistakes
- Hard-coding keys "temporarily" and forgetting them.
- Sharing secrets in chat, email or tickets.
- Storing passwords with a fast hash, or reversible encryption.
- Ignoring audit warnings for months.
- Using one all-powerful key for every service and environment.`,
      practice: [
        { title: 'Secret hygiene audit', kind: 'exercise', prompt: 'Search a repository you own (including its history) for hard-coded keys, passwords and tokens. Move any you find to environment variables, add a .env.example, update .gitignore and rotate the exposed values.' },
        { title: 'Password storage', kind: 'exercise', prompt: 'In a small app, implement sign-up and login that store Argon2id or bcrypt hashes. Write tests that a correct password verifies, a wrong one fails, and the stored value never equals the plain password.' },
        { title: 'Dependency scan', kind: 'exercise', prompt: 'Run npm audit or pip-audit on a project, read the top three findings, decide whether each affects your usage, and upgrade or document the decision.' },
      ],
      resources: [
        { title: 'Secrets Management Cheat Sheet', url: 'https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html', source: 'OWASP', kind: 'cheatsheet' },
        { title: 'Password Storage Cheat Sheet', url: 'https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html', source: 'OWASP', kind: 'cheatsheet' },
        { title: 'GitHub code security documentation', url: 'https://docs.github.com/en/code-security', source: 'GitHub Docs', kind: 'docs' },
      ],
      quiz: [
        {
          key: 'q1',
          type: 'single',
          title: 'Leaked key response',
          prompt: 'You notice an API key was committed to a public repository last week. What is the most important first step?',
          options: [
            { id: 'a', text: 'Delete the file in a new commit' },
            { id: 'b', text: 'Revoke and rotate the key' },
            { id: 'c', text: 'Rename the repository' },
          ],
          correct: ['b'],
          explanation: 'Assume the key is compromised. Rotating it makes the leaked copy useless; cleaning history comes after.',
        },
        {
          key: 'q2',
          type: 'true_false',
          title: 'Example env file',
          prompt: 'Committing a `.env.example` file with variable names and placeholder values is a good practice.',
          options: [
            { id: 'true', text: 'True' },
            { id: 'false', text: 'False' },
          ],
          correct: ['true'],
          explanation: 'It documents required configuration without exposing real secrets.',
          difficulty: 'easy',
        },
        {
          key: 'q3',
          type: 'single',
          title: 'Password storage',
          prompt: 'How should an application store user passwords?',
          options: [
            { id: 'a', text: 'Encrypted with a key stored next to the database' },
            { id: 'b', text: 'Hashed with a slow, salted password algorithm such as Argon2id or bcrypt' },
            { id: 'c', text: 'Hashed once with SHA-256' },
          ],
          correct: ['b'],
          explanation: 'Password hashing algorithms are deliberately slow and salted, which makes large-scale guessing expensive. Encryption is reversible, and plain SHA-256 is too fast.',
        },
        {
          key: 'q4',
          type: 'multi',
          title: 'Safe error responses',
          prompt: 'Which should a production API return to the user when an unexpected error happens? Select all that apply.',
          options: [
            { id: 'a', text: 'A generic message such as "Something went wrong"' },
            { id: 'b', text: 'A request id they can quote to support' },
            { id: 'c', text: 'The full stack trace and SQL query' },
            { id: 'd', text: 'An appropriate status code such as 500' },
          ],
          correct: ['a', 'b', 'd'],
          explanation: 'Details belong in server logs. Stack traces and queries help attackers map your system.',
        },
        {
          key: 'q5',
          type: 'fill_blank',
          title: 'Allow-lists',
          prompt: 'Checking that a sort parameter is one of a fixed set of known column names is an example of an ___-list.',
          accepted: [['allow', 'allowed', 'safe']],
          explanation: 'Allow-lists accept only known-good values, which is far more reliable than trying to block every bad input.',
        },
      ],
    },
    {
      slug: 'refactoring-with-tests',
      title: 'Refactoring safely with tests',
      module: 'Maintenance',
      skill: 'code-review',
      minutes: 45,
      objectives: [
        'Define refactoring and separate it from changing behaviour',
        'Write characterization tests before changing untested code',
        'Recognise common code smells and the refactoring that fixes each',
        'Refactor in small steps, running tests and committing after each one',
      ],
      body: `**Refactoring** means changing the structure of code without changing what it does. It keeps code easy to read and change. The safety net is a test suite that tells you, within seconds, if behaviour changed by accident.

### The safe refactoring loop
1. Make sure the code is covered by tests. If it is not, write **characterization tests** that record what it does today, even if that behaviour looks odd.
2. Make one small change: rename, extract a function, replace a magic number.
3. Run the tests. Green: commit. Red: undo and take a smaller step.
4. Repeat. Change behaviour only in a separate step, with its own test.

### Worked example
This function works, but it is hard to read and to change:

\`\`\`python
def price(order):
    t = 0
    for i in order["items"]:
        t += i["p"] * i["q"]
    if order["type"] == "member":
        if t > 1000:
            t = t * 0.9
    if order["country"] != "IN":
        t = t + 250
    return t
\`\`\`

**Step 1: characterization tests.** Record current outputs for a few representative orders: a small domestic order, a member order just above 1000, a member order exactly at 1000, and an international order. Exactly 1000 matters: the code uses \`>\`, so 1000 gets no discount, and the refactor must keep that.

**Step 2: small, named pieces.**

\`\`\`python
MEMBER_DISCOUNT_THRESHOLD = 1000
MEMBER_PRICE_FACTOR = 0.9
INTERNATIONAL_SHIPPING = 250

def subtotal(items):
    return sum(item["p"] * item["q"] for item in items)

def apply_member_discount(order, amount):
    if order["type"] == "member" and amount > MEMBER_DISCOUNT_THRESHOLD:
        return amount * MEMBER_PRICE_FACTOR
    return amount

def shipping(order):
    return 0 if order["country"] == "IN" else INTERNATIONAL_SHIPPING

def price(order):
    amount = apply_member_discount(order, subtotal(order["items"]))
    return amount + shipping(order)
\`\`\`

Each extraction was its own commit with the tests green. Now a new rule, such as free shipping above 5000, is a small, obvious change to \`shipping\`, with a new test written first.

### Smells and their refactorings
| Smell | Refactoring |
|---|---|
| Long function doing several things | Extract function |
| Unclear names (\`t\`, \`i\`, \`data2\`) | Rename variable or function |
| Unexplained numbers (\`0.9\`, \`250\`) | Replace magic number with a named constant |
| Deep nesting of conditions | Guard clauses and early returns |
| The same logic copied in several places | Extract and reuse one function |

### Refactoring and code review
Keep refactoring and behaviour changes in **separate commits or pull requests**. A reviewer can check a pure refactor quickly ("tests unchanged and green"), and a behaviour change stays small and focused. Editors with automated rename and extract tools make these steps safer than editing by hand.

### Common mistakes
- Refactoring code with no tests and hoping nothing changed.
- Mixing a refactor, a bug fix and a new feature in one large commit.
- "Fixing" odd behaviour during a refactor without checking whether anyone depends on it.
- Rewriting a whole module from scratch when a series of small refactors would be safer.`,
      practice: [
        { title: 'Characterize, then refactor', kind: 'exercise', prompt: 'Pick a long function in one of your projects. Write characterization tests for its current behaviour, then apply at least three refactorings from the table, committing after each with the tests green.' },
        { title: 'Separate the changes', kind: 'exercise', prompt: 'Take a change you need to make that also needs cleanup. Split it into two pull requests: a pure refactor with unchanged tests, then a behaviour change with a new test. Note how the reviews differ.' },
      ],
      resources: [
        { title: 'Refactoring', url: 'https://refactoring.com/', source: 'Martin Fowler', kind: 'article' },
        { title: 'Characterization test', url: 'https://en.wikipedia.org/wiki/Characterization_test', source: 'Wikipedia', kind: 'article' },
        { title: 'What to look for in a code review', url: 'https://google.github.io/eng-practices/review/reviewer/looking-for.html', source: 'Google Engineering Practices', kind: 'article' },
      ],
      quiz: [
        {
          key: 'q1',
          type: 'single',
          title: 'Definition',
          prompt: 'Which change is a refactoring?',
          options: [
            { id: 'a', text: 'Adding a new discount rule for students' },
            { id: 'b', text: 'Extracting a block of code into a well-named function with no change in behaviour' },
            { id: 'c', text: 'Fixing a bug where totals were rounded incorrectly' },
          ],
          correct: ['b'],
          explanation: 'Refactoring changes structure, not behaviour. New rules and bug fixes change behaviour and should be separate steps.',
          difficulty: 'easy',
        },
        {
          key: 'q2',
          type: 'single',
          title: 'Untested code',
          prompt: 'You need to refactor a function that has no tests. What should you do first?',
          options: [
            { id: 'a', text: 'Refactor carefully and test manually afterwards' },
            { id: 'b', text: 'Write characterization tests that record its current behaviour' },
            { id: 'c', text: 'Rewrite it from scratch' },
          ],
          correct: ['b'],
          explanation: 'Characterization tests give you a safety net, so any accidental behaviour change shows up immediately.',
        },
        {
          key: 'q3',
          type: 'matching',
          title: 'Smells',
          prompt: 'Match each code smell with the refactoring that usually fixes it.',
          pairs: {
            left: [
              { id: 'l1', text: 'A bare `0.18` appears in several calculations' },
              { id: 'l2', text: 'A 120-line function that parses, validates and saves' },
              { id: 'l3', text: 'Four levels of nested if statements' },
            ],
            right: [
              { id: 'r1', text: 'Guard clauses with early returns' },
              { id: 'r2', text: 'Replace magic number with a named constant' },
              { id: 'r3', text: 'Extract function' },
            ],
          },
          matches: { l1: 'r2', l2: 'r3', l3: 'r1' },
          explanation: 'Named constants explain numbers, extraction separates responsibilities, and guard clauses flatten nesting.',
        },
        {
          key: 'q4',
          type: 'true_false',
          title: 'Mixed commits',
          prompt: 'Combining a large refactor and a new feature in one commit makes the change easier to review.',
          options: [
            { id: 'true', text: 'True' },
            { id: 'false', text: 'False' },
          ],
          correct: ['false'],
          explanation: 'Mixed changes hide behaviour changes inside structural noise. Separate commits or pull requests are faster and safer to review.',
        },
      ],
    },
  ],
};
