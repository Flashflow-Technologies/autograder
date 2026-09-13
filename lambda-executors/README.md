# EvalAI — Lambda Code Executor (deployment & validation guide)

A safer alternative to Judge0 for running untrusted student code: each language
runs in an AWS Lambda function on **Firecracker microVM isolation** (per-invocation,
AWS-owned — stronger than container-based Judge0, and nothing for you to harden).

This prototype ships the **C++** executor end to end as the reference (the hardest
compiled-language case). Python/Java/C follow the same pattern.

## What's included

```
lambda-executors/cpp/
  index.js        # the Lambda handler: compile once, run each test case
  Dockerfile      # container image (AWS Lambda Node base + g++)
  local-test.js   # run the handler locally with Node + g++ (no AWS needed)
server/src/services/
  codeRunnerLambda.js   # the runViaLambda() client (AWS SDK Invoke)
  codeExecProvider.js   # router: CODE_EXEC_PROVIDER=lambda dispatches here
```

## What is verified vs. what YOU must verify

- **Verified here (actually run):** the C++ handler compiles real code, runs test
  cases, maps results to the right status ids (pass/wrong/compile-error/timeout),
  enforces the per-test timeout, and the client's contract mapping correctly sums
  weights and masks hidden-test output. These ran with real g++ in the build env.
- **NOT verified here (needs your AWS account):** the container build, the deploy,
  Lambda's microVM isolation under load, no-egress networking, cold-start latency,
  and the `@aws-sdk/client-lambda` Invoke path. You must validate these in AWS.

## Step 1 — validate the handler locally (no AWS)

On any machine with Node + g++:

```bash
node lambda-executors/cpp/local-test.js
```

Expect: test 1 → [pass, pass, wrong]; test 2 → compile error; test 3 → timeout.
This proves the executor logic before you touch AWS.

## Step 2 — build & push the container image

Lambda container images live in Amazon ECR.

```bash
cd lambda-executors/cpp
AWS_REGION=ap-south-1                 # use your region
ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
REPO=evalai-exec-cpp

aws ecr create-repository --repository-name $REPO --region $AWS_REGION
aws ecr get-login-password --region $AWS_REGION \
  | docker login --username AWS --password-stdin $ACCOUNT.dkr.ecr.$AWS_REGION.amazonaws.com

docker build -t $REPO .
docker tag $REPO:latest $ACCOUNT.dkr.ecr.$AWS_REGION.amazonaws.com/$REPO:latest
docker push $ACCOUNT.dkr.ecr.$AWS_REGION.amazonaws.com/$REPO:latest
```

## Step 3 — create the Lambda function

```bash
aws lambda create-function \
  --function-name evalai-exec-cpp \
  --package-type Image \
  --code ImageUri=$ACCOUNT.dkr.ecr.$AWS_REGION.amazonaws.com/$REPO:latest \
  --role arn:aws:iam::$ACCOUNT:role/<lambda-exec-role> \
  --timeout 30 \
  --memory-size 512 \
  --region $AWS_REGION
```

**Security hardening (important — this runs untrusted code):**
- **No VPC / no egress:** do NOT attach the function to a VPC with internet access.
  By default Lambda functions have no inbound network and no access to your VPC
  resources — keep it that way so student code can't reach your databases or call out.
- Keep `--timeout` low (e.g. 30s ceiling; the per-test limit in the handler is the
  real cap) and `--memory-size` modest.
- Give the execution role **only** `AWSLambdaBasicExecutionRole` (CloudWatch logs).
  It needs no other AWS permissions.

## Step 4 — point EvalAI at Lambda

Set on the server/worker:

```bash
CODE_EXEC_PROVIDER=lambda
AWS_REGION=ap-south-1
LAMBDA_EXEC_CPP=evalai-exec-cpp
# (later) LAMBDA_EXEC_PYTHON / LAMBDA_EXEC_JAVA / LAMBDA_EXEC_C
```

The server needs AWS credentials with permission to **invoke** these functions
(`lambda:InvokeFunction` on the specific function ARNs) — via an instance role if
running on EC2, or access keys otherwise. Install the SDK on the server:

```bash
cd server && npm install @aws-sdk/client-lambda
```

Then `CODE_EXEC_PROVIDER=lambda` routes all programming-question scoring through
Lambda. **No scoring code changes** — the return contract is identical to Judge0.

## Step 5 — end-to-end test in AWS

Invoke directly to confirm the deployed function behaves like the local test:

```bash
aws lambda invoke --function-name evalai-exec-cpp \
  --payload '{"source":"#include <iostream>\nint main(){int a,b;std::cin>>a>>b;std::cout<<a+b;}","language":"cpp","timeLimitSec":5,"testCases":[{"stdin":"3 5","expectedStdout":"8"}]}' \
  --cli-binary-format raw-in-base64-out out.json && cat out.json
```

Expect `{"compiled":true,"cases":[{"index":0,"statusId":3,...}]}`.

## Adding the other languages

Clone the `cpp/` folder per language and change only the compile/run commands in
`index.js`:
- **C:** `gcc` instead of `g++` (Dockerfile installs `gcc`).
- **Java:** install a JDK in the Dockerfile; compile with `javac`, run with `java`.
  (Class-name handling: write to `Main.java`, require `public class Main`.)
- **Python:** no compile step; Dockerfile uses the Python Lambda base image; run
  `python3 main.py`. (Mark `compiled:true` always.)

Each returns the same `{ compiled, cases:[{index,statusId,...}] }` shape, so the
client and scoring need no further changes.

## Honest caveats

- **Cold starts:** the first invocation of an idle function adds ~1–2s. Irrelevant
  for background grading; don't use this for interactive "run my code" (which you
  removed anyway).
- **Lambda limits:** 15-min max timeout (you'll set far lower), 10 GB image, limited
  `/tmp`. Fine for typical exam questions; not for programs needing large disk or
  very long runtimes.
- **Compiled-language images are larger** (toolchain included) → slightly slower
  cold starts. Acceptable for grading.
- This is a prototype reference. Before production, load-test concurrency and
  confirm the no-egress + IAM-least-privilege posture in your account.
