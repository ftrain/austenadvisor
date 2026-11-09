// The little linear algebra the embeddings need: a sparse matrix, randomized SVD (Halko, Martinsson & Tropp 2011)
// and Jacobi's eigenvalue method (1846) for the small symmetric matrix at its core.

export interface Csr {
  rows: number;
  cols: number;
  ptr: Int32Array;
  idx: Int32Array;
  val: Float32Array;
}

export function csrFrom(rows: number, cols: number, entries: Map<number, number>, keyCols: number): Csr {
  const keys = [...entries.keys()].sort((a, b) => a - b);
  const ptr = new Int32Array(rows + 1);
  const idx = new Int32Array(keys.length);
  const val = new Float32Array(keys.length);
  let k = 0;
  for (const key of keys) {
    const r = Math.floor(key / keyCols);
    const c = key - r * keyCols;
    ptr[r + 1]!++;
    idx[k] = c;
    val[k] = entries.get(key)!;
    k++;
  }
  for (let r = 0; r < rows; r++) ptr[r + 1]! += ptr[r]!;
  return { rows, cols, ptr, idx, val };
}

/** Dense matrices are row-major Float64Arrays with their shape beside them. */
export interface Dense {
  rows: number;
  cols: number;
  d: Float64Array;
}
const dense = (rows: number, cols: number): Dense => ({ rows, cols, d: new Float64Array(rows * cols) });

/** A · X */
function mul(a: Csr, x: Dense): Dense {
  const y = dense(a.rows, x.cols);
  const l = x.cols;
  for (let r = 0; r < a.rows; r++) {
    const yo = r * l;
    for (let p = a.ptr[r]!; p < a.ptr[r + 1]!; p++) {
      const v = a.val[p]!;
      const xo = a.idx[p]! * l;
      for (let j = 0; j < l; j++) y.d[yo + j]! += v * x.d[xo + j]!;
    }
  }
  return y;
}

/** Aᵀ · X */
function mulT(a: Csr, x: Dense): Dense {
  const y = dense(a.cols, x.cols);
  const l = x.cols;
  for (let r = 0; r < a.rows; r++) {
    const xo = r * l;
    for (let p = a.ptr[r]!; p < a.ptr[r + 1]!; p++) {
      const v = a.val[p]!;
      const yo = a.idx[p]! * l;
      for (let j = 0; j < l; j++) y.d[yo + j]! += v * x.d[xo + j]!;
    }
  }
  return y;
}

/** Orthonormal columns, by modified Gram–Schmidt, in place. */
function orthonormalize(y: Dense): Dense {
  const { rows, cols, d } = y;
  for (let j = 0; j < cols; j++) {
    for (let i = 0; i < j; i++) {
      let dot = 0;
      for (let r = 0; r < rows; r++) dot += d[r * cols + i]! * d[r * cols + j]!;
      for (let r = 0; r < rows; r++) d[r * cols + j]! -= dot * d[r * cols + i]!;
    }
    let norm = 0;
    for (let r = 0; r < rows; r++) norm += d[r * cols + j]! ** 2;
    norm = Math.sqrt(norm);
    // A column with nothing left of its own (the matrix's rank is spent) is zero, not noise made large.
    for (let r = 0; r < rows; r++) d[r * cols + j] = norm > 1e-10 ? d[r * cols + j]! / norm : 0;
  }
  return y;
}

/** Eigenvalues and eigenvectors of a symmetric n×n matrix (Jacobi rotations); columns of v are the vectors. */
export function jacobiEigen(a: Float64Array, n: number): { values: Float64Array; vectors: Float64Array } {
  const m = Float64Array.from(a);
  const v = new Float64Array(n * n);
  for (let i = 0; i < n; i++) v[i * n + i] = 1;
  for (let sweep = 0; sweep < 100; sweep++) {
    let off = 0;
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) off += m[i * n + j]! ** 2;
    if (off < 1e-20) break;
    for (let p = 0; p < n; p++)
      for (let q = p + 1; q < n; q++) {
        const apq = m[p * n + q]!;
        if (Math.abs(apq) < 1e-300) continue;
        const app = m[p * n + p]!;
        const aqq = m[q * n + q]!;
        const theta = (aqq - app) / (2 * apq);
        const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
        const c = 1 / Math.sqrt(t * t + 1);
        const s = t * c;
        for (let k = 0; k < n; k++) {
          const mkp = m[k * n + p]!;
          const mkq = m[k * n + q]!;
          m[k * n + p] = c * mkp - s * mkq;
          m[k * n + q] = s * mkp + c * mkq;
        }
        for (let k = 0; k < n; k++) {
          const mpk = m[p * n + k]!;
          const mqk = m[q * n + k]!;
          m[p * n + k] = c * mpk - s * mqk;
          m[q * n + k] = s * mpk + c * mqk;
        }
        for (let k = 0; k < n; k++) {
          const vkp = v[k * n + p]!;
          const vkq = v[k * n + q]!;
          v[k * n + p] = c * vkp - s * vkq;
          v[k * n + q] = s * vkp + c * vkq;
        }
      }
  }
  const values = new Float64Array(n);
  for (let i = 0; i < n; i++) values[i] = m[i * n + i]!;
  return { values, vectors: v };
}

/** The leading k left singular vectors and values of A. */
export function randomizedSvd(a: Csr, k: number, oversample = 10, powerIters = 3, seed = 42): { u: Dense; s: Float64Array } {
  const l = k + oversample;
  let state = seed;
  const rand = () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
  const gauss = () => Math.sqrt(-2 * Math.log(rand() + 1e-12)) * Math.cos(2 * Math.PI * rand());
  const omega = dense(a.cols, l);
  for (let i = 0; i < omega.d.length; i++) omega.d[i] = gauss();
  let q = orthonormalize(mul(a, omega));
  for (let i = 0; i < powerIters; i++) q = orthonormalize(mul(a, orthonormalize(mulT(a, q))));
  // B = Qᵀ A, as (Aᵀ Q)ᵀ; then B Bᵀ = (AᵀQ)ᵀ(AᵀQ), l × l.
  const bt = mulT(a, q); // cols × l
  const bbt = new Float64Array(l * l);
  for (let r = 0; r < bt.rows; r++) {
    const o = r * l;
    for (let i = 0; i < l; i++) {
      const x = bt.d[o + i]!;
      if (x === 0) continue;
      for (let j = i; j < l; j++) bbt[i * l + j]! += x * bt.d[o + j]!;
    }
  }
  for (let i = 0; i < l; i++) for (let j = 0; j < i; j++) bbt[i * l + j] = bbt[j * l + i]!;
  const { values, vectors } = jacobiEigen(bbt, l);
  const order = [...values.keys()].sort((x, y) => values[y]! - values[x]!).slice(0, k);
  const s = Float64Array.from(order, (i) => Math.sqrt(Math.max(0, values[i]!)));
  // U = Q · W
  const u = dense(a.rows, k);
  for (let r = 0; r < a.rows; r++)
    for (let j = 0; j < k; j++) {
      const col = order[j]!;
      let sum = 0;
      for (let t = 0; t < l; t++) sum += q.d[r * l + t]! * vectors[t * l + col]!;
      u.d[r * k + j] = sum;
    }
  return { u, s };
}

export function cosine(a: Float32Array, b: Float32Array): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!;
    na += a[i]! * a[i]!;
    nb += b[i]! * b[i]!;
  }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}
