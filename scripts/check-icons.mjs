// Fails if any *Icon imported from @phosphor-icons/react does not exist in the installed version.
import * as icons from '@phosphor-icons/react';
import fs from 'node:fs';
import path from 'node:path';

const missing = [];
function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.(tsx?|jsx?)$/.test(e.name)) {
      const src = fs.readFileSync(p, 'utf8');
      for (const m of src.matchAll(/import\s*{([^}]*)}\s*from\s*'@phosphor-icons\/react'/g)) {
        for (const raw of m[1].split(',')) {
          const name = raw.trim().split(/\s+as\s+/)[0];
          if (name && name !== 'type' && !name.startsWith('type ') && name !== 'Icon' && !(name in icons)) missing.push(`${p}: ${name}`);
        }
      }
    }
  }
}
walk('web/src');
if (missing.length) {
  console.error('Missing Phosphor icons:\n' + missing.join('\n'));
  process.exit(1);
}
console.log('All Phosphor icons exist.');
