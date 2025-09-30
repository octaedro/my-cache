import http from 'http';

const HOST = 'localhost';
const PORT = 7379;
const REQUESTS = 5000;
const CONCURRENCY = 20;

interface RequestOptions {
  hostname: string;
  port: number;
  path: string;
  method: string;
  headers: Record<string, string>;
}

interface Response {
  status: number;
  data: string;
}

/**
 * Make HTTP request
 */
function makeRequest(method: string, path: string, body?: any): Promise<Response> {
  return new Promise((resolve, reject) => {
    const options: RequestOptions = {
      hostname: HOST,
      port: PORT,
      path,
      method,
      headers: {
        'Content-Type': 'application/json'
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode || 0, data }));
    });

    req.on('error', reject);

    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

/**
 * Run load test
 */
async function runLoadTest(): Promise<void> {
  console.log(`Starting load test: ${REQUESTS} requests with concurrency ${CONCURRENCY}`);
  console.log('Warming up server...\n');

  // Warmup
  await makeRequest('GET', '/health');

  // Test SET operations
  console.log('Testing SET operations...');
  let setStart = Date.now();
  let setCompleted = 0;
  let setErrors = 0;

  let inFlight = 0;
  let nextIdx = 0;

  await new Promise<void>((resolve) => {
    const runNext = () => {
      while (inFlight < CONCURRENCY && nextIdx < REQUESTS) {
        inFlight++;
        const i = nextIdx++;
        makeRequest('POST', '/set', {
          key: `key${i}`,
          value: `value${i}`
        }).then(() => {
          setCompleted++;
        }).catch(() => {
          setErrors++;
        }).finally(() => {
          inFlight--;
          if (nextIdx < REQUESTS) {
            runNext();
          } else if (inFlight === 0) {
            resolve();
          }
        });
      }
    };
    runNext();
  });
  const setDuration = Date.now() - setStart;
  const setThroughput = Math.floor((setCompleted / setDuration) * 1000);

  console.log(`SET: ${setCompleted} completed, ${setErrors} errors`);
  console.log(`SET: ${setDuration}ms total, ${setThroughput} ops/sec\n`);

  // Test GET operations
  console.log('Testing GET operations...');
  let getStart = Date.now();
  let getCompleted = 0;
  let getErrors = 0;

  inFlight = 0;
  nextIdx = 0;

  await new Promise<void>((resolve) => {
    const runNext = () => {
      while (inFlight < CONCURRENCY && nextIdx < REQUESTS) {
        inFlight++;
        const i = nextIdx++;
        makeRequest('GET', `/get?key=key${i % 1000}`).then(() => {
          getCompleted++;
        }).catch(() => {
          getErrors++;
        }).finally(() => {
          inFlight--;
          if (nextIdx < REQUESTS) {
            runNext();
          } else if (inFlight === 0) {
            resolve();
          }
        });
      }
    };
    runNext();
  });
  const getDuration = Date.now() - getStart;
  const getThroughput = Math.floor((getCompleted / getDuration) * 1000);

  console.log(`GET: ${getCompleted} completed, ${getErrors} errors`);
  console.log(`GET: ${getDuration}ms total, ${getThroughput} ops/sec\n`);

  // Test ZADD operations
  console.log('Testing ZADD operations...');
  let zaddStart = Date.now();
  let zaddCompleted = 0;
  let zaddErrors = 0;

  inFlight = 0;
  nextIdx = 0;
  const zaddCount = Math.min(REQUESTS, 2000);

  await new Promise<void>((resolve) => {
    const runNext = () => {
      while (inFlight < CONCURRENCY && nextIdx < zaddCount) {
        inFlight++;
        const i = nextIdx++;
        makeRequest('POST', '/zadd', {
          key: 'leaderboard',
          score: Math.random() * 1000,
          member: `player${i}`
        }).then(() => {
          zaddCompleted++;
        }).catch(() => {
          zaddErrors++;
        }).finally(() => {
          inFlight--;
          if (nextIdx < zaddCount) {
            runNext();
          } else if (inFlight === 0) {
            resolve();
          }
        });
      }
    };
    runNext();
  });
  const zaddDuration = Date.now() - zaddStart;
  const zaddThroughput = Math.floor((zaddCompleted / zaddDuration) * 1000);

  console.log(`ZADD: ${zaddCompleted} completed, ${zaddErrors} errors`);
  console.log(`ZADD: ${zaddDuration}ms total, ${zaddThroughput} ops/sec\n`);

  // Test ZRANGEBYSCORE
  console.log('Testing ZRANGEBYSCORE operations...');
  let zrangeStart = Date.now();
  let zrangeCompleted = 0;
  let zrangeErrors = 0;

  inFlight = 0;
  nextIdx = 0;
  const zrangeCount = 500;

  await new Promise<void>((resolve) => {
    const runNext = () => {
      while (inFlight < CONCURRENCY && nextIdx < zrangeCount) {
        inFlight++;
        nextIdx++;
        makeRequest('GET', `/zrangeByScore?key=leaderboard&min=0&max=500&limit=10`).then(() => {
          zrangeCompleted++;
        }).catch(() => {
          zrangeErrors++;
        }).finally(() => {
          inFlight--;
          if (nextIdx < zrangeCount) {
            runNext();
          } else if (inFlight === 0) {
            resolve();
          }
        });
      }
    };
    runNext();
  });
  const zrangeDuration = Date.now() - zrangeStart;
  const zrangeThroughput = Math.floor((zrangeCompleted / zrangeDuration) * 1000);

  console.log(`ZRANGEBYSCORE: ${zrangeCompleted} completed, ${zrangeErrors} errors`);
  console.log(`ZRANGEBYSCORE: ${zrangeDuration}ms total, ${zrangeThroughput} ops/sec\n`);

  // Summary
  const totalOps = setCompleted + getCompleted + zaddCompleted + zrangeCompleted;
  const totalDuration = setDuration + getDuration + zaddDuration + zrangeDuration;
  const overallThroughput = Math.floor((totalOps / totalDuration) * 1000);

  console.log('=== SUMMARY ===');
  console.log(`Total operations: ${totalOps}`);
  console.log(`Total time: ${totalDuration}ms`);
  console.log(`Overall throughput: ${overallThroughput} ops/sec`);
}

// Check if server is running
makeRequest('GET', '/health')
  .then(() => {
    console.log('Server is running, starting load test...\n');
    return runLoadTest();
  })
  .catch((err) => {
    console.error('Error: Server not running. Start server with "npm start" first.');
    process.exit(1);
  });