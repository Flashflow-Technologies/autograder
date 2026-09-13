import logger from '../utils/logger.js';

/**
 * Code-execution provider abstraction.
 *
 * In multi-tenant SaaS, running untrusted student code is the most
 * security-sensitive operation. Rather than hardwire Judge0, code execution goes
 * through this interface so the backend is swappable:
 *
 *   - 'judge0'  : self-run Judge0 on an isolated execution tier (free, you harden it)
 *   - 'managed' : a hosted third-party execution API (offloads the hardest
 *                 security problem; a paid dependency)
 *
 * Chosen via CODE_EXEC_PROVIDER. Both implement runTestCases(...) with the same
 * signature the existing scoring logic already expects, so swapping providers
 * does not touch scoring code.
 *
 * NOTE: This is the integration seam only. The actual managed-provider client and
 * the hardened Judge0 deployment are Phase 4 (infrastructure) work; this file
 * defines the contract and routes to the configured provider.
 */

const PROVIDER = process.env.CODE_EXEC_PROVIDER || 'judge0';

/**
 * @typedef {Object} RunRequest
 * @property {string} source
 * @property {string} language   // 'python' | 'java' | 'c' | 'cpp'
 * @property {Array<{stdin:string, expectedStdout:string, hidden?:boolean, weight?:number}>} testCases
 * @property {number} [timeLimitSec]
 * @property {number} [memoryLimitMb]
 * @property {string} [tenantSlug]  // for metering/limits, never affects sandbox state
 */

/** Route a run request to the configured provider. */
export async function runTestCases(req) {
  switch (PROVIDER) {
    case 'managed':
      return runViaManaged(req);
    case 'lambda':
      return runViaLambdaProvider(req);
    case 'judge0':
    default:
      return runViaJudge0(req);
  }
}

// --- AWS Lambda backend (Firecracker microVM isolation, AWS-owned) ---
async function runViaLambdaProvider(req) {
  const { runViaLambda } = await import('./codeRunnerLambda.js');
  return runViaLambda(req);
}

// --- Judge0 backend (isolated execution tier) ---
async function runViaJudge0(req) {
  // Delegates to the existing Judge0 client (codeRunner.js). In SaaS this should
  // point at a dedicated, network-isolated Judge0 cluster (Phase 4 hardening),
  // not the app tier. Kept here so the seam is explicit.
  const { runTestCases: judge0Run } = await import('./codeRunner.js');
  return judge0Run(req);
}

// --- Managed third-party execution API backend ---
async function runViaManaged(req) {
  const url = process.env.CODE_EXEC_API_URL;
  const key = process.env.CODE_EXEC_API_KEY;
  if (!url || !key) {
    logger.error('Managed code-exec provider selected but CODE_EXEC_API_URL/KEY not set');
    throw new Error('Code execution is not configured.');
  }
  // Placeholder contract — the concrete request/response mapping depends on the
  // chosen vendor and is implemented in Phase 4. Shape mirrors runViaJudge0's
  // return so scoring code is provider-agnostic:
  //   { compiled, results:[{index,passed,hidden,statusId,stdout,stderr,time}],
  //     passedWeight, totalWeight }
  throw new Error('Managed code-exec provider not yet implemented (Phase 4).');
}

export function activeProvider() { return PROVIDER; }
