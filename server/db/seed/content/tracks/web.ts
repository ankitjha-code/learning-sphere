import type { SeedTrack } from '../types';

export const webFoundations: SeedTrack = {
  slug: 'web-foundations',
  title: 'Web Foundations: HTML, CSS and JavaScript in the Browser',
  category: 'web',
  summary: 'Build accessible, responsive web pages, test them for accessibility, and make them interactive with the DOM and fetch.',
  description: `**Who it's for:** beginners who know basic programming (variables, loops, functions) and want to build for the web, and backend developers who want a solid grounding in how the browser works.

**Prerequisites:** basic JavaScript syntax helps for the last two topics (*JavaScript Essentials* covers it). No framework knowledge needed. All you need is a text editor and a modern browser with its developer tools.

**You will be able to:**
- structure pages with semantic HTML that works for everyone, including people using assistive technology
- predict which CSS rule wins using the cascade, specificity and inheritance
- lay out pages with the box model, flexbox and grid
- make layouts responsive from a 320px phone to a wide desktop
- apply core accessibility practices and test them with automated tools, a keyboard and a screen reader
- handle events, update the DOM safely and load JSON data with fetch, including loading, error and cancelled states

**Milestones:** *Layout with flexbox and grid* (topic 3) and *A data-driven page* (topic 8).`,
  level: 'beginner',
  estimatedHours: 26,
  roles: ['frontend developer', 'full-stack developer', 'software engineer', 'web developer', 'ui engineer'],
  contentStatus: 'complete',
  topics: [
    {
      slug: 'html-semantics',
      title: 'Semantic HTML',
      module: 'Structure',
      skill: 'html-css',
      minutes: 45,
      objectives: [
        'Explain why semantic elements beat generic div and span',
        'Write a valid document skeleton and structure a page with landmark elements',
        'Use headings in a logical order and write meaningful link text',
        'Build forms whose inputs have associated labels, types and autocomplete hints',
      ],
      body: `HTML describes the **meaning** of content, not its look. When you pick the element that matches the meaning, browsers, search engines and assistive technology (such as screen readers and voice control) understand your page for free. CSS then handles the appearance.

### The document skeleton

\`\`\`html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Learning the box model | My Site</title>
    <link rel="stylesheet" href="styles.css">
  </head>
  <body>
    ...
  </body>
</html>
\`\`\`

\`lang\` tells screen readers which pronunciation rules to use. The \`<title>\` is what appears in the browser tab, bookmarks and search results, so make it specific to the page.

### Landmarks and sections

\`\`\`html
<header>
  <nav aria-label="Main">
    <ul>
      <li><a href="/">Home</a></li>
      <li><a href="/blog" aria-current="page">Blog</a></li>
    </ul>
  </nav>
</header>
<main>
  <article>
    <h1>Learning the box model</h1>
    <p>Every element is a rectangle...</p>
    <section>
      <h2>Padding vs margin</h2>
      <p>...</p>
    </section>
  </article>
  <aside><h2>Related posts</h2>...</aside>
</main>
<footer><p>&copy; 2026 My Site</p></footer>
\`\`\`

| Element | Meaning |
|---|---|
| \`<header>\` / \`<footer>\` | introductory or closing content for the page or a section |
| \`<nav>\` | a block of major navigation links |
| \`<main>\` | the unique main content (one per page) |
| \`<article>\` | self-contained content that makes sense on its own, such as a post |
| \`<section>\` | a themed group of content, usually with its own heading |
| \`<aside>\` | related but secondary content |

A screen reader user can jump straight to \`<main>\`, list all headings or list all landmarks. With only \`<div>\`s, that navigation disappears.

### Headings, links and buttons
- One \`<h1>\` per page, then \`<h2>\`, \`<h3>\` in order. Do not skip levels to get a smaller font; use CSS for size.
- Use \`<a href>\` to **navigate** and \`<button>\` to **act** (open a menu, submit, delete). A clickable \`<div>\` is not focusable and is not announced as a button.
- Link text should make sense out of context: "Read the pricing guide", not "click here".

### Forms

\`\`\`html
<form action="/subscribe" method="post">
  <fieldset>
    <legend>Newsletter</legend>
    <label for="email">Email address</label>
    <input id="email" name="email" type="email" autocomplete="email" required>
    <label for="freq">How often?</label>
    <select id="freq" name="freq">
      <option>Weekly</option>
      <option>Monthly</option>
    </select>
  </fieldset>
  <button type="submit">Subscribe</button>
</form>
\`\`\`

The \`for\` attribute links the label to the input's \`id\`, so clicking the label focuses the field and screen readers announce "Email address, edit text". Types such as \`email\`, \`tel\` and \`number\` give mobile users the right keyboard, and \`autocomplete\` lets browsers fill known values.

### Images
Every \`<img>\` needs an \`alt\` attribute. Describe the purpose ("Bar chart: sign-ups doubled in March"), or use \`alt=""\` for purely decorative images so screen readers skip them.

### Common mistakes
- "Div soup": wrapping everything in \`<div>\` and styling it to look like headings or buttons.
- Link text like "click here" or "read more", which is meaningless in a list of links.
- Using \`<br>\` tags for spacing instead of CSS margins.
- Placeholder text instead of a \`<label>\`; it disappears as soon as someone types.
- Forgetting \`lang\` on \`<html>\`, so screen readers may read the page with the wrong voice.`,
      practice: [
        { title: 'Rewrite a div-only page', kind: 'exercise', prompt: 'Take a page built only from <div> and <span> elements (or write one with a header, menu, blog post, sidebar and footer) and rewrite it with semantic elements. Check the heading outline and landmarks in your browser dev tools Accessibility panel.' },
        { title: 'Accessible contact form', kind: 'exercise', prompt: 'Build a contact form with name, email, topic (select) and message fields inside a fieldset with a legend. Every input must have a visible <label> linked with for/id, sensible type and autocomplete attributes, and the submit control must be a <button>.' },
        { title: 'Valid parentheses', kind: 'problem', ref: 'valid-parentheses' },
      ],
      resources: [
        { title: 'Learn HTML', url: 'https://web.dev/learn/html', source: 'web.dev (Google)', kind: 'course' },
        { title: 'Semantics (glossary)', url: 'https://developer.mozilla.org/en-US/docs/Glossary/Semantics', source: 'MDN Web Docs', kind: 'docs' },
        { title: 'HTML elements reference', url: 'https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements', source: 'MDN Web Docs', kind: 'docs' },
      ],
      quiz: [
        {
          key: 'q1',
          type: 'single',
          title: 'Action element',
          prompt: 'A control opens a modal dialog on the same page. Which element should you use?',
          options: [
            { id: 'a', text: '`<div onclick="...">`' },
            { id: 'b', text: '`<button type="button">`' },
            { id: 'c', text: '`<a href="#">`' },
          ],
          correct: ['b'],
          explanation: 'Buttons perform actions. They are keyboard focusable and announced as buttons. Links are for navigating to a URL.',
          difficulty: 'easy',
        },
        {
          key: 'q2',
          type: 'true_false',
          title: 'Heading levels',
          prompt: 'It is fine to jump from `<h1>` to `<h4>` if you want smaller text.',
          options: [
            { id: 'true', text: 'True' },
            { id: 'false', text: 'False' },
          ],
          correct: ['false'],
          explanation: 'Heading levels describe document structure. Change the size with CSS and keep the levels in order.',
          difficulty: 'easy',
        },
        {
          key: 'q3',
          type: 'matching',
          title: 'Landmark elements',
          prompt: 'Match each element with the content it should hold.',
          pairs: {
            left: [
              { id: 'l1', text: '`<nav>`' },
              { id: 'l2', text: '`<main>`' },
              { id: 'l3', text: '`<aside>`' },
              { id: 'l4', text: '`<article>`' },
            ],
            right: [
              { id: 'r1', text: 'The unique primary content of the page' },
              { id: 'r2', text: 'A block of major navigation links' },
              { id: 'r3', text: 'A self-contained piece such as a blog post' },
              { id: 'r4', text: 'Related but secondary content' },
            ],
          },
          matches: { l1: 'r2', l2: 'r1', l3: 'r4', l4: 'r3' },
          explanation: 'Landmarks let assistive technology users jump between regions. Each element signals a different role on the page.',
          difficulty: 'medium',
        },
        {
          key: 'q4',
          type: 'fill_blank',
          title: 'Label association',
          prompt: 'Complete the attribute that links a label to an input with `id="email"`: `<label ____="email">Email</label>`',
          accepted: [['for']],
          explanation: 'The `for` attribute must match the input id. Clicking the label then focuses the input, and screen readers announce the label text.',
          difficulty: 'easy',
        },
        {
          key: 'q5',
          type: 'single',
          title: 'Decorative image',
          prompt: 'An image is a purely decorative swirl next to a heading. What should its `alt` attribute be?',
          options: [
            { id: 'a', text: 'Leave out the alt attribute entirely' },
            { id: 'b', text: '`alt=""`' },
            { id: 'c', text: '`alt="image"`' },
          ],
          correct: ['b'],
          explanation: 'An empty alt tells screen readers to skip the image. Leaving alt out often makes them read the file name instead.',
          difficulty: 'medium',
        },
      ],
    },
    {
      slug: 'css-cascade-specificity',
      title: 'Selectors, the cascade and specificity',
      module: 'Styling',
      skill: 'html-css',
      minutes: 45,
      objectives: [
        'Write type, class, attribute, pseudo-class and combinator selectors',
        'Calculate specificity and predict which conflicting declaration wins',
        'Explain which properties inherit and use custom properties for design tokens',
        'Debug styling conflicts with the browser Styles panel',
      ],
      body: `When two CSS rules set the same property on the same element, the browser needs a way to pick a winner. That process is the **cascade**. Understanding it turns "why is my style not applying?" from guesswork into a quick check.

### Selectors you will use every day

\`\`\`css
p { line-height: 1.6; }                 /* type selector */
.card { padding: 1rem; }                /* class selector */
#signup { scroll-margin-top: 4rem; }    /* id selector */
input[type="email"] { width: 100%; }    /* attribute selector */
a:hover, a:focus-visible { text-decoration: underline; }  /* pseudo-classes */
.card > h2 { margin-top: 0; }           /* direct child combinator */
.card p { color: #333; }                /* descendant combinator */
li + li { border-top: 1px solid #ddd; } /* adjacent sibling */
.price::before { content: "$"; }        /* pseudo-element */
\`\`\`

### How the cascade decides
For each property, the browser compares the competing declarations in this order and stops at the first difference:
1. **Origin and importance:** user agent, user and author styles, with \`!important\` flipping the order.
2. **Cascade layers** (\`@layer\`): later layers beat earlier ones for normal declarations.
3. **Specificity:** the more specific selector wins.
4. **Order of appearance:** if everything else ties, the declaration that comes last wins.

Inline \`style="..."\` attributes beat any selector in normal author styles.

### Calculating specificity
Count three columns: **(ids, classes/attributes/pseudo-classes, types/pseudo-elements)** and compare left to right.

| Selector | Specificity |
|---|---|
| \`p\` | (0, 0, 1) |
| \`.card p\` | (0, 1, 1) |
| \`nav .link:hover\` | (0, 2, 1) |
| \`#signup .btn\` | (1, 1, 0) |

\`(1, 0, 0)\` beats \`(0, 9, 9)\` because the first column wins. \`:where(...)\` always adds zero specificity, which makes it handy for easy-to-override defaults, while \`:is(...)\` takes the specificity of its most specific argument.

### Inheritance
Some properties, mostly text-related ones such as \`color\`, \`font-family\` and \`line-height\`, inherit from the parent. Box properties such as \`margin\`, \`padding\`, \`border\` and \`width\` do not. You can force either behaviour with the \`inherit\` and \`initial\` keywords.

\`\`\`css
body { font-family: system-ui, sans-serif; color: #1f2933; } /* every element inherits these */
button { font: inherit; }  /* form controls do not inherit fonts by default */
\`\`\`

### Custom properties (CSS variables)

\`\`\`css
:root {
  --brand: #0b5fff;
  --space: 1rem;
}
.btn { background: var(--brand); padding: calc(var(--space) / 2) var(--space); }
.theme-dark { --brand: #7aa7ff; }  /* custom properties inherit, so this re-themes children */
\`\`\`

### Debugging
Open dev tools, select the element and read the **Styles** panel. Crossed-out declarations lost the cascade; hover them to see the specificity, or check the **Computed** tab for the final value and which rule set it.

### Common mistakes
- Reaching for \`!important\` or ids to win a fight, which starts a specificity arms race. Lower the specificity of the other rule instead.
- Deeply nested selectors like \`.page .main .list li a\` that are fragile and hard to override. Prefer one meaningful class.
- Expecting \`padding\` or \`border\` to inherit from a parent.
- Forgetting that form controls do not inherit \`font\`, so buttons look different from the surrounding text.`,
      practice: [
        { title: 'Specificity detective', kind: 'exercise', prompt: 'Write ten pairs of conflicting selectors that target the same element (for example ".nav a" vs "a.active"). Predict the winner of each pair using the three-column count, then check your predictions in the dev tools Styles panel.' },
        { title: 'Design tokens', kind: 'exercise', prompt: 'Refactor a stylesheet you wrote earlier so every colour and spacing value comes from custom properties on :root. Then add a .theme-dark class that redefines only the colour variables and confirm the whole page re-themes.' },
      ],
      resources: [
        { title: 'Learn CSS: The cascade', url: 'https://web.dev/learn/css/the-cascade', source: 'web.dev (Google)', kind: 'course' },
        { title: 'Learn CSS: Specificity', url: 'https://web.dev/learn/css/specificity', source: 'web.dev (Google)', kind: 'course' },
        { title: 'Learn CSS: Inheritance', url: 'https://web.dev/learn/css/inheritance', source: 'web.dev (Google)', kind: 'course' },
      ],
      quiz: [
        {
          key: 'q1',
          type: 'single',
          title: 'Which rule wins',
          prompt: 'Both rules target the same link and appear in this order: `#menu a { color: red; }` then `.nav .item a { color: blue; }`. What colour is the link?',
          options: [
            { id: 'a', text: 'Red, because the id selector is more specific' },
            { id: 'b', text: 'Blue, because it comes later' },
            { id: 'c', text: 'Blue, because it has more selectors' },
          ],
          correct: ['a'],
          explanation: '`#menu a` is (1, 0, 1) and `.nav .item a` is (0, 2, 1). The id column is compared first, so red wins regardless of order.',
          difficulty: 'medium',
        },
        {
          key: 'q2',
          type: 'true_false',
          title: 'Padding inheritance',
          prompt: 'Setting `padding: 2rem` on a `<section>` also gives every child element 2rem of padding.',
          options: [
            { id: 'true', text: 'True' },
            { id: 'false', text: 'False' },
          ],
          correct: ['false'],
          explanation: 'Box properties such as padding, margin and border do not inherit. Text properties such as color and font-family do.',
          difficulty: 'easy',
        },
        {
          key: 'q3',
          type: 'fill_blank',
          title: 'Using a custom property',
          prompt: 'Complete the declaration that reads the custom property `--brand`: `color: ____(--brand);`',
          accepted: [['var']],
          explanation: 'The `var()` function reads a custom property, optionally with a fallback: `var(--brand, blue)`.',
          difficulty: 'easy',
        },
        {
          key: 'q4',
          type: 'matching',
          title: 'Selector types',
          prompt: 'Match each selector with what it selects.',
          pairs: {
            left: [
              { id: 'l1', text: '`ul > li`' },
              { id: 'l2', text: '`input[required]`' },
              { id: 'l3', text: '`a:focus-visible`' },
              { id: 'l4', text: '`p::first-line`' },
            ],
            right: [
              { id: 'r1', text: 'Inputs that have a required attribute' },
              { id: 'r2', text: 'List items that are direct children of a ul' },
              { id: 'r3', text: 'The first rendered line of each paragraph' },
              { id: 'r4', text: 'A link focused in a way that should show a focus ring' },
            ],
          },
          matches: { l1: 'r2', l2: 'r1', l3: 'r4', l4: 'r3' },
          explanation: '`>` is the child combinator, `[attr]` matches attributes, single-colon pseudo-classes match states and double-colon pseudo-elements match parts of an element.',
          difficulty: 'medium',
        },
        {
          key: 'q5',
          type: 'single',
          title: 'Zero specificity',
          prompt: 'You are writing default styles for a component library and want users to override them with any single class. Which selector form helps most?',
          options: [
            { id: 'a', text: '`#lib .button`' },
            { id: 'b', text: '`:where(.lib-button)`' },
            { id: 'c', text: '`.lib-button !important`' },
          ],
          correct: ['b'],
          explanation: '`:where()` contributes zero specificity, so any later class selector overrides it. Ids and `!important` make overrides harder.',
          difficulty: 'hard',
        },
      ],
    },
    {
      slug: 'css-box-model-layout',
      title: 'CSS box model and layout with flexbox and grid',
      module: 'Layout',
      skill: 'html-css',
      minutes: 60,
      milestone: true,
      completionCriteria: 'Build a page with a flexbox navigation bar and a grid card layout that does not overflow at any width from 320px up.',
      objectives: [
        'Describe content, padding, border and margin and how box-sizing changes width',
        'Choose between flexbox (one dimension) and grid (two dimensions)',
        'Align and distribute items with justify-content, align-items and gap',
        'Build a responsive card grid without media queries and a page layout with grid areas',
      ],
      body: `Every element is a rectangular **box**: content, then padding, then border, then margin. Layout is the art of arranging those boxes.

### The box model and box-sizing

\`\`\`css
.card {
  width: 300px;
  padding: 16px;
  border: 2px solid #ccd;
  margin: 24px;
}
\`\`\`

By default (\`box-sizing: content-box\`), \`width\` sets only the content, so this card is 300 + 2 x 16 + 2 x 2 = 336px wide before margins. Most projects switch every element to the more intuitive model:

\`\`\`css
*, *::before, *::after { box-sizing: border-box; }
\`\`\`

Now \`width: 300px\` means the whole box, padding and border included. Remember that vertical margins between block elements **collapse**: a 24px bottom margin next to a 16px top margin produces a 24px gap, not 40px.

### Display types
- **block** (\`div\`, \`p\`, \`section\`): starts on a new line and fills the available width.
- **inline** (\`a\`, \`span\`, \`strong\`): flows within text; width and height do not apply.
- **inline-block**: flows like text but accepts width, height and vertical padding.
- **flex** and **grid**: turn the element into a layout container for its children.

### Flexbox: one dimension
Use flexbox to lay items out in a **row or a column**, such as a nav bar or a toolbar:

\`\`\`css
.nav {
  display: flex;
  justify-content: space-between; /* main axis (row by default) */
  align-items: center;            /* cross axis */
  gap: 1rem;
  flex-wrap: wrap;                /* allow items to wrap on narrow screens */
}
.nav .search { flex: 1; }         /* take up the remaining space */
\`\`\`

\`flex: 1\` is shorthand for \`flex-grow: 1; flex-shrink: 1; flex-basis: 0%\`, which shares free space between items.

### Grid: two dimensions
Use grid when you care about **rows and columns** together:

\`\`\`css
.cards {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(220px, 100%), 1fr));
  gap: 1.5rem;
}
\`\`\`

This creates as many columns at least 220px wide as fit, and stretches them to fill the row. The \`min(220px, 100%)\` stops a single column overflowing a very narrow screen.

### Page layout with grid areas

\`\`\`css
.page {
  display: grid;
  grid-template-columns: 220px 1fr;
  grid-template-areas:
    "header header"
    "sidebar main"
    "footer footer";
  min-height: 100vh;
}
.page > header { grid-area: header; }
.page > nav    { grid-area: sidebar; }
.page > main   { grid-area: main; }
.page > footer { grid-area: footer; }
\`\`\`

Visual order should match source order. Rearranging items with \`order\` or grid placement confuses keyboard and screen reader users, who follow the HTML order.

### Positioning, briefly
\`position: sticky; top: 0\` keeps a header visible while scrolling. \`position: absolute\` places an element relative to its nearest positioned ancestor, which is why you often see \`position: relative\` on a parent. Use these for overlays and badges, not for whole-page layout.

### Common mistakes
- Using margins on every child for spacing instead of \`gap\`.
- Fixed widths like \`width: 1200px\` that cause horizontal scrolling on phones. Use \`max-width\` instead.
- Forgetting that \`justify-content\` follows the main axis, which flips when \`flex-direction: column\`.
- Fighting collapsing margins instead of using \`gap\` or padding on the parent.
- Reordering content visually so it no longer matches the reading and tab order.`,
      practice: [
        { title: 'Flexbox nav bar', kind: 'exercise', prompt: 'Build a header with a logo on the left, a search box that grows to fill the middle (flex: 1) and three links on the right using one flex container. Then switch it to flex-direction: column below 500px wide.' },
        { title: 'Card grid', kind: 'exercise', prompt: 'Render 9 cards with grid and repeat(auto-fill, minmax(min(220px, 100%), 1fr)). Resize the window from 320px to 1400px and confirm there is never horizontal scroll.' },
        { title: 'Holy grail layout', kind: 'exercise', prompt: 'Build a page with a header, sidebar, main content and footer using grid-template-areas. Make the footer stay at the bottom even when the main content is short.' },
      ],
      resources: [
        { title: 'Learn CSS: Box Model', url: 'https://web.dev/learn/css/box-model', source: 'web.dev (Google)', kind: 'course' },
        { title: 'Basic concepts of flexbox', url: 'https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Flexible_box_layout/Basic_concepts', source: 'MDN Web Docs', kind: 'docs' },
        { title: 'Basic concepts of grid layout', url: 'https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Grid_layout/Basic_concepts', source: 'MDN Web Docs', kind: 'docs' },
      ],
      quiz: [
        {
          key: 'q1',
          type: 'single',
          title: 'box-sizing',
          prompt: 'With `box-sizing: border-box`, an element has `width: 200px; padding: 20px; border: 5px solid`. How wide is the rendered box?',
          options: [
            { id: 'a', text: '200px' },
            { id: 'b', text: '240px' },
            { id: 'c', text: '250px' },
          ],
          correct: ['a'],
          explanation: 'border-box includes padding and border inside the declared width, so the box is 200px wide. With content-box it would be 250px.',
          difficulty: 'easy',
        },
        {
          key: 'q2',
          type: 'single',
          title: 'Flex or grid',
          prompt: 'You need a photo gallery laid out in rows and columns that line up. Which is the better fit?',
          options: [
            { id: 'a', text: 'Flexbox' },
            { id: 'b', text: 'Grid' },
            { id: 'c', text: 'Floats' },
          ],
          correct: ['b'],
          explanation: 'Grid controls two dimensions at once, so rows and columns align. Flexbox handles one axis at a time.',
          difficulty: 'easy',
        },
        {
          key: 'q3',
          type: 'fill_blank',
          title: 'Spacing between items',
          prompt: 'Which property adds space between flex or grid items without adding space around the outside edges? `____: 1rem;`',
          accepted: [['gap']],
          explanation: '`gap` (also `row-gap` and `column-gap`) spaces items inside flex and grid containers without margin hacks.',
          difficulty: 'easy',
        },
        {
          key: 'q4',
          type: 'matching',
          title: 'Flexbox properties',
          prompt: 'Match each flexbox property with what it controls.',
          pairs: {
            left: [
              { id: 'l1', text: '`justify-content`' },
              { id: 'l2', text: '`align-items`' },
              { id: 'l3', text: '`flex-wrap`' },
              { id: 'l4', text: '`flex: 1`' },
            ],
            right: [
              { id: 'r1', text: 'Alignment along the cross axis' },
              { id: 'r2', text: 'Distribution along the main axis' },
              { id: 'r3', text: 'Whether items may move onto new lines' },
              { id: 'r4', text: 'Letting an item grow to share free space' },
            ],
          },
          matches: { l1: 'r2', l2: 'r1', l3: 'r3', l4: 'r4' },
          explanation: 'justify-content works on the main axis, align-items on the cross axis, flex-wrap allows wrapping and flex: 1 lets an item grow.',
          difficulty: 'medium',
        },
        {
          key: 'q5',
          type: 'true_false',
          title: 'Visual reordering',
          prompt: 'Using the CSS `order` property to move the main content before the navigation also changes the keyboard tab order.',
          options: [
            { id: 'true', text: 'True' },
            { id: 'false', text: 'False' },
          ],
          correct: ['false'],
          explanation: 'Tab order and screen reader order follow the HTML source, not the visual order. Change the HTML if the order matters.',
          difficulty: 'medium',
        },
      ],
    },
    {
      slug: 'responsive-design',
      title: 'Responsive design',
      module: 'Layout',
      skill: 'html-css',
      minutes: 50,
      objectives: [
        'Add the viewport meta tag and explain what it does',
        'Write mobile-first CSS with min-width media queries and component-level container queries',
        'Use relative units, fluid type with clamp() and responsive images',
        'Respect user preferences such as reduced motion and test layouts with device emulation',
      ],
      body: `A responsive page adapts to any screen width, zoom level and input method, instead of shipping separate mobile and desktop sites.

### 1. The viewport tag
Without it, phones lay out the page at a desktop-like width and shrink it down:

\`\`\`html
<meta name="viewport" content="width=device-width, initial-scale=1">
\`\`\`

Never add \`maximum-scale=1\` or \`user-scalable=no\`; people with low vision rely on pinch zoom.

### 2. Mobile first
Write the base styles for small screens, then add enhancements as space grows:

\`\`\`css
.layout { display: grid; gap: 1rem; }            /* one column on phones */

@media (min-width: 48rem) {                      /* about 768px at default font size */
  .layout { grid-template-columns: 15rem 1fr; }  /* sidebar on tablets and up */
}

@media (min-width: 75rem) {
  .layout { grid-template-columns: 15rem 1fr 18rem; }
}
\`\`\`

Mobile-first CSS tends to be simpler because small screens get the least complex layout. Using \`rem\` in breakpoints means layouts also adapt when someone increases their browser font size.

### 3. Fluid units and type

\`\`\`css
html { font-size: 100%; }                         /* respect the user's setting */
h1 { font-size: clamp(1.75rem, 1rem + 3vw, 3rem); }
.container { width: min(100% - 2rem, 70rem); margin-inline: auto; }
\`\`\`

- \`rem\` is relative to the root font size, \`em\` to the current element's font size.
- \`%\`, \`vw\` and \`vh\` are relative to the container or viewport.
- \`clamp(min, preferred, max)\` grows smoothly between two limits. Including a \`rem\` term keeps text zoomable.

### 4. Responsive images

\`\`\`html
<img src="hero-800.jpg"
     srcset="hero-400.jpg 400w, hero-800.jpg 800w, hero-1600.jpg 1600w"
     sizes="(min-width: 48rem) 50vw, 100vw"
     width="800" height="450" loading="lazy"
     alt="Students working together at a long table">
\`\`\`

The browser picks the smallest file that looks sharp. \`width\` and \`height\` reserve space so the page does not jump while loading, and \`loading="lazy"\` defers off-screen images (do not lazy-load the main hero image). Add \`img { max-width: 100%; height: auto; }\` so images never overflow.

### 5. Container queries
Media queries ask about the viewport. **Container queries** ask about the space a component actually has, so the same card works in a sidebar and in a wide main column:

\`\`\`css
.card-wrapper { container-type: inline-size; }
@container (min-width: 30rem) {
  .card { display: grid; grid-template-columns: 10rem 1fr; }
}
\`\`\`

### 6. User preferences

\`\`\`css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation-duration: 0.01ms !important; transition-duration: 0.01ms !important; }
}
\`\`\`

### 7. Pick breakpoints from content
Resize your page in dev tools device mode and add a breakpoint where the layout starts to look wrong, rather than targeting specific phone models. Test at 320px wide and at 200% browser zoom.

### Common mistakes
- Forgetting the viewport meta tag, then wondering why media queries never fire on phones.
- Setting fixed \`height\` on text containers, which overflow when text wraps on narrow screens.
- Tiny tap targets. WCAG 2.2 level AA asks for at least 24 by 24 CSS pixels in most cases, and around 44 by 44 is more comfortable on touch screens.
- Disabling zoom in the viewport tag.
- Hiding important content on mobile instead of reorganising it.`,
      practice: [
        { title: 'Mobile-first landing page', kind: 'exercise', prompt: 'Build a landing page with a hero, three feature cards and a footer. Start with a single column, then add one min-width breakpoint in rem that places the cards in a row. Use clamp() for the hero heading.' },
        { title: 'Container query card', kind: 'exercise', prompt: 'Build a product card that stacks vertically when its container is narrow and switches to an image-left layout when the container is wider than 30rem. Place the same card in a narrow sidebar and a wide main column to prove it adapts.' },
        { title: 'Breakpoint audit', kind: 'exercise', prompt: 'Open any site you built earlier in dev tools device mode. Check 320px width and 200% zoom. Note every place where something overflows or looks cramped and fix it with relative units or a breakpoint.' },
      ],
      resources: [
        { title: 'Learn Responsive Design', url: 'https://web.dev/learn/design', source: 'web.dev (Google)', kind: 'course' },
        { title: 'Using media queries', url: 'https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Media_queries/Using', source: 'MDN Web Docs', kind: 'docs' },
        { title: 'Learn Responsive Design: Responsive images', url: 'https://web.dev/learn/design/responsive-images', source: 'web.dev (Google)', kind: 'course' },
      ],
      quiz: [
        {
          key: 'q1',
          type: 'single',
          title: 'Mobile first',
          prompt: 'In mobile-first CSS, which media query feature do you mostly use?',
          options: [
            { id: 'a', text: '`min-width`' },
            { id: 'b', text: '`max-width`' },
            { id: 'c', text: '`orientation` only' },
          ],
          correct: ['a'],
          explanation: 'Base styles target small screens; `min-width` queries layer on changes as the viewport grows.',
          difficulty: 'easy',
        },
        {
          key: 'q2',
          type: 'true_false',
          title: 'Viewport tag',
          prompt: 'Without the viewport meta tag, many phones lay out the page at a desktop-like width and scale it down.',
          options: [
            { id: 'true', text: 'True' },
            { id: 'false', text: 'False' },
          ],
          correct: ['true'],
          explanation: 'The tag tells mobile browsers to use the device width as the layout width.',
          difficulty: 'easy',
        },
        {
          key: 'q3',
          type: 'multi',
          title: 'Zoom-friendly sizing',
          prompt: 'Which choices help text and layout respect a user who has increased their browser font size? Select all that apply.',
          options: [
            { id: 'a', text: 'Font sizes in `rem`' },
            { id: 'b', text: 'Breakpoints in `rem` or `em`' },
            { id: 'c', text: '`font-size: 3vw` with no other term' },
            { id: 'd', text: '`user-scalable=no` in the viewport tag' },
          ],
          correct: ['a', 'b'],
          explanation: 'rem and em scale with the user setting. Pure vw text ignores font settings and does not grow with zoom, and disabling zoom blocks people who need it.',
          difficulty: 'medium',
        },
        {
          key: 'q4',
          type: 'single',
          title: 'Container queries',
          prompt: 'A card appears both in a narrow sidebar and a wide main area on the same desktop page. Which tool lets the card adapt to each spot?',
          options: [
            { id: 'a', text: 'A media query on viewport width' },
            { id: 'b', text: 'A container query on its parent with `container-type: inline-size`' },
            { id: 'c', text: 'The viewport meta tag' },
          ],
          correct: ['b'],
          explanation: 'The viewport is the same for both cards, so media queries cannot tell them apart. Container queries respond to the space the component has.',
          difficulty: 'medium',
        },
        {
          key: 'q5',
          type: 'fill_blank',
          title: 'Images that shrink',
          prompt: 'Complete the rule that stops images overflowing their container: `img { ____: 100%; height: auto; }`',
          accepted: [['max-width']],
          explanation: '`max-width: 100%` lets images shrink to fit but never stretch beyond their natural size. `height: auto` keeps the aspect ratio.',
          difficulty: 'easy',
        },
      ],
    },
    {
      slug: 'accessibility-basics',
      title: 'Accessibility basics',
      module: 'Quality',
      skill: 'web-accessibility',
      minutes: 50,
      objectives: [
        'Explain the four WCAG principles (perceivable, operable, understandable, robust)',
        'Make every interactive element usable with a keyboard and a visible focus style',
        'Check colour contrast, provide text alternatives and write accessible error messages',
        'Know when ARIA helps and when native HTML is better',
      ],
      body: `Accessibility (often shortened to a11y) means people with disabilities can perceive, understand, navigate and interact with your site. That includes people who are blind or have low vision, are Deaf or hard of hearing, have motor or cognitive disabilities, or have a temporary injury. It also helps everyone: captions in noisy places, keyboard shortcuts, clear language and good contrast in bright sunlight. In many countries accessibility is also a legal requirement.

### The WCAG principles: POUR
The Web Content Accessibility Guidelines (WCAG) organise their success criteria under four principles. Level **AA** is the usual target.
- **Perceivable:** text alternatives for images, captions for video, enough contrast (4.5:1 for normal text, 3:1 for large text and for UI component boundaries and focus indicators).
- **Operable:** everything works with a keyboard, there are no keyboard traps, focus is visible and users have enough time.
- **Understandable:** clear labels, predictable behaviour, helpful error messages and a declared page language.
- **Robust:** valid, semantic markup that browsers and assistive technology can interpret.

### Keyboard support
Put your mouse away and press **Tab** through the page. Can you reach every link and control? Can you see where focus is? Can you activate buttons with Enter and Space and close dialogs with Escape?

\`\`\`css
/* Never remove focus outlines without a replacement */
:focus-visible {
  outline: 3px solid #1a5fd1;
  outline-offset: 2px;
}
\`\`\`

Add a skip link as the first focusable element so keyboard users can bypass repeated navigation:

\`\`\`html
<a class="skip-link" href="#main">Skip to main content</a>
...
<main id="main" tabindex="-1">...</main>
\`\`\`

Avoid positive \`tabindex\` values; they create a confusing custom order. \`tabindex="0"\` makes a custom element focusable in source order and \`tabindex="-1"\` allows focus from script only.

### Accessible errors

\`\`\`html
<label for="pw">Password</label>
<input id="pw" type="password" aria-describedby="pw-hint pw-error" aria-invalid="true">
<p id="pw-hint">At least 12 characters.</p>
<p id="pw-error">Password is too short. Add 4 more characters.</p>
\`\`\`

The error is in text (not only red), says how to fix the problem, and is linked to the input with \`aria-describedby\` so it is announced when the field is focused.

### ARIA: the first rule
Use native HTML first. \`<button>\`, \`<a href>\`, \`<input>\` and \`<dialog>\` already come with roles, focus and keyboard behaviour. ARIA only changes what is **announced**; it adds no behaviour.

\`\`\`html
<!-- An icon-only button needs an accessible name -->
<button type="button" aria-label="Close dialog">&times;</button>

<!-- Announce status updates without moving focus -->
<p role="status">3 results found</p>
\`\`\`

### Common mistakes
- \`outline: none\` with no replacement focus style.
- Placeholder text used instead of a label; it disappears while typing and often has low contrast.
- Conveying meaning by colour alone, such as "fields in red are required".
- Adding \`role="button"\` to a \`<div>\` instead of using \`<button>\`.
- Auto-playing media or carousels with no way to pause them.`,
      practice: [
        { title: 'Keyboard-only audit', kind: 'exercise', prompt: 'Navigate a page you built using only the keyboard. List every element you could not reach, could not see focus on, or could not activate, then fix each one. Add a skip link.' },
        { title: 'Contrast and alt text pass', kind: 'exercise', prompt: 'Check text colours with the contrast tool in your browser dev tools and fix anything below 4.5:1 (3:1 for large text). Write alt text for every image, or alt="" for decorative ones.' },
        { title: 'Accessible error messages', kind: 'exercise', prompt: 'Add validation to a sign-up form so each invalid field shows a text error that explains the fix, is linked with aria-describedby, and sets aria-invalid. Move focus to the first invalid field on submit.' },
      ],
      resources: [
        { title: 'Introduction to Web Accessibility', url: 'https://www.w3.org/WAI/fundamentals/accessibility-intro/', source: 'W3C WAI', kind: 'article' },
        { title: 'How to Meet WCAG (Quick Reference)', url: 'https://www.w3.org/WAI/WCAG22/quickref/', source: 'W3C WAI', kind: 'docs' },
        { title: 'Learn Accessibility', url: 'https://web.dev/learn/accessibility', source: 'web.dev (Google)', kind: 'course' },
      ],
      quiz: [
        {
          key: 'q1',
          type: 'single',
          title: 'ARIA vs native',
          prompt: 'What does adding `role="button"` to a `<div>` give you?',
          options: [
            { id: 'a', text: 'Keyboard focus and Enter/Space activation automatically' },
            { id: 'b', text: 'Only the announced role; you must add focus and key handling yourself' },
            { id: 'c', text: 'Nothing at all' },
          ],
          correct: ['b'],
          explanation: 'ARIA changes semantics only. A native `<button>` gives role, focus and keyboard behaviour for free.',
          difficulty: 'medium',
        },
        {
          key: 'q2',
          type: 'single',
          title: 'Contrast ratio',
          prompt: 'What minimum contrast ratio does WCAG level AA require for normal-size body text?',
          options: [
            { id: 'a', text: '3:1' },
            { id: 'b', text: '4.5:1' },
            { id: 'c', text: '7:1' },
          ],
          correct: ['b'],
          explanation: 'AA requires 4.5:1 for normal text and 3:1 for large text. 7:1 is the AAA level.',
          difficulty: 'easy',
        },
        {
          key: 'q3',
          type: 'matching',
          title: 'POUR principles',
          prompt: 'Match each practice with the WCAG principle it mainly supports.',
          pairs: {
            left: [
              { id: 'l1', text: 'Captions on a video' },
              { id: 'l2', text: 'All controls work with a keyboard' },
              { id: 'l3', text: 'Error messages explain how to fix the problem' },
              { id: 'l4', text: 'Valid markup with correct roles and names' },
            ],
            right: [
              { id: 'r1', text: 'Operable' },
              { id: 'r2', text: 'Robust' },
              { id: 'r3', text: 'Perceivable' },
              { id: 'r4', text: 'Understandable' },
            ],
          },
          matches: { l1: 'r3', l2: 'r1', l3: 'r4', l4: 'r2' },
          explanation: 'Captions make audio perceivable, keyboard support makes the UI operable, clear errors make it understandable and valid markup makes it robust for assistive technology.',
          difficulty: 'medium',
        },
        {
          key: 'q4',
          type: 'multi',
          title: 'Accessible errors',
          prompt: 'Which make a form error message accessible? Select all that apply.',
          options: [
            { id: 'a', text: 'The message is written in text, not only shown with a red border' },
            { id: 'b', text: 'It is linked to the field with `aria-describedby`' },
            { id: 'c', text: 'It explains how to fix the problem' },
            { id: 'd', text: 'It appears only as a tooltip on mouse hover' },
          ],
          correct: ['a', 'b', 'c'],
          explanation: 'Text, a programmatic link to the field and a clear fix make errors perceivable and understandable. Hover-only tooltips are invisible to keyboard and touch users.',
          difficulty: 'medium',
        },
        {
          key: 'q5',
          type: 'fill_blank',
          title: 'Icon button name',
          prompt: 'Complete the attribute that gives an icon-only button an accessible name: `<button ____="Search">` followed by an SVG icon.',
          accepted: [['aria-label']],
          explanation: '`aria-label` provides a name when there is no visible text. Visually hidden text inside the button also works.',
          difficulty: 'easy',
        },
      ],
    },
    {
      slug: 'accessibility-testing',
      title: 'Accessibility testing',
      module: 'Quality',
      skill: 'web-accessibility',
      minutes: 50,
      objectives: [
        'Combine automated scans, manual checks and assistive technology testing',
        'Run axe or Lighthouse scans in the browser and in automated tests',
        'Perform keyboard, zoom, reflow and screen reader smoke tests',
        'Record findings against WCAG success criteria and prioritise fixes',
      ],
      body: `Knowing the rules is half the job. The other half is checking that your page actually works for people using keyboards, screen readers, magnifiers and voice control. No single technique finds everything, so use three layers.

### Layer 1: automated scans
Automated tools quickly find issues that can be detected from the code: missing alt attributes, missing form labels, low contrast, invalid ARIA, duplicate ids and empty buttons.

- **Lighthouse** (built into Chrome DevTools) gives an accessibility score and a list of failed audits.
- **axe DevTools** and similar browser extensions show each issue, the affected element and a fix suggestion.
- **axe-core** can run inside your test suite so regressions fail the build:

\`\`\`js
// tests/a11y.spec.js (Playwright with @axe-core/playwright)
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('home page has no detectable WCAG A or AA violations', async ({ page }) => {
  await page.goto('/');
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa'])
    .analyze();
  expect(results.violations).toEqual([]);
});
\`\`\`

Automated tools can only detect a portion of WCAG failures. A clean scan does not mean a page is accessible: a tool can confirm an image has alt text, but not that the text is accurate.

### Layer 2: manual checks
Work through a short checklist on every new page or component:
1. **Keyboard:** Tab through everything. Focus order is logical, focus is always visible, nothing traps focus, and dialogs return focus to the control that opened them.
2. **Zoom and reflow:** zoom to 200% and check text is still readable. At 320 CSS pixels wide (or 400% zoom on a 1280px screen) content should reflow into one column without horizontal scrolling.
3. **Contrast:** check text, icons, focus rings and input borders, including hover and disabled states.
4. **Headings and landmarks:** open the dev tools **Accessibility** panel or the full accessibility tree and confirm the outline makes sense.
5. **Content:** link text, button labels and error messages are clear on their own.

### Layer 3: assistive technology
Do a smoke test with a real screen reader. Free options include **NVDA** and **Narrator** on Windows, **VoiceOver** built into macOS and iOS, and **TalkBack** on Android. Learn a few commands (next heading, next landmark, next form field), then complete your page's main task with your eyes closed or the screen turned off. Listen for unlabeled buttons, confusing reading order and status messages that are never announced.

### Test components with roles
Component tests that query by role double as accessibility checks:

\`\`\`jsx
render(<SignupForm />);
await user.click(screen.getByRole('button', { name: /sign up/i }));
expect(screen.getByRole('textbox', { name: /email/i })).toHaveAccessibleDescription(/enter a valid email/i);
\`\`\`

If \`getByRole\` cannot find your control by its name, a screen reader user probably cannot either.

### Report and prioritise
Record each finding with the page, the element, the WCAG success criterion (for example *1.4.3 Contrast (Minimum)*), who it affects and a suggested fix. Fix blockers first: anything that stops someone completing a core task, such as an unlabeled checkout button or a keyboard trap.

### Common mistakes
- Treating a 100 Lighthouse score as proof of accessibility.
- Testing only with a mouse on a large monitor.
- Adding ARIA to silence a tool instead of fixing the underlying markup.
- Running a screen reader without learning basic commands, then misreading normal behaviour as a bug.
- Leaving accessibility testing until the end, when fixes are expensive.`,
      practice: [
        { title: 'Three-layer audit', kind: 'exercise', prompt: 'Audit one page you built: run Lighthouse and axe DevTools, then do the five manual checks, then complete the main task with a screen reader. Write a table of findings with the WCAG success criterion, severity and fix for each, and fix the top three.' },
        { title: 'Accessibility test in CI', kind: 'exercise', prompt: 'Add an automated axe-core check (for example with @axe-core/playwright) for your two most important pages. Introduce a deliberate bug, such as removing a label, and confirm the test fails.' },
      ],
      resources: [
        { title: 'Evaluating Web Accessibility Overview', url: 'https://www.w3.org/WAI/test-evaluate/', source: 'W3C WAI', kind: 'article' },
        { title: 'Easy Checks: A First Review of Web Accessibility', url: 'https://www.w3.org/WAI/test-evaluate/preliminary/', source: 'W3C WAI', kind: 'article' },
        { title: 'Playwright: Accessibility testing', url: 'https://playwright.dev/docs/accessibility-testing', source: 'Playwright', kind: 'docs' },
      ],
      quiz: [
        {
          key: 'q1',
          type: 'true_false',
          title: 'Automated coverage',
          prompt: 'If axe reports zero violations, the page fully meets WCAG AA.',
          options: [
            { id: 'true', text: 'True' },
            { id: 'false', text: 'False' },
          ],
          correct: ['false'],
          explanation: 'Automated tools detect only a portion of issues. Things like accurate alt text, logical focus order and meaningful labels need human judgement.',
          difficulty: 'easy',
        },
        {
          key: 'q2',
          type: 'multi',
          title: 'Manual checks',
          prompt: 'Which issues usually need a manual check to find? Select all that apply.',
          options: [
            { id: 'a', text: 'Alt text that exists but describes the wrong thing' },
            { id: 'b', text: 'A focus order that jumps around the page illogically' },
            { id: 'c', text: 'An `<img>` with no alt attribute at all' },
            { id: 'd', text: 'A dialog that does not return focus when closed' },
          ],
          correct: ['a', 'b', 'd'],
          explanation: 'A missing alt attribute is easy to detect automatically. Accuracy of content, logical order and focus management need a person to judge.',
          difficulty: 'medium',
        },
        {
          key: 'q3',
          type: 'single',
          title: 'Reflow width',
          prompt: 'WCAG reflow testing checks that content works without horizontal scrolling at what width?',
          options: [
            { id: 'a', text: '320 CSS pixels' },
            { id: 'b', text: '768 CSS pixels' },
            { id: 'c', text: '1024 CSS pixels' },
          ],
          correct: ['a'],
          explanation: 'Success criterion 1.4.10 Reflow uses 320 CSS pixels wide, which equals 400% zoom on a 1280px wide screen.',
          difficulty: 'medium',
        },
        {
          key: 'q4',
          type: 'matching',
          title: 'Testing tools',
          prompt: 'Match each tool with how it is used.',
          pairs: {
            left: [
              { id: 'l1', text: 'Lighthouse' },
              { id: 'l2', text: 'axe-core in Playwright' },
              { id: 'l3', text: 'NVDA or VoiceOver' },
              { id: 'l4', text: 'Dev tools Accessibility panel' },
            ],
            right: [
              { id: 'r1', text: 'Screen reader for hearing what users hear' },
              { id: 'r2', text: 'Automated checks that fail a test run on regressions' },
              { id: 'r3', text: 'Inspecting the computed role and accessible name of an element' },
              { id: 'r4', text: 'A browser audit with a score and failed checks' },
            ],
          },
          matches: { l1: 'r4', l2: 'r2', l3: 'r1', l4: 'r3' },
          explanation: 'Each tool covers a different layer: quick audits, automated regression tests, assistive technology testing and inspection of the accessibility tree.',
          difficulty: 'medium',
        },
      ],
    },
    {
      slug: 'dom-and-events',
      title: 'The DOM and events',
      module: 'Interactivity',
      skill: 'dom-browser',
      minutes: 55,
      objectives: [
        'Select elements with querySelector and update text, attributes, data attributes and classes',
        'Create elements safely without injecting untrusted HTML',
        'Attach and remove event listeners and use the event object, including target vs currentTarget',
        'Use event delegation for lists that change',
      ],
      body: `The **DOM** (Document Object Model) is the browser's live tree of objects built from your HTML. JavaScript reads and changes this tree, and the page updates.

### Load scripts at the right time

\`\`\`html
<script type="module" src="app.js"></script>
\`\`\`

Module scripts are deferred automatically: they download in parallel and run after the HTML is parsed, so the elements you select already exist. For classic scripts, add \`defer\`.

### Select and change

\`\`\`js
const title = document.querySelector('h1');             // first match or null
const cards = document.querySelectorAll('.card');        // static NodeList
title.textContent = 'Updated!';
cards.forEach((card) => card.classList.toggle('is-compact'));

const btn = document.querySelector('#save');
btn.disabled = true;                                      // properties
btn.setAttribute('aria-busy', 'true');                    // attributes
console.log(btn.dataset.userId);                          // reads data-user-id="42"
\`\`\`

Prefer toggling classes over setting inline styles, so the look stays in CSS.

### Create elements safely

\`\`\`js
function renderComment(comment) {
  const li = document.createElement('li');
  const author = document.createElement('strong');
  author.textContent = comment.author;       // safe: treated as text
  const text = document.createElement('p');
  text.textContent = comment.body;
  li.append(author, text);
  return li;
}
document.querySelector('#comments').append(...comments.map(renderComment));
\`\`\`

**Security note:** assigning untrusted data to \`innerHTML\` (or \`outerHTML\`, or \`insertAdjacentHTML\`) can run attacker-supplied code, for example \`<img src=x onerror="stealCookies()">\`. This is **cross-site scripting (XSS)**. Use \`textContent\` and \`createElement\` for anything that came from users, URLs or APIs.

### Events and the event object

\`\`\`js
const form = document.querySelector('#todo-form');
form.addEventListener('submit', (event) => {
  event.preventDefault();               // stop the full page reload
  const input = form.elements.namedItem('title');
  const title = input.value.trim();
  if (!title) return;
  addTodo(title);
  form.reset();
  input.focus();
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeMenu();
});
\`\`\`

- \`event.target\` is the element where the event started (perhaps an icon inside a button).
- \`event.currentTarget\` is the element the listener is attached to.

### Event delegation
Most events **bubble** up from the target to its ancestors. One listener on a parent can handle clicks on children, including children added later:

\`\`\`js
const list = document.querySelector('#list');
list.addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-action]');
  if (!btn || !list.contains(btn)) return;
  const item = btn.closest('li');
  if (btn.dataset.action === 'delete') item.remove();
  if (btn.dataset.action === 'toggle') item.classList.toggle('done');
});
\`\`\`

### Removing listeners
Keep a reference to the handler for \`removeEventListener\`, or pass an \`AbortController\` signal and abort it to remove several listeners at once:

\`\`\`js
const controller = new AbortController();
window.addEventListener('resize', onResize, { signal: controller.signal });
window.addEventListener('scroll', onScroll, { signal: controller.signal, passive: true });
controller.abort();   // removes both listeners
\`\`\`

### Common mistakes
- Running a script before the elements exist. Use \`type="module"\` or \`defer\`.
- Forgetting \`preventDefault()\` on form submit, so the page reloads and your state is lost.
- Adding a new listener to every list item instead of delegating.
- Using \`innerHTML\` with user data.
- Using \`event.target\` when you meant \`event.currentTarget\`, which breaks as soon as the button contains an icon.`,
      practice: [
        { title: 'To-do list', kind: 'exercise', prompt: 'Build a to-do list: a form adds items, each item has a Delete button and a toggle to mark it done. Use one delegated listener on the list for both actions, render text with textContent, and keep the list in an array that you re-render from.' },
        { title: 'Character counter', kind: 'exercise', prompt: 'Show a live "120 characters left" counter under a textarea using the input event. Turn the counter red (via a CSS class) when fewer than 10 remain, and announce it politely with role="status".' },
        { title: 'XSS check', kind: 'exercise', prompt: 'In a scratch page, render a comment with innerHTML and try the input <img src=x onerror="alert(1)">. Observe the alert, then fix the code with textContent and createElement and confirm the input shows as plain text.' },
      ],
      resources: [
        { title: 'Document Object Model (DOM)', url: 'https://developer.mozilla.org/en-US/docs/Web/API/Document_Object_Model', source: 'MDN Web Docs', kind: 'docs' },
        { title: 'EventTarget: addEventListener() method', url: 'https://developer.mozilla.org/en-US/docs/Web/API/EventTarget/addEventListener', source: 'MDN Web Docs', kind: 'docs' },
        { title: 'Browser: Document, Events, Interfaces', url: 'https://javascript.info/ui', source: 'javascript.info', kind: 'book' },
      ],
      quiz: [
        {
          key: 'q1',
          type: 'single',
          title: 'Safe text',
          prompt: 'Which property should you use to display text that came from a user?',
          options: [
            { id: 'a', text: '`innerHTML`' },
            { id: 'b', text: '`textContent`' },
            { id: 'c', text: '`outerHTML`' },
          ],
          correct: ['b'],
          explanation: '`textContent` treats the value as plain text. `innerHTML` parses it as HTML, which enables XSS.',
          difficulty: 'easy',
        },
        {
          key: 'q2',
          type: 'true_false',
          title: 'Delegation',
          prompt: 'Event delegation works because most events bubble up from the target element to its ancestors.',
          options: [
            { id: 'true', text: 'True' },
            { id: 'false', text: 'False' },
          ],
          correct: ['true'],
          explanation: 'A listener on a parent sees bubbling events from its descendants, including elements added later.',
          difficulty: 'easy',
        },
        {
          key: 'q3',
          type: 'single',
          title: 'target vs currentTarget',
          prompt: 'A listener is attached to a `<button>` that contains an `<svg>` icon. The user clicks the icon. What is `event.currentTarget`?',
          options: [
            { id: 'a', text: 'The `<svg>` element' },
            { id: 'b', text: 'The `<button>` element' },
            { id: 'c', text: 'The `document`' },
          ],
          correct: ['b'],
          explanation: '`currentTarget` is the element the listener is attached to. `target` would be the svg (or a shape inside it) where the click started.',
          difficulty: 'medium',
        },
        {
          key: 'q4',
          type: 'fill_blank',
          title: 'Stop the reload',
          prompt: 'Inside a submit handler, which method call stops the browser from reloading the page? `event.____()`',
          accepted: [['preventDefault']],
          explanation: '`preventDefault()` cancels the default action, here the full-page form submission.',
          difficulty: 'easy',
        },
        {
          key: 'q5',
          type: 'multi',
          title: 'XSS sinks',
          prompt: 'Which are dangerous places to put untrusted user input? Select all that apply.',
          options: [
            { id: 'a', text: '`element.innerHTML = input`' },
            { id: 'b', text: '`element.insertAdjacentHTML("beforeend", input)`' },
            { id: 'c', text: '`element.textContent = input`' },
            { id: 'd', text: '`element.outerHTML = input`' },
          ],
          correct: ['a', 'b', 'd'],
          explanation: 'Anything that parses a string as HTML can run injected scripts. `textContent` never parses HTML.',
          difficulty: 'medium',
        },
      ],
    },
    {
      slug: 'fetch-and-json',
      title: 'Fetching data and working with JSON',
      module: 'Interactivity',
      skill: 'dom-browser',
      minutes: 55,
      milestone: true,
      completionCriteria: 'Build a page that loads JSON from a public API, renders it safely, and shows loading, empty, error and success states, with a search that cancels outdated requests.',
      objectives: [
        'Explain what JSON is and convert with JSON.parse and JSON.stringify',
        'Load and send data with fetch and async/await, building query strings safely',
        'Check response.ok and handle network, HTTP and parsing errors',
        'Cancel outdated requests with AbortController and render loading, empty, error and success states',
      ],
      body: `**JSON** (JavaScript Object Notation) is a text format for data: objects, arrays, strings, numbers, booleans and null. It is the common language of web APIs.

\`\`\`js
const text = '{"name":"Asha","skills":["html","css"],"active":true}';
const user = JSON.parse(text);          // text -> object
user.skills.length;                     // 2
JSON.stringify({ ok: true });           // object -> '{"ok":true}'
JSON.stringify(user, null, 2);          // pretty-printed with 2-space indents
\`\`\`

JSON keys and strings must use double quotes, and JSON has no comments, trailing commas, \`undefined\`, functions or dates (dates travel as ISO strings such as \`"2026-03-01T09:30:00Z"\`). \`JSON.parse\` throws a \`SyntaxError\` on invalid input.

### fetch with async/await

\`\`\`js
const status = document.querySelector('#status');
const list = document.querySelector('#users');

async function loadUsers() {
  status.textContent = 'Loading...';
  list.replaceChildren();
  try {
    const res = await fetch('https://jsonplaceholder.typicode.com/users');
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const users = await res.json();
    if (users.length === 0) {
      status.textContent = 'No users found.';
      return;
    }
    status.textContent = '';
    list.append(...users.map(renderUser));     // build nodes with textContent
  } catch (err) {
    status.textContent = 'Could not load users. Please try again.';
    console.error(err);
  }
}
\`\`\`

### Why check res.ok?
\`fetch\` only rejects on **network** failure (offline, DNS error, CORS blocked). A 404 or 500 response still resolves, so you must check \`res.ok\` (status 200 to 299) yourself. \`res.json()\` can also throw if the server returns HTML, such as an error page, instead of JSON.

### Query strings and sending JSON

\`\`\`js
const params = new URLSearchParams({ q: 'café & bar', page: '2' });
const res = await fetch('/api/search?' + params);   // values are encoded for you

await fetch('/api/todos', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ title: 'Learn fetch' }),
});
\`\`\`

Never build URLs by gluing raw user input into strings; characters like \`&\` and \`#\` change the meaning.

### Cancelling outdated requests
When a user types in a search box, an older slow response can arrive after a newer fast one and overwrite it. Abort the previous request:

\`\`\`js
let controller;
async function search(query) {
  controller?.abort();                  // cancel the previous request
  controller = new AbortController();
  try {
    const res = await fetch('/api/search?' + new URLSearchParams({ q: query }), { signal: controller.signal });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    render(await res.json());
  } catch (err) {
    if (err.name === 'AbortError') return;   // expected, ignore
    showError();
  }
}
\`\`\`

\`AbortSignal.timeout(5000)\` gives you a signal that aborts after five seconds, which is handy for timeouts.

### Design the four states
Every request has **loading**, **empty**, **error** and **success** states. Decide what each looks like before you write code, and announce changes with a \`role="status"\` region so screen reader users hear them.

**Security note:** anything in frontend code, including API keys, is visible to every visitor. Keep secret keys on a server and call your own backend instead.

### Common mistakes
- Forgetting \`await\` and logging a Promise instead of the data.
- Assuming a 404 throws an error.
- Showing a blank screen while loading or after a failure.
- Rendering API data with \`innerHTML\`. Treat third-party data as untrusted, just like user input.
- Shipping a secret API key in browser JavaScript.`,
      practice: [
        { title: 'Public API viewer', kind: 'exercise', prompt: 'Fetch a list from a free public API (for example a placeholder users API), render it as cards using textContent, and add loading, empty and error states in a role="status" region. Test the error state by changing the URL to a bad path and by going offline in dev tools.' },
        { title: 'Search with cancellation', kind: 'exercise', prompt: 'Add a search box that requests results as the user types, uses URLSearchParams to build the query, aborts the previous request with AbortController, and shows "No matches" when the result is empty. Throttle the network in dev tools to prove stale results never appear.' },
        { title: 'Word frequency', kind: 'problem', ref: 'word-frequency' },
      ],
      resources: [
        { title: 'Using the Fetch API', url: 'https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API/Using_Fetch', source: 'MDN Web Docs', kind: 'docs' },
        { title: 'JSON (JavaScript reference)', url: 'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/JSON', source: 'MDN Web Docs', kind: 'docs' },
        { title: 'AbortController', url: 'https://developer.mozilla.org/en-US/docs/Web/API/AbortController', source: 'MDN Web Docs', kind: 'docs' },
      ],
      quiz: [
        {
          key: 'q1',
          type: 'single',
          title: 'fetch and 404',
          prompt: 'What happens when `await fetch(url)` receives a 404 response?',
          options: [
            { id: 'a', text: 'The promise rejects and the catch block runs' },
            { id: 'b', text: 'The promise resolves with a Response whose `ok` is false' },
            { id: 'c', text: 'The browser retries automatically' },
          ],
          correct: ['b'],
          explanation: 'fetch rejects only on network errors. HTTP error statuses resolve normally, so check `res.ok`.',
          difficulty: 'easy',
        },
        {
          key: 'q2',
          type: 'multi',
          title: 'Valid JSON',
          prompt: 'Which of these are valid JSON? Select all that apply.',
          options: [
            { id: 'a', text: '`{"a": 1}`' },
            { id: 'b', text: "`{'a': 1}`" },
            { id: 'c', text: '`[1, 2, 3]`' },
            { id: 'd', text: '`{"a": 1,}`' },
          ],
          correct: ['a', 'c'],
          explanation: 'JSON requires double-quoted keys and strings and does not allow trailing commas.',
          difficulty: 'easy',
        },
        {
          key: 'q3',
          type: 'fill_blank',
          title: 'Object to JSON text',
          prompt: 'Which method turns a JavaScript object into a JSON string for a request body? `JSON.____(data)`',
          accepted: [['stringify']],
          explanation: '`JSON.stringify` serialises a value to JSON text. `JSON.parse` does the reverse.',
          difficulty: 'easy',
        },
        {
          key: 'q4',
          type: 'single',
          title: 'Stale responses',
          prompt: 'A search box fires a request on every keystroke and older responses sometimes overwrite newer ones. What is the cleanest fix in plain JavaScript?',
          options: [
            { id: 'a', text: 'Add a fixed one-second delay before rendering every response' },
            { id: 'b', text: 'Abort the previous request with an AbortController before starting a new one' },
            { id: 'c', text: 'Switch from fetch to XMLHttpRequest' },
          ],
          correct: ['b'],
          explanation: 'Aborting the earlier request means its response can never be rendered. Fixed delays only make the race less likely.',
          difficulty: 'medium',
        },
        {
          key: 'q5',
          type: 'true_false',
          title: 'Keys in the browser',
          prompt: 'An API key stored in a JavaScript variable in your frontend bundle is hidden from users as long as you minify the code.',
          options: [
            { id: 'true', text: 'True' },
            { id: 'false', text: 'False' },
          ],
          correct: ['false'],
          explanation: 'Everything sent to the browser can be read in dev tools or the network panel. Keep secrets on the server.',
          difficulty: 'easy',
        },
      ],
    },
  ],
};

