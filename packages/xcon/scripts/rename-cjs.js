import { readFileSync, renameSync, unlinkSync, writeFileSync } from 'fs';
import { readdirSync } from 'fs';
import { join } from 'path';

const cjsDir = './dist/cjs';
const files = readdirSync(cjsDir);

// First pass: rewrite require("./X.js") -> require("./X.cjs") in every .js file,
// then rename to .cjs. Sourcemap .map files are removed (we don't ship CJS maps).
files.forEach((file) => {
  if (file.endsWith('.js')) {
    const oldPath = join(cjsDir, file);
    const newPath = join(cjsDir, file.replace(/\.js$/, '.cjs'));
    let content = readFileSync(oldPath, 'utf8');
    content = content.replace(/require\("\.\/([^"]+)\.js"\)/g, 'require("./$1.cjs")');
    // Strip sourcemap reference comment since we delete the .map files.
    content = content.replace(/\n\/\/# sourceMappingURL=.*$/m, '');
    writeFileSync(newPath, content);
    unlinkSync(oldPath);
  } else if (file.endsWith('.js.map')) {
    unlinkSync(join(cjsDir, file));
  }
});

console.log('Renamed .js files to .cjs in dist/cjs and rewrote requires');
