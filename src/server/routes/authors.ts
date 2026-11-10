// The voices, with whether each is built.

import { route, send } from '../http.ts';
import { authors } from '../voices.ts';

route('GET', '/api/authors', (_q, res) => send(res, 200, authors()));