export const frontendReact: SeedTrack = {
  slug: 'frontend-react',
  title: 'Frontend Development with React',
  category: 'web',
  summary: 'Build interactive, accessible, data-driven user interfaces with React components, hooks, routing and tests.',
  description: `**Who it's for:** learners comfortable with HTML, CSS and modern JavaScript who want to build single-page applications with React, the most widely used UI library.

**Prerequisites:** Web Foundations (or equivalent): the DOM, events, fetch and ES modules. You will need Node.js installed to run a React project created with a tool such as Vite.

**You will be able to:**
- break a UI into reusable components written in JSX, and render lists and conditional content correctly
- manage state with useState and useReducer, update it immutably and lift it to share between components
- synchronise with the network using effects without race conditions, and know when not to use an effect
- build accessible controlled forms with client validation and server error display
- choose where state should live: local, context, the URL or a server cache
- add client-side routing with layouts and protected pages, measure performance and write user-centred tests

**Milestones:** *Stateful components* (topic 2) and *A tested, routed app* (topic 7).`,
  level: 'intermediate',
  estimatedHours: 30,
  roles: ['frontend developer', 'full-stack developer', 'software engineer', 'ui engineer'],
  contentStatus: 'complete',
  prerequisites: ['web-foundations'],
  topics: [
    {
      slug: 'components-and-jsx',
      title: 'Components and JSX',
      module: 'React basics',
      skill: 'react',
      minutes: 50,
      objectives: [
        'Write pure function components that return JSX and accept props, including children',
        'Embed JavaScript expressions in JSX with curly braces and handle events',
        'Render lists with map and stable keys',
        'Render conditionally with if, && and the ternary operator without leaking values like 0',
      ],
      body: `A React **component** is a JavaScript function that returns markup. **JSX** is the HTML-like syntax that a build tool compiles into plain function calls. You build an app by composing small components into bigger ones, just as you nest HTML elements.

### A first component tree

\`\`\`jsx
function Avatar({ name, url, size = 48 }) {
  return <img className="avatar" src={url} alt={name} width={size} height={size} />;
}

function Card({ title, children }) {
  return (
    <section className="card">
      <h2>{title}</h2>
      {children}
    </section>
  );
}

export default function TeamList({ members }) {
  if (members.length === 0) return <p>No team members yet.</p>;
  return (
    <Card title={'Team (' + members.length + ')'}>
      <ul>
        {members.map((m) => (
          <li key={m.id}>
            <Avatar name={m.name} url={m.photo} />
            {m.name} {m.isLead && <strong>(lead)</strong>}
          </li>
        ))}
      </ul>
    </Card>
  );
}
\`\`\`

- Props arrive as a single object; destructuring with defaults (\`size = 48\`) keeps components readable.
- \`children\` is whatever you nest between a component's opening and closing tags, which makes wrappers like \`Card\` reusable.

### JSX rules
- Return a single root element. Wrap siblings in a fragment \`<>...</>\` when you do not want an extra \`<div>\`.
- Close every tag, including \`<img />\` and \`<input />\`.
- Use \`className\` instead of \`class\`, \`htmlFor\` instead of \`for\`, and camelCase attributes like \`onClick\` and \`tabIndex\`.
- Curly braces hold any JavaScript **expression**: \`{user.name}\`, \`{count * 2}\`, \`{formatDate(d)}\`. Statements like \`if\` and \`for\` cannot go inside braces; use them before the \`return\` or use \`map\` and ternaries.

### Events

\`\`\`jsx
function LikeButton({ onLike }) {
  return <button type="button" onClick={() => onLike()}>Like</button>;
}
\`\`\`

Pass a function (\`onClick={handleClick}\`), not the result of calling one (\`onClick={handleClick()}\`), which would run during render.

### Keys
Each item in a list needs a \`key\` that is stable and unique among its siblings, usually a database id. React uses keys to match items between renders, so the right item keeps its state when the list is sorted or filtered.

### Conditional rendering

\`\`\`jsx
{isLoading ? <Spinner /> : <Results items={items} />}
{error && <p role="alert">{error}</p>}
{items.length > 0 && <List items={items} />}   // not {items.length && ...}
\`\`\`

\`{items.length && <List />}\` renders a literal **0** when the list is empty, because \`0\` is a value React displays.

### Keep components pure
Given the same props, a component should return the same JSX and not change anything outside itself during render (no mutations of shared variables, no fetches). Side effects belong in event handlers or effects.

**Security note:** JSX escapes text in curly braces, so \`{comment.body}\` cannot inject HTML. \`dangerouslySetInnerHTML\` turns that protection off; only use it with HTML you have sanitised with a trusted library. Also validate user-supplied URLs (allow only \`http:\` and \`https:\`) before putting them in \`href\`.

### Common mistakes
- Using the array index as key for lists that can be reordered or filtered, which mixes up item state.
- Naming components in lowercase; React treats \`<card>\` as an HTML tag. Use \`<Card>\`.
- Defining a component inside another component, which recreates it on every render and resets its state.
- Writing \`onClick={save()}\`, which calls \`save\` during every render.
- Using \`&&\` with a number on the left and rendering a stray 0.`,
      practice: [
        { title: 'Profile card list', kind: 'exercise', prompt: 'Create a ProfileCard component and render a list of five people from an array, keyed by id. Show a "Hiring" badge only for people whose openToWork flag is true, and an empty state when the array is empty.' },
        { title: 'Split a page into components', kind: 'exercise', prompt: 'Take a static HTML page you built earlier and split it into Header, Main and Footer components, plus a reusable Card component that renders its children.' },
        { title: 'Spot the bugs', kind: 'exercise', prompt: 'Write a component that renders a list with index keys, uses {count && <p>...</p>} and calls a handler during render. Observe each bug in the browser and React DevTools, then fix all three.' },
      ],
      resources: [
        { title: 'Your First Component', url: 'https://react.dev/learn/your-first-component', source: 'react.dev', kind: 'docs' },
        { title: 'Writing Markup with JSX', url: 'https://react.dev/learn/writing-markup-with-jsx', source: 'react.dev', kind: 'docs' },
        { title: 'Rendering Lists', url: 'https://react.dev/learn/rendering-lists', source: 'react.dev', kind: 'docs' },
      ],
      quiz: [
        {
          key: 'q1',
          type: 'single',
          title: 'List keys',
          prompt: 'Which is the best `key` for items in a sortable list of products?',
          options: [
            { id: 'a', text: 'The array index' },
            { id: 'b', text: 'The product id from the database' },
            { id: 'c', text: '`Math.random()`' },
          ],
          correct: ['b'],
          explanation: 'Keys must be stable and unique among siblings. Indexes change when sorting; random values change every render.',
          difficulty: 'easy',
        },
        {
          key: 'q2',
          type: 'single',
          title: 'JSX attribute',
          prompt: 'Which attribute sets a CSS class in JSX?',
          options: [
            { id: 'a', text: '`class`' },
            { id: 'b', text: '`className`' },
            { id: 'c', text: '`cssClass`' },
          ],
          correct: ['b'],
          explanation: '`class` is a reserved word in JavaScript, so JSX uses `className`.',
          difficulty: 'easy',
        },
        {
          key: 'q3',
          type: 'single',
          title: 'Stray zero',
          prompt: 'What does `{items.length && <List items={items} />}` render when `items` is an empty array?',
          options: [
            { id: 'a', text: 'Nothing' },
            { id: 'b', text: 'The text 0' },
            { id: 'c', text: 'An empty List' },
          ],
          correct: ['b'],
          explanation: '`0 && x` evaluates to `0`, and React renders numbers. Use `items.length > 0 && ...` or a ternary.',
          difficulty: 'medium',
        },
        {
          key: 'q4',
          type: 'fill_blank',
          title: 'Nested content',
          prompt: 'In `<Card title="Hi"><p>Body</p></Card>`, the `<p>` element is available inside Card as the prop named ____.',
          accepted: [['children']],
          explanation: 'Content between the opening and closing tags is passed as `props.children`.',
          difficulty: 'easy',
        },
        {
          key: 'q5',
          type: 'true_false',
          title: 'JSX escaping',
          prompt: 'Rendering `{userComment}` in JSX, where the comment contains `<script>` tags, will execute the script.',
          options: [
            { id: 'true', text: 'True' },
            { id: 'false', text: 'False' },
          ],
          correct: ['false'],
          explanation: 'React escapes strings in JSX, so the tags appear as text. Only `dangerouslySetInnerHTML` bypasses this.',
          difficulty: 'medium',
        },
      ],
    },
    {
      slug: 'props-and-state',
      title: 'Props and state',
      module: 'React basics',
      skill: 'react',
      minutes: 60,
      milestone: true,
      completionCriteria: 'Build a small app where a parent owns state and passes data and callbacks to at least two children, with all updates done immutably.',
      objectives: [
        'Pass data down with props and keep components pure',
        'Add local state with useState and update objects and arrays immutably',
        'Lift state up to share it between sibling components',
        'Explain state snapshots, batching and when to use the updater form',
      ],
      body: `**Props** are inputs a parent passes to a child. They are read-only. **State** is data a component remembers between renders. When you set state, React re-renders the component (and its children) with the new value.

### useState

\`\`\`jsx
import { useState } from 'react';

function Counter() {
  const [count, setCount] = useState(0);
  return (
    <button type="button" onClick={() => setCount((c) => c + 1)}>
      Clicked {count} times
    </button>
  );
}
\`\`\`

### State is a snapshot
During one render, \`count\` is a fixed value. Setting state schedules a re-render; it does not change the variable you already have:

\`\`\`jsx
function handleClick() {
  setCount(count + 1);
  setCount(count + 1);
  setCount(count + 1);
  console.log(count);     // still the old value
}
// Result: count goes up by 1, not 3, because each call used the same snapshot.

function handleClickFixed() {
  setCount((c) => c + 1); // updater form receives the latest pending value
  setCount((c) => c + 1);
  setCount((c) => c + 1); // goes up by 3
}
\`\`\`

React **batches** the updates from one event into a single re-render. Use the **updater form** whenever the next value depends on the previous one.

### Update objects and arrays immutably
React compares the old and new values by reference. Create new objects and arrays instead of changing the existing ones:

\`\`\`jsx
const [form, setForm] = useState({ name: '', email: '' });
setForm({ ...form, email: 'asha@example.com' });           // copy, then override

setTodos([...todos, newTodo]);                              // add
setTodos(todos.filter((t) => t.id !== id));                 // remove
setTodos(todos.map((t) => (t.id === id ? { ...t, done: !t.done } : t))); // edit one
\`\`\`

Mutating (\`todos.push(x)\` or \`form.email = x\`) keeps the same reference, so React may skip the re-render and other code holding the old value sees surprising changes.

### Lifting state up
When two components need the same data, move the state to their closest common parent and pass it down along with callbacks:

\`\`\`jsx
function Shop({ products }) {
  const [cart, setCart] = useState([]);   // [{ id, name, qty }]

  function addToCart(product) {
    setCart((items) => {
      const existing = items.find((i) => i.id === product.id);
      if (existing) return items.map((i) => (i.id === product.id ? { ...i, qty: i.qty + 1 } : i));
      return [...items, { id: product.id, name: product.name, qty: 1 }];
    });
  }

  const totalItems = cart.reduce((sum, i) => sum + i.qty, 0);  // derived, not stored
  return (
    <>
      <ProductList products={products} onAdd={addToCart} />
      <CartSummary items={cart} totalItems={totalItems} />
    </>
  );
}
\`\`\`

\`ProductList\` and \`CartSummary\` stay simple: they receive data and call back up. This **one-way data flow** makes it easy to trace where a value came from.

### Choosing state structure
- Keep the **minimum** state; compute everything else during render (totals, filtered lists, counts).
- Avoid duplicate state: store the selected **id**, not a copy of the selected object.
- Group values that always change together into one object.

### Common mistakes
- Reading state right after setting it and expecting the new value; it updates on the next render.
- Copying props into state, which then goes stale when the prop changes.
- Storing values that can be computed from other state, such as a filtered list, and forgetting to keep them in sync.
- Mutating arrays or objects held in state.`,
      practice: [
        { title: 'Shopping cart', kind: 'exercise', prompt: 'Build a product list and a cart summary as siblings. Lift the cart state to their parent. Support add, remove and change quantity, all with immutable updates, and compute the total price during render.' },
        { title: 'Derived state refactor', kind: 'exercise', prompt: 'Write a searchable list where the filtered results are computed during render from the full list and the query, not stored in separate state. Store only the selected item id and look up the item during render.' },
        { title: 'Snapshot experiment', kind: 'exercise', prompt: 'Make a "+3" button that calls setCount(count + 1) three times, observe the result, then fix it with the updater form. Write two sentences explaining why the first version adds only one.' },
      ],
      resources: [
        { title: 'Passing Props to a Component', url: 'https://react.dev/learn/passing-props-to-a-component', source: 'react.dev', kind: 'docs' },
        { title: 'State: A Component\'s Memory', url: 'https://react.dev/learn/state-a-components-memory', source: 'react.dev', kind: 'docs' },
        { title: 'Sharing State Between Components', url: 'https://react.dev/learn/sharing-state-between-components', source: 'react.dev', kind: 'docs' },
      ],
      quiz: [
        {
          key: 'q1',
          type: 'single',
          title: 'Immutable update',
          prompt: 'Which correctly adds `item` to an array held in state?',
          options: [
            { id: 'a', text: '`items.push(item); setItems(items);`' },
            { id: 'b', text: '`setItems([...items, item]);`' },
            { id: 'c', text: '`items[items.length] = item;`' },
          ],
          correct: ['b'],
          explanation: 'Creating a new array gives React a new reference to compare. Mutating the old one can skip re-renders.',
          difficulty: 'easy',
        },
        {
          key: 'q2',
          type: 'true_false',
          title: 'Props are read-only',
          prompt: 'A child component may modify the props object it receives to update the parent.',
          options: [
            { id: 'true', text: 'True' },
            { id: 'false', text: 'False' },
          ],
          correct: ['false'],
          explanation: 'Props are read-only. To change parent data, the parent passes a callback that updates its own state.',
          difficulty: 'easy',
        },
        {
          key: 'q3',
          type: 'single',
          title: 'Snapshots',
          prompt: '`count` is 0. A click handler runs `setCount(count + 1)` three times in a row. What is `count` after the re-render?',
          options: [
            { id: 'a', text: '1' },
            { id: 'b', text: '3' },
            { id: 'c', text: '0' },
          ],
          correct: ['a'],
          explanation: 'Each call computes `0 + 1` from the same snapshot. The updater form `setCount(c => c + 1)` would give 3.',
          difficulty: 'medium',
        },
        {
          key: 'q4',
          type: 'matching',
          title: 'Where data belongs',
          prompt: 'Match each value with the best way to hold it.',
          pairs: {
            left: [
              { id: 'l1', text: 'Text the user is typing into a search box' },
              { id: 'l2', text: 'The number of items matching that search' },
              { id: 'l3', text: 'A product passed from a list to its row component' },
            ],
            right: [
              { id: 'r1', text: 'Computed during render (derived)' },
              { id: 'r2', text: 'A prop' },
              { id: 'r3', text: 'State' },
            ],
          },
          matches: { l1: 'r3', l2: 'r1', l3: 'r2' },
          explanation: 'Typed text changes over time, so it is state. The count can be calculated from existing data. Data handed down from a parent is a prop.',
          difficulty: 'medium',
        },
        {
          key: 'q5',
          type: 'fill_blank',
          title: 'State hook',
          prompt: 'Complete the hook call that declares a piece of state: `const [open, setOpen] = ____(false);`',
          accepted: [['useState']],
          explanation: '`useState` returns the current value and a setter function, starting from the initial value you pass.',
          difficulty: 'easy',
        },
      ],
    },
    {
      slug: 'effects-and-data-fetching',
      title: 'Effects and data fetching',
      module: 'Working with data',
      skill: 'react',
      minutes: 60,
      objectives: [
        'Explain what useEffect is for: synchronising with systems outside React',
        'Write correct dependency arrays and cleanup functions, and explain why Strict Mode runs effects twice in development',
        'Fetch data in an effect while avoiding race conditions, and extract it into a custom hook',
        'Recognise when you do not need an effect',
      ],
      body: `**Effects** let a component synchronise with something outside React: the network, a timer, a browser API, a WebSocket or a third-party widget. React runs an effect **after** it has updated the screen.

### The shape of an effect

\`\`\`jsx
useEffect(() => {
  // setup: start synchronising
  const id = setInterval(() => setNow(new Date()), 1000);
  return () => clearInterval(id);     // cleanup: stop synchronising
}, []);                               // dependencies
\`\`\`

React runs the setup after the first render, runs the cleanup and then the setup again whenever a dependency changes, and runs the cleanup when the component unmounts.

### Fetching with cleanup

\`\`\`jsx
import { useEffect, useState } from 'react';

function UserProfile({ userId }) {
  const [user, setUser] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    const controller = new AbortController();
    setUser(null);
    setError(null);
    fetch('/api/users/' + encodeURIComponent(userId), { signal: controller.signal })
      .then((r) => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(setUser)
      .catch((e) => { if (e.name !== 'AbortError') setError(e); });
    return () => controller.abort();   // cleanup on change or unmount
  }, [userId]);                        // re-run when userId changes

  if (error) return <p role="alert">Could not load profile.</p>;
  if (!user) return <p>Loading...</p>;
  return <h2>{user.name}</h2>;
}
\`\`\`

If \`userId\` changes from 1 to 2 while the first request is still in flight, the cleanup aborts it, so a slow, outdated response can never overwrite the newer one (a **race condition**). If you cannot abort, set an \`ignore\` flag in cleanup and skip the state update when it is true.

### Extract a custom hook

\`\`\`jsx
function useJson(url) {
  const [state, setState] = useState({ data: null, error: null, loading: true });
  useEffect(() => {
    const controller = new AbortController();
    setState({ data: null, error: null, loading: true });
    fetch(url, { signal: controller.signal })
      .then((r) => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then((data) => setState({ data, error: null, loading: false }))
      .catch((error) => { if (error.name !== 'AbortError') setState({ data: null, error, loading: false }); });
    return () => controller.abort();
  }, [url]);
  return state;
}
// const { data, error, loading } = useJson('/api/projects');
\`\`\`

Custom hooks are functions whose names start with \`use\`. They let components share stateful logic, not state itself: each component calling \`useJson\` gets its own copy.

### Dependency array
- Include every reactive value (props, state, values derived from them) the effect reads. The \`react-hooks/exhaustive-deps\` lint rule checks this.
- \`[]\` means "only after the first render". No array means "after every render", which is rarely what you want.

### Strict Mode runs effects twice in development
In development with \`<StrictMode>\`, React mounts, unmounts and remounts each component once to reveal missing cleanup. If you see two requests in the network tab, make sure the first is cancelled or ignored. This does not happen in production builds.

### You might not need an effect
- Values computed from props or state: compute during render.
- Responding to a click or a submit: do the work in the event handler.
- Resetting state when a prop changes: give the component a \`key\` so React creates a fresh instance.

In larger apps, a data library such as TanStack Query, or your framework's data loaders, handles caching, retries, deduplication and refetching for you.

### Common mistakes
- Missing dependencies, which leaves the effect using stale values.
- Setting state that is also a dependency, causing an infinite loop.
- Forgetting cleanup for timers, subscriptions and in-flight requests.
- Using an effect to "sync" derived state instead of computing it during render.`,
      practice: [
        { title: 'Search with debounce', kind: 'exercise', prompt: 'Build a search box that fetches results 300 ms after the user stops typing. Use an effect with a setTimeout and an AbortController, and clear both in the cleanup function. Show loading, empty and error states.' },
        { title: 'useJson hook', kind: 'exercise', prompt: 'Write a useJson(url) custom hook that returns { data, error, loading } and aborts outdated requests. Use it in two different components and confirm in the network tab that switching quickly between pages never shows stale data.' },
        { title: 'Remove unnecessary effects', kind: 'exercise', prompt: 'Find a component that uses useEffect to compute a value from props or state (or write one) and rewrite it to compute the value during render. Explain in a comment why the effect was unnecessary.' },
      ],
      resources: [
        { title: 'Synchronizing with Effects', url: 'https://react.dev/learn/synchronizing-with-effects', source: 'react.dev', kind: 'docs' },
        { title: 'You Might Not Need an Effect', url: 'https://react.dev/learn/you-might-not-need-an-effect', source: 'react.dev', kind: 'docs' },
        { title: 'Reusing Logic with Custom Hooks', url: 'https://react.dev/learn/reusing-logic-with-custom-hooks', source: 'react.dev', kind: 'docs' },
      ],
      quiz: [
        {
          key: 'q1',
          type: 'single',
          title: 'Dependency array',
          prompt: 'An effect fetches `/api/items?page=N`, where N comes from the `page` prop. What should its dependency array contain?',
          options: [
            { id: 'a', text: '`[]`' },
            { id: 'b', text: '`[page]`' },
            { id: 'c', text: 'Nothing; omit the array' },
          ],
          correct: ['b'],
          explanation: 'The effect reads `page`, so it must re-run when `page` changes.',
          difficulty: 'easy',
        },
        {
          key: 'q2',
          type: 'single',
          title: 'Cleanup purpose',
          prompt: 'Why does the fetch example abort the request in the cleanup function?',
          options: [
            { id: 'a', text: 'To make the server roll back any database changes' },
            { id: 'b', text: 'To stop an outdated response from updating state after the input changed or the component unmounted' },
            { id: 'c', text: 'To make the effect run only once' },
          ],
          correct: ['b'],
          explanation: 'Cleanup runs before the next effect and on unmount, so late responses from previous runs cannot overwrite newer data.',
          difficulty: 'medium',
        },
        {
          key: 'q3',
          type: 'true_false',
          title: 'Strict Mode',
          prompt: 'In development with Strict Mode, React deliberately runs setup, cleanup and setup again for effects to help you find missing cleanup.',
          options: [
            { id: 'true', text: 'True' },
            { id: 'false', text: 'False' },
          ],
          correct: ['true'],
          explanation: 'The extra cycle only happens in development. A correct effect with cleanup behaves the same either way.',
          difficulty: 'medium',
        },
        {
          key: 'q4',
          type: 'multi',
          title: 'No effect needed',
          prompt: 'Which of these should NOT use an effect? Select all that apply.',
          options: [
            { id: 'a', text: 'Computing a filtered list from props and a search query' },
            { id: 'b', text: 'Sending an analytics event when the user clicks Buy' },
            { id: 'c', text: 'Subscribing to a WebSocket while a chat room is open' },
            { id: 'd', text: 'Calculating a total price from cart items in state' },
          ],
          correct: ['a', 'b', 'd'],
          explanation: 'Derived values belong in render and click-driven work belongs in the event handler. Keeping a WebSocket connected is synchronisation with an external system, which is what effects are for.',
          difficulty: 'medium',
        },
        {
          key: 'q5',
          type: 'fill_blank',
          title: 'Custom hook naming',
          prompt: 'Custom hook names must start with the prefix ____ so React and its lint rules can check the rules of hooks.',
          accepted: [['use']],
          explanation: 'Names like `useJson` or `useAuth` signal that the function may call other hooks.',
          difficulty: 'easy',
        },
      ],
    },
    {
      slug: 'forms-in-react',
      title: 'Forms',
      module: 'Working with data',
      skill: 'react',
      minutes: 55,
      objectives: [
        'Build controlled inputs bound to state, including several fields in one state object',
        'Handle submit, client validation, server errors and disabled states',
        'Show accessible error messages linked to fields with useId and aria-describedby',
        'Decide when uncontrolled inputs with FormData or a form library make sense',
      ],
      body: `In a **controlled** input, React state is the single source of truth: the input shows \`value\` from state and \`onChange\` updates it. That makes it easy to validate as the user types, disable buttons and reset the form.

### A complete sign-up form

\`\`\`jsx
import { useId, useState } from 'react';

function validate(values) {
  const errors = {};
  if (!values.name.trim()) errors.name = 'Enter your name.';
  if (!/^[^@\\s]+@[^@\\s]+$/.test(values.email)) errors.email = 'Enter an email address like name@example.com.';
  if (values.password.length < 12) errors.password = 'Use at least 12 characters.';
  return errors;
}

export function SignupForm({ onSubmit }) {
  const id = useId();
  const [values, setValues] = useState({ name: '', email: '', password: '' });
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);

  function handleChange(e) {
    const { name, value } = e.target;
    setValues((v) => ({ ...v, [name]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const found = validate(values);
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    setSubmitting(true);
    try {
      await onSubmit(values);
    } catch (err) {
      setErrors(err.fieldErrors ?? { form: 'Something went wrong. Please try again.' });
    } finally {
      setSubmitting(false);
    }
  }

  function field(name, label, type, autoComplete) {
    const inputId = id + '-' + name;
    const errorId = inputId + '-error';
    return (
      <div className="field">
        <label htmlFor={inputId}>{label}</label>
        <input id={inputId} name={name} type={type} autoComplete={autoComplete}
          value={values[name]} onChange={handleChange}
          aria-invalid={errors[name] ? true : undefined}
          aria-describedby={errors[name] ? errorId : undefined} />
        {errors[name] && <p id={errorId} className="error">{errors[name]}</p>}
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      {field('name', 'Name', 'text', 'name')}
      {field('email', 'Email', 'email', 'email')}
      {field('password', 'Password', 'password', 'new-password')}
      {errors.form && <p role="alert">{errors.form}</p>}
      <button type="submit" disabled={submitting}>
        {submitting ? 'Creating account...' : 'Create account'}
      </button>
    </form>
  );
}
\`\`\`

Things to notice:
- One \`handleChange\` serves every field by reading \`name\` from the event and using a computed key.
- \`useId\` generates unique ids, so two copies of the form on one page never clash.
- Server-side field errors (for example "email already registered") are shown in the same place as client errors.

### Good form habits
- Use \`htmlFor\` on labels (the JSX name for \`for\`).
- Validate on the client for fast feedback, and **always validate again on the server**. Client checks can be bypassed with dev tools or curl.
- Disable the submit button while a request is in flight to avoid double submissions.
- Link error text to its field with \`aria-describedby\`, and move focus to the first invalid field on submit for keyboard and screen reader users.
- Use the right \`autoComplete\` values, such as \`new-password\`, so password managers work.

### Uncontrolled inputs and FormData
For simple forms you can let the DOM hold the values and read them on submit:

\`\`\`jsx
function handleSubmit(e) {
  e.preventDefault();
  const data = Object.fromEntries(new FormData(e.currentTarget));
  onSubmit(data);   // { name: '...', email: '...' }
}
\`\`\`

React 19 also supports passing a function to a form's \`action\` prop together with the \`useActionState\` hook. For large forms, libraries such as React Hook Form reduce boilerplate. Learn the controlled pattern first so you understand what they do.

**Security note:** never log passwords or put them in URLs, and do not store them in browser storage.

### Common mistakes
- Setting \`value\` without \`onChange\`, which makes the input read-only.
- Forgetting \`e.preventDefault()\`, which reloads the page.
- Only showing errors in red with no text.
- Mutating the values object (\`values.email = x\`) instead of creating a new one.
- Trusting client validation as a security measure.`,
      practice: [
        { title: 'Registration form', kind: 'exercise', prompt: 'Build a registration form with name, email, password and confirm password. Validate on submit, show per-field error messages linked with aria-describedby, move focus to the first invalid field and disable the button while submitting.' },
        { title: 'Server errors', kind: 'exercise', prompt: 'Make your onSubmit call a fake API that rejects with { fieldErrors: { email: "This email is already registered." } } for one address. Show that error next to the email field without clearing the other values.' },
        { title: 'Edit profile', kind: 'exercise', prompt: 'Build a form pre-filled from an object, track whether anything changed by comparing with the original, and enable Save only when the form is dirty and valid.' },
      ],
      resources: [
        { title: 'Reacting to Input with State', url: 'https://react.dev/learn/reacting-to-input-with-state', source: 'react.dev', kind: 'docs' },
        { title: '<input> (React DOM components)', url: 'https://react.dev/reference/react-dom/components/input', source: 'react.dev', kind: 'docs' },
        { title: 'Learn Forms', url: 'https://web.dev/learn/forms', source: 'web.dev (Google)', kind: 'course' },
      ],
      quiz: [
        {
          key: 'q1',
          type: 'true_false',
          title: 'Client validation',
          prompt: 'If the React form validates input, the server does not need to validate it again.',
          options: [
            { id: 'true', text: 'True' },
            { id: 'false', text: 'False' },
          ],
          correct: ['false'],
          explanation: 'Anyone can send requests directly to your API. Server-side validation is required; client checks are for user experience.',
          difficulty: 'easy',
        },
        {
          key: 'q2',
          type: 'single',
          title: 'Read-only input',
          prompt: 'An input has `value={name}` but no `onChange`. What happens when the user types?',
          options: [
            { id: 'a', text: 'The text updates normally' },
            { id: 'b', text: 'Nothing changes; the input is effectively read-only' },
            { id: 'c', text: 'React throws an error and stops rendering' },
          ],
          correct: ['b'],
          explanation: 'The displayed value always comes from state, and nothing updates that state. React also logs a warning.',
          difficulty: 'easy',
        },
        {
          key: 'q3',
          type: 'fill_blank',
          title: 'Label attribute in JSX',
          prompt: 'In JSX, the label attribute that points to an input id is written ____.',
          accepted: [['htmlFor']],
          explanation: '`for` is a reserved word in JavaScript, so JSX uses `htmlFor`, which renders as the `for` attribute.',
          difficulty: 'easy',
        },
        {
          key: 'q4',
          type: 'multi',
          title: 'Accessible form errors',
          prompt: 'Which practices make React form errors accessible? Select all that apply.',
          options: [
            { id: 'a', text: 'Setting `aria-describedby` on the input to the error element id' },
            { id: 'b', text: 'Setting `aria-invalid` on invalid inputs' },
            { id: 'c', text: 'Moving focus to the first invalid field on submit' },
            { id: 'd', text: 'Turning the border red with no text' },
          ],
          correct: ['a', 'b', 'c'],
          explanation: 'Linked text, an invalid state and focus management help screen reader and keyboard users. Colour alone is not enough.',
          difficulty: 'medium',
        },
        {
          key: 'q5',
          type: 'single',
          title: 'Unique ids',
          prompt: 'A reusable form component may appear twice on the same page. Which hook generates ids that will not clash?',
          options: [
            { id: 'a', text: '`useId`' },
            { id: 'b', text: '`useRef`' },
            { id: 'c', text: '`useMemo` with `Math.random()`' },
          ],
          correct: ['a'],
          explanation: '`useId` returns a stable, unique id per component instance that also matches between server and client rendering.',
          difficulty: 'medium',
        },
      ],
    },
    {
      slug: 'state-management',
      title: 'State management: reducers, context and server state',
      module: 'Application structure',
      skill: 'react',
      minutes: 55,
      objectives: [
        'Move complex update logic into a reducer with useReducer',
        'Share state without prop drilling using context and a custom hook',
        'Decide where each kind of state belongs: local, lifted, context, URL or server cache',
        'Judge when an external state library is worth adding',
      ],
      body: `As an app grows, state spreads: several components need the current user, a cart is updated from many places, and lists of server data need caching. React gives you two built-in tools for this, **reducers** and **context**, and knowing where each kind of state should live prevents most "state management" pain.

### useReducer: put update logic in one place
A reducer is a pure function \`(state, action) => newState\`. Components **dispatch** actions that describe what happened; the reducer decides how state changes.

\`\`\`jsx
function cartReducer(items, action) {
  switch (action.type) {
    case 'added': {
      const found = items.find((i) => i.id === action.product.id);
      if (found) return items.map((i) => (i.id === found.id ? { ...i, qty: i.qty + 1 } : i));
      return [...items, { ...action.product, qty: 1 }];
    }
    case 'removed':
      return items.filter((i) => i.id !== action.id);
    case 'quantity_changed':
      return items.map((i) => (i.id === action.id ? { ...i, qty: Math.max(1, action.qty) } : i));
    default:
      throw new Error('Unknown action: ' + action.type);
  }
}

const [items, dispatch] = useReducer(cartReducer, []);
dispatch({ type: 'added', product });
\`\`\`

Because the reducer is a pure function, you can unit test it without rendering anything:

\`\`\`js
test('adding the same product twice increases quantity', () => {
  const once = cartReducer([], { type: 'added', product: { id: 1, name: 'Pen' } });
  const twice = cartReducer(once, { type: 'added', product: { id: 1, name: 'Pen' } });
  expect(twice).toEqual([{ id: 1, name: 'Pen', qty: 2 }]);
});
\`\`\`

### Context: avoid prop drilling
Passing a prop through five components that do not use it is called **prop drilling**. Context lets any descendant read a value directly:

\`\`\`jsx
import { createContext, useContext, useReducer } from 'react';

const CartContext = createContext(null);

export function CartProvider({ children }) {
  const [items, dispatch] = useReducer(cartReducer, []);
  return <CartContext.Provider value={{ items, dispatch }}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used inside <CartProvider>');
  return ctx;
}

// Anywhere below the provider:
function AddButton({ product }) {
  const { dispatch } = useCart();
  return <button type="button" onClick={() => dispatch({ type: 'added', product })}>Add to cart</button>;
}
\`\`\`

Every component that reads a context re-renders when its value changes, so keep contexts focused (for example separate \`AuthContext\` and \`CartContext\`) rather than one giant "app state" object.

### Where should this state live?

| Kind of state | Good home |
|---|---|
| UI detail for one component (is this menu open?) | local \`useState\` |
| Shared by a few nearby components | lift to the common parent |
| Needed widely and changes rarely (theme, current user, locale) | context |
| Should survive refresh and be shareable (filters, page, search) | the URL query string |
| Data that lives on the server (lists, records) | a server-cache library such as TanStack Query, or your framework's loaders |
| Form drafts | local form state |

**Server state is different.** It can be stale, shared with other users and changed by them. Copying it into context means you must handle caching, refetching and invalidation yourself, which is exactly what server-cache libraries do well.

### External stores
Libraries such as Redux Toolkit and Zustand help when lots of unrelated components update the same complex client state, or when you want dev tools for time-travel debugging. Add one when the built-in tools are clearly straining, not by default.

### Common mistakes
- Putting everything in one global context, so every keystroke re-renders the whole app.
- Mutating state inside a reducer instead of returning a new value.
- Copying server data into global state and then fighting stale data.
- Reaching for a state library before trying lifting state, reducers and context.
- Forgetting to wrap the tree in the provider, then getting a confusing null; a custom hook that throws makes this obvious.`,
      practice: [
        { title: 'Cart with reducer and context', kind: 'exercise', prompt: 'Refactor your shopping cart to use useReducer for add, remove and change-quantity actions, expose it through a CartProvider and a useCart hook, and read it from a header badge and a cart page without passing props through intermediate components.' },
        { title: 'Test the reducer', kind: 'exercise', prompt: 'Write at least five unit tests for your cart reducer, including the unknown-action case and a check that the input array is never mutated (freeze it with Object.freeze before calling the reducer).' },
        { title: 'State audit', kind: 'exercise', prompt: 'List every piece of state in an app you built and classify it using the table in this lesson. Move at least one value to a better home, such as a search filter into the URL.' },
      ],
      resources: [
        { title: 'Extracting State Logic into a Reducer', url: 'https://react.dev/learn/extracting-state-logic-into-a-reducer', source: 'react.dev', kind: 'docs' },
        { title: 'Passing Data Deeply with Context', url: 'https://react.dev/learn/passing-data-deeply-with-context', source: 'react.dev', kind: 'docs' },
        { title: 'Scaling Up with Reducer and Context', url: 'https://react.dev/learn/scaling-up-with-reducer-and-context', source: 'react.dev', kind: 'docs' },
      ],
      quiz: [
        {
          key: 'q1',
          type: 'true_false',
          title: 'Reducer purity',
          prompt: 'It is fine for a reducer to call `fetch` and mutate the state array before returning it.',
          options: [
            { id: 'true', text: 'True' },
            { id: 'false', text: 'False' },
          ],
          correct: ['false'],
          explanation: 'Reducers must be pure: compute and return a new state from the old state and the action, with no side effects or mutations.',
          difficulty: 'easy',
        },
        {
          key: 'q2',
          type: 'fill_blank',
          title: 'Sending an action',
          prompt: 'Complete the conventional name for the second value returned by useReducer, the function you call with an action object: `const [state, ____] = useReducer(reducer, initial);`',
          accepted: [['dispatch']],
          explanation: '`dispatch({ type: "added", product })` sends an action to the reducer, which returns the next state.',
          difficulty: 'easy',
        },
        {
          key: 'q3',
          type: 'matching',
          title: 'Homes for state',
          prompt: 'Match each piece of state with its best home.',
          pairs: {
            left: [
              { id: 'l1', text: 'Whether a dropdown is open' },
              { id: 'l2', text: 'The signed-in user, needed in many places' },
              { id: 'l3', text: 'The current search filter on a product list' },
              { id: 'l4', text: 'A list of orders loaded from the API' },
            ],
            right: [
              { id: 'r1', text: 'Context' },
              { id: 'r2', text: 'A server-cache library or framework loader' },
              { id: 'r3', text: 'Local useState' },
              { id: 'r4', text: 'The URL query string' },
            ],
          },
          matches: { l1: 'r3', l2: 'r1', l3: 'r4', l4: 'r2' },
          explanation: 'Keep state as local as possible, share widely used rarely changing values with context, put shareable view state in the URL and let a cache manage server data.',
          difficulty: 'medium',
        },
        {
          key: 'q4',
          type: 'single',
          title: 'Context re-renders',
          prompt: 'An app keeps theme, user, cart and the text of a search box in one context value. What problem is most likely?',
          options: [
            { id: 'a', text: 'Typing in the search box re-renders every component that reads the context' },
            { id: 'b', text: 'Context values cannot hold objects' },
            { id: 'c', text: 'The cart will be lost on every render' },
          ],
          correct: ['a'],
          explanation: 'All consumers re-render when the context value changes. Fast-changing values like search text belong in local state, and contexts should be split by concern.',
          difficulty: 'medium',
        },
      ],
    },
    {
      slug: 'client-side-routing',
      title: 'Routing',
      module: 'Application structure',
      skill: 'react',
      minutes: 50,
      objectives: [
        'Explain client-side routing and the History API',
        'Define routes, nested layouts with an outlet, URL parameters and search parameters',
        'Navigate with links instead of full page reloads and manage focus after navigation',
        'Handle not-found routes and protected pages, knowing that real protection lives on the server',
      ],
      body: `In a single-page app, the browser loads one HTML page and JavaScript swaps views when the URL changes. A router maps **URL paths to components** and uses the History API, so the back and forward buttons, bookmarks and shared links still work.

### Routes, layouts and parameters (React Router)

\`\`\`jsx
import { BrowserRouter, Routes, Route, NavLink, Outlet, useParams } from 'react-router-dom';

function Layout() {
  return (
    <>
      <header>
        <nav aria-label="Main">
          <NavLink to="/">Home</NavLink> <NavLink to="/products">Products</NavLink>
        </nav>
      </header>
      <main id="main"><Outlet /></main>   {/* the matched child route renders here */}
    </>
  );
}

function ProductPage() {
  const { id } = useParams();           // from /products/:id
  const { data: product } = useJson('/api/products/' + encodeURIComponent(id));
  return <h1>{product ? product.name : 'Loading...'}</h1>;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Home />} />
          <Route path="/products" element={<ProductList />} />
          <Route path="/products/:id" element={<ProductPage />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
\`\`\`

\`NavLink\` marks the active link with \`aria-current="page"\`, so you can style it and screen readers announce it. Package names and APIs differ between router versions and frameworks; check the docs for the version you install.

### Put shareable state in the URL

\`\`\`jsx
import { useSearchParams } from 'react-router-dom';

function ProductList() {
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  return (
    <input type="search" aria-label="Search products" value={q}
      onChange={(e) => setParams(e.target.value ? { q: e.target.value } : {})} />
  );
}
\`\`\`

Now \`/products?q=lamp\` survives refresh and can be bookmarked or shared.

### Protected routes

\`\`\`jsx
import { Navigate, useLocation } from 'react-router-dom';

function RequireAuth({ children }) {
  const { user } = useAuth();
  const location = useLocation();
  if (!user) return <Navigate to="/login" replace state={{ from: location }} />;
  return children;
}
// <Route path="/account" element={<RequireAuth><Account /></RequireAuth>} />
\`\`\`

After login, send the user back to \`location.state.from\`. Remember: this only hides UI. The **server** must still check authentication and authorization on every API call.

### Accessibility of route changes
A full page load resets focus and screen readers announce the new title. A client-side navigation does neither by default. On each route change, update \`document.title\` and move focus to the main heading (or a wrapper with \`tabIndex={-1}\`) so keyboard and screen reader users know the page changed.

### Server configuration
When a user refreshes \`/products/42\`, the request goes to the server. Configure it to return \`index.html\` for unknown non-API paths so the client router can take over.

### Common mistakes
- Using \`<a href>\` inside the app, which triggers a full reload and loses state.
- Keeping filters only in component state, so refresh resets them.
- Treating client-side route guards as security.
- Forgetting a catch-all not-found route.
- Leaving focus on the clicked link after navigation, so screen reader users do not hear the new page.`,
      practice: [
        { title: 'Multi-page catalogue', kind: 'exercise', prompt: 'Build Home, Products list and Product detail routes inside a shared Layout with an Outlet. The list reads a ?q= search parameter from the URL so searches survive refresh and can be shared.' },
        { title: 'Protected account page', kind: 'exercise', prompt: 'Add a RequireAuth wrapper that redirects to /login and returns the user to the page they asked for after a fake login. Add a friendly 404 page for unknown paths.' },
        { title: 'Focus on navigation', kind: 'exercise', prompt: 'On every route change, update document.title and move focus to the page h1. Test with a keyboard and a screen reader that each navigation is announced.' },
      ],
      resources: [
        { title: 'React Router documentation', url: 'https://reactrouter.com/', source: 'React Router', kind: 'docs' },
        { title: 'History API', url: 'https://developer.mozilla.org/en-US/docs/Web/API/History_API', source: 'MDN Web Docs', kind: 'docs' },
      ],
      quiz: [
        {
          key: 'q1',
          type: 'true_false',
          title: 'Route guards',
          prompt: 'Hiding an admin route on the client is enough to keep admin data secure.',
          options: [
            { id: 'true', text: 'True' },
            { id: 'false', text: 'False' },
          ],
          correct: ['false'],
          explanation: 'Client code can be bypassed. The API must check authorization on every request.',
          difficulty: 'easy',
        },
        {
          key: 'q2',
          type: 'single',
          title: 'Refresh on a deep link',
          prompt: 'Refreshing `/products/42` in a deployed SPA returns a 404 from the server. What is the usual fix?',
          options: [
            { id: 'a', text: 'Configure the server to serve index.html for unknown paths' },
            { id: 'b', text: 'Remove the route' },
            { id: 'c', text: 'Use only hash links everywhere' },
          ],
          correct: ['a'],
          explanation: 'The server must hand unknown paths to the SPA so the client router can render them. Hash routing is a workaround, not the usual fix.',
          difficulty: 'medium',
        },
        {
          key: 'q3',
          type: 'fill_blank',
          title: 'Layout placeholder',
          prompt: 'In React Router, a layout route renders its matched child route wherever it places the ____ component.',
          accepted: [['Outlet', '<Outlet />', '<Outlet/>']],
          explanation: '`<Outlet />` marks where nested routes render inside a shared layout.',
          difficulty: 'easy',
        },
        {
          key: 'q4',
          type: 'single',
          title: 'Shareable filters',
          prompt: 'Users want to bookmark a filtered product list. Where should the filter value live?',
          options: [
            { id: 'a', text: 'In a useState variable inside the list component' },
            { id: 'b', text: 'In the URL search parameters, for example `?q=lamp`' },
            { id: 'c', text: 'In a global variable' },
          ],
          correct: ['b'],
          explanation: 'The URL survives refresh and can be bookmarked and shared. Component state resets on reload.',
          difficulty: 'easy',
        },
        {
          key: 'q5',
          type: 'multi',
          title: 'Accessible navigation',
          prompt: 'Which help screen reader and keyboard users after a client-side route change? Select all that apply.',
          options: [
            { id: 'a', text: 'Updating `document.title` for the new page' },
            { id: 'b', text: 'Moving focus to the new page heading' },
            { id: 'c', text: 'Using `NavLink` so the active link has `aria-current="page"`' },
            { id: 'd', text: 'Disabling the browser back button' },
          ],
          correct: ['a', 'b', 'c'],
          explanation: 'A new title, a focus move and a marked current link communicate the change. Breaking the back button harms everyone.',
          difficulty: 'medium',
        },
      ],
    },
    {
      slug: 'react-performance-testing',
      title: 'Performance and testing basics',
      module: 'Application structure',
      skill: 'react',
      minutes: 60,
      milestone: true,
      completionCriteria: 'Write at least three React Testing Library tests for a routed app (including an async loading and error case), and measure one render with the React DevTools Profiler.',
      objectives: [
        'Explain what causes re-renders and measure them with the Profiler',
        'Apply memo, useMemo and useCallback only where measurements show a need',
        'Split code with lazy loading for large routes',
        'Write user-centred component tests with React Testing Library, including async data and mocked network calls',
      ],
      body: `### Performance: measure first
A component re-renders when its state changes, its parent re-renders, or a context it reads changes. Most re-renders are cheap. Before optimising, record a session with the **React DevTools Profiler** (and the browser Performance panel) to find which components are slow and why.

Tools to reach for once you have evidence:

\`\`\`jsx
import { memo, useMemo, useCallback, lazy, Suspense } from 'react';

const Row = memo(function Row({ item, onSelect }) {   // skips re-render if props are unchanged
  return <li><button type="button" onClick={() => onSelect(item.id)}>{item.name}</button></li>;
});

function BigList({ items, query, onSelect }) {
  const visible = useMemo(
    () => items.filter((i) => i.name.toLowerCase().includes(query.toLowerCase())),
    [items, query],                                     // recompute only when these change
  );
  const handleSelect = useCallback((id) => onSelect(id), [onSelect]); // stable reference for memo rows
  return <ul>{visible.map((i) => <Row key={i.id} item={i} onSelect={handleSelect} />)}</ul>;
}

const Reports = lazy(() => import('./Reports'));       // separate bundle, loaded on demand
// <Suspense fallback={<p>Loading reports...</p>}><Reports /></Suspense>
\`\`\`

- \`memo\` only helps if the props really stay the same; a new object or arrow function on every render defeats it, which is why \`useCallback\` and \`useMemo\` exist.
- \`lazy\` with \`<Suspense>\` keeps rarely used, heavy routes out of the initial download.
- For thousands of rows, render only what is visible (**virtualisation**).
- The React Compiler, if your project uses it, adds much of this memoisation automatically at build time.

### Testing: test behaviour, not implementation
React Testing Library (usually run with Vitest or Jest in a jsdom environment) encourages tests that interact with the UI the way people do:

\`\`\`jsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { test, expect, vi, afterEach } from 'vitest';
import Counter from './Counter';
import UserProfile from './UserProfile';

afterEach(() => vi.restoreAllMocks());

test('increments when clicked', async () => {
  const user = userEvent.setup();
  render(<Counter />);
  await user.click(screen.getByRole('button', { name: /clicked 0 times/i }));
  expect(screen.getByRole('button', { name: /clicked 1 times/i })).toBeInTheDocument();
});

test('shows the user name after loading', async () => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(JSON.stringify({ name: 'Ada' }), { status: 200, headers: { 'Content-Type': 'application/json' } }),
  );
  render(<UserProfile userId="1" />);
  expect(screen.getByText(/loading/i)).toBeInTheDocument();
  expect(await screen.findByRole('heading', { name: 'Ada' })).toBeInTheDocument();
});

test('shows an error when the request fails', async () => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('', { status: 500 }));
  render(<UserProfile userId="1" />);
  expect(await screen.findByRole('alert')).toHaveTextContent(/could not load/i);
});
\`\`\`

- \`getBy...\` finds something that is already there; \`findBy...\` waits for something to appear (async); \`queryBy...\` returns null instead of throwing, for asserting absence.
- Querying by **role and accessible name** also checks that your UI is accessible. If a test cannot find the button by role, a screen reader user may not either.
- Mock at the network boundary (\`fetch\`, or a request-mocking library such as MSW), not your own child components.

### What to test
- Rendering with typical, empty and error data
- User interactions: typing, clicking, submitting, keyboard navigation
- Pure logic such as reducers and validation functions, with plain unit tests

### Common mistakes
- Wrapping everything in useMemo "just in case", adding complexity with no measured gain.
- Tests that check internal state or class names, which break on every refactor.
- Using test ids everywhere when a role or label query would work.
- Using \`getBy\` for content that appears after a fetch, instead of \`findBy\`.
- Leaving mocks in place between tests, so one test affects another.`,
      practice: [
        { title: 'Test a form', kind: 'exercise', prompt: 'Write tests for your registration form: it shows an error for an invalid email, calls onSubmit with the right data when valid, and disables the button while submitting. Use only role and label queries.' },
        { title: 'Test async data', kind: 'exercise', prompt: 'Write tests for a component that loads data: the loading state, the success state with findByRole, the empty state and a 500 error. Mock fetch and restore it after each test.' },
        { title: 'Profile and fix', kind: 'exercise', prompt: 'Render a list of 2,000 items with a filter box. Record a Profiler session while typing, identify the slow part, apply one optimisation, and record the before and after timings.' },
      ],
      resources: [
        { title: 'memo', url: 'https://react.dev/reference/react/memo', source: 'react.dev', kind: 'docs' },
        { title: 'React Testing Library: Introduction', url: 'https://testing-library.com/docs/react-testing-library/intro/', source: 'Testing Library', kind: 'docs' },
        { title: 'About Queries (priority guide)', url: 'https://testing-library.com/docs/queries/about/', source: 'Testing Library', kind: 'docs' },
      ],
      quiz: [
        {
          key: 'q1',
          type: 'single',
          title: 'Query priority',
          prompt: 'Which query best reflects how a user finds a submit button?',
          options: [
            { id: 'a', text: "`getByTestId('submit')`" },
            { id: 'b', text: "`getByRole('button', { name: /submit/i })`" },
            { id: 'c', text: "`container.querySelector('.btn-primary')`" },
          ],
          correct: ['b'],
          explanation: 'Role and accessible name match what users and assistive technology perceive. Test ids and class names are implementation details.',
          difficulty: 'easy',
        },
        {
          key: 'q2',
          type: 'true_false',
          title: 'Optimise first',
          prompt: 'You should wrap every component in memo before measuring performance.',
          options: [
            { id: 'true', text: 'True' },
            { id: 'false', text: 'False' },
          ],
          correct: ['false'],
          explanation: 'Memoisation has a cost and adds complexity. Profile first, then optimise the parts that are actually slow.',
          difficulty: 'easy',
        },
        {
          key: 'q3',
          type: 'fill_blank',
          title: 'Waiting for content',
          prompt: 'Complete the query that waits for a heading to appear after data loads: `await screen.____(\'heading\', { name: \'Ada\' })`',
          accepted: [['findByRole']],
          explanation: '`findBy` queries return a promise that resolves when the element appears or rejects after a timeout. `getBy` fails immediately if the element is not there yet.',
          difficulty: 'medium',
        },
        {
          key: 'q4',
          type: 'single',
          title: 'memo defeated',
          prompt: 'A memoised `Row` still re-renders every time its parent renders. The parent passes `onSelect={(id) => select(id)}`. Why?',
          options: [
            { id: 'a', text: 'memo only works on class components' },
            { id: 'b', text: 'A new arrow function is created on every render, so the prop is never equal to the previous one' },
            { id: 'c', text: 'Rows always re-render when they have a key' },
          ],
          correct: ['b'],
          explanation: 'memo compares props by reference. Wrap the callback in useCallback (or let the React Compiler do it) to keep the reference stable.',
          difficulty: 'hard',
        },
        {
          key: 'q5',
          type: 'multi',
          title: 'Good test targets',
          prompt: 'Which are good things for a component test to check? Select all that apply.',
          options: [
            { id: 'a', text: 'An error message appears when the API returns 500' },
            { id: 'b', text: 'The value of an internal useState variable' },
            { id: 'c', text: 'Submitting the form calls onSubmit with the typed values' },
            { id: 'd', text: 'The empty state appears when there are no results' },
          ],
          correct: ['a', 'c', 'd'],
          explanation: 'Test what users see and do. Internal state is an implementation detail that can change without changing behaviour.',
          difficulty: 'medium',
        },
      ],
    },
  ],
};

