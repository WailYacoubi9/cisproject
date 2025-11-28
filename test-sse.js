#!/usr/bin/env node

/**
 * Test Suite for SSE Migration
 * Tests the Server-Sent Events implementation in device-app
 */

const https = require('https');
const http = require('http');

// Allow self-signed certificates for testing
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const DEVICE_APP_URL = 'http://localhost:4000';
const DEVICE_APP_HTTP_URL = 'http://localhost:4000';

let testsPassed = 0;
let testsFailed = 0;

function log(emoji, message) {
  console.log(`${emoji} ${message}`);
}

function pass(testName) {
  testsPassed++;
  log('✅', `PASS: ${testName}`);
}

function fail(testName, error) {
  testsFailed++;
  log('❌', `FAIL: ${testName}`);
  if (error) log('   ', `Error: ${error.message || error}`);
}

// Helper to make HTTP requests
function makeRequest(url, method = 'GET', data = null) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const isHttps = urlObj.protocol === 'https:';
    const lib = isHttps ? https : http;

    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port,
      path: urlObj.pathname,
      method: method,
      headers: data ? {
        'Content-Type': 'application/json',
        'Content-Length': JSON.stringify(data).length
      } : {},
      rejectUnauthorized: false
    };

    const req = lib.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(body);
          resolve({ status: res.statusCode, data: json, headers: res.headers });
        } catch (e) {
          resolve({ status: res.statusCode, data: body, headers: res.headers });
        }
      });
    });

    req.on('error', reject);

    if (data) {
      req.write(JSON.stringify(data));
    }

    req.end();
  });
}

// Test 1: Server Health Check
async function testHealthCheck() {
  try {
    const response = await makeRequest(`${DEVICE_APP_URL}/health`);
    if (response.status === 200 && response.data.status === 'OK') {
      pass('Health Check - Server is running');
      return true;
    } else {
      fail('Health Check', 'Invalid response');
      return false;
    }
  } catch (error) {
    // Try HTTP fallback
    try {
      const response = await makeRequest(`${DEVICE_APP_HTTP_URL}/health`);
      if (response.status === 200 && response.data.status === 'OK') {
        pass('Health Check - Server is running (HTTP)');
        return true;
      }
    } catch (e) {
      fail('Health Check', error);
      return false;
    }
  }
}

// Test 2: SSE Endpoint Exists
async function testSSEEndpoint() {
  try {
    // We'll test that the endpoint exists and returns proper headers
    const urlObj = new URL(`${DEVICE_APP_URL}/events`);

    return new Promise((resolve) => {
      const lib = urlObj.protocol === 'https:' ? https : http;
      const req = lib.request({
        hostname: urlObj.hostname,
        port: urlObj.port,
        path: urlObj.pathname,
        method: 'GET',
        rejectUnauthorized: false
      }, (res) => {
        if (res.headers['content-type'] === 'text/event-stream') {
          pass('SSE Endpoint - Returns correct Content-Type header');
          req.destroy(); // Close connection
          resolve(true);
        } else {
          fail('SSE Endpoint', 'Wrong Content-Type: ' + res.headers['content-type']);
          req.destroy();
          resolve(false);
        }
      });

      req.on('error', (error) => {
        fail('SSE Endpoint', error);
        resolve(false);
      });

      req.end();
    });
  } catch (error) {
    fail('SSE Endpoint', error);
    return false;
  }
}

// Test 3: SSE Initial State
async function testSSEInitialState() {
  try {
    log('🔄', 'Testing SSE initial state message...');

    return new Promise((resolve) => {
      const urlObj = new URL(`${DEVICE_APP_URL}/events`);
      let received = false;
      const lib = urlObj.protocol === 'https:' ? https : http;

      const req = lib.request({
        hostname: urlObj.hostname,
        port: urlObj.port,
        path: urlObj.pathname,
        method: 'GET',
        rejectUnauthorized: false
      }, (res) => {
        res.on('data', (chunk) => {
          const data = chunk.toString();
          if (data.includes('data:') && !received) {
            received = true;
            try {
              const jsonMatch = data.match(/data: (.+)/);
              if (jsonMatch) {
                const json = JSON.parse(jsonMatch[1]);
                if (json.type === 'waiting' || json.type === 'pending' || json.type === 'authenticated') {
                  pass(`SSE Initial State - Received state: ${json.type}`);
                  req.destroy();
                  resolve(true);
                } else {
                  fail('SSE Initial State', 'Invalid state type: ' + json.type);
                  req.destroy();
                  resolve(false);
                }
              }
            } catch (e) {
              fail('SSE Initial State', 'Invalid JSON: ' + e.message);
              req.destroy();
              resolve(false);
            }
          }
        });
      });

      req.on('error', (error) => {
        fail('SSE Initial State', error);
        resolve(false);
      });

      // Timeout after 5 seconds
      setTimeout(() => {
        if (!received) {
          fail('SSE Initial State', 'No data received within 5 seconds');
          req.destroy();
          resolve(false);
        }
      }, 5000);

      req.end();
    });
  } catch (error) {
    fail('SSE Initial State', error);
    return false;
  }
}

