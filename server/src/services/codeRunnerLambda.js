import logger from '../utils/logger.js';

/**
 * Lambda-backed code execution.
 *
 * Each programming language maps to a dedicated AWS Lambda function that runs on
 * Firecracker microVMs (per-invocation isolation that AWS owns — much stronger
 * than container-based Judge0, and nothing for us to harden). The Lambda
 * compiles the source ONCE and runs it against every test case in a single
 * invocation, returning a result per case.
 *
 * This returns the SAME shape as the Judge0 runner so scoring code is unchanged:
 *   { compiled, results:[{index,hidden,passed,statusId,stdout,stderr,compileOutput,time}],
 *     passedWeight, totalWeight }
 *
 * Status ids follow the Judge0 convention used elsewhere:
 *   3 = Accepted (passed), 4 = Wrong Answer, 5 = Time Limit Exceeded,
 *   6 = Compile Error, -2 = infrastructure error.
 *
 * The AWS SDK is imported lazily so environments not using this provider don't
 * need the dependency installed.
 */

// language -> Lambda function name (configurable via env, with sane defaults).
function functionFor(language) {
  const map = {
    python: process.env.LAMBDA_EXEC_PYTHON || 'evalai-exec-python',
    java: process.env.LAMBDA_EXEC_JAVA || 'evalai-exec-java',
    c: process.env.LAMBDA_EXEC_C || 'evalai-exec-c',
    cpp: process.env.LAMBDA_EXEC_CPP || 'evalai-exec-cpp',
  };
  return map[language];
}

let _lambdaClient = null;
async function getClient() {
  if (_lambdaClient) return _lambdaClient;
  // Lazy import — only required when CODE_EXEC_PROVIDER=lambda.
  const { LambdaClient } = await import('@aws-sdk/client-lambda');
  _lambdaClient = new LambdaClient({ region: process.env.AWS_REGION || 'ap-south-1' });
  return _lambdaClient;
}

/**
 * @param {{source,language,testCases,timeLimitSec,memoryLimitMb}} req
 */
export async function runViaLambda(req) {
  const { source, language, testCases, timeLimitSec = 5, memoryLimitMb = 128 } = req;

  const fnName = functionFor(language);
  if (!fnName) throw new Error(`Unsupported language for Lambda executor: ${language}`);

  const totalWeight = (testCases || []).reduce((a, t) => a + (t.weight || 1), 0);
  if (!source || !source.trim()) {
    return { compiled: false, results: [], passedWeight: 0, totalWeight, note: 'Empty submission' };
  }

  // The Lambda receives the full set of cases (it compiles once, runs each).
  // Hidden flags are NOT sent — the Lambda only needs stdin + expected output;
  // we re-apply hidden masking on the way out.
  const payload = {
    source,
    language,
    timeLimitSec,
    memoryLimitMb,
    testCases: testCases.map((t) => ({ stdin: t.stdin ?? '', expectedStdout: t.expectedStdout ?? '' })),
  };

  let parsed;
  try {
    const { InvokeCommand } = await import('@aws-sdk/client-lambda');
    const client = await getClient();
    const out = await client.send(new InvokeCommand({
      FunctionName: fnName,
      InvocationType: 'RequestResponse',
      Payload: Buffer.from(JSON.stringify(payload)),
    }));
    const text = Buffer.from(out.Payload || []).toString('utf8');
    parsed = JSON.parse(text);
    if (out.FunctionError) {
      throw new Error(`Lambda function error: ${parsed?.errorMessage || out.FunctionError}`);
    }
  } catch (e) {
    logger.error('Lambda execution failed', { language, error: e.message });
    // Mirror the Judge0 runner's behaviour: every case becomes an infra error so
    // the submission is still scored (0) and flagged for manual review, never lost.
    return {
      compiled: false,
      results: testCases.map((t, i) => ({ index: i, hidden: !!t.hidden, passed: false, statusId: -2, stderr: 'Execution unavailable', time: 0 })),
      passedWeight: 0,
      totalWeight,
      note: 'Code execution unavailable',
    };
  }

  return normalize(parsed, testCases, totalWeight);
}

/**
 * Convert the Lambda's raw response into the canonical contract, re-applying
 * hidden-output masking (the Lambda doesn't know which cases are hidden).
 * Expected Lambda response:
 *   { compiled: boolean,
 *     cases: [{ index, statusId, stdout, stderr, compileOutput, time }] }
 */
function normalize(parsed, testCases, totalWeight) {
  const compiled = parsed?.compiled !== false;
  const rawCases = Array.isArray(parsed?.cases) ? parsed.cases : [];
  const byIndex = new Map(rawCases.map((c) => [c.index, c]));

  const results = [];
  let passedWeight = 0;

  for (let i = 0; i < testCases.length; i++) {
    const tc = testCases[i];
    const weight = tc.weight || 1;
    const c = byIndex.get(i) || { statusId: -2, stderr: 'No result returned', time: 0 };

    if (c.statusId === 6) {
      // Compile error — entire submission failed to build.
      results.push({ index: i, hidden: !!tc.hidden, passed: false, statusId: 6, compileOutput: c.compileOutput, time: 0 });
      continue;
    }
    const passed = c.statusId === 3;
    if (passed) passedWeight += weight;
    results.push({
      index: i,
      hidden: !!tc.hidden,
      passed,
      statusId: c.statusId,
      time: c.time,
      stdout: tc.hidden ? undefined : c.stdout,
      stderr: tc.hidden ? undefined : (c.stderr || undefined),
    });
  }

  return { compiled, results, passedWeight, totalWeight };
}
