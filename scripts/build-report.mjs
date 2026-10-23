// Assembles reports/test-report/index.html from the collected test data.
// Inputs (all optional except scenarios): reports/.data/{scenarios,shots,gallery,vitest.json,e2e.json,meta.json}
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { TEST_FILE_INFO, AREA_ORDER, JOURNEY_PLAIN } from './report-areas.mjs';

const DATA = path.resolve('reports/.data');
const OUT = path.resolve('reports/test-report');
const IMG = path.join(OUT, 'images');
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(IMG, { recursive: true });

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const readJson = (f) => (fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : null);
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/** Copy an image into the report, shrinking large screenshots (macOS sips; falls back to a plain copy). */
let imgCount = 0;
function addImage(srcRel, baseDir = DATA) {
  if (!srcRel) return null;
  const src = path.join(baseDir, srcRel);
  if (!fs.existsSync(src)) return null;
  const name = `${String(++imgCount).padStart(4, '0')}.jpg`;
  const dest = path.join(IMG, name);
  try {
    execFileSync('sips', ['--resampleWidth', '1280', '-s', 'format', 'jpeg', '-s', 'formatOptions', '72', src, '--out', dest], { stdio: 'ignore' });
  } catch {
    fs.copyFileSync(src, dest);
  }
  return `images/${name}`;
}

// ---------- Load data ----------
const meta = readJson(path.join(DATA, 'meta.json')) ?? {};
const scenarioDir = path.join(DATA, 'scenarios');
const scenarios = fs.existsSync(scenarioDir) ? fs.readdirSync(scenarioDir).filter((f) => f.endsWith('.json')).map((f) => readJson(path.join(scenarioDir, f))) : [];
scenarios.sort((a, b) => (AREA_ORDER.indexOf(a.area) - AREA_ORDER.indexOf(b.area)) || a.id.localeCompare(b.id));
const areas = [...new Set([...AREA_ORDER.filter((a) => scenarios.some((s) => s.area === a)), ...scenarios.map((s) => s.area)])];

const vitest = readJson(path.join(DATA, 'vitest.json'));
const apiFiles = (vitest?.testResults ?? []).map((f) => {
  const file = path.basename(f.name);
  const info = TEST_FILE_INFO[file] ?? { area: file.replace('.test.ts', ''), about: '' };
  const tests = (f.assertionResults ?? []).map((t) => ({
    group: (t.ancestorTitles ?? []).join(' › '),
    title: t.title.charAt(0).toUpperCase() + t.title.slice(1),
    status: t.status,
    ms: Math.round(t.duration ?? 0),
    error: (t.failureMessages ?? []).join('\n').split('\n')[0]?.slice(0, 300),
  }));
  return { file, ...info, tests };
});
const apiTotal = apiFiles.reduce((n, f) => n + f.tests.length, 0);
const apiPassed = apiFiles.reduce((n, f) => n + f.tests.filter((t) => t.status === 'passed').length, 0);

const e2e = readJson(path.join(DATA, 'e2e.json'));
const e2eTests = [];
(function walk(suites, file = '') {
  for (const s of suites ?? []) {
    for (const spec of s.specs ?? []) {
      const res = spec.tests?.[0]?.results?.at(-1);
      e2eTests.push({ file: s.file ?? file, suite: s.title, title: spec.title, ok: spec.ok, ms: res?.duration ?? 0, error: res?.error?.message?.split('\n')[0] });
    }
    walk(s.suites, s.file ?? file);
  }
})(e2e?.suites);
const journeys = e2eTests.filter((t) => /journeys-/.test(t.file));
const a11y = e2eTests.filter((t) => /a11y/.test(t.file));

const gallery = readJson(path.join(DATA, 'gallery', 'manifest.json')) ?? [];

// ---------- Numbers ----------
const scenPassed = scenarios.filter((s) => s.status === 'passed').length;
const stepCount = scenarios.reduce((n, s) => n + s.steps.length, 0);
const checkCount = scenarios.reduce((n, s) => n + s.checks.length, 0);
const checksPassed = scenarios.reduce((n, s) => n + s.checks.filter((c) => c.ok).length, 0);
const journeysPassed = journeys.filter((j) => j.ok).length;
const a11yPassed = a11y.filter((j) => j.ok).length;
const allGreen = scenPassed === scenarios.length && apiPassed === apiTotal && journeysPassed === journeys.length && a11yPassed === a11y.length;

// ---------- HTML pieces ----------
const badge = (ok, okText = 'Passed', badText = 'Failed') => `<span class="badge ${ok ? 'ok' : 'bad'}">${ok ? okText : badText}</span>`;

