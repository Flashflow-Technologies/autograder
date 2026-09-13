# C++ executor Lambda — container image.
# Based on the AWS Lambda Node.js base image, with g++ added so we can compile
# student C++ submissions. Container-image Lambdas can be up to 10 GB, which
# comfortably fits a compiler toolchain.

FROM public.ecr.aws/lambda/nodejs:20

# Install the GNU C++ compiler. The Lambda Node base is Amazon Linux based.
RUN dnf install -y gcc-c++ && dnf clean all

# Lambda's task root.
WORKDIR ${LAMBDA_TASK_ROOT}

# Handler code (no node deps needed — uses only Node built-ins).
COPY index.js ${LAMBDA_TASK_ROOT}/

# handler = <file>.<exported function>
CMD [ "index.handler" ]