// Test 4: API Status Endpoint (CORS)
async function testAPIStatus() {
  try {
    const response = await makeRequest(`${DEVICE_APP_URL}/api/status`);
    if (response.status === 200 && response.data.hasOwnProperty('authenticated')) {
      // Check for CORS header
      if (response.headers['access-control-allow-origin']) {
        pass('API Status - Endpoint works with CORS headers');
        return true;
      } else {
        fail('API Status', 'Missing CORS header');
        return false;
      }
    } else {
      fail('API Status', 'Invalid response');
      return false;
    }
  } catch (error) {
    fail('API Status', error);
    return false;
  }
}

// Test 5: Start Device Flow
async function testStartDeviceFlow() {
  try {
    log('🔄', 'Testing Device Flow initiation...');
    const response = await makeRequest(`${DEVICE_APP_URL}/start-device-flow`, 'POST', {});

    if (response.status === 200 && response.data.success) {
      if (response.data.data.user_code && response.data.data.verification_uri) {
        pass('Start Device Flow - Generates user_code and verification_uri');
        log('   ', `User Code: ${response.data.data.user_code}`);
        log('   ', `Verification URI: ${response.data.data.verification_uri}`);
        return response.data.data;
      } else {
        fail('Start Device Flow', 'Missing required fields');
        return null;
      }
    } else {
      fail('Start Device Flow', response.data.error || 'Failed to start flow');
      return null;
    }
  } catch (error) {
    fail('Start Device Flow', error);
    return null;
  }
}

// Test 6: SSE Notification on Flow Start
async function testSSENotificationOnStart() {
  try {
    log('🔄', 'Testing SSE notification when device flow starts...');

    return new Promise((resolve) => {
      const urlObj = new URL(`${DEVICE_APP_URL}/events`);
      let receivedInitial = false;
      let receivedPending = false;
      const lib = urlObj.protocol === 'https:' ? https : http;

      const req = lib.request({
        hostname: urlObj.hostname,
        port: urlObj.port,
        path: urlObj.pathname,
        method: 'GET',
        rejectUnauthorized: false
      }, (res) => {
        res.on('data', (chunk) => {
          const data = chunk.toString();
          const messages = data.split('\n\n').filter(m => m.trim());

          messages.forEach(message => {
            if (message.includes('data:')) {
              const jsonMatch = message.match(/data: (.+)/);
              if (jsonMatch) {
                try {
                  const json = JSON.parse(jsonMatch[1]);

                  if (!receivedInitial) {
                    receivedInitial = true;
                    log('   ', `Initial state: ${json.type}`);
                  } else if (json.type === 'pending' && !receivedPending) {
                    receivedPending = true;
                    log('   ', `Received pending notification with code: ${json.user_code}`);
                    pass('SSE Notification on Flow Start - Received pending state via SSE');
                    req.destroy();
                    resolve(true);
                  }
                } catch (e) {
                  // Ignore parse errors
                }
              }
            }
          });
        });
      });

      req.on('error', (error) => {
        fail('SSE Notification on Flow Start', error);
        req.destroy();
        resolve(false);
      });

      req.end();

      // Start the device flow after a short delay
      setTimeout(async () => {
        try {
          await makeRequest(`${DEVICE_APP_URL}/start-device-flow`, 'POST', {});
        } catch (e) {
          // Ignore errors
        }
      }, 500);

      // Timeout after 10 seconds
      setTimeout(() => {
        if (!receivedPending) {
          fail('SSE Notification on Flow Start', 'No pending notification received');
          req.destroy();
          resolve(false);
        }
      }, 10000);
    });
  } catch (error) {
    fail('SSE Notification on Flow Start', error);
    return false;
  }
}

// Test 7: Logout Endpoint
async function testLogout() {
  try {
    const response = await makeRequest(`${DEVICE_APP_URL}/logout`, 'POST', {});
    if (response.status === 200 && response.data.success) {
      pass('Logout - Successfully clears state');
      return true;
    } else {
      fail('Logout', 'Invalid response');
      return false;
    }
  } catch (error) {
    fail('Logout', error);
    return false;
  }
}

