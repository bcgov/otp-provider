import http from 'k6/http';
import { sleep } from 'k6';
import { URL } from 'https://jslib.k6.io/url/1.0.0/index.js';
import { expect } from 'https://jslib.k6.io/k6chaijs/4.3.4.3/index.js';

const CLIENT_ID = __ENV.CLIENT_ID;
const CLIENT_SECRET = __ENV.CLIENT_SECRET;
const REDIRECT_URI = __ENV.REDIRECT_URI;
const OTP_BASE_URL = __ENV.OTP_BASE_URL;

const SCENARIO = __ENV.SCENARIO || 'smoke';

const scenarios = {
    smoke: {
        executor: "constant-vus",
        vus: 1,
        duration: "10s",
        tags: { test_type: "smoke" },
    },
    load: {
        executor: "ramping-arrival-rate",
        startRate: 1,
        timeUnit: "1s",
        preAllocatedVUs: 100,
        stages: [
            { target: 5, duration: '10s' },   
            { target: 10, duration: '10s' },   
            { target: 15, duration: '10s' },  
            { target: 15, duration: '30s' },    
        ],
        tags: { test_type: "load" },
    },
};

export let options = {
    thresholds: {
        // Fail if any request takes longer than 5s
        http_req_duration: [{threshold: 'max<5000', abortOnFail: true ,}],
        http_req_failed: [{threshold: 'rate<0.001', abortOnFail: true, }], // fail if more than 0.1% fail
    },
    tags: {testid:  __ENV.TEST_ID, rds_min_acu: __ENV.RDS_MIN_ACU, rds_max_acu: __ENV.RDS_MAX_ACU, fargate_tasks: __ENV.FARGATE_TASKS, fargate_cpu: __ENV.FARGATE_CPU, fargate_mem: __ENV.FARGATE_MEM},
    scenarios: {}
};

options.scenarios[SCENARIO] = scenarios[SCENARIO];

export default function () {
    console.log(`starting with vu ${__VU}`)
    const authParams = {
        client_id: CLIENT_ID,
        redirect_uri: REDIRECT_URI,
        response_type: "code",
        scope: "openid",
    };

    const jar = http.cookieJar();

    const authUrl = `${OTP_BASE_URL}/auth?` +
        Object.entries(authParams)
            .map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join("&");

    let res = http.get(authUrl, { redirects: 0, jar });
    let cookies = res.cookies;

    const loginPath = `${OTP_BASE_URL}${cookies._interaction[0].path}/otp`

    // Generating randId to avoid email dupes
    const randID = Math.floor(Math.random() * 100000000000)

    res = http.post(loginPath, {
        email: `test${randID}@mail.com`,
    }, {
        jar,
        redirects: 0,
        headers: {
            "Content-Type": "application/x-www-form-urlencoded",
        },
    });

    const authnPath = `${OTP_BASE_URL}${cookies._interaction[0].path}/login`

    res = http.post(authnPath, {
        code1: "1",
        code2: "1",
        code3: "1",
        code4: "1",
        code5: "1",
        code6: "1",
    }, {
        jar,
        redirects: 0,
        headers: {
            "Content-Type": "application/x-www-form-urlencoded",
        },
    });

    // Adjust to https in case location header is http
    const redirectUri = res.headers.Location.replace('http://', 'https://')

    const newRes = http.get(redirectUri, {
        redirects: 0,
        jar,
    });

    const url = new URL(newRes.headers.Location);
    const authCode = url.searchParams.get("code");

    const tokenUrl = `${OTP_BASE_URL}/token`;
    const payload = {
        grant_type: "authorization_code",
        code: authCode,
        redirect_uri: REDIRECT_URI,
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
    };

    const tokenRes = http.post(tokenUrl, payload, {
        redirects: 0,
        headers: {
            "Content-Type": "application/x-www-form-urlencoded",
        },
    });

    expect(tokenRes.status).to.equal(200);
    expect(JSON.parse(tokenRes.body).access_token).to.be.a('string');
    sleep(1)
}