function scenarioHtml(s) {
  const steps = s.steps
    .map((st) => {
      const img = addImage(st.shot);
      return `<li class="step ${st.ok ? '' : 'step-bad'}">
  <div class="step-text">
    <div class="step-n">Step ${st.n}</div>
    <h4>${esc(st.title)}</h4>
    <p>${esc(st.explain)}</p>
    ${st.ok ? '' : `<p class="err"><strong>What went wrong:</strong> ${esc(st.error)}</p>`}
  </div>
  ${img ? `<button class="shot" data-full="${img}" aria-label="Enlarge screenshot: ${esc(st.title)}"><img loading="lazy" src="${img}" alt="Screenshot: ${esc(st.title)}"></button>` : '<div class="noshot">No screenshot</div>'}
</li>`;
    })
    .join('\n');
  const checks = s.checks.length
    ? `<div class="checks"><h4>What we verified</h4><ul>${s.checks.map((c) => `<li class="${c.ok ? 'c-ok' : 'c-bad'}"><span class="mark">${c.ok ? '&#10003;' : '&#10007;'}</span> ${esc(c.text)}${c.ok ? '' : `<div class="err">${esc(c.error)}</div>`}</li>`).join('')}</ul></div>`
    : '';
  return `<article class="scenario" id="${esc(s.id)}">
  <header>
    <div>
      <div class="scen-id">${esc(s.id)}</div>
      <h3>${esc(s.title)} ${badge(s.status === 'passed')}</h3>
      <p class="summary">${esc(s.summary)}</p>
      <p class="roles">Who is involved: ${s.roles.map((r) => `<span class="role">${esc(r)}</span>`).join(' ')}</p>
    </div>
  </header>
  ${s.status === 'passed' ? '' : `<p class="err box">This scenario did not finish: ${esc(s.error)}</p>`}
  <ol class="steps">${steps}</ol>
  ${checks}
  <p class="top"><a href="#contents">Back to contents</a></p>
</article>`;
}

const areaSections = areas
  .map((a) => {
    const list = scenarios.filter((s) => s.area === a);
    return `<section class="area" id="area-${slug(a)}"><h2>${esc(a)}</h2><p class="area-sub">${list.length} scenario${list.length === 1 ? '' : 's'}, ${list.reduce((n, s) => n + s.steps.length, 0)} screenshots</p>${list.map(scenarioHtml).join('\n')}</section>`;
  })
  .join('\n');

const toc = areas
  .map((a) => {
    const list = scenarios.filter((s) => s.area === a);
    return `<li><a href="#area-${slug(a)}"><strong>${esc(a)}</strong></a><ul>${list.map((s) => `<li><span class="dot ${s.status === 'passed' ? 'ok' : 'bad'}"></span><a href="#${esc(s.id)}">${esc(s.title)}</a></li>`).join('')}</ul></li>`;
  })
  .join('');

const journeysHtml = journeys.length
  ? `<table class="tbl"><thead><tr><th>#</th><th>Journey</th><th>What it proves, in plain words</th><th>Result</th><th>Time</th></tr></thead><tbody>${journeys
      .map((j) => {
        const n = Number(/Journey (\d+)/.exec(j.suite)?.[1] ?? /Journey (\d+)/.exec(j.title)?.[1] ?? 0);
        return `<tr><td>${n || ''}</td><td>${esc(j.suite.replace(/^Journey \d+: /, ''))}</td><td>${esc(JOURNEY_PLAIN[n] ?? j.title)}</td><td>${badge(j.ok)}</td><td>${(j.ms / 1000).toFixed(1)} s</td></tr>`;
      })
      .join('')}</tbody></table>`
  : '<p class="muted">Journey results were not collected in this run.</p>';

const a11yHtml = a11y.length
  ? `<p>Each row loads several pages for one type of user and runs an automatic accessibility checker (axe-core) against the international WCAG 2.2 AA rules: colour contrast, labels for screen readers, keyboard access and more. "Passed" means no serious or critical problems were found.</p>
<table class="tbl"><thead><tr><th>Who</th><th>Theme</th><th>Result</th></tr></thead><tbody>${a11y
      .map((t) => {
        const m = /a11y (\S+) \((\w+)\)/.exec(t.title) ?? [];
        return `<tr><td>${esc(m[1] ?? t.title)}</td><td>${esc(m[2] ?? '')}</td><td>${badge(t.ok)}</td></tr>`;
      })
      .join('')}</tbody></table>`
  : '<p class="muted">Accessibility results were not collected in this run.</p>';

