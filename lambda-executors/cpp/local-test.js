/**
 * Local test for the C++ executor handler — runs the handler directly with Node
 * (no AWS needed), provided g++ is installed on the machine you run it on.
 *
 *   node lambda-executors/cpp/local-test.js
 *
 * This validates the compile-once-run-each logic and the status-id mapping
 * before you ever build the container or deploy to Lambda. It is NOT a
 * substitute for testing the deployed Lambda (isolation, timeouts under load),
 * but it proves the core executor logic end to end.
 */
const { handler } = require('./index.js');

const SUM_PROGRAM = `
#include <iostream>
int main() { int a,b; std::cin >> a >> b; std::cout << a + b << std::endl; return 0; }
`;

const INFINITE_LOOP = `int main(){ while(true){} }`;
const WONT_COMPILE = `int main(){ this is not c++ }`;

async function run() {
  console.log('--- Test 1: correct sum program ---');
  let r = await handler({
    source: SUM_PROGRAM, language: 'cpp', timeLimitSec: 5,
    testCases: [
      { stdin: '3 5', expectedStdout: '8' },     // should pass (3)
      { stdin: '10 20', expectedStdout: '30' },  // should pass (3)
      { stdin: '1 1', expectedStdout: '3' },     // should fail  (4 wrong answer)
    ],
  });
  console.log(JSON.stringify(r, null, 2));
  console.log('expect: compiled=true, cases statusIds = [3,3,4]\n');

  console.log('--- Test 2: compile error ---');
  r = await handler({ source: WONT_COMPILE, language: 'cpp', testCases: [{ stdin: '', expectedStdout: '' }] });
  console.log(JSON.stringify(r, null, 2));
  console.log('expect: compiled=false, every case statusId=6\n');

  console.log('--- Test 3: timeout ---');
  r = await handler({ source: INFINITE_LOOP, language: 'cpp', timeLimitSec: 2, testCases: [{ stdin: '', expectedStdout: '' }] });
  console.log(JSON.stringify(r, null, 2));
  console.log('expect: compiled=true, case statusId=5 (time limit exceeded)\n');
}

run().catch((e) => { console.error(e); process.exit(1); });
