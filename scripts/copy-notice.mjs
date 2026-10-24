import { copyFileSync, existsSync } from 'node:fs';

if (!existsSync('dist')) throw new Error('dist/ not found; run vite build first');
copyFileSync('NOTICE.md', 'dist/NOTICE.txt');