export const backendNodeApis: SeedTrack = {
  slug: 'backend-node-apis',
  title: 'Backend Development: APIs with Node.js',
  category: 'web',
  summary: 'Design, build, secure, observe and deploy REST APIs with Node.js and a relational database.',
  description: `**Who it's for:** learners who know JavaScript and want to build the server side of web applications, and frontend developers who want to understand the APIs they call.

**Prerequisites:** JavaScript including async/await and modules (*JavaScript Essentials*). Basic SQL helps for the database topic. You will need Node.js (a current LTS release) and a terminal; curl or any HTTP client is useful for testing.

**You will be able to:**
- explain HTTP requests, responses, methods, headers and status codes, and serve them from plain Node.js
- build and test a REST API with Express routing and middleware
- validate every input against a schema and return consistent, safe errors
- implement password login with hashed passwords, secure session cookies and ownership checks
- protect an API with rate limits and observe it with structured, privacy-aware logs
- query a database safely with parameterised queries and transactions, and design paginated, versioned endpoints
- deploy a service with configuration from the environment, health checks and graceful shutdown

**Milestones:** *Your first REST API* (topic 2) and *Authentication* (topic 4).`,
  level: 'intermediate',
  estimatedHours: 34,
  roles: ['backend developer', 'full-stack developer', 'software engineer', 'api developer'],
  contentStatus: 'complete',
  topics: [
    {
      slug: 'http-fundamentals',
      title: 'HTTP fundamentals',
      module: 'Foundations',
      skill: 'http-rest',
      minutes: 50,
      objectives: [
        'Describe the parts of a URL, an HTTP request and an HTTP response',
        'Choose the right method (GET, POST, PUT, PATCH, DELETE) and explain safety and idempotency',
        'Pick meaningful status codes and common headers such as Content-Type, Cache-Control and Set-Cookie',
        'Serve a response from plain Node.js and inspect real traffic with curl and browser dev tools',
      ],
      body: `HTTP is a **stateless request and response protocol**. A client (browser, mobile app, another server) sends a request; the server returns a response. Each request carries everything the server needs, which is why authentication travels in a cookie or header on every call.

### Anatomy of a URL

\`\`\`text
https://api.example.com:443/v1/todos/17?fields=title&lang=en#notes
scheme  host            port path       query string         fragment
\`\`\`

The fragment (\`#notes\`) never reaches the server; the browser keeps it.

### A request and its response

\`\`\`text
POST /api/todos HTTP/1.1
Host: example.com
Content-Type: application/json
Accept: application/json
Cookie: sid=8f2c...

{"title": "Learn HTTP"}
\`\`\`

\`\`\`text
HTTP/1.1 201 Created
Content-Type: application/json
Location: /api/todos/17
Cache-Control: no-store

{"id": 17, "title": "Learn HTTP", "done": false}
\`\`\`

A request has a **method**, a **path**, **headers** and an optional **body**. A response has a **status code**, headers and an optional body.

### Methods
| Method | Meaning | Safe | Idempotent |
|---|---|---|---|
| GET | read | yes | yes |
| POST | create or trigger an action | no | no |
| PUT | replace a resource | no | yes |
| PATCH | partially update | no | not guaranteed |
| DELETE | remove | no | yes |

**Safe** means the request should not change server state. **Idempotent** means repeating the request has the same effect as sending it once, which makes automatic retries safe.

### Status codes you will use most
- **200** OK, **201** Created, **204** No Content
- **301/308** moved permanently, **304** Not Modified (cache still valid)
- **400** Bad Request (malformed input), **401** Unauthorized (not authenticated), **403** Forbidden (authenticated, not allowed), **404** Not Found, **409** Conflict, **422** Unprocessable Content, **429** Too Many Requests
- **500** Internal Server Error, **502** Bad Gateway, **503** Service Unavailable

### Headers worth knowing
- \`Content-Type\`: the format of the body, such as \`application/json\`.
- \`Accept\`: the formats the client wants back.
- \`Authorization\`: credentials such as a bearer token.
- \`Cookie\` / \`Set-Cookie\`: how browsers send and receive cookies.
- \`Cache-Control\` and \`ETag\`: whether and how long a response may be cached.

### HTTP from plain Node.js
Frameworks are thin layers over Node's built-in \`http\` module:

\`\`\`js
import http from 'node:http';

const server = http.createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok' }));
    return;
  }
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found' }));
});

server.listen(3000, () => console.log('http://localhost:3000'));
\`\`\`

### Try it

\`\`\`bash
curl -i http://localhost:3000/health                 # -i prints status and headers
curl -i -X POST https://httpbin.org/post \\
  -H 'Content-Type: application/json' -d '{"title":"Learn HTTP"}'
\`\`\`

In the browser, the dev tools **Network** panel shows the same details for every request a page makes.

**Security note:** use HTTPS everywhere. Plain HTTP sends cookies, passwords and data in readable form to anyone on the network path.

### Common mistakes
- Returning 200 with \`{"error": "..."}\` in the body; clients and monitoring then think it succeeded.
- Using GET for actions that change data. Crawlers and link prefetchers may trigger them.
- Confusing 401 (who are you?) with 403 (I know who you are, and the answer is no).
- Forgetting \`Content-Type: application/json\` on JSON request bodies, so the server does not parse them.`,
      practice: [
        { title: 'Explore with curl', kind: 'exercise', prompt: 'Use curl -i against a public API. For three requests, write down the method, status code, two response headers and what each header means. Repeat one request in the browser and find the same details in the Network panel.' },
        { title: 'Plain Node server', kind: 'exercise', prompt: 'Using only node:http, build a server with GET /health, GET /time (returns the current ISO time as JSON) and a JSON 404 for everything else. Return 405 Method Not Allowed for POST /time.' },
        { title: 'Status code mapping', kind: 'exercise', prompt: 'For a blog API, list the status code you would return for: created post, invalid JSON, post not found, deleting someone else\'s post, duplicate slug, too many requests, and a database outage.' },
      ],
      resources: [
        { title: 'An overview of HTTP', url: 'https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/Overview', source: 'MDN Web Docs', kind: 'docs' },
        { title: 'HTTP response status codes', url: 'https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Status', source: 'MDN Web Docs', kind: 'docs' },
        { title: 'Node.js HTTP module', url: 'https://nodejs.org/docs/latest/api/http.html', source: 'nodejs.org', kind: 'docs' },
      ],
      quiz: [
        {
          key: 'q1',
          type: 'single',
          title: '401 vs 403',
          prompt: 'A logged-in user requests another user\'s private invoice. Which status fits best?',
          options: [
            { id: 'a', text: '401 Unauthorized' },
            { id: 'b', text: '403 Forbidden' },
            { id: 'c', text: '500 Internal Server Error' },
          ],
          correct: ['b'],
          explanation: 'The user is authenticated but not allowed. Some APIs return 404 instead to avoid revealing that the invoice exists.',
          difficulty: 'easy',
        },
        {
          key: 'q2',
          type: 'multi',
          title: 'Idempotent methods',
          prompt: 'Which methods are idempotent by definition? Select all that apply.',
          options: [
            { id: 'a', text: 'GET' },
            { id: 'b', text: 'POST' },
            { id: 'c', text: 'PUT' },
            { id: 'd', text: 'DELETE' },
          ],
          correct: ['a', 'c', 'd'],
          explanation: 'Repeating GET, PUT or DELETE leaves the server in the same state. Repeating POST may create duplicates.',
          difficulty: 'medium',
        },
        {
          key: 'q3',
          type: 'matching',
          title: 'Status codes',
          prompt: 'Match each situation with the best status code.',
          pairs: {
            left: [
              { id: 'l1', text: 'A new resource was created' },
              { id: 'l2', text: 'A delete succeeded and there is no body to return' },
              { id: 'l3', text: 'The username is already taken' },
              { id: 'l4', text: 'The client has sent too many requests' },
            ],
            right: [
              { id: 'r1', text: '409 Conflict' },
              { id: 'r2', text: '201 Created' },
              { id: 'r3', text: '429 Too Many Requests' },
              { id: 'r4', text: '204 No Content' },
            ],
          },
          matches: { l1: 'r2', l2: 'r4', l3: 'r1', l4: 'r3' },
          explanation: 'Specific status codes let clients react correctly without parsing the body: show the new item, remove a row, ask for a new username or back off.',
          difficulty: 'easy',
        },
        {
          key: 'q4',
          type: 'fill_blank',
          title: 'Body format header',
          prompt: 'Which request header tells the server the body is JSON? `____: application/json`',
          accepted: [['Content-Type']],
          explanation: '`Content-Type` describes the body that is being sent. `Accept` describes what the client wants back.',
          difficulty: 'easy',
        },
        {
          key: 'q5',
          type: 'true_false',
          title: 'URL fragment',
          prompt: 'The fragment part of a URL (after `#`) is sent to the server with the request.',
          options: [
            { id: 'true', text: 'True' },
            { id: 'false', text: 'False' },
          ],
          correct: ['false'],
          explanation: 'Browsers keep the fragment on the client. Use the path or query string for anything the server needs.',
          difficulty: 'medium',
        },
      ],
    },
    {
      slug: 'rest-api-with-node',
      title: 'Building a REST API with Node.js',
      module: 'Foundations',
      skill: 'nodejs',
      minutes: 70,
      milestone: true,
      completionCriteria: 'Ship a CRUD API for one resource with correct methods and status codes, a JSON 404 handler and at least four automated tests.',
      objectives: [
        'Create an HTTP server with Express, parse JSON bodies and organise routes with a router',
        'Model a resource with RESTful routes for list, read, create, update and delete',
        'Use middleware for logging and cross-cutting concerns, and explain why order matters',
        'Separate the app from the server so it can be tested with node:test and supertest',
      ],
      body: `Node.js runs JavaScript on the server. The built-in \`http\` module works, but most projects use a small framework like **Express** for routing and middleware.

### Project setup

\`\`\`bash
mkdir notes-api && cd notes-api
npm init -y
npm pkg set type=module          # use import/export syntax
npm install express
npm install --save-dev supertest
node --watch src/server.js       # restarts when files change
\`\`\`

### Separate the app from the server
Export the configured app from one file and start listening in another. Tests can then import the app without opening a port.

\`\`\`js
// src/app.js
import express from 'express';
import { todosRouter } from './todos.js';

export const app = express();
app.use(express.json());                     // parse JSON request bodies

app.use((req, res, next) => {                // request logger middleware
  const start = Date.now();
  res.on('finish', () => console.log(req.method, req.originalUrl, res.statusCode, Date.now() - start + 'ms'));
  next();
});

app.use('/api/todos', todosRouter);
app.use((req, res) => res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Route not found' } }));
\`\`\`

\`\`\`js
// src/server.js
import { app } from './app.js';
const port = Number(process.env.PORT ?? 3000);
app.listen(port, () => console.log('Listening on http://localhost:' + port));
\`\`\`

### A resource router

\`\`\`js
// src/todos.js
import { Router } from 'express';

export const todosRouter = Router();
let todos = [{ id: 1, title: 'Learn Express', done: false }];
let nextId = 2;

todosRouter.get('/', (req, res) => {
  const done = req.query.done;
  res.json(done === undefined ? todos : todos.filter((t) => String(t.done) === done));
});

todosRouter.get('/:id', (req, res) => {
  const todo = todos.find((t) => t.id === Number(req.params.id));
  if (!todo) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Todo not found' } });
  res.json(todo);
});

todosRouter.post('/', (req, res) => {
  const todo = { id: nextId++, title: req.body.title, done: false };   // validation comes next lesson
  todos.push(todo);
  res.status(201).location('/api/todos/' + todo.id).json(todo);
});

todosRouter.patch('/:id', (req, res) => {
  const todo = todos.find((t) => t.id === Number(req.params.id));
  if (!todo) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Todo not found' } });
  if (typeof req.body.done === 'boolean') todo.done = req.body.done;
  if (typeof req.body.title === 'string') todo.title = req.body.title;
  res.json(todo);
});

todosRouter.delete('/:id', (req, res) => {
  todos = todos.filter((t) => t.id !== Number(req.params.id));
  res.status(204).end();
});
\`\`\`

### Middleware and order
Middleware is a function \`(req, res, next)\` that runs in the order it is registered. It can read or change \`req\` and \`res\`, end the response, or call \`next()\` to pass control on. That is why \`express.json()\` must come before the routes that read \`req.body\`, and the 404 handler must come after all routes.

In Express 5, an async route handler that throws or returns a rejected promise is passed to your error handler automatically. In Express 4 you must catch the error and call \`next(err)\` yourself.

### Test it

\`\`\`js
// test/todos.test.js  (run with: node --test)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { app } from '../src/app.js';

test('POST /api/todos creates a todo', async () => {
  const res = await request(app).post('/api/todos').send({ title: 'Write tests' });
  assert.equal(res.status, 201);
  assert.equal(res.body.title, 'Write tests');
  assert.match(res.headers.location, /^\\/api\\/todos\\/\\d+$/);
});

test('GET an unknown todo returns 404', async () => {
  const res = await request(app).get('/api/todos/9999');
  assert.equal(res.status, 404);
});
\`\`\`

### RESTful routes
Use nouns for resources and HTTP methods for actions: \`GET /api/todos\`, \`POST /api/todos\`, \`PATCH /api/todos/:id\`. Avoid \`/api/getTodos\` or \`/api/deleteTodo\`.

### Common mistakes
- Forgetting \`express.json()\`, so \`req.body\` is undefined.
- Forgetting to \`return\` after sending a response, then trying to send a second one ("headers already sent").
- Comparing \`req.params.id\` (always a string) with a numeric id without converting.
- Registering the 404 handler before the routes, so every request returns 404.
- Calling \`app.listen\` in the same module the tests import, leaving ports open.`,
      practice: [
        { title: 'Notes API', kind: 'exercise', prompt: 'Build a CRUD API for notes (title, body, createdAt) with in-memory storage and an Express Router. Implement GET list, GET by id, POST, PATCH and DELETE with correct status codes and a JSON 404 handler, and test each with curl.' },
        { title: 'Automated tests', kind: 'exercise', prompt: 'Split your notes API into app.js and server.js, then write at least four node:test plus supertest tests: create (201 with Location), read missing (404), update (200) and delete (204).' },
        { title: 'Request logger', kind: 'exercise', prompt: 'Write middleware that logs method, path, status code and duration for every request. Then add a query parameter ?done=true to filter the list and a test for it.' },
      ],
      resources: [
        { title: 'Introduction to Node.js', url: 'https://nodejs.org/learn/getting-started/introduction-to-nodejs', source: 'nodejs.org', kind: 'docs' },
        { title: 'Express: Routing', url: 'https://expressjs.com/en/guide/routing/', source: 'expressjs.com', kind: 'docs' },
        { title: 'Express: Using middleware', url: 'https://expressjs.com/en/guide/using-middleware/', source: 'expressjs.com', kind: 'docs' },
      ],
      quiz: [
        {
          key: 'q1',
          type: 'single',
          title: 'Create status',
          prompt: 'Which status code should `POST /api/todos` return after creating a todo?',
          options: [
            { id: 'a', text: '200 OK' },
            { id: 'b', text: '201 Created' },
            { id: 'c', text: '204 No Content' },
          ],
          correct: ['b'],
          explanation: '201 signals a new resource was created, usually with a Location header pointing to it.',
          difficulty: 'easy',
        },
        {
          key: 'q2',
          type: 'single',
          title: 'Route naming',
          prompt: 'Which route follows REST conventions for deleting a user?',
          options: [
            { id: 'a', text: '`POST /api/deleteUser?id=5`' },
            { id: 'b', text: '`DELETE /api/users/5`' },
            { id: 'c', text: '`GET /api/users/5/delete`' },
          ],
          correct: ['b'],
          explanation: 'The URL names the resource; the HTTP method names the action.',
          difficulty: 'easy',
        },
        {
          key: 'q3',
          type: 'true_false',
          title: 'Middleware order',
          prompt: 'If `app.use(express.json())` is registered after a POST route, that route will still see a parsed `req.body`.',
          options: [
            { id: 'true', text: 'True' },
            { id: 'false', text: 'False' },
          ],
          correct: ['false'],
          explanation: 'Middleware runs in registration order. A route registered earlier runs before the JSON parser, so `req.body` is not populated.',
          difficulty: 'medium',
        },
        {
          key: 'q4',
          type: 'fill_blank',
          title: 'Passing control',
          prompt: 'A middleware that does not send a response must call ____() to pass the request to the next handler.',
          accepted: [['next']],
          explanation: 'Without `next()` (or a response), the request hangs until the client times out.',
          difficulty: 'easy',
        },
        {
          key: 'q5',
          type: 'single',
          title: 'Testable structure',
          prompt: 'Why export the Express app from `app.js` and call `listen` in a separate `server.js`?',
          options: [
            { id: 'a', text: 'Express requires two files' },
            { id: 'b', text: 'Tests can import the app and send requests with supertest without opening a real port' },
            { id: 'c', text: 'It makes the app run faster in production' },
          ],
          correct: ['b'],
          explanation: 'Separating construction from startup keeps tests fast and isolated, and lets you start the server differently in each environment.',
          difficulty: 'medium',
        },
      ],
    },
    {
      slug: 'validation-and-errors',
      title: 'Validation and error handling',
      module: 'Robust APIs',
      skill: 'nodejs',
      minutes: 55,
      objectives: [
        'Validate request bodies, params and query strings against a schema with reusable middleware',
        'Prevent mass assignment and oversized payloads by allowing only known fields and limiting body size',
        'Return a consistent error format with useful messages and correct 4xx or 5xx codes',
        'Centralise error handling in error middleware without leaking internal details',
      ],
      body: `Never trust input. Everything in a request (body, path parameters, query string, headers, cookies) can be anything an attacker chooses. Validate it at the edge of your API, before it reaches business logic or the database.

### Schema validation with zod

\`\`\`js
import { z } from 'zod';

const CreateNote = z.object({
  title: z.string().trim().min(1, 'Title is required').max(200),
  body: z.string().max(10_000).default(''),
  tags: z.array(z.string().trim().min(1).max(30)).max(10).default([]),
});
const IdParam = z.object({ id: z.coerce.number().int().positive() });
const ListQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  q: z.string().trim().max(100).optional(),
});
\`\`\`

The schema documents the contract, converts strings like \`"42"\` into numbers, applies defaults and rejects everything else.

### A reusable validation middleware

\`\`\`js
export function validate(schemas) {
  return (req, res, next) => {
    for (const part of ['params', 'query', 'body']) {
      if (!schemas[part]) continue;
      const result = schemas[part].safeParse(req[part]);
      if (!result.success) {
        return res.status(400).json({
          error: {
            code: 'VALIDATION_FAILED',
            message: 'Invalid request ' + part,
            details: result.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
          },
        });
      }
      req.valid = { ...req.valid, [part]: result.data };
    }
    next();
  };
}

app.post('/api/notes', validate({ body: CreateNote }), async (req, res) => {
  const note = await createNote(req.user.id, req.valid.body);
  res.status(201).json(note);
});
\`\`\`

Handlers read only \`req.valid\`, so unvalidated data never reaches them.

### Security: mass assignment and payload size
A \`z.object\` schema drops unknown keys from its output by default. That protects you from **mass assignment**, where a client sends \`{"title": "x", "role": "admin"}\` and your code copies the whole body into the database. Never pass \`req.body\` straight to an insert or update. Also limit body size so huge payloads cannot exhaust memory:

\`\`\`js
app.use(express.json({ limit: '100kb' }));   // 413 Payload Too Large beyond this
\`\`\`

### Error classes and a central handler

\`\`\`js
export class HttpError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}
export const notFound = (what) => new HttpError(404, 'NOT_FOUND', what + ' not found');

// Registered after all routes. Error middleware has four arguments.
app.use((err, req, res, next) => {
  const status = err.status ?? err.statusCode ?? 500;
  if (status >= 500) console.error({ err, path: req.path });   // full detail in server logs only
  res.status(status).json({
    error: {
      code: err.code ?? 'INTERNAL',
      message: status < 500 ? err.message : 'Something went wrong. Please try again.',
    },
  });
});
\`\`\`

Handlers can now \`throw notFound('Note')\`; the handler turns it into a clean 404. Unknown errors become a generic 500 with no stack trace sent to the client.

### A consistent error shape
Pick one format and use it everywhere, for example \`{ error: { code, message, details } }\`, or the standard **Problem Details** format (RFC 9457). Clients can then handle errors generically, and a stable \`code\` lets them react without parsing English messages.

### Common mistakes
- Returning raw exception messages or stack traces to users, which leaks internals.
- Validating in the frontend only.
- Using 500 for bad input. Client mistakes are 4xx; server faults are 5xx.
- Swallowing errors with an empty catch, so failures vanish silently.
- Spreading \`req.body\` into a database update (mass assignment).
- Forgetting to validate path and query parameters, not just bodies.`,
      practice: [
        { title: 'Add validation', kind: 'exercise', prompt: 'Add schema validation to every route of your notes API: body, :id param and query string, using a reusable validate middleware. Return 400 with field-level details for invalid input and add tests for three invalid cases.' },
        { title: 'Error middleware', kind: 'exercise', prompt: 'Create an HttpError class with helpers for 404 and 409, throw them from handlers, and map them in a single error middleware. Verify with a test that a thrown generic Error returns a 500 with no stack trace in the body.' },
        { title: 'Mass assignment test', kind: 'exercise', prompt: 'Send a PATCH request that includes an extra field such as ownerId or role. Prove with a test that the field is ignored and the stored record is unchanged.' },
        { title: 'Safe division', kind: 'problem', ref: 'safe-division' },
      ],
      resources: [
        { title: 'Express: Error handling', url: 'https://expressjs.com/en/guide/error-handling/', source: 'expressjs.com', kind: 'docs' },
        { title: 'Input Validation Cheat Sheet', url: 'https://cheatsheetseries.owasp.org/cheatsheets/Input_Validation_Cheat_Sheet.html', source: 'OWASP', kind: 'cheatsheet' },
        { title: 'RFC 9457: Problem Details for HTTP APIs', url: 'https://www.rfc-editor.org/rfc/rfc9457', source: 'IETF', kind: 'docs' },
      ],
      quiz: [
        {
          key: 'q1',
          type: 'single',
          title: 'Where to validate',
          prompt: 'Where must input validation happen to protect your data?',
          options: [
            { id: 'a', text: 'Only in the browser' },
            { id: 'b', text: 'On the server, at the API boundary' },
            { id: 'c', text: 'Only in the database' },
          ],
          correct: ['b'],
          explanation: 'Server-side validation cannot be bypassed by a client. Browser checks are a convenience; database constraints are a final safety net.',
          difficulty: 'easy',
        },
        {
          key: 'q2',
          type: 'true_false',
          title: 'Stack traces',
          prompt: 'Returning the full stack trace in production error responses helps clients and is safe.',
          options: [
            { id: 'true', text: 'True' },
            { id: 'false', text: 'False' },
          ],
          correct: ['false'],
          explanation: 'Stack traces reveal file paths, libraries and logic that help attackers. Log them on the server instead.',
          difficulty: 'easy',
        },
        {
          key: 'q3',
          type: 'single',
          title: 'Mass assignment',
          prompt: 'A handler runs `db.users.update(req.params.id, req.body)`. What is the main risk?',
          options: [
            { id: 'a', text: 'The request will be slower' },
            { id: 'b', text: 'A client can set fields they should not control, such as role or ownerId' },
            { id: 'c', text: 'JSON bodies cannot be stored' },
          ],
          correct: ['b'],
          explanation: 'Copying the whole body allows mass assignment. Validate against a schema that lists only the fields a client may change.',
          difficulty: 'medium',
        },
        {
          key: 'q4',
          type: 'fill_blank',
          title: 'Error middleware signature',
          prompt: 'Express recognises error-handling middleware because it declares ____ parameters: (err, req, res, next).',
          accepted: [['4', 'four']],
          explanation: 'A middleware function with four parameters is treated as an error handler and receives errors passed to `next(err)` or thrown in handlers.',
          difficulty: 'medium',
        },
        {
          key: 'q5',
          type: 'matching',
          title: 'Errors to status codes',
          prompt: 'Match each failure with the status code it should produce.',
          pairs: {
            left: [
              { id: 'l1', text: 'Title is longer than 200 characters' },
              { id: 'l2', text: 'Note id does not exist' },
              { id: 'l3', text: 'Slug already used by another note' },
              { id: 'l4', text: 'The database connection dropped' },
            ],
            right: [
              { id: 'r1', text: '404' },
              { id: 'r2', text: '500 or 503' },
              { id: 'r3', text: '400' },
              { id: 'r4', text: '409' },
            ],
          },
          matches: { l1: 'r3', l2: 'r1', l3: 'r4', l4: 'r2' },
          explanation: 'Input problems are 400, missing resources 404, conflicts with current state 409 and server-side failures 5xx.',
          difficulty: 'easy',
        },
      ],
    },
    {
      slug: 'auth-and-sessions',
      title: 'Authentication and sessions',
      module: 'Robust APIs',
      skill: 'auth-security-web',
      minutes: 70,
      milestone: true,
      completionCriteria: 'Implement register, login, logout and a protected route with hashed passwords, a regenerated session on login, a secure session cookie and ownership checks.',
      objectives: [
        'Distinguish authentication (who you are) from authorization (what you can do)',
        'Store passwords with a slow, salted hash such as argon2id or bcrypt',
        'Configure server sessions with HttpOnly, Secure, SameSite cookies and regenerate them on login',
        'Enforce ownership checks and compare server sessions with token-based approaches',
      ],
      body: `**Authentication** proves who a user is. **Authorization** decides what they may do. You need both on every protected request, and both must happen on the server.

### Storing passwords
Never store plain passwords, never encrypt them reversibly, and never use a fast hash like SHA-256 alone. Use a slow, salted password hashing algorithm. OWASP recommends **argon2id**; **bcrypt** is a common, acceptable choice.

\`\`\`js
import argon2 from 'argon2';

const passwordHash = await argon2.hash(password);          // on register (argon2id, random salt included)
const ok = await argon2.verify(user.passwordHash, attempt); // on login
\`\`\`

Prefer length over complexity rules: set a generous minimum length (current NIST guidance asks for 15 characters when a password is the only factor), allow long passphrases and paste so password managers work, and check new passwords against lists of known breached passwords.

### Server sessions with express-session

\`\`\`js
import session from 'express-session';

app.set('trust proxy', 1);                 // when running behind a proxy that terminates HTTPS
app.use(session({
  name: 'sid',
  secret: process.env.SESSION_SECRET,      // long random value from the environment
  resave: false,
  saveUninitialized: false,
  store: sessionStore,                     // a database or Redis store; the default memory store is for development only
  cookie: {
    httpOnly: true,                        // JavaScript cannot read it, which limits XSS damage
    secure: true,                          // only sent over HTTPS
    sameSite: 'lax',                       // not sent on most cross-site requests, which helps against CSRF
    maxAge: 1000 * 60 * 60 * 24 * 7,
  },
}));
\`\`\`

The cookie holds only a random session id. The user data lives on the server, so you can end a session at any time.

### Login, logout and the current user

\`\`\`js
app.post('/api/auth/login', validate({ body: LoginSchema }), async (req, res, next) => {
  const { email, password } = req.valid.body;
  const user = await findUserByEmail(email.toLowerCase());
  const ok = user ? await argon2.verify(user.passwordHash, password) : false;
  if (!ok) {
    return res.status(401).json({ error: { code: 'INVALID_CREDENTIALS', message: 'Email or password is incorrect.' } });
  }
  req.session.regenerate((err) => {       // new session id prevents session fixation
    if (err) return next(err);
    req.session.userId = user.id;
    res.json({ id: user.id, email: user.email });
  });
});

app.post('/api/auth/logout', (req, res, next) => {
  req.session.destroy((err) => {
    if (err) return next(err);
    res.clearCookie('sid').status(204).end();
  });
});

export function requireAuth(req, res, next) {
  if (!req.session.userId) return res.status(401).json({ error: { code: 'UNAUTHENTICATED', message: 'Please log in.' } });
  next();
}
\`\`\`

The same generic message for "no such user" and "wrong password" avoids revealing which emails are registered. For stronger protection, verify against a dummy hash when the user does not exist so response times are similar.

### Authorization: check ownership every time

\`\`\`js
app.delete('/api/notes/:id', requireAuth, validate({ params: IdParam }), async (req, res) => {
  const note = await getNote(req.valid.params.id);
  if (!note || note.ownerId !== req.session.userId) return res.status(404).end();
  await deleteNote(note.id);
  res.status(204).end();
});
\`\`\`

Checking only "is logged in" lets any user change ids in the URL and reach other people's data. This is the most common API vulnerability (broken object level authorization). Better still, scope queries by owner: \`WHERE id = $1 AND owner_id = $2\`.

### CSRF in brief
Browsers attach cookies automatically, so another site could submit a form to your API. \`SameSite=Lax\` blocks most of this; also never change data in GET handlers, and add a CSRF token or check the \`Origin\` header for state-changing requests. The *Full-Stack Path* covers this end to end.

### Sessions vs tokens (JWT)
Server sessions are simple, small and easy to revoke. Stateless signed tokens avoid a session lookup but are hard to revoke before they expire, and storing them in \`localStorage\` exposes them to any injected script. For a web app with its own frontend, cookie sessions are a sound default.

### Common mistakes
- Error messages that reveal whether an email is registered.
- Not regenerating the session id on login (session fixation).
- Storing tokens in \`localStorage\`, where any injected script can read them.
- Checking that a user is logged in but not that they own the resource.
- No rate limiting on login, allowing password guessing (next topic).
- Using the default in-memory session store in production, which leaks memory and logs everyone out on restart.`,
      practice: [
        { title: 'Login system', kind: 'exercise', prompt: 'Add register, login, logout and GET /api/me to your API. Hash passwords with argon2 or bcrypt, store sessions server-side, regenerate the session on login and set an HttpOnly, Secure, SameSite cookie.' },
        { title: 'Ownership checks', kind: 'exercise', prompt: 'Make notes belong to users. Write integration tests with two logged-in agents proving user A cannot read, update or delete user B\'s notes, and that unauthenticated requests get 401.' },
        { title: 'Enumeration check', kind: 'exercise', prompt: 'Try logging in with an unknown email and with a known email and a wrong password. Confirm the status code, message and approximate response time are the same, and fix any difference.' },
      ],
      resources: [
        { title: 'Authentication Cheat Sheet', url: 'https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html', source: 'OWASP', kind: 'cheatsheet' },
        { title: 'Password Storage Cheat Sheet', url: 'https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html', source: 'OWASP', kind: 'cheatsheet' },
        { title: 'Session Management Cheat Sheet', url: 'https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html', source: 'OWASP', kind: 'cheatsheet' },
        { title: 'Using HTTP cookies', url: 'https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/Cookies', source: 'MDN Web Docs', kind: 'docs' },
      ],
      quiz: [
        {
          key: 'q1',
          type: 'single',
          title: 'Password hashing',
          prompt: 'Which is the right way to store user passwords?',
          options: [
            { id: 'a', text: 'Encrypted with a key so they can be recovered' },
            { id: 'b', text: 'Hashed with SHA-256' },
            { id: 'c', text: 'Hashed with a slow, salted algorithm like argon2id or bcrypt' },
          ],
          correct: ['c'],
          explanation: 'Slow, salted hashes make brute-forcing leaked hashes expensive. Fast hashes and reversible encryption do not.',
          difficulty: 'easy',
        },
        {
          key: 'q2',
          type: 'single',
          title: 'HttpOnly',
          prompt: 'What does the `HttpOnly` cookie flag do?',
          options: [
            { id: 'a', text: 'Sends the cookie only over HTTPS' },
            { id: 'b', text: 'Prevents JavaScript from reading the cookie' },
            { id: 'c', text: 'Blocks the cookie on cross-site requests' },
          ],
          correct: ['b'],
          explanation: '`HttpOnly` hides the cookie from `document.cookie`. `Secure` restricts it to HTTPS; `SameSite` controls cross-site sending.',
          difficulty: 'easy',
        },
        {
          key: 'q3',
          type: 'matching',
          title: 'Cookie attributes',
          prompt: 'Match each cookie attribute with the risk it mainly reduces.',
          pairs: {
            left: [
              { id: 'l1', text: '`HttpOnly`' },
              { id: 'l2', text: '`Secure`' },
              { id: 'l3', text: '`SameSite=Lax`' },
            ],
            right: [
              { id: 'r1', text: 'The cookie being sent with cross-site form posts (CSRF)' },
              { id: 'r2', text: 'Injected scripts reading the session id (XSS impact)' },
              { id: 'r3', text: 'The cookie travelling over unencrypted HTTP' },
            ],
          },
          matches: { l1: 'r2', l2: 'r3', l3: 'r1' },
          explanation: 'Each attribute closes a different gap, so session cookies should normally set all three.',
          difficulty: 'medium',
        },
        {
          key: 'q4',
          type: 'true_false',
          title: 'Session fixation',
          prompt: 'Calling `req.session.regenerate()` on login helps prevent session fixation attacks.',
          options: [
            { id: 'true', text: 'True' },
            { id: 'false', text: 'False' },
          ],
          correct: ['true'],
          explanation: 'Issuing a new session id at login means an id an attacker planted before login becomes useless.',
          difficulty: 'medium',
        },
        {
          key: 'q5',
          type: 'single',
          title: 'Ownership',
          prompt: 'A logged-in user changes the URL from `/api/notes/10` to `/api/notes/11` and sees another user\'s note. What is missing?',
          options: [
            { id: 'a', text: 'Authentication' },
            { id: 'b', text: 'An object-level authorization (ownership) check' },
            { id: 'c', text: 'HTTPS' },
          ],
          correct: ['b'],
          explanation: 'The user is authenticated, but the API never checks that the note belongs to them. Scope queries by owner or compare ownerId on every request.',
          difficulty: 'medium',
        },
      ],
    },
    {
      slug: 'rate-limiting-and-logging',
      title: 'Rate limiting and logging',
      module: 'Robust APIs',
      skill: 'web-security',
      minutes: 55,
      objectives: [
        'Explain why APIs need rate limits and compare fixed window, sliding window and token bucket approaches',
        'Implement a rate-limiting middleware that returns 429 with Retry-After, with stricter limits on login',
        'Write structured JSON logs with request ids and appropriate levels',
        'Keep secrets and personal data out of logs while recording useful security events',
      ],
      body: `Once an API is public, it will receive far more traffic than your users generate: scripts guessing passwords, scrapers, buggy clients stuck in retry loops, and occasionally deliberate floods. **Rate limiting** keeps one client from harming everyone else, and **logging** tells you what actually happened.

### Rate-limiting approaches
- **Fixed window:** count requests per key per minute; reset at the start of each window. Simple, but allows bursts at window edges.
- **Sliding window:** count requests in the last N seconds, smoothing those bursts.
- **Token bucket:** each key has a bucket that refills at a steady rate; each request spends a token. Allows short bursts while enforcing an average rate.

The **key** is who you are limiting: an authenticated user id is best, an IP address is the fallback for anonymous traffic.

### A fixed-window middleware

\`\`\`js
export function rateLimit({ windowMs, limit, key = (req) => req.ip }) {
  const hits = new Map();                 // key -> { count, resetAt }
  setInterval(() => {                     // forget expired entries so memory does not grow forever
    const now = Date.now();
    for (const [k, v] of hits) if (v.resetAt <= now) hits.delete(k);
  }, windowMs).unref();

  return (req, res, next) => {
    const now = Date.now();
    const k = key(req);
    let entry = hits.get(k);
    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + windowMs };
      hits.set(k, entry);
    }
    entry.count += 1;
    if (entry.count > limit) {
      res.set('Retry-After', String(Math.ceil((entry.resetAt - now) / 1000)));
      return res.status(429).json({ error: { code: 'RATE_LIMITED', message: 'Too many requests. Please try again later.' } });
    }
    next();
  };
}

app.use('/api', rateLimit({ windowMs: 60_000, limit: 300 }));
app.post('/api/auth/login',
  rateLimit({ windowMs: 15 * 60_000, limit: 10, key: (req) => 'login:' + req.ip }),
  loginHandler);
\`\`\`

This in-memory version is perfect for learning and for a single process. When you run several instances, each has its own map, so share the counters in a store such as Redis. Libraries such as \`express-rate-limit\` provide tested implementations with pluggable stores.

Behind a load balancer or proxy, \`req.ip\` is the proxy's address unless you configure Express's \`trust proxy\` setting correctly. Trust only your own proxies, or clients can spoof their IP with an \`X-Forwarded-For\` header.

### Other abuse controls
- Cap page sizes (\`limit\` at most 100) and request body sizes.
- Set timeouts on outgoing calls to databases and other services.
- For login, also slow down repeated failures per **account**, not just per IP, and alert on spikes.

### Structured logging
Plain \`console.log('user logged in')\` is hard to search. Log **JSON objects** with consistent fields instead:

\`\`\`js
import pino from 'pino';
import { randomUUID } from 'node:crypto';

export const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  redact: ['req.headers.authorization', 'req.headers.cookie', '*.password', '*.token'],
});

app.use((req, res, next) => {
  req.id = randomUUID();
  res.set('X-Request-Id', req.id);       // users can quote it in bug reports
  const start = process.hrtime.bigint();
  res.on('finish', () => {
    logger.info({
      reqId: req.id, method: req.method, route: req.route?.path ?? req.path,
      status: res.statusCode, ms: Number(process.hrtime.bigint() - start) / 1e6,
      userId: req.session?.userId,
    }, 'request completed');
  });
  next();
});
\`\`\`

Use levels deliberately: \`error\` for failures someone must look at, \`warn\` for suspicious or degraded behaviour, \`info\` for normal events such as requests and logins, \`debug\` for detail you switch on temporarily.

### What to log, and what never to log
**Log** security-relevant events: logins and failed logins, logouts, password changes, authorization failures, validation failures at unusual rates, rate-limit hits, and admin actions, each with a timestamp, request id and user id.

**Never log** passwords, session ids, tokens, API keys, full payment card numbers or unnecessary personal data. Logs are copied to many systems and kept for a long time, so they are a common source of leaks. Redact by default.

### Common mistakes
- No limit on login, password reset or sign-up endpoints.
- Limiting only by IP, which punishes everyone behind a shared network and misses distributed guessing.
- An in-memory limiter on a multi-instance deployment, so each instance allows the full quota.
- Logging whole request bodies or headers, including passwords and cookies.
- Unstructured log lines that cannot be filtered by user, route or request id.`,
      practice: [
        { title: 'Protect login', kind: 'exercise', prompt: 'Add the fixed-window middleware to your API: a general limit for /api and a strict limit for POST /api/auth/login. Write a test that sends 11 login attempts and expects the last to return 429 with a Retry-After header.' },
        { title: 'Structured request logs', kind: 'exercise', prompt: 'Replace console.log with a structured logger. Every request should log a request id, method, route, status, duration and user id. Send a login request and confirm the password never appears in any log line.' },
        { title: 'Noisiest clients', kind: 'problem', ref: 'top-k-frequent' },
      ],
      resources: [
        { title: 'Logging Cheat Sheet', url: 'https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html', source: 'OWASP', kind: 'cheatsheet' },
        { title: 'Denial of Service Cheat Sheet', url: 'https://cheatsheetseries.owasp.org/cheatsheets/Denial_of_Service_Cheat_Sheet.html', source: 'OWASP', kind: 'cheatsheet' },
        { title: '429 Too Many Requests', url: 'https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Status/429', source: 'MDN Web Docs', kind: 'docs' },
      ],
      quiz: [
        {
          key: 'q1',
          type: 'single',
          title: 'Rate limit status',
          prompt: 'Which status code should an API return when a client exceeds its rate limit?',
          options: [
            { id: 'a', text: '403 Forbidden' },
            { id: 'b', text: '429 Too Many Requests' },
            { id: 'c', text: '503 Service Unavailable' },
          ],
          correct: ['b'],
          explanation: '429 tells the client it is sending too fast, ideally with a Retry-After header saying when to try again.',
          difficulty: 'easy',
        },
        {
          key: 'q2',
          type: 'fill_blank',
          title: 'When to retry',
          prompt: 'Which response header tells a rate-limited client how many seconds to wait? `____: 30`',
          accepted: [['Retry-After']],
          explanation: '`Retry-After` can hold a number of seconds or an HTTP date. Well-behaved clients wait before retrying.',
          difficulty: 'easy',
        },
        {
          key: 'q3',
          type: 'true_false',
          title: 'Multiple instances',
          prompt: 'An in-memory rate limiter enforces the same overall limit when the API runs as four separate instances behind a load balancer.',
          options: [
            { id: 'true', text: 'True' },
            { id: 'false', text: 'False' },
          ],
          correct: ['false'],
          explanation: 'Each instance keeps its own counters, so a client can get up to four times the limit. Use a shared store such as Redis.',
          difficulty: 'medium',
        },
        {
          key: 'q4',
          type: 'multi',
          title: 'Never log',
          prompt: 'Which values should never be written to logs? Select all that apply.',
          options: [
            { id: 'a', text: 'Plain-text passwords from a login request' },
            { id: 'b', text: 'Session cookie values' },
            { id: 'c', text: 'The request id' },
            { id: 'd', text: 'API keys and bearer tokens' },
          ],
          correct: ['a', 'b', 'd'],
          explanation: 'Credentials in logs can be stolen and replayed. Request ids are designed to be logged so you can trace a request.',
          difficulty: 'easy',
        },
        {
          key: 'q5',
          type: 'matching',
          title: 'Limiting algorithms',
          prompt: 'Match each rate-limiting approach with its description.',
          pairs: {
            left: [
              { id: 'l1', text: 'Fixed window' },
              { id: 'l2', text: 'Sliding window' },
              { id: 'l3', text: 'Token bucket' },
            ],
            right: [
              { id: 'r1', text: 'Tokens refill at a steady rate and each request spends one, allowing short bursts' },
              { id: 'r2', text: 'Counts reset at fixed intervals, so bursts can occur at window edges' },
              { id: 'r3', text: 'Counts requests over the most recent period, smoothing edge bursts' },
            ],
          },
          matches: { l1: 'r2', l2: 'r3', l3: 'r1' },
          explanation: 'All three cap traffic. They differ in how they treat bursts and how much state they keep.',
          difficulty: 'medium',
        },
      ],
    },
    {
      slug: 'databases-from-node',
      title: 'Databases from Node.js',
      module: 'Data',
      skill: 'nodejs',
      minutes: 60,
      objectives: [
        'Connect to PostgreSQL with a connection pool and a least-privilege database user',
        'Write parameterised queries to prevent SQL injection and map database errors to HTTP responses',
        'Use transactions for multi-step changes and avoid N+1 queries with joins',
        'Manage schema changes with versioned migrations',
      ],
      body: `Real APIs store data in a database. A relational database like **PostgreSQL** gives you constraints, transactions and powerful queries, and it enforces rules even when application code has bugs.

### Connection pool and parameterised queries

\`\`\`js
// src/db.js
import pg from 'pg';
export const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 10 });

export async function getNotesForUser(userId) {
  const { rows } = await pool.query(
    'SELECT id, title, created_at FROM notes WHERE owner_id = $1 ORDER BY created_at DESC LIMIT 100',
    [userId],
  );
  return rows;
}
\`\`\`

Opening a database connection is slow, so a **pool** keeps a few open and lends them out. The \`$1\` placeholder sends the value separately from the SQL text, so input can never change the query's structure.

### Security: SQL injection

\`\`\`js
// NEVER do this
pool.query("SELECT * FROM users WHERE email = '" + email + "'");
// An email of  ' OR '1'='1  returns every user.
\`\`\`

Always use placeholders for values. Placeholders cannot stand in for identifiers such as table or column names, so if users choose a sort column, map their choice through an allow-list: \`const column = { newest: 'created_at', title: 'title' }[req.query.sort] ?? 'created_at'\`. Also connect as a database user that has only the permissions the app needs (no \`DROP\`, no superuser).

### Map database errors to HTTP

\`\`\`js
try {
  const { rows } = await pool.query(
    'INSERT INTO notes (owner_id, slug, title) VALUES ($1, $2, $3) RETURNING id, slug, title',
    [userId, slug, title],
  );
  res.status(201).json(rows[0]);
} catch (err) {
  if (err.code === '23505') return res.status(409).json({ error: { code: 'DUPLICATE', message: 'That slug is already in use.' } });
  throw err;   // anything else is a 500, handled by the error middleware
}
\`\`\`

\`23505\` is PostgreSQL's code for a unique constraint violation. Let the database enforce uniqueness instead of "check then insert" in code, which races when two requests arrive together.

### Transactions
When several writes must succeed or fail together, wrap them in a transaction on a single client:

\`\`\`js
const client = await pool.connect();
try {
  await client.query('BEGIN');
  await client.query('UPDATE accounts SET balance = balance - $1 WHERE id = $2', [amount, fromId]);
  await client.query('UPDATE accounts SET balance = balance + $1 WHERE id = $2', [amount, toId]);
  await client.query('INSERT INTO transfers (from_id, to_id, amount) VALUES ($1, $2, $3)', [fromId, toId, amount]);
  await client.query('COMMIT');
} catch (e) {
  await client.query('ROLLBACK');
  throw e;
} finally {
  client.release();          // always return the client to the pool
}
\`\`\`

### Avoid N+1 queries

\`\`\`js
// N+1: one query for the posts, then one more per post
for (const post of posts) post.author = await getUser(post.author_id);

// One query with a join
const { rows } = await pool.query(
  'SELECT p.id, p.title, u.name AS author FROM posts p JOIN users u ON u.id = p.author_id ORDER BY p.created_at DESC LIMIT 20',
);
\`\`\`

### Migrations
Keep schema changes in numbered migration files committed to Git (\`001_create_users.sql\`, \`002_add_notes.sql\`), so every environment can be brought to the same schema. Query builders and ORMs such as Drizzle, Prisma and Knex include migration tooling. They also use parameterised queries, but their "raw SQL" escape hatches can still be misused.

### Common mistakes
- Creating a new connection per request instead of using a pool.
- Forgetting to release a pooled client, which eventually exhausts the pool and hangs the app.
- N+1 queries: one query for a list, then one more per row.
- Relying only on app code for rules the database can enforce (NOT NULL, UNIQUE, foreign keys, CHECK).
- Building SQL with string concatenation, including inside ORM raw-query functions.
- Selecting \`*\` and returning every column, including password hashes, to the client.`,
      practice: [
        { title: 'Persist the notes API', kind: 'exercise', prompt: 'Replace in-memory storage in your notes API with PostgreSQL (or SQLite). Use parameterised queries only, add a UNIQUE constraint on (owner_id, slug), and map a unique violation to 409 Conflict. Select explicit columns, never *.' },
        { title: 'Spot the injection', kind: 'exercise', prompt: 'Write a deliberately vulnerable query using string concatenation in a scratch project, show how input like \' OR \'1\'=\'1 changes it, then fix it with a placeholder. Add an allow-list for a user-chosen sort column.' },
        { title: 'Orders with customer names', kind: 'sql', ref: 'sql-orders-with-customer-names' },
        { title: 'Order count for every customer', kind: 'sql', ref: 'sql-order-count-including-zero' },
      ],
      resources: [
        { title: 'node-postgres documentation', url: 'https://node-postgres.com/', source: 'node-postgres', kind: 'docs' },
        { title: 'SQL Injection Prevention Cheat Sheet', url: 'https://cheatsheetseries.owasp.org/cheatsheets/SQL_Injection_Prevention_Cheat_Sheet.html', source: 'OWASP', kind: 'cheatsheet' },
        { title: 'PostgreSQL Tutorial: Transactions', url: 'https://www.postgresql.org/docs/current/tutorial-transactions.html', source: 'PostgreSQL', kind: 'docs' },
      ],
      quiz: [
        {
          key: 'q1',
          type: 'single',
          title: 'SQL injection',
          prompt: 'Which query is safe from SQL injection?',
          options: [
            { id: 'a', text: "`pool.query(\"SELECT * FROM users WHERE email = '\" + email + \"'\")`" },
            { id: 'b', text: "`pool.query('SELECT * FROM users WHERE email = $1', [email])`" },
            { id: 'c', text: 'Both, if the email is trimmed first' },
          ],
          correct: ['b'],
          explanation: 'Parameterised queries send values separately from the SQL text. Trimming does not stop injection.',
          difficulty: 'easy',
        },
        {
          key: 'q2',
          type: 'true_false',
          title: 'Transactions',
          prompt: 'If one statement in a transaction fails and you roll back, earlier statements in that transaction are undone too.',
          options: [
            { id: 'true', text: 'True' },
            { id: 'false', text: 'False' },
          ],
          correct: ['true'],
          explanation: 'A transaction is atomic: all of its changes are committed together or none are.',
          difficulty: 'easy',
        },
        {
          key: 'q3',
          type: 'single',
          title: 'N+1 queries',
          prompt: 'An endpoint lists 50 posts and then runs one query per post to load its author. How many queries run, and what is the usual fix?',
          options: [
            { id: 'a', text: '2 queries; no fix needed' },
            { id: 'b', text: '51 queries; load authors with a join or a single IN query' },
            { id: 'c', text: '50 queries; add an index' },
          ],
          correct: ['b'],
          explanation: 'One list query plus one per row is the N+1 pattern. A join or `WHERE id = ANY($1)` fetches all authors at once.',
          difficulty: 'medium',
        },
        {
          key: 'q4',
          type: 'fill_blank',
          title: 'Placeholder',
          prompt: 'In node-postgres, complete the placeholder that refers to the first value in the parameters array: `pool.query(\'SELECT * FROM notes WHERE id = ____\', [id])`',
          accepted: [['$1']],
          explanation: 'PostgreSQL uses numbered placeholders: `$1`, `$2` and so on, matched to the values array in order.',
          difficulty: 'easy',
        },
        {
          key: 'q5',
          type: 'single',
          title: 'Dynamic sort column',
          prompt: 'Users can choose to sort by "newest" or "title". How should you put the column name into the SQL?',
          options: [
            { id: 'a', text: 'Pass it as a `$1` placeholder' },
            { id: 'b', text: 'Map the choice through an allow-list of known column names' },
            { id: 'c', text: 'Concatenate `req.query.sort` after escaping quotes' },
          ],
          correct: ['b'],
          explanation: 'Placeholders work only for values, not identifiers. An allow-list guarantees only known column names reach the query.',
          difficulty: 'hard',
        },
      ],
    },
    {
      slug: 'api-design-and-versioning',
      title: 'API design and versioning',
      module: 'Design and delivery',
      skill: 'api-design',
      minutes: 55,
      objectives: [
        'Model resources and relationships with clear, consistent URLs and response shapes',
        'Add bounded cursor pagination, filtering and sorting to list endpoints',
        'Make retries safe with idempotency keys and evolve an API without breaking existing clients',
        'Document an API with an OpenAPI description and avoid exposing more data than needed',
      ],
      body: `A good API is predictable: once a developer learns one endpoint, they can guess the rest. Design decisions are hard to undo once clients depend on them, so they are worth getting right early.

### Consistent resources

\`\`\`text
GET    /v1/projects                  list projects (paginated)
POST   /v1/projects                  create
GET    /v1/projects/42               read
PATCH  /v1/projects/42               update some fields
DELETE /v1/projects/42               delete
GET    /v1/projects/42/tasks         tasks in a project
POST   /v1/projects/42/archive       an action that does not map to CRUD
\`\`\`

Use plural nouns, one casing style for JSON fields (pick camelCase or snake_case and stick to it), ISO 8601 timestamps in UTC, and string ids if they might ever exceed safe JavaScript integers.

### Filtering, sorting and pagination
Never return an unbounded list. Cap the page size on the server, whatever the client asks for.

\`\`\`text
GET /v1/tasks?status=open&sort=-createdAt&limit=20&cursor=MTIw
{
  "data": [ ... ],
  "nextCursor": "MTQw"
}
\`\`\`

**Cursor** (keyset) pagination continues after the last item seen, so it stays correct when rows are inserted and fast on large tables:

\`\`\`js
app.get('/v1/tasks', requireAuth, validate({ query: TaskListQuery }), async (req, res) => {
  const { limit, cursor } = req.valid.query;                  // limit is 1..100, default 20
  const afterId = cursor ? Number(Buffer.from(cursor, 'base64url').toString()) : 0;
  const { rows } = await pool.query(
    'SELECT id, title, status, created_at FROM tasks WHERE owner_id = $1 AND id > $2 ORDER BY id LIMIT $3',
    [req.session.userId, afterId, limit + 1],                  // fetch one extra to know if there is more
  );
  const page = rows.slice(0, limit);
  const nextCursor = rows.length > limit ? Buffer.from(String(page[page.length - 1].id)).toString('base64url') : null;
  res.json({ data: page, nextCursor });
});
\`\`\`

**Offset** pagination (\`?page=3\`) is simpler and allows jumping to a page, but it can skip or repeat items as data changes and gets slower deep into large tables.

### Safe retries with idempotency keys
Networks fail, and clients retry. Retrying a POST can create a duplicate order. Let clients send an \`Idempotency-Key\` header with a unique value; the server stores the first result for that key and returns the same result for repeats.

### Evolving without breaking clients
- **Additive changes are safe:** new optional request fields, new response fields, new endpoints.
- **Breaking changes:** removing or renaming fields, changing types or meanings, making optional inputs required, changing error codes. Ship them in a new version (\`/v2\` or a version header) and give clients time to migrate.
- Announce deprecations, add a \`Sunset\` header with the retirement date, and track who still calls old versions.

### Expose only what clients need
Return an explicit list of fields, never the raw database row. Leaking fields such as \`passwordHash\`, \`isAdmin\` or internal notes is a common API vulnerability. Combine this with the ownership checks from the authentication topic.

### Documentation
Describe your API in an **OpenAPI** file. Tools can generate reference docs, client SDKs, mock servers and request validation from it.

\`\`\`yaml
paths:
  /v1/tasks/{id}:
    get:
      parameters:
        - { name: id, in: path, required: true, schema: { type: integer } }
      responses:
        '200': { description: The task, content: { application/json: { schema: { $ref: '#/components/schemas/Task' } } } }
        '404': { description: Task not found }
\`\`\`

### Common mistakes
- Verbs in URLs (\`/createProject\`).
- Different error formats on different endpoints.
- Renaming a field in place and breaking every mobile app still on the old release.
- Letting clients request \`limit=100000\`.
- Returning whole database rows, including sensitive columns.`,
      practice: [
        { title: 'Design review', kind: 'exercise', prompt: 'Write the endpoint list for a library system (books, members, loans) including pagination, filters, sorting and error format. Ask a peer to guess three endpoints you did not show them, and refine until they can.' },
        { title: 'Cursor pagination', kind: 'exercise', prompt: 'Add cursor pagination with a server-side maximum page size to your notes list endpoint. Write a test that inserts 45 notes and walks all pages, asserting no note is missing or repeated.' },
        { title: 'OpenAPI spec', kind: 'exercise', prompt: 'Write an OpenAPI description for two endpoints of your notes API, including request and response schemas and error responses. Render it with any free OpenAPI viewer.' },
        { title: 'Top four salaries', kind: 'sql', ref: 'sql-top-four-salaries' },
      ],
      resources: [
        { title: 'API Design Guide', url: 'https://docs.cloud.google.com/apis/design', source: 'Google Cloud', kind: 'docs' },
        { title: 'OpenAPI Specification', url: 'https://spec.openapis.org/oas/latest.html', source: 'OpenAPI Initiative', kind: 'docs' },
        { title: 'OWASP API Security Project', url: 'https://owasp.org/API-Security/', source: 'OWASP', kind: 'article' },
      ],
      quiz: [
        {
          key: 'q1',
          type: 'multi',
          title: 'Breaking changes',
          prompt: 'Which changes break existing clients? Select all that apply.',
          options: [
            { id: 'a', text: 'Adding a new optional response field' },
            { id: 'b', text: 'Renaming `userName` to `username`' },
            { id: 'c', text: 'Making a previously optional request field required' },
            { id: 'd', text: 'Adding a new endpoint' },
          ],
          correct: ['b', 'c'],
          explanation: 'Renames and stricter requirements break clients written against the old contract. Additive changes do not.',
          difficulty: 'easy',
        },
        {
          key: 'q2',
          type: 'single',
          title: 'Pagination choice',
          prompt: 'A feed gets new items constantly. Which pagination avoids showing duplicates as users scroll?',
          options: [
            { id: 'a', text: 'Offset pagination' },
            { id: 'b', text: 'Cursor pagination' },
            { id: 'c', text: 'No pagination' },
          ],
          correct: ['b'],
          explanation: 'Cursors continue from the last item seen, so new inserts do not shift the pages.',
          difficulty: 'easy',
        },
        {
          key: 'q3',
          type: 'fill_blank',
          title: 'Safe POST retries',
          prompt: 'A client sends a unique value in the ____ header so the server can recognise a retried payment request and avoid charging twice.',
          accepted: [['Idempotency-Key']],
          explanation: 'The server stores the result for each key and returns it again for repeats, making POST safe to retry.',
          difficulty: 'medium',
        },
        {
          key: 'q4',
          type: 'true_false',
          title: 'Client-chosen page size',
          prompt: 'If a client sends `limit=50000`, the API should return 50,000 rows because the client asked for them.',
          options: [
            { id: 'true', text: 'True' },
            { id: 'false', text: 'False' },
          ],
          correct: ['false'],
          explanation: 'Always cap page sizes on the server. Unbounded queries are slow and an easy way to overload the service.',
          difficulty: 'easy',
        },
        {
          key: 'q5',
          type: 'single',
          title: 'Data exposure',
          prompt: 'A `GET /v1/users/me` handler returns `rows[0]` from `SELECT * FROM users`. What is the main problem?',
          options: [
            { id: 'a', text: 'It may expose sensitive columns such as password hashes or internal flags' },
            { id: 'b', text: 'JSON cannot represent database rows' },
            { id: 'c', text: 'It should use POST instead of GET' },
          ],
          correct: ['a'],
          explanation: 'Return an explicit, documented set of fields. Raw rows leak whatever columns exist today and any added later.',
          difficulty: 'medium',
        },
      ],
    },
    {
      slug: 'deployment-basics',
      title: 'Deployment basics',
      module: 'Design and delivery',
      skill: 'nodejs',
      minutes: 55,
      objectives: [
        'Configure an app from validated environment variables, never hard-coded secrets',
        'Prepare a Node service for production: start script, port, health and readiness checks, logs to stdout',
        'Shut down gracefully on SIGTERM and package the service in a container image',
        'Run migrations and roll back safely during a deploy',
      ],
      body: `Deploying means running your code somewhere others can reach it, reliably and repeatably. Most platforms (containers, managed app hosts, serverless) expect the same few things from your app.

### Configuration from the environment
Follow the twelve-factor idea: the same build runs everywhere; only configuration changes. Validate configuration at startup so a missing value fails fast with a clear message instead of a confusing error at 3 a.m.

\`\`\`js
// src/config.js
import { z } from 'zod';

const Env = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().default(3000),
  DATABASE_URL: z.string().min(1),
  SESSION_SECRET: z.string().min(32),
});

export const config = Env.parse(process.env);   // throws and lists every problem
\`\`\`

Keep secrets in your platform's secret store or environment settings. Commit a \`.env.example\` with placeholder names, add \`.env\` to \`.gitignore\`, and load it locally with \`node --env-file=.env src/server.js\` (Node 20.6 and later).

### Production readiness checklist
- \`npm ci\` for reproducible installs from the lockfile, and \`NODE_ENV=production\`
- Listen on the port the platform provides (\`process.env.PORT\`)
- \`GET /healthz\` (liveness: the process is up) and \`GET /readyz\` (readiness: it can reach the database and should receive traffic)
- Structured logs to stdout, not files on local disk
- HTTPS terminated by the platform or a reverse proxy, with \`trust proxy\` set correctly
- Graceful shutdown on SIGTERM

### Health checks and graceful shutdown

\`\`\`js
app.get('/healthz', (req, res) => res.json({ status: 'ok' }));
app.get('/readyz', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ready' });
  } catch {
    res.status(503).json({ status: 'unavailable' });
  }
});

const server = app.listen(config.PORT, () => logger.info({ port: config.PORT }, 'listening'));

process.on('SIGTERM', () => {
  logger.info('SIGTERM received, draining connections');
  server.close(async () => {          // stop accepting new connections, finish in-flight requests
    await pool.end();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();   // do not hang forever
});
\`\`\`

Platforms send SIGTERM before stopping an instance during deploys and scaling. Without a handler, in-flight requests are cut off.

### A minimal Dockerfile

\`\`\`dockerfile
FROM node:22-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
ENV NODE_ENV=production
USER node
EXPOSE 3000
CMD ["node", "src/server.js"]
\`\`\`

Copying \`package*.json\` first lets Docker cache the dependency layer between builds. Add a \`.dockerignore\` containing \`node_modules\`, \`.env\` and \`.git\` so secrets and local files never enter the image. \`USER node\` avoids running as root.

### Deploy safely
- Run database migrations as a separate step before the new code starts.
- Make migrations **backward compatible** with the previous app version (add a column first, start using it in the next release, remove old columns later), so you can roll back the code without rolling back the schema.
- Know how to roll back to the last good release, and practise it once.

### Common mistakes
- Committing \`.env\` or API keys to Git. Rotate any secret that was ever pushed.
- Writing uploads to the container's disk, which disappears on restart. Use object storage.
- No health check, so the platform cannot tell a crashed app from a working one.
- A readiness check that does not test dependencies, so traffic is sent to an instance that cannot reach the database.
- Ignoring SIGTERM, so every deploy drops requests.`,
      practice: [
        { title: 'Deploy your API', kind: 'exercise', prompt: 'Deploy your notes API and database to a free tier of any hosting platform. All configuration must come from validated environment variables, /healthz must return 200 and /readyz must return 503 when the database is unreachable.' },
        { title: 'Containerise', kind: 'exercise', prompt: 'Write a Dockerfile and .dockerignore for your API, build it, run it locally with environment variables passed via -e, and confirm the image does not contain your .env file. Stop the container and check the logs show a graceful shutdown.' },
        { title: 'Safe migration plan', kind: 'exercise', prompt: 'Plan renaming the notes column body to content without downtime. Write the sequence of migrations and releases so that every step can be rolled back.' },
      ],
      resources: [
        { title: 'The Twelve-Factor App', url: 'https://12factor.net/', source: '12factor.net', kind: 'article' },
        { title: 'Node.js: development vs production', url: 'https://nodejs.org/learn/getting-started/nodejs-the-difference-between-development-and-production', source: 'nodejs.org', kind: 'docs' },
        { title: 'Docker: Get started', url: 'https://docs.docker.com/get-started/', source: 'Docker Docs', kind: 'docs' },
      ],
      quiz: [
        {
          key: 'q1',
          type: 'single',
          title: 'Leaked secret',
          prompt: 'You pushed an API key to a public repository, then deleted it in the next commit. What must you do?',
          options: [
            { id: 'a', text: 'Nothing; it is deleted' },
            { id: 'b', text: 'Revoke and rotate the key, because it remains in history and may already be copied' },
            { id: 'c', text: 'Make the repository private' },
          ],
          correct: ['b'],
          explanation: 'Git history and automated scrapers keep the secret. Treat it as compromised and rotate it.',
          difficulty: 'easy',
        },
        {
          key: 'q2',
          type: 'true_false',
          title: 'Same build',
          prompt: 'In a twelve-factor app, the same build artifact is promoted through staging and production with different configuration.',
          options: [
            { id: 'true', text: 'True' },
            { id: 'false', text: 'False' },
          ],
          correct: ['true'],
          explanation: 'Configuration lives in the environment, so one tested build can run anywhere.',
          difficulty: 'easy',
        },
        {
          key: 'q3',
          type: 'fill_blank',
          title: 'Shutdown signal',
          prompt: 'Platforms usually send the ____ signal to ask a process to shut down gracefully before stopping it.',
          accepted: [['SIGTERM']],
          explanation: 'Handle SIGTERM by closing the server, finishing in-flight requests and releasing resources such as database pools.',
          difficulty: 'medium',
        },
        {
          key: 'q4',
          type: 'single',
          title: 'Readiness',
          prompt: 'What should a readiness endpoint do when the database is unreachable?',
          options: [
            { id: 'a', text: 'Return 200 so the instance stays in rotation' },
            { id: 'b', text: 'Return 503 so the load balancer stops sending traffic to this instance' },
            { id: 'c', text: 'Crash the process immediately' },
          ],
          correct: ['b'],
          explanation: 'Readiness tells the platform whether to route traffic here. A failing dependency means it should not, at least until it recovers.',
          difficulty: 'medium',
        },
        {
          key: 'q5',
          type: 'multi',
          title: 'Container hygiene',
          prompt: 'Which are good practices for a Node.js container image? Select all that apply.',
          options: [
            { id: 'a', text: 'A .dockerignore that excludes .env and node_modules' },
            { id: 'b', text: 'Running as a non-root user' },
            { id: 'c', text: 'Baking production secrets into the image with ENV' },
            { id: 'd', text: 'Installing dependencies with npm ci from the lockfile' },
          ],
          correct: ['a', 'b', 'd'],
          explanation: 'Images are copied and cached widely, so secrets must come from the runtime environment, not the image.',
          difficulty: 'medium',
        },
      ],
    },
  ],
};

