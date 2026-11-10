// The glossary: every term, or those a search finds (?q=), or one by any of its names (/api/glossary/anastrophe).

import { Glossary } from '../../engine/glossary.ts';
import { route, send } from '../http.ts';

route('GET', '/api/glossary', (_q, res, _p, url) => {
  const q = url.searchParams.get('q');
  send(res, 200, q ? Glossary.load().search(q) : Glossary.load().all());
});
route('GET', '/api/glossary/:name', (_q, res, [name]) => {
  const t = Glossary.load().define(name!);
  t ? send(res, 200, t) : send(res, 404, { error: `No term “${name}” in the glossary.` });
});
