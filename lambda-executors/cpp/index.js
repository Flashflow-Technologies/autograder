/**
 * EvalAI C++ execution Lambda (container image).
 *
 * Runs on AWS Lambda's Firecracker microVM isolation. Compiles the submitted
 * C++ source ONCE, then runs the resulting binary against each test case,
 * feeding stdin and comparing stdout to the expected output.
 *
 * Input event:
 *   { source, language:'cpp', timeLimitSec, memoryLimitMb,
 *     testCases: [{ stdin, expectedStdout }] }
 *
 * Output (matches what codeRunnerLambda.js#normalize expects):
 *   { compiled: boolean,
 *     cases: [{ index, statusId, stdout, stderr, compileOutput, time }] }
 *
 * Status ids follow the Judge0 convention used across EvalAI:
 *   3 = Accepted (stdout matches), 4 = Wrong Answer, 5 = Time Limit Exceeded,
 *   6 = Compile Error, 7 = Runtime Error.
 *
 * SECURITY NOTES (this is untrusted student code):
 *  - Lambda gives per-invocation microVM isolation automatically.
 *  - Deploy this function with NO VPC egress (no network) so code can't call out.
 *  - Set a low Lambda timeout and modest memory; the per-test timeout below is a
 *    second layer. Work happens only in /tmp (the sole writable path on Lambda).
 */
const { execFileSync, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const WORK = '/tmp/work';

exports.handler = async (event) => {
  const { source, testCases = [], timeLimitSec = 5 } = event || {};
  const perTestMs = Math.max(1, Number(timeLimitSec)) * 1000;

  // Fresh scratch dir each invocation (containers can be reused between calls).
  fs.rmSync(WORK, { recursive: true, force: true });
  fs.mkdirSync(WORK, { recursive: true });
  const srcPath = path.join(WORK, 'main.cpp');
  const binPath = path.join(WORK, 'main');
  fs.writeFileSync(srcPath, source || '');

  // --- Compile once ---
  const compile = spawnSync('g++', ['-O2', '-std=c++17', '-o', binPath, srcPath], {
    encoding: 'utf8',
    timeout: 20000, // compilation time cap
  });
  if (compile.status !== 0) {
    const compileOutput = (compile.stderr || compile.error?.message || 'Compilation failed').slice(0, 4000);
    // All cases fail to compile.
    return {
      compiled: false,
      cases: testCases.map((_, index) => ({ index, statusId: 6, compileOutput, time: 0 })),
    };
  }

  // --- Run each test case against the compiled binary ---
  const cases = testCases.map((tc, index) => {
    const started = Date.now();
    const run = spawnSync(binPath, [], {
      input: tc.stdin ?? '',
      encoding: 'utf8',
      timeout: perTestMs,
      maxBuffer: 1024 * 1024, // 1 MB stdout cap
      killSignal: 'SIGKILL',
    });
    const time = (Date.now() - started) / 1000;

    // Timed out
    if (run.error && run.error.code === 'ETIMEDOUT') {
      return { index, statusId: 5, stdout: '', stderr: 'Time limit exceeded', time };
    }
    // Crashed / non-zero exit (runtime error)
    if (run.status !== 0) {
      return { index, statusId: 7, stdout: (run.stdout || '').slice(0, 4000), stderr: (run.stderr || '').slice(0, 2000), time };
    }
    // Compare stdout to expected (trailing-whitespace-tolerant, like a judge).
    const got = normalizeOut(run.stdout);
    const want = normalizeOut(tc.expectedStdout);
    const statusId = got === want ? 3 : 4; // Accepted vs Wrong Answer
    return { index, statusId, stdout: (run.stdout || '').slice(0, 4000), stderr: undefined, time };
  });

  return { compiled: true, cases };
};

// Normalize output for comparison: trim trailing spaces per line + trailing newlines.
function normalizeOut(s) {
  return String(s ?? '')
    .replace(/[ \t]+(\r?\n)/g, '$1') // strip trailing spaces on each line
    .replace(/\s+$/g, '');           // strip trailing whitespace overall
}