export const fullStackCapstonePath: SeedTrack = {
  slug: 'full-stack-path',
  title: 'Full-Stack Path: From Frontend to Production',
  category: 'web',
  summary: 'Connect a React frontend to a Node API, secure it end to end, test every layer and ship it with CI and monitoring.',
  description: `**Who it's for:** learners who have finished the React and Node API tracks and want to build, secure and ship a complete application, the kind of project that anchors a portfolio or capstone.

**Prerequisites:** Frontend Development with React and Backend Development: APIs with Node.js. A free GitHub account and a free hosting tier are enough for the shipping topic.

**You will be able to:**
- connect a frontend and backend in development and production, with one API client and shared validation
- implement login, session restore, logout and CSRF protection across both tiers, with the server as the authority
- harden the app against XSS and misconfiguration with output encoding, a Content Security Policy, security headers and dependency checks
- test a full-stack app with unit, integration and end-to-end tests that are fast and deterministic
- deploy with CI, monitor the running system and roll back with a runbook

**Milestones:** *Secure end-to-end auth* (topic 2) and *Shipped and monitored* (topic 5).`,
  level: 'intermediate',
  estimatedHours: 34,
  roles: ['full-stack developer', 'software engineer', 'frontend developer', 'backend developer'],
  contentStatus: 'complete',
  prerequisites: ['frontend-react', 'backend-node-apis'],
  topics: [
    {
      slug: 'integrating-frontend-backend',
      title: 'Integrating the front end and back end',
      module: 'Integration',
      skill: 'http-rest',
      minutes: 60,
      objectives: [
        'Set up a dev proxy, same-origin production serving, or a strict CORS policy so the frontend can call the API',
        'Build a small API client with consistent error handling',
        'Share validation schemas between client and server and display server field errors',
        'Keep secrets out of the frontend build and handle loading, error and empty states for every request',
      ],
      body: `In development the frontend (for example Vite on port 5173) and the API (port 3000) run on different **origins**. An origin is scheme + host + port, so the browser applies the same-origin policy and blocks the page from reading API responses unless you set things up deliberately.

### Option 1: dev proxy (simplest)
Let the dev server forward \`/api\` requests, so the browser sees one origin:

\`\`\`js
// vite.config.js
import { defineConfig } from 'vite';
export default defineConfig({
  server: { proxy: { '/api': 'http://localhost:3000' } },
});
\`\`\`

### Same origin in production
The cleanest production setup serves the built frontend and the API from one origin, either through a reverse proxy or from Express itself:

\`\`\`js
import path from 'node:path';
const distDir = path.resolve('client/dist');

app.use('/api', apiRouter);
app.use(express.static(distDir));
app.use((req, res, next) => {                       // SPA fallback for client-side routes
  if (req.method !== 'GET' || req.path.startsWith('/api/')) return next();
  res.sendFile(path.join(distDir, 'index.html'));
});
\`\`\`

Same origin means no CORS configuration, and cookies with \`SameSite=Lax\` just work.

### Option 2: CORS
If the API must live on another origin, allow exactly the frontend's origin, never \`*\`, especially when cookies are involved:

\`\`\`js
import cors from 'cors';
app.use('/api', cors({ origin: ['https://app.example.com'], credentials: true }));
\`\`\`

### One API client, not fetch everywhere

\`\`\`js
// client/src/api.js
export class ApiError extends Error {
  constructor(status, body) {
    super(body?.error?.message ?? 'Request failed with status ' + status);
    this.status = status;
    this.code = body?.error?.code;
    this.details = body?.error?.details ?? [];
  }
}

export async function api(path, { body, headers, ...options } = {}) {
  const res = await fetch('/api' + path, {
    ...options,
    credentials: 'include',
    headers: {
      Accept: 'application/json',
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...headers,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const isJson = res.headers.get('Content-Type')?.includes('application/json');
  const data = isJson ? await res.json() : null;     // 204 and HTML error pages have no JSON
  if (!res.ok) throw new ApiError(res.status, data);
  return data;
}

// usage: const note = await api('/notes', { method: 'POST', body: { title } });
\`\`\`

Centralising this gives you one place for credentials, CSRF headers, error mapping and logging.

### Share validation and show server errors
Put schemas in a shared module that both sides import, so the form gives instant feedback and the API enforces the same rules:

\`\`\`js
// shared/note.js
import { z } from 'zod';
export const NoteInput = z.object({ title: z.string().trim().min(1, 'Title is required').max(200) });
\`\`\`

\`\`\`jsx
// In the form's submit handler
try {
  await api('/notes', { method: 'POST', body: values });
} catch (err) {
  if (err instanceof ApiError && err.status === 400) {
    setErrors(Object.fromEntries(err.details.map((d) => [d.field, d.message])));
  } else {
    setErrors({ form: 'Could not save. Please try again.' });
  }
}
\`\`\`

The server is still the authority: shared schemas improve the experience, they do not replace server validation.

### Environment variables in the frontend
Build tools inline frontend environment variables into the JavaScript bundle. In Vite, only variables prefixed \`VITE_\` are exposed, via \`import.meta.env\`. Anything there is public, so use it for values like a public analytics id, never for secrets.

### Common mistakes
- \`Access-Control-Allow-Origin: *\` combined with credentials (browsers reject it, and it is unsafe).
- Hard-coding \`http://localhost:3000\` in frontend code that ships to production.
- Assuming CORS protects your API. It only controls which browser pages may read responses; other clients ignore it.
- Putting an API secret in a \`VITE_\` variable.
- Calling \`res.json()\` on every response, then crashing on 204 or an HTML error page.`,
      practice: [
        { title: 'Wire up the notes app', kind: 'exercise', prompt: 'Build a React frontend for your notes API using a dev proxy and a single api() helper with an ApiError class. Show loading, empty and error states, and display server validation messages next to the relevant fields.' },
        { title: 'Shared schema', kind: 'exercise', prompt: 'Move your note validation schema into a shared module used by both the form (for instant feedback) and the API route (for enforcement). Prove the server still rejects invalid input sent with curl.' },
        { title: 'Production serving', kind: 'exercise', prompt: 'Build the frontend and serve it from Express with an SPA fallback that never swallows /api routes. Refresh a deep link such as /notes/3 and confirm it loads, and that an unknown /api path still returns JSON 404.' },
      ],
      resources: [
        { title: 'Cross-Origin Resource Sharing (CORS)', url: 'https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/CORS', source: 'MDN Web Docs', kind: 'docs' },
        { title: 'Same-origin policy', url: 'https://developer.mozilla.org/en-US/docs/Web/Security/Defenses/Same-origin_policy', source: 'MDN Web Docs', kind: 'docs' },
        { title: 'Vite: server.proxy option', url: 'https://vite.dev/config/server-options', source: 'vite.dev', kind: 'docs' },
      ],
      quiz: [
        {
          key: 'q1',
          type: 'true_false',
          title: 'CORS is not auth',
          prompt: 'Configuring CORS correctly prevents attackers from calling your API with curl.',
          options: [
            { id: 'true', text: 'True' },
            { id: 'false', text: 'False' },
          ],
          correct: ['false'],
          explanation: 'CORS is enforced by browsers only. Non-browser clients ignore it, so the API still needs authentication and authorization.',
          difficulty: 'easy',
        },
        {
          key: 'q2',
          type: 'single',
          title: 'Different origins',
          prompt: 'Which pair of URLs are different origins?',
          options: [
            { id: 'a', text: '`https://app.com/a` and `https://app.com/b`' },
            { id: 'b', text: '`http://localhost:5173` and `http://localhost:3000`' },
            { id: 'c', text: 'Neither pair' },
          ],
          correct: ['b'],
          explanation: 'An origin is scheme + host + port. Different ports mean different origins; different paths do not.',
          difficulty: 'easy',
        },
        {
          key: 'q3',
          type: 'true_false',
          title: 'Frontend env variables',
          prompt: 'A secret stored in a `VITE_` environment variable stays on the build server and never reaches users.',
          options: [
            { id: 'true', text: 'True' },
            { id: 'false', text: 'False' },
          ],
          correct: ['false'],
          explanation: 'Vite inlines `VITE_` variables into the JavaScript bundle, which anyone can download and read.',
          difficulty: 'medium',
        },
        {
          key: 'q4',
          type: 'fill_blank',
          title: 'Sending cookies',
          prompt: 'Complete the fetch option that sends cookies on cross-origin requests: `fetch(url, { credentials: \'____\' })`',
          accepted: [['include']],
          explanation: '`include` sends cookies even cross-origin (the server must also allow credentials). The default, `same-origin`, sends them only to the same origin.',
          difficulty: 'medium',
        },
        {
          key: 'q5',
          type: 'single',
          title: 'Parsing responses',
          prompt: 'An API client calls `await res.json()` on every response and crashes after a successful DELETE. What is the most likely cause?',
          options: [
            { id: 'a', text: 'DELETE requests cannot use fetch' },
            { id: 'b', text: 'The server returned 204 No Content, which has no JSON body to parse' },
            { id: 'c', text: 'The cookie expired' },
          ],
          correct: ['b'],
          explanation: 'Check the status or Content-Type before parsing. 204 responses and HTML error pages are not JSON.',
          difficulty: 'medium',
        },
      ],
    },
    {
      slug: 'auth-flows-end-to-end',
      title: 'Authentication flows end to end',
      module: 'Integration',
      skill: 'auth-security-web',
      minutes: 70,
      milestone: true,
      completionCriteria: 'Users can register, log in, stay logged in across refresh, log out, and cannot access other users\' data through the UI or the API. State-changing requests without a valid CSRF token are rejected.',
      objectives: [
        'Implement login, session restore and logout across frontend and backend',
        'Protect state-changing requests against CSRF with SameSite cookies and a synchronizer token',
        'Handle expired sessions gracefully in the UI and return users to where they were',
        'Enforce authorization on the server for every resource',
      ],
      body: `End-to-end auth means the browser, the frontend code and the API agree on who the user is, and the **server** stays the authority.

### The flow with cookie sessions
1. On app load, the frontend calls \`GET /api/auth/me\` to restore the session after a refresh, and fetches a CSRF token.
2. The login form POSTs credentials to \`/api/auth/login\`.
3. The server verifies the password hash, regenerates the session and sets an **HttpOnly, Secure, SameSite** cookie.
4. Every API request includes the cookie automatically (\`credentials: 'include'\`).
5. Logout POSTs to \`/api/auth/logout\`; the server destroys the session and clears the cookie.

### Restoring the session in React

\`\`\`jsx
const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(undefined);   // undefined = still checking, null = logged out
  useEffect(() => {
    refreshCsrf()
      .then(() => api('/auth/me'))
      .then(setUser)
      .catch(() => setUser(null));
  }, []);

  async function login(email, password) {
    const me = await api('/auth/login', { method: 'POST', body: { email, password } });
    await refreshCsrf();                          // the session was regenerated, so get a new token
    setUser(me);
  }
  async function logout() {
    await api('/auth/logout', { method: 'POST' });
    await refreshCsrf();
    setUser(null);
  }

  if (user === undefined) return <p>Loading...</p>;   // avoid flashing protected pages
  return <AuthContext.Provider value={{ user, login, logout }}>{children}</AuthContext.Provider>;
}
\`\`\`

### CSRF: why and how
Browsers attach cookies automatically, so a malicious site could make a user's browser send a request to your API. Layer the defences:
- \`SameSite=Lax\` (or \`Strict\`) cookies, which browsers do not send on most cross-site requests.
- Never change data in GET handlers.
- A **synchronizer token**: a random value stored in the session that the client must echo in a header on every state-changing request. Another site cannot read it, so it cannot forge the header.

\`\`\`js
// server
import { randomBytes, timingSafeEqual } from 'node:crypto';

app.get('/api/auth/csrf', (req, res) => {
  req.session.csrfToken ??= randomBytes(32).toString('base64url');
  res.json({ csrfToken: req.session.csrfToken });
});

function requireCsrf(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const sent = Buffer.from(req.get('X-CSRF-Token') ?? '');
  const expected = Buffer.from(req.session.csrfToken ?? '');
  if (expected.length === 0 || sent.length !== expected.length || !timingSafeEqual(sent, expected)) {
    return res.status(403).json({ error: { code: 'CSRF_FAILED', message: 'Invalid or missing CSRF token.' } });
  }
  next();
}
app.use('/api', requireCsrf);
\`\`\`

\`\`\`js
// client: keep the token in memory and add it to unsafe methods inside api()
let csrfToken = '';
export async function refreshCsrf() {
  csrfToken = (await api('/auth/csrf')).csrfToken;
}
// in api(): if (options.method && options.method !== 'GET') headers['X-CSRF-Token'] = csrfToken;
\`\`\`

\`timingSafeEqual\` compares in constant time so attackers cannot learn the token from response timings. Checking the \`Origin\` header on state-changing requests is a useful extra layer.

### Expired sessions
When any request returns **401**, clear the user state and send the user to login with the current location saved, then return them there after login. Do this once, in the API client or the provider, not in every component.

### The golden rule
UI checks (hiding buttons, guarding routes) are for convenience. **Every** API handler must check that the current user may access the specific resource, using the identity from the session, never from the request body.

### Common mistakes
- Trusting a \`userId\` sent in the request body instead of the session.
- Flashing protected pages before the session check finishes.
- Logout that only clears client state while the server session stays valid.
- Storing the CSRF token or session id in \`localStorage\`.
- Forgetting to refresh the CSRF token after login regenerates the session.`,
      practice: [
        { title: 'Complete auth flow', kind: 'exercise', prompt: 'Add register, login, session restore on refresh, logout and a 401 handler that redirects to login and back. Include the synchronizer-token CSRF defence for POST, PATCH and DELETE, and verify that a request without the header gets 403.' },
        { title: 'Attack your own app', kind: 'exercise', prompt: 'Log in as user A and, using browser dev tools or curl, try to read and modify user B\'s data by changing ids, sending a userId in the body, and replaying a request without the CSRF header. Document each attempt and fix anything that succeeds.' },
        { title: 'Cross-site form test', kind: 'exercise', prompt: 'Host a tiny HTML page on another origin with a form that POSTs to your API. Confirm the request fails because of SameSite cookies and the CSRF check, and explain which defence stopped it.' },
      ],
      resources: [
        { title: 'Cross-Site Request Forgery Prevention Cheat Sheet', url: 'https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html', source: 'OWASP', kind: 'cheatsheet' },
        { title: 'Set-Cookie header', url: 'https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Set-Cookie', source: 'MDN Web Docs', kind: 'docs' },
        { title: 'Authorization Cheat Sheet', url: 'https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html', source: 'OWASP', kind: 'cheatsheet' },
      ],
      quiz: [
        {
          key: 'q1',
          type: 'single',
          title: 'Source of identity',
          prompt: 'Where should the API get the current user\'s id when creating a note?',
          options: [
            { id: 'a', text: 'From `req.body.userId`' },
            { id: 'b', text: 'From the server-side session tied to the cookie' },
            { id: 'c', text: 'From a hidden form field' },
          ],
          correct: ['b'],
          explanation: 'Anything in the request body can be forged. Identity must come from the verified session.',
          difficulty: 'easy',
        },
        {
          key: 'q2',
          type: 'multi',
          title: 'CSRF defences',
          prompt: 'Which help defend against CSRF? Select all that apply.',
          options: [
            { id: 'a', text: '`SameSite=Lax` or `Strict` cookies' },
            { id: 'b', text: 'Never changing data in GET handlers' },
            { id: 'c', text: 'CSRF tokens on state-changing requests' },
            { id: 'd', text: 'Minifying the frontend JavaScript' },
          ],
          correct: ['a', 'b', 'c'],
          explanation: 'Cookie restrictions, safe GETs and tokens all address CSRF. Minification has no security effect.',
          difficulty: 'easy',
        },
        {
          key: 'q3',
          type: 'single',
          title: 'Why the token works',
          prompt: 'Why can a malicious site not simply include your CSRF token header in its forged request?',
          options: [
            { id: 'a', text: 'The same-origin policy stops it from reading the token from your API responses or pages' },
            { id: 'b', text: 'Browsers strip all custom headers' },
            { id: 'c', text: 'The token is encrypted with the user password' },
          ],
          correct: ['a'],
          explanation: 'The attacker can make the browser send requests, but cannot read responses from your origin, so it never learns the token value.',
          difficulty: 'hard',
        },
        {
          key: 'q4',
          type: 'true_false',
          title: 'Client-only logout',
          prompt: 'Setting the user to null in React state is enough to log a user out securely.',
          options: [
            { id: 'true', text: 'True' },
            { id: 'false', text: 'False' },
          ],
          correct: ['false'],
          explanation: 'The session cookie would still be valid. The server must destroy the session and clear the cookie.',
          difficulty: 'easy',
        },
        {
          key: 'q5',
          type: 'fill_blank',
          title: 'Constant-time comparison',
          prompt: 'Which Node.js crypto function compares two buffers in constant time, so token checks do not leak timing information? `crypto.____(a, b)`',
          accepted: [['timingSafeEqual']],
          explanation: '`timingSafeEqual` requires equal-length buffers, so check lengths first, as in the lesson code.',
          difficulty: 'medium',
        },
      ],
    },
    {
      slug: 'security-hardening',
      title: 'Security hardening for full-stack apps',
      module: 'Security',
      skill: 'web-security',
      minutes: 60,
      objectives: [
        'Map common OWASP Top 10 risks to concrete defences in a React and Node app',
        'Prevent XSS with output encoding, safe URL handling and sanitisation when HTML is unavoidable',
        'Add a Content Security Policy and other security headers',
        'Manage dependency and secret risks with audits, lockfiles and secret scanning',
      ],
      body: `Earlier topics covered injection, authentication, CSRF and rate limiting. This topic ties them together and closes the remaining common gaps. Broken access control tops the OWASP Top 10, and injection (including cross-site scripting), security misconfiguration, vulnerable dependencies and logging failures all appear on it too.

### A quick threat map

| Risk | Where it bites | Defence |
|---|---|---|
| Broken access control | \`GET /api/notes/11\` returns someone else's note | ownership checks in every handler, scoped queries |
| Injection | string-built SQL, shell commands | parameterised queries, no \`exec\` with user input |
| XSS | user content rendered as HTML | React escaping, no unsanitised \`dangerouslySetInnerHTML\`, CSP |
| CSRF | forged form posts | SameSite cookies, CSRF tokens |
| Misconfiguration | debug output, permissive CORS, default secrets | security headers, strict CORS, validated config |
| Vulnerable components | outdated packages with known flaws | lockfiles, audits, automated update pull requests |

### XSS in React apps
React escapes text in JSX, which prevents most XSS. The remaining holes are places where you hand React raw HTML or URLs:

\`\`\`jsx
import DOMPurify from 'dompurify';

// 1. Rich text you must render as HTML: sanitise it first
<div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(post.html) }} />

// 2. User-supplied links: allow only http and https
function safeHref(url) {
  try {
    const u = new URL(url, window.location.origin);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.href : undefined;
  } catch {
    return undefined;
  }
}
<a href={safeHref(profile.website)} rel="noopener noreferrer">Website</a>
\`\`\`

Without the check, a "website" of \`javascript:stealSession()\` could run code when clicked. Also avoid building HTML strings for \`innerHTML\` in non-React code.

### Content Security Policy and security headers
A **Content Security Policy (CSP)** tells the browser which sources of scripts, styles, images and connections are allowed. If an attacker manages to inject a script tag, a strict CSP stops the browser from running it. The \`helmet\` middleware sets a sensible default CSP plus other protective headers:

\`\`\`js
import helmet from 'helmet';

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", 'data:', 'https://images.example-cdn.com'],
      connectSrc: ["'self'"],
      objectSrc: ["'none'"],
      frameAncestors: ["'none'"],       // nobody may embed the app in a frame (clickjacking)
    },
  },
}));
\`\`\`

Helmet also sets headers such as \`Strict-Transport-Security\` (always use HTTPS), \`X-Content-Type-Options: nosniff\` and \`Referrer-Policy\`, and removes \`X-Powered-By\`. Roll out a new CSP with the \`Content-Security-Policy-Report-Only\` header first, fix what it reports, then enforce it. Avoid \`'unsafe-inline'\` for scripts; it cancels most of the protection.

### Dependencies and the supply chain
A typical app has hundreds of transitive dependencies, and any of them can have a known vulnerability or be compromised.
- Commit your lockfile and install with \`npm ci\` so builds use exactly the reviewed versions.
- Run \`npm audit\` (or your platform's dependency scanning) in CI and review the results; do not blindly force upgrades.
- Enable automated dependency update pull requests, and keep the number of dependencies small.
- Be wary of new packages with names similar to popular ones (typosquatting).

### Secrets
Keep secrets in environment variables or a secret manager, enable secret scanning on your repository, give each environment its own credentials, and rotate anything that leaks.

### Common mistakes
- Treating React escaping as complete protection while using \`dangerouslySetInnerHTML\` or unchecked URLs.
- Adding \`'unsafe-inline'\` and \`'unsafe-eval'\` to the CSP to make errors go away.
- Leaving verbose error pages or debug endpoints enabled in production.
- Ignoring audit warnings for months, or running \`npm audit fix --force\` without testing.
- Assuming a security review happens once; re-check whenever you add a feature that takes user input.`,
      practice: [
        { title: 'Harden the notes app', kind: 'exercise', prompt: 'Add helmet with an explicit CSP to your full-stack notes app. Deploy it in Report-Only mode first, fix every violation in the browser console, then enforce it. Confirm in the Network panel that the security headers are present.' },
        { title: 'XSS hunt', kind: 'exercise', prompt: 'Add a profile "website" field and a rich-text note body. Try the payloads javascript:alert(1) and <img src=x onerror=alert(1)>. Fix both with safeHref and DOMPurify, and write tests that prove the payloads are neutralised.' },
        { title: 'Dependency review', kind: 'exercise', prompt: 'Run npm audit on your project, list each finding with its severity and whether the vulnerable code path is reachable, and fix or document each one. Add an audit step to CI.' },
      ],
      resources: [
        { title: 'OWASP Top Ten', url: 'https://owasp.org/www-project-top-ten/', source: 'OWASP', kind: 'article' },
        { title: 'Cross Site Scripting Prevention Cheat Sheet', url: 'https://cheatsheetseries.owasp.org/cheatsheets/Cross_Site_Scripting_Prevention_Cheat_Sheet.html', source: 'OWASP', kind: 'cheatsheet' },
        { title: 'Content Security Policy Cheat Sheet', url: 'https://cheatsheetseries.owasp.org/cheatsheets/Content_Security_Policy_Cheat_Sheet.html', source: 'OWASP', kind: 'cheatsheet' },
        { title: 'npm audit', url: 'https://docs.npmjs.com/cli/commands/npm-audit', source: 'npm Docs', kind: 'docs' },
      ],
      quiz: [
        {
          key: 'q1',
          type: 'single',
          title: 'What CSP does',
          prompt: 'An attacker injects `<script src="https://evil.example/x.js">` into a page. How does a strict Content Security Policy help?',
          options: [
            { id: 'a', text: 'It removes the tag from the HTML on the server' },
            { id: 'b', text: 'The browser refuses to load or run scripts from sources the policy does not allow' },
            { id: 'c', text: 'It encrypts the page so the script cannot read it' },
          ],
          correct: ['b'],
          explanation: 'CSP is enforced by the browser as a second line of defence. You still need to prevent the injection in the first place.',
          difficulty: 'medium',
        },
        {
          key: 'q2',
          type: 'multi',
          title: 'React XSS holes',
          prompt: 'In a React app, which of these can still lead to XSS? Select all that apply.',
          options: [
            { id: 'a', text: '`dangerouslySetInnerHTML` with unsanitised user HTML' },
            { id: 'b', text: '`<a href={userUrl}>` where userUrl is `javascript:...`' },
            { id: 'c', text: '`<p>{userComment}</p>`' },
            { id: 'd', text: 'Setting `element.innerHTML` with user input in non-React code' },
          ],
          correct: ['a', 'b', 'd'],
          explanation: 'Text inside JSX braces is escaped. Raw HTML, unchecked URLs and direct DOM HTML insertion bypass that protection.',
          difficulty: 'medium',
        },
        {
          key: 'q3',
          type: 'true_false',
          title: 'Audit fixes everything',
          prompt: 'Running `npm audit fix --force` guarantees your application is secure and keeps working.',
          options: [
            { id: 'true', text: 'True' },
            { id: 'false', text: 'False' },
          ],
          correct: ['false'],
          explanation: 'Audits only know about reported vulnerabilities, and forced upgrades can introduce breaking changes. Review findings and run your tests.',
          difficulty: 'easy',
        },
        {
          key: 'q4',
          type: 'matching',
          title: 'Risks and defences',
          prompt: 'Match each risk with its primary defence.',
          pairs: {
            left: [
              { id: 'l1', text: 'SQL injection' },
              { id: 'l2', text: 'Cross-site scripting' },
              { id: 'l3', text: 'Clickjacking' },
              { id: 'l4', text: 'Reading another user\'s record by changing an id' },
            ],
            right: [
              { id: 'r1', text: 'Ownership checks on every request' },
              { id: 'r2', text: 'Parameterised queries' },
              { id: 'r3', text: 'Output encoding, sanitisation and a CSP' },
              { id: 'r4', text: '`frame-ancestors` in the CSP (or X-Frame-Options)' },
            ],
          },
          matches: { l1: 'r2', l2: 'r3', l3: 'r4', l4: 'r1' },
          explanation: 'Each class of attack has a specific, well-known defence. Layering them is called defence in depth.',
          difficulty: 'medium',
        },
        {
          key: 'q5',
          type: 'fill_blank',
          title: 'Trial a policy',
          prompt: 'To test a new CSP without breaking the site, send it in the `Content-Security-Policy-____` header first.',
          accepted: [['Report-Only']],
          explanation: 'Report-Only mode logs violations without blocking anything, so you can fix problems before enforcing the policy.',
          difficulty: 'medium',
        },
      ],
    },
    {
      slug: 'testing-full-stack',
      title: 'Testing a full-stack app',
      module: 'Quality and shipping',
      skill: 'unit-testing',
      minutes: 65,
      objectives: [
        'Balance unit, integration and end-to-end tests (the test pyramid)',
        'Write API integration tests against a real test database, including auth, CSRF and authorization cases',
        'Write a small number of end-to-end tests for critical user journeys with Playwright',
        'Keep tests fast, isolated and deterministic',
      ],
      body: `A full-stack app has many seams: UI, API client, server, database, auth. Each kind of test covers different risks, and a good suite combines them.

### The test pyramid
- **Many unit tests:** pure functions, reducers, validation schemas and small components. Fast and precise.
- **Some integration tests:** an API route with a real database, or a component with a mocked network.
- **Few end-to-end (E2E) tests:** a real browser clicking through critical journeys such as sign up, log in and create a note.

### Unit test a shared schema

\`\`\`js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NoteInput } from '../shared/note.js';

test('note titles are trimmed and required', () => {
  assert.equal(NoteInput.parse({ title: '  Milk  ' }).title, 'Milk');
  assert.equal(NoteInput.safeParse({ title: '   ' }).success, false);
});
\`\`\`

### API integration tests with a real database

\`\`\`js
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { app } from '../src/app.js';
import { pool } from '../src/db.js';
import { seedUsers } from './fixtures.js';

beforeEach(async () => {
  await pool.query('TRUNCATE notes, users RESTART IDENTITY CASCADE');
  await seedUsers();                      // a@test.dev and b@test.dev
});

async function loggedIn(email) {
  const agent = request.agent(app);       // keeps cookies between requests
  let { body } = await agent.get('/api/auth/csrf');
  await agent.post('/api/auth/login').set('X-CSRF-Token', body.csrfToken)
    .send({ email, password: 'test-password' }).expect(200);
  ({ body } = await agent.get('/api/auth/csrf'));   // session was regenerated
  return { agent, csrf: body.csrfToken };
}

test('rejects an empty title', async () => {
  const { agent, csrf } = await loggedIn('a@test.dev');
  const res = await agent.post('/api/notes').set('X-CSRF-Token', csrf).send({ title: '' });
  assert.equal(res.status, 400);
  assert.equal(res.body.error.code, 'VALIDATION_FAILED');
});

test('user B cannot read user A\\'s note', async () => {
  const a = await loggedIn('a@test.dev');
  const created = await a.agent.post('/api/notes').set('X-CSRF-Token', a.csrf).send({ title: 'Private' });
  const b = await loggedIn('b@test.dev');
  const res = await b.agent.get('/api/notes/' + created.body.id);
  assert.equal(res.status, 404);
});

test('rejects writes without a CSRF token', async () => {
  const { agent } = await loggedIn('a@test.dev');
  const res = await agent.post('/api/notes').send({ title: 'No token' });
  assert.equal(res.status, 403);
});
\`\`\`

Run these against a dedicated test database (set by \`DATABASE_URL\` in the test environment) that is reset before each test, never against your development or production data.

### End-to-end tests with Playwright

\`\`\`js
// playwright.config.js
import { defineConfig } from '@playwright/test';
export default defineConfig({
  use: { baseURL: 'http://localhost:5173' },
  webServer: { command: 'npm run dev', url: 'http://localhost:5173', reuseExistingServer: !process.env.CI },
});
\`\`\`

\`\`\`js
// e2e/notes.spec.js
import { test, expect } from '@playwright/test';

test('user can create a note', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email').fill('a@test.dev');
  await page.getByLabel('Password').fill('test-password');
  await page.getByRole('button', { name: 'Log in' }).click();
  await page.getByRole('button', { name: 'New note' }).click();
  await page.getByLabel('Title').fill('Buy milk');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('listitem').filter({ hasText: 'Buy milk' })).toBeVisible();
});
\`\`\`

Playwright's locators and \`expect\` assertions wait automatically for elements to appear, so you rarely need manual waits.

### Keep tests trustworthy
- Each test creates the data it needs; no test depends on another test's data or on run order.
- Use fixed clocks and seeded random values where behaviour depends on time or randomness.
- Mock third-party services (payments, email) at the network boundary.
- Investigate flaky tests immediately; a suite people do not trust gets ignored.

### Common mistakes
- Only E2E tests: slow, flaky and hard to debug.
- Tests that depend on each other's data or run order.
- Fixed sleeps (\`waitForTimeout(3000)\`) instead of waiting for a condition.
- Testing against shared or production databases.
- Skipping the "unhappy paths": 401, 403 or 404, validation failures and missing CSRF tokens.`,
      practice: [
        { title: 'Integration suite', kind: 'exercise', prompt: 'Write at least eight API integration tests covering success, validation failure, unauthenticated (401), another user\'s resource (404), a missing CSRF token (403) and a rate-limited login (429). Reset the test database before each test.' },
        { title: 'Critical journeys', kind: 'exercise', prompt: 'Write two Playwright tests: sign up then create a note, and log out then confirm protected pages redirect to login. Run them three times in a row and fix anything flaky.' },
        { title: 'Accessibility in E2E', kind: 'exercise', prompt: 'Add an automated axe-core scan to your Playwright suite for the login page and the notes list, and fix every violation it reports.' },
      ],
      resources: [
        { title: 'The Practical Test Pyramid', url: 'https://martinfowler.com/articles/practical-test-pyramid.html', source: 'martinfowler.com', kind: 'article' },
        { title: 'Playwright: Getting started', url: 'https://playwright.dev/docs/intro', source: 'Playwright', kind: 'docs' },
        { title: 'Node.js test runner', url: 'https://nodejs.org/docs/latest/api/test.html', source: 'nodejs.org', kind: 'docs' },
      ],
      quiz: [
        {
          key: 'q1',
          type: 'single',
          title: 'Test pyramid',
          prompt: 'According to the test pyramid, which tests should you have the most of?',
          options: [
            { id: 'a', text: 'End-to-end tests' },
            { id: 'b', text: 'Unit tests' },
            { id: 'c', text: 'Manual tests' },
          ],
          correct: ['b'],
          explanation: 'Unit tests are fast and precise, so they form the wide base. E2E tests are valuable but slow, so keep them few.',
          difficulty: 'easy',
        },
        {
          key: 'q2',
          type: 'true_false',
          title: 'Fixed sleeps',
          prompt: 'Adding fixed sleeps is the best way to fix flaky end-to-end tests.',
          options: [
            { id: 'true', text: 'True' },
            { id: 'false', text: 'False' },
          ],
          correct: ['false'],
          explanation: 'Wait for a specific condition (an element visible, a response received). Fixed sleeps are slow and still flaky.',
          difficulty: 'easy',
        },
        {
          key: 'q3',
          type: 'matching',
          title: 'Which kind of test',
          prompt: 'Match each check with the most suitable kind of test.',
          pairs: {
            left: [
              { id: 'l1', text: 'A validation schema trims titles' },
              { id: 'l2', text: 'POST /api/notes returns 403 without a CSRF token' },
              { id: 'l3', text: 'A new user can sign up and create their first note in a browser' },
            ],
            right: [
              { id: 'r1', text: 'End-to-end test' },
              { id: 'r2', text: 'Unit test' },
              { id: 'r3', text: 'API integration test' },
            ],
          },
          matches: { l1: 'r2', l2: 'r3', l3: 'r1' },
          explanation: 'Test each behaviour at the lowest level that can prove it. Save the browser for whole journeys.',
          difficulty: 'medium',
        },
        {
          key: 'q4',
          type: 'fill_blank',
          title: 'Keeping cookies',
          prompt: 'In supertest, which function creates a client that keeps cookies between requests, so a test can log in and then call protected routes? `request.____(app)`',
          accepted: [['agent']],
          explanation: '`request.agent(app)` persists cookies like a browser, which is what session-based tests need.',
          difficulty: 'medium',
        },
        {
          key: 'q5',
          type: 'multi',
          title: 'Isolated tests',
          prompt: 'Which practices keep a test suite isolated and deterministic? Select all that apply.',
          options: [
            { id: 'a', text: 'Resetting the test database before each test' },
            { id: 'b', text: 'Each test creating the data it needs' },
            { id: 'c', text: 'Running tests against the production database for realism' },
            { id: 'd', text: 'Mocking third-party services such as payments and email' },
          ],
          correct: ['a', 'b', 'd'],
          explanation: 'Isolation means a test passes or fails on its own merits. Production data is unpredictable and risky to modify.',
          difficulty: 'easy',
        },
      ],
    },
    {
      slug: 'shipping-and-monitoring',
      title: 'Shipping and monitoring',
      module: 'Quality and shipping',
      skill: 'ci-cd',
      minutes: 65,
      milestone: true,
      completionCriteria: 'The app deploys automatically from the main branch after lint, type checks and tests pass, and you can see request logs, error counts and a health check for production, with a written rollback runbook.',
      objectives: [
        'Set up a CI pipeline that runs lint, type checks, tests and a build on every pull request',
        'Deploy automatically from the main branch with environment-specific config, migrations and a smoke test',
        'Add structured logging, error tracking, metrics and uptime checks, and alert on user-visible symptoms',
        'Write a short runbook for rollback and common incidents',
      ],
      body: `Shipping is not the end. You need confidence before a deploy and visibility after it.

### Continuous integration
Run the same checks on every pull request so broken code never reaches main:

\`\`\`yaml
# .github/workflows/ci.yml
name: CI
on:
  pull_request:
  push:
    branches: [main]
jobs:
  test:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_PASSWORD: postgres
        ports: ['5432:5432']
        options: >-
          --health-cmd pg_isready --health-interval 5s --health-timeout 5s --health-retries 5
    env:
      DATABASE_URL: postgres://postgres:postgres@localhost:5432/postgres
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm run lint
      - run: npm run typecheck
      - run: npm run migrate
      - run: npm test
      - run: npm run build
\`\`\`

Protect the main branch so pull requests cannot merge until CI is green and someone has reviewed the change.

### Continuous delivery

\`\`\`yaml
  deploy:
    needs: test
    if: github.ref == 'refs/heads/main' && github.event_name == 'push'
    runs-on: ubuntu-latest
    environment: production
    steps:
      - uses: actions/checkout@v4
      - run: ./scripts/deploy.sh
        env:
          DEPLOY_TOKEN: \${{ secrets.DEPLOY_TOKEN }}
\`\`\`

Keep secrets in the CI provider's encrypted secrets, never in the workflow file. A good deploy script runs migrations, releases the new version, then runs a **smoke test** (for example \`curl --fail https://app.example.com/healthz\`) and stops if it fails.

### Monitoring: know before your users tell you
- **Structured logs** (JSON with request id, route, status, duration, user id) so you can search and filter them.
- **Error tracking** that groups exceptions with stack traces, the release they started in and how many users are affected, on both server and browser.
- **Metrics** for the four golden signals: **latency**, **traffic**, **errors** and **saturation** (how full your resources are, such as CPU, memory or database connections).
- **Uptime checks** that call \`/healthz\` from outside your infrastructure and alert you when it fails.

\`\`\`js
logger.info({ reqId, route: '/api/notes', status: 201, ms: 42, release: process.env.RELEASE_SHA }, 'request completed');
\`\`\`

Tagging logs and errors with the release (for example the Git commit) makes "did the last deploy cause this?" a quick question.

### Alerts that help
Alert on **symptoms users feel**: error rate above 2% for five minutes, p95 latency above one second, the health check failing. Send everything else to dashboards. Too many alerts teach people to ignore them. As the app matures, set a simple service level objective (for example "99.5% of requests succeed each month") and alert when you are using up that error budget too quickly.

### Runbook and rollback
Write down, before you need it:
- how to roll back to the previous release (and how long it takes)
- where logs, errors and dashboards live
- how to check database health and recent migrations
- who to contact and how to post a status update

Practise a rollback once. After any incident, write a short blameless review: what happened, how it was detected, what you changed so it cannot happen the same way again.

### Common mistakes
- Deploying straight from a laptop, so nobody knows what is running.
- Logging passwords, tokens or full personal data.
- Alerts on everything, so real problems drown in noise.
- Migrations that are not backward compatible, so rolling back the code breaks the app.
- No smoke test after deploy, so a broken release sits in production until a user complains.`,
      practice: [
        { title: 'CI/CD pipeline', kind: 'exercise', prompt: 'Add a CI workflow that runs lint, type checks, tests against a Postgres service and a build on pull requests, and a deploy job that runs only on pushes to main after tests pass, followed by a smoke test against /healthz.' },
        { title: 'Observe production', kind: 'exercise', prompt: 'Add structured request logging with a request id and release tag, error tracking on both client and server, and an external uptime check on /healthz. Trigger a deliberate error and find it in each tool.' },
        { title: 'Runbook drill', kind: 'exercise', prompt: 'Write a one-page runbook covering rollback, where to find logs and errors, and who to contact. Then deploy a deliberately broken release to a staging environment and time how long it takes you to detect it and roll back using only the runbook.' },
      ],
      resources: [
        { title: 'GitHub Actions documentation', url: 'https://docs.github.com/en/actions', source: 'GitHub Docs', kind: 'docs' },
        { title: 'Monitoring Distributed Systems (SRE book)', url: 'https://sre.google/sre-book/monitoring-distributed-systems/', source: 'Google SRE', kind: 'book' },
        { title: 'Full Stack Developer roadmap', url: 'https://roadmap.sh/full-stack', source: 'roadmap.sh', kind: 'interactive' },
      ],
      quiz: [
        {
          key: 'q1',
          type: 'multi',
          title: 'Golden signals',
          prompt: 'Which are among the four golden signals of monitoring? Select all that apply.',
          options: [
            { id: 'a', text: 'Latency' },
            { id: 'b', text: 'Errors' },
            { id: 'c', text: 'Lines of code' },
            { id: 'd', text: 'Saturation' },
          ],
          correct: ['a', 'b', 'd'],
          explanation: 'The four golden signals are latency, traffic, errors and saturation.',
          difficulty: 'easy',
        },
        {
          key: 'q2',
          type: 'true_false',
          title: 'Secrets in workflows',
          prompt: 'It is acceptable to paste a production API key directly into a CI workflow file if the repository is private.',
          options: [
            { id: 'true', text: 'True' },
            { id: 'false', text: 'False' },
          ],
          correct: ['false'],
          explanation: 'Use the CI provider\'s encrypted secrets. Private repositories get cloned, forked and shared, and history keeps old values.',
          difficulty: 'easy',
        },
        {
          key: 'q3',
          type: 'single',
          title: 'Good alerts',
          prompt: 'Which of these is the best candidate for paging the on-call developer?',
          options: [
            { id: 'a', text: 'CPU on one instance reached 70% for a minute' },
            { id: 'b', text: 'The error rate for checkout requests has been above 5% for ten minutes' },
            { id: 'c', text: 'A new dependency version was released' },
          ],
          correct: ['b'],
          explanation: 'Page on symptoms users feel. Resource levels and routine events belong on dashboards or in tickets.',
          difficulty: 'medium',
        },
        {
          key: 'q4',
          type: 'fill_blank',
          title: 'Reproducible installs',
          prompt: 'In CI, install dependencies exactly as recorded in the lockfile with `npm ____`.',
          accepted: [['ci']],
          explanation: '`npm ci` installs exactly what the lockfile specifies and fails if package.json and the lockfile disagree.',
          difficulty: 'easy',
        },
        {
          key: 'q5',
          type: 'matching',
          title: 'Observability tools',
          prompt: 'Match each tool with the question it answers best.',
          pairs: {
            left: [
              { id: 'l1', text: 'Structured logs' },
              { id: 'l2', text: 'Error tracking' },
              { id: 'l3', text: 'Metrics dashboard' },
              { id: 'l4', text: 'Uptime check' },
            ],
            right: [
              { id: 'r1', text: 'Is the site reachable from outside right now?' },
              { id: 'r2', text: 'What exactly happened during request abc-123?' },
              { id: 'r3', text: 'How have latency and traffic changed over the last day?' },
              { id: 'r4', text: 'Which exception started after the last release, and how many users hit it?' },
            ],
          },
          matches: { l1: 'r2', l2: 'r4', l3: 'r3', l4: 'r1' },
          explanation: 'Each signal answers a different question. Together they let you detect, diagnose and confirm the fix for an incident.',
          difficulty: 'medium',
        },
      ],
    },
  ],
};