// Test 8: Verify notifyClients function exists in code
async function testCodeStructure() {
  const fs = require('fs');
  const path = require('path');

  try {
    const serverCode = fs.readFileSync(path.join(__dirname, 'device-app/server.js'), 'utf8');

    // Check for SSE infrastructure
    const checks = [
      { name: 'sseClients array', pattern: /let sseClients = \[\]/ },
      { name: 'notifyClients function', pattern: /function notifyClients\(data\)/ },
      { name: 'getCurrentState function', pattern: /function getCurrentState\(\)/ },
      { name: 'GET /events route', pattern: /app\.get\('\/events'/ },
      { name: 'SSE headers', pattern: /text\/event-stream/ },
      { name: 'notifyClients called on auth', pattern: /notifyClients\(\{ type: 'authenticated'/ },
      { name: 'notifyClients called on logout', pattern: /notifyClients\(\{ type: 'waiting'/ },
      { name: 'notifyClients called on pending', pattern: /notifyClients\(\{[\s\S]*?type: 'pending'/ }
    ];

    let allFound = true;
    checks.forEach(check => {
      if (check.pattern.test(serverCode)) {
        log('   ', `✓ Found: ${check.name}`);
      } else {
        log('   ', `✗ Missing: ${check.name}`);
        allFound = false;
      }
    });

    if (allFound) {
      pass('Code Structure - All SSE components present');
      return true;
    } else {
      fail('Code Structure', 'Some SSE components missing');
      return false;
    }
  } catch (error) {
    fail('Code Structure', error);
    return false;
  }
}

// Test 9: Frontend EventSource Implementation
async function testFrontendCode() {
  const fs = require('fs');
  const path = require('path');

  try {
    const frontendCode = fs.readFileSync(path.join(__dirname, 'device-app/views/device-home.ejs'), 'utf8');

    const checks = [
      { name: 'eventSource variable', pattern: /let eventSource = null/ },
      { name: 'startEventStream function', pattern: /function startEventStream\(\)/ },
      { name: 'new EventSource', pattern: /new EventSource\('\/events'\)/ },
      { name: 'onmessage handler', pattern: /eventSource\.onmessage/ },
      { name: 'onerror handler', pattern: /eventSource\.onerror/ },
      { name: 'SSE on window.onload', pattern: /startEventStream\(\)/ },
      { name: 'EventSource close on logout', pattern: /eventSource\.close\(\)/ },
      { name: 'No more HTTP polling', pattern: /setInterval.*fetch.*status/i, shouldNotExist: true }
    ];

    let allPassed = true;
    checks.forEach(check => {
      const found = check.pattern.test(frontendCode);
      if (check.shouldNotExist) {
        if (!found) {
          log('   ', `✓ Confirmed removed: ${check.name}`);
        } else {
          log('   ', `✗ Still present: ${check.name}`);
          allPassed = false;
        }
      } else {
        if (found) {
          log('   ', `✓ Found: ${check.name}`);
        } else {
          log('   ', `✗ Missing: ${check.name}`);
          allPassed = false;
        }
      }
    });

    if (allPassed) {
      pass('Frontend Code - EventSource properly implemented');
      return true;
    } else {
      fail('Frontend Code', 'Some components missing or incorrect');
      return false;
    }
  } catch (error) {
    fail('Frontend Code', error);
    return false;
  }
}

// Run all tests
async function runTests() {
  console.log('\n🧪 Starting SSE Migration Tests\n');
  console.log('═══════════════════════════════════════════════════════\n');

  // Static code analysis tests (don't require server)
  log('📋', 'SECTION 1: Code Structure Tests\n');
  await testCodeStructure();
  await testFrontendCode();

  console.log('\n═══════════════════════════════════════════════════════\n');
  log('🌐', 'SECTION 2: Runtime Tests (require server running)\n');

  // Check if server is running
  const serverRunning = await testHealthCheck();

  if (serverRunning) {
    await testAPIStatus();
    await testSSEEndpoint();
    await testSSEInitialState();
    await testStartDeviceFlow();
    await testSSENotificationOnStart();
    await testLogout();
  } else {
    log('⚠️', 'Server not running - skipping runtime tests');
    log('   ', 'To run full tests, start the server with: cd device-app && node server.js');
  }

  // Print summary
  console.log('\n═══════════════════════════════════════════════════════');
  console.log('\n📊 Test Summary:\n');
  console.log(`   ✅ Passed: ${testsPassed}`);
  console.log(`   ❌ Failed: ${testsFailed}`);
  console.log(`   📈 Total:  ${testsPassed + testsFailed}`);

  if (testsFailed === 0) {
    console.log('\n🎉 All tests passed!\n');
  } else {
    console.log(`\n⚠️  ${testsFailed} test(s) failed\n`);
  }

  process.exit(testsFailed > 0 ? 1 : 0);
}

// Run tests
runTests().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