const apiHtml = apiFiles.length
  ? `<p>These are automatic checks that talk directly to the server (no browser). Each one creates its own empty database, sets up a situation and checks the outcome, including that people can't see or change things they shouldn't. Use the box to search.</p>
<input id="apiSearch" class="search" type="search" placeholder="Search checks, e.g. password, grade, private" aria-label="Search automated checks">
${apiFiles
  .map(
    (f) => `<details class="api" open><summary><strong>${esc(f.area)}</strong> <span class="muted">${f.tests.filter((t) => t.status === 'passed').length} of ${f.tests.length} passed</span> ${badge(f.tests.every((t) => t.status === 'passed'))}</summary>
<p class="muted">${esc(f.about)}</p>
<ul class="api-list">${f.tests.map((t) => `<li class="${t.status === 'passed' ? 'c-ok' : 'c-bad'}" data-text="${esc((f.area + ' ' + t.group + ' ' + t.title).toLowerCase())}"><span class="mark">${t.status === 'passed' ? '&#10003;' : '&#10007;'}</span> ${esc(t.title)}${t.group ? ` <span class="muted">(${esc(t.group)})</span>` : ''}${t.status === 'passed' ? '' : `<div class="err">${esc(t.error)}</div>`}</li>`).join('')}</ul></details>`,
  )
  .join('\n')}`
  : '<p class="muted">Server test results were not collected in this run.</p>';

const galleryGroups = [...new Set(gallery.map((g) => g.group))];
const galleryHtml = gallery.length
  ? galleryGroups
      .map(
        (grp) => `<h3>${esc(grp)}</h3><div class="grid">${gallery
          .filter((g) => g.group === grp)
          .map((g) => {
            const img = addImage(g.file, path.join(DATA, 'gallery'));
            return img ? `<figure><button class="shot" data-full="${img}" aria-label="Enlarge: ${esc(g.title)}"><img loading="lazy" src="${img}" alt="${esc(g.title)}"></button><figcaption><strong>${esc(g.title)}</strong><br><span class="muted">${esc(g.path)}</span></figcaption></figure>` : '';
          })
          .join('')}</div>`,
      )
      .join('')
  : '<p class="muted">The page gallery was not collected in this run.</p>';

