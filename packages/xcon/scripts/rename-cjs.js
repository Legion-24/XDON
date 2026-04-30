import { renameSync } from 'fs';
import { readdirSync } from 'fs';
import { join } from 'path';

const cjsDir = './dist/cjs';
const files = readdirSync(cjsDir);

files.forEach((file) => {
  if (file.endsWith('.js')) {
    const oldPath = join(cjsDir, file);
    const newPath = join(cjsDir, file.replace(/\.js$/, '.cjs'));
    renameSync(oldPath, newPath);
  }
});

console.log('Renamed .js files to .cjs in dist/cjs');
