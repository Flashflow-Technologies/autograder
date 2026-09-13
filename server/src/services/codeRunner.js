import logger from '../utils/logger.js';

// Judge0 language IDs (for image 1.13.x). These map our language keys to the
// compiler/runtime Judge0 uses.
const LANGUAGE_IDS = {
  python: 71,  // Python 3.8
  java: 62,    // Java (OpenJDK 13)
  c: 50,       // C (GCC 9)
  cpp: 54,     // C++ (GCC 9)
};

const JUDGE0_URL = process.env.JUDGE0_URL || 'http://judge0:2358';
const POLL_INTERVAL_MS = 1000;
const MAX_POLLS = 30;

const b64 = (s) => Buffer.from(s ?? '', 'utf8').toString('base64');
const unb64 = (s) => (s ? Buffer.from(s, 'base64').toString('utf8') : '');

/**
 * Run one source submission against a single stdin, returning the Judge0 result.
 * Uses base64 encoding end-to-end so arbitrary bytes/newlines survive.
 */
async function runOne({ source, languageId, stdin, expectedOutput, timeLimitSec, memoryLimitMb }) {
  const body = {
    source_code: b64(source),
    language_id: languageId,
    stdin: b64(stdin || ''),
    expected_output: b64(expectedOutput || ''),
    cpu_time_limit: timeLimitSec,
    wall_time_limit: timeLimitSec + 5,
    memory_limit: memoryLimitMb * 1024, // Judge0 wants KB
  };

  // Create submission (base64_encoded, wait=false so we poll — robust for big batches)
  const createRes = await fetch(`${JUDGE0_URL}/submissions?base64_encoded=true&wait=false`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!createRes.ok) throw new Error(`Judge0 create failed: ${createRes.status}`);
  const { token } = await createRes.json();

  // Poll until done (status id <= 2 means In Queue / Processing).
  for (let i = 0; i < MAX_POLLS; i++) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    const res = await fetch(`${JUDGE0_URL}/submissions/${token}?base64_encoded=true&fields=status_id,stdout,stderr,compile_output,time,memory`);
    if (!res.ok) continue;
    const data = await res.json();
    if (data.status_id > 2) {
      return {
        statusId: data.status_id, // 3 = Accepted, 4 = WrongAnswer, 6 = CompileError, 5 = TLE, etc.
        stdout: unb64(data.stdout),
        stderr: unb64(data.stderr),
        compileOutput: unb64(data.compile_output),
        time: parseFloat(data.time) || 0,
        memory: data.memory || 0,
      };
    }
  }
  return { statusId: -1, stdout: '', stderr: 'Execution timed out (judge polling exceeded)', compileOutput: '', time: 0, memory: 0 };
}

/**
 * Run a student's program against all test cases. Returns:
 *   { compiled, results: [{ index, hidden, passed, statusId, time, ... }],
 *     passedWeight, totalWeight }
 * The first compile error short-circuits (all tests fail to compile).
 */
export async function runTestCases({ source, language, testCases, timeLimitSec = 5, memoryLimitMb = 128 }) {
  const languageId = LANGUAGE_IDS[language];
  if (!languageId) throw new Error(`Unsupported language: ${language}`);
  if (!source || !source.trim()) {
    return { compiled: false, results: [], passedWeight: 0, totalWeight: (testCases || []).reduce((a, t) => a + (t.weight || 1), 0), note: 'Empty submission' };
  }

  const results = [];
  let passedWeight = 0;
  let totalWeight = 0;
  let compiled = true;

  for (let i = 0; i < testCases.length; i++) {
    const tc = testCases[i];
    const weight = tc.weight || 1;
    totalWeight += weight;
    let r;
    try {
      r = await runOne({ source, languageId, stdin: tc.stdin, expectedOutput: tc.expectedStdout, timeLimitSec, memoryLimitMb });
    } catch (e) {
      logger.error('Judge0 run failed', { error: e.message });
      r = { statusId: -2, stderr: e.message, stdout: '', compileOutput: '', time: 0, memory: 0 };
    }
    // Status 6 = compile error: the program never builds, so stop testing.
    if (r.statusId === 6) {
      compiled = false;
      results.push({ index: i, hidden: !!tc.hidden, passed: false, statusId: 6, compileOutput: r.compileOutput, time: 0 });
      // Remaining cases also count as failed-to-compile.
      for (let j = i + 1; j < testCases.length; j++) {
        totalWeight += testCases[j].weight || 1;
        results.push({ index: j, hidden: !!testCases[j].hidden, passed: false, statusId: 6, time: 0 });
      }
      break;
    }
    const passed = r.statusId === 3; // Accepted (stdout matches expected)
    if (passed) passedWeight += weight;
    results.push({
      index: i, hidden: !!tc.hidden, passed, statusId: r.statusId,
      time: r.time, memory: r.memory,
      stdout: tc.hidden ? undefined : r.stdout,
      stderr: tc.hidden ? undefined : (r.stderr || undefined),
    });
  }

  return { compiled, results, passedWeight, totalWeight };
}

export { LANGUAGE_IDS };