const generated = new Date();
const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>LearnSphere Nexus - Test Report</title>
<style>
:root{--bg:#f6f6f3;--card:#fff;--text:#16181d;--muted:#5b5e66;--border:#e1e1da;--accent:#0f766e;--accent-soft:#e3f4f1;--ok:#147a3a;--ok-soft:#e6f6eb;--bad:#b91c1c;--bad-soft:#fdeaea;--warn:#b45309;--warn-soft:#fdf2e1}
@media (prefers-color-scheme:dark){:root{--bg:#0c0e11;--card:#13161b;--text:#e9ebee;--muted:#a2a7b0;--border:#252a32;--accent:#2dd4bf;--accent-soft:#0f2f2c;--ok:#4ade80;--ok-soft:#0f2a1a;--bad:#f87171;--bad-soft:#2f1414;--warn:#fbbf24;--warn-soft:#2e2410}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--text);font:15px/1.6 ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
a{color:var(--accent)}
.wrap{max-width:1180px;margin:0 auto;padding:24px 16px 80px}
.hero{background:linear-gradient(135deg,#0b2724,#0f4a44);color:#fff;border-radius:16px;padding:32px;margin-bottom:24px}
.hero h1{margin:0 0 6px;font-size:30px;letter-spacing:-.01em}
.hero p{margin:0;color:#cdeee9}
.verdict{display:inline-block;margin-top:16px;padding:6px 14px;border-radius:999px;font-weight:600;background:${allGreen ? '#14532d' : '#7f1d1d'};color:#fff}
.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:12px;margin:0 0 24px}
.card{background:var(--card);border:1px solid var(--border);border-radius:12px;padding:16px}
.card .num{font-size:26px;font-weight:700}
.card .lbl{color:var(--muted);font-size:13px}
.box{background:var(--card);border:1px solid var(--border);border-radius:12px;padding:18px 20px;margin-bottom:24px}
h2{font-size:24px;margin:40px 0 4px;padding-top:8px;border-top:2px solid var(--border)}
.area-sub{color:var(--muted);margin:0 0 16px}
.scenario{background:var(--card);border:1px solid var(--border);border-radius:14px;padding:20px;margin:0 0 24px}
.scenario h3{margin:2px 0 6px;font-size:20px}
.scen-id{font:12px ui-monospace,Menlo,monospace;color:var(--muted)}
.summary{margin:0 0 6px}
.roles{margin:0;color:var(--muted);font-size:13px}
.role{display:inline-block;background:var(--accent-soft);color:var(--text);border-radius:999px;padding:1px 10px;margin-right:4px}
.badge{display:inline-block;font-size:12px;font-weight:600;padding:2px 10px;border-radius:999px;vertical-align:middle}
.badge.ok{background:var(--ok-soft);color:var(--ok)}.badge.bad{background:var(--bad-soft);color:var(--bad)}
.steps{list-style:none;padding:0;margin:18px 0 0;display:grid;gap:16px}
.step{display:grid;grid-template-columns:minmax(220px,1fr) 2fr;gap:16px;align-items:start;border-top:1px solid var(--border);padding-top:16px}
.step-bad{background:var(--bad-soft);border-radius:10px;padding:12px}
.step-n{font-size:12px;font-weight:700;color:var(--accent);text-transform:uppercase;letter-spacing:.05em}
.step h4{margin:2px 0 6px;font-size:16px}
.step p{margin:0;color:var(--muted)}
.shot{display:block;border:1px solid var(--border);border-radius:10px;overflow:hidden;padding:0;background:#fff;cursor:zoom-in;width:100%}
.shot img{display:block;width:100%;height:auto;max-height:560px;object-fit:cover;object-position:top}
.noshot{color:var(--muted);font-size:13px}
.checks{margin-top:18px;background:var(--bg);border-radius:10px;padding:12px 16px}
.checks h4{margin:0 0 6px}
.checks ul,.api-list{list-style:none;margin:0;padding:0}
.checks li,.api-list li{padding:4px 0}
.mark{display:inline-block;width:20px;font-weight:700}
.c-ok .mark{color:var(--ok)}.c-bad .mark{color:var(--bad)}
.err{color:var(--bad);font-size:13px}
.err.box{background:var(--bad-soft);padding:10px 14px;border-radius:8px}
.muted{color:var(--muted)}
.top{margin:14px 0 0;font-size:13px}
.toc ul{list-style:none;padding-left:0}.toc>ul>li{margin-bottom:10px}.toc ul ul{padding-left:16px;margin-top:4px}.toc li li{padding:1px 0}
.dot{display:inline-block;width:9px;height:9px;border-radius:50%;margin-right:8px}.dot.ok{background:var(--ok)}.dot.bad{background:var(--bad)}
.tbl{width:100%;border-collapse:collapse;background:var(--card);border:1px solid var(--border);border-radius:12px;overflow:hidden}
.tbl th,.tbl td{text-align:left;padding:10px 12px;border-bottom:1px solid var(--border);vertical-align:top}
.tbl th{background:var(--bg);font-size:13px}
details.api{background:var(--card);border:1px solid var(--border);border-radius:12px;padding:12px 16px;margin:0 0 10px}
details.api summary{cursor:pointer}
.search{width:100%;max-width:460px;padding:10px 12px;border:1px solid var(--border);border-radius:8px;background:var(--card);color:var(--text);font-size:15px;margin:6px 0 14px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:14px;margin-bottom:24px}
figure{margin:0;background:var(--card);border:1px solid var(--border);border-radius:10px;padding:8px}
figure .shot img{max-height:220px}
figcaption{font-size:13px;margin-top:6px}
#lb{position:fixed;inset:0;background:rgba(0,0,0,.85);display:none;align-items:flex-start;justify-content:center;z-index:10;overflow:auto;padding:24px;cursor:zoom-out}
#lb img{max-width:100%;height:auto;border-radius:8px}
#lb.open{display:flex}
@media (max-width:760px){.step{grid-template-columns:1fr}.hero{padding:22px}.hero h1{font-size:24px}}
</style>
</head>
<body>
<div class="wrap">
  <div class="hero">
    <h1>LearnSphere Nexus: Test Report</h1>
    <p>How the website works and looks, scenario by scenario, with a screenshot of every step.</p>
    <p style="margin-top:8px">Generated ${esc(generated.toLocaleString('en-GB', { dateStyle: 'long', timeStyle: 'short' }))}</p>
    <span class="verdict">${allGreen ? 'Everything passed' : 'Some items need attention (see red markers)'}</span>
  </div>

  <div class="cards">
    <div class="card"><div class="num">${scenPassed}/${scenarios.length}</div><div class="lbl">Walkthrough scenarios passed</div></div>
    <div class="card"><div class="num">${stepCount}</div><div class="lbl">Steps with screenshots</div></div>
    <div class="card"><div class="num">${checksPassed}/${checkCount}</div><div class="lbl">Outcomes verified in scenarios</div></div>
    <div class="card"><div class="num">${journeysPassed}/${journeys.length || 10}</div><div class="lbl">Required journeys passed</div></div>
    <div class="card"><div class="num">${apiPassed}/${apiTotal}</div><div class="lbl">Automated server checks passed</div></div>
    <div class="card"><div class="num">${a11yPassed}/${a11y.length}</div><div class="lbl">Accessibility scans passed</div></div>
  </div>

  <div class="box">
    <h2 style="margin-top:0;border:0;padding:0">How to read this report</h2>
    <ul>
      <li><strong>Walkthrough scenarios</strong> are recorded in a real web browser, just like a person using the site. Each step has a short explanation and a screenshot. Click any screenshot to see it full size.</li>
      <li><strong>"What we verified"</strong> lists the outcomes the test checked automatically (for example "the student cannot see the teacher's private comment"). A green tick means it was confirmed.</li>
      <li><strong>Sample data:</strong> organisations such as Northbridge Institute of Technology, Helix Labs, Riverside College and Orbit Systems, and people like Asha and Rohan, are demonstration data created for testing. They are labelled "Sample" in the app.</li>
      <li><strong>Test environment:</strong> ${esc(meta.environment ?? 'production build of the app on a fresh, temporary database with demo data')}.</li>
      <li><strong>AI:</strong> ${esc(meta.ai ?? 'not recorded')}. AI answers vary from run to run, so the tests check that AI appears where expected and is clearly labelled, not the exact wording.</li>
      <li><strong>Code execution:</strong> ${esc(meta.exec ?? 'JavaScript, TypeScript and SQL in built-in sandboxes')}.</li>
    </ul>
  </div>

  <nav class="box toc" id="contents" aria-label="Contents">
    <h2 style="margin-top:0;border:0;padding:0">Contents</h2>
    <ul>
      ${toc}
      <li><a href="#journeys"><strong>The ten required journeys</strong></a></li>
      <li><a href="#api"><strong>Automated server checks (${apiTotal})</strong></a></li>
      <li><a href="#a11y"><strong>Accessibility checks</strong></a></li>
      <li><a href="#gallery"><strong>Page gallery (every screen)</strong></a></li>
    </ul>
  </nav>

  ${areaSections}

  <section id="journeys"><h2>The ten required journeys</h2><p class="area-sub">End-to-end tests of the ten user journeys required by the project brief, run in a real browser against the production build.</p>${journeysHtml}</section>

  <section id="api"><h2>Automated server checks</h2><p class="area-sub">${apiPassed} of ${apiTotal} passed</p>${apiHtml}</section>

  <section id="a11y"><h2>Accessibility checks</h2>${a11yHtml}</section>

  <section id="gallery"><h2>Page gallery</h2><p class="area-sub">Every main screen for every type of user, as captured during this run.</p>${galleryHtml}</section>

  <p class="muted" style="margin-top:40px">To regenerate this report: <code>pnpm report</code> in the project folder.</p>
</div>
<div id="lb" role="dialog" aria-modal="true" aria-label="Screenshot"><img alt=""></div>
<script>
(function(){
  var lb=document.getElementById('lb'),im=lb.querySelector('img');
  document.addEventListener('click',function(e){var b=e.target.closest('.shot');if(b){im.src=b.getAttribute('data-full');im.alt=b.getAttribute('aria-label')||'';lb.classList.add('open');}else if(e.target.closest('#lb')){lb.classList.remove('open');}});
  document.addEventListener('keydown',function(e){if(e.key==='Escape')lb.classList.remove('open');});
  var s=document.getElementById('apiSearch');
  if(s)s.addEventListener('input',function(){var q=s.value.trim().toLowerCase();document.querySelectorAll('.api-list li').forEach(function(li){li.style.display=!q||li.getAttribute('data-text').indexOf(q)>-1?'':'none';});});
})();
</script>
</body>
</html>`;

fs.writeFileSync(path.join(OUT, 'index.html'), html);
const sizeMb = (fs.readdirSync(IMG).reduce((n, f) => n + fs.statSync(path.join(IMG, f)).size, 0) / 1e6).toFixed(1);
console.log(`Report written to ${path.join(OUT, 'index.html')}`);
console.log(`Scenarios ${scenPassed}/${scenarios.length}, steps ${stepCount}, server checks ${apiPassed}/${apiTotal}, journeys ${journeysPassed}/${journeys.length}, a11y ${a11yPassed}/${a11y.length}, images ${imgCount} (${sizeMb} MB)`);
