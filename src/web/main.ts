// The page (/): your text rewritten in an author's voice, in three columns. The older shared editor still opens a
// document by its link (/d/<id>), and loads only then.

import { rewritePage } from './rewrite-page.ts';

const app = document.getElementById('app')!;
const m = /^\/d\/([\w-]+)/.exec(location.pathname);
if (m) void import('./editor-entry.ts').then(({ editorPage }) => editorPage(app, m[1]!));
else void rewritePage(app);
