# SETUP

These load tests can be run against OTP. To work, the running image for the OTP server must have the env var TEST_MODE=true, this bypasses the email and sets a known code for the test to use. In dev sandbox you can use the task definition "otp-provider-test-mode" which has it set.

You will also need to ensure the otp server has a client setup in the "ClientConfig" table with a client id, secret, and redirect uris you can use. The test is setup to use a confidential client.

## Config

You can set the following environment variables to adjust the test configuration:

- **CLIENT_ID**: The client id to use in the OTP server 
- **CLIENT_SECRET**: The client secret to use in the OTP server
- **REDIRECT_URI**: The allowed redirect uri configured for the client in the OTP server
- **OTP_BASE_URL**: The base url of the otp server, e.g. for dev sandbox `https://dev.sandbox.otp.loginproxy.gov.bc.ca`.
- **SCENARIO**: The scenario to use, one of `smoke` or `load`.

The following environment variables are to set test tags, which help to organize them and know what configuration the OTP server was using for the test run.
- **RDS_MIN_ACU**
- **RDS_MAX_ACU** 
- **FARGATE_TASKS** 
- **FARGATE_CPU**
- **FARGATE_MEM** 
- **TEST_ID**: The ID for the test. Follow the format `OTP:<timestamp>`, e.g. `OTP:2025-12-14T12:12:12`. This helps organize the test by range and search metrics near its timestamp.


## Usage

The test can be run locally for development, but is best run in openshift namespace c6af30-dev where the results can be kept in our grafana dashboard for reference and the test runner has the same settings. To run in openshift, adjust the environment variables in `job.yaml` for your desired configuration. Ensure to update the `args` field to add in the timescaleDB connection string. Then run `oc apply -f job.yaml`. To cleanup `oc delete job k6-test`.
