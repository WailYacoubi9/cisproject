#!/usr/bin/env node

/**
 * Mock Keycloak Server for Testing Device Flow
 * Simulates Keycloak endpoints needed for OAuth2 Device Authorization Grant
 */

const http = require('http');

const PORT = 8080;
let deviceCodes = {};

console.log('🔐 Starting Mock Keycloak Server...\n');

const server = http.createServer((req, res) => {
  const url = req.url;

  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  // Device Authorization Endpoint
  if (url.includes('/protocol/openid-connect/auth/device') && req.method === 'POST') {
    let body = '';

    req.on('data', chunk => {
      body += chunk.toString();
    });

    req.on('end', () => {
      console.log('📱 Device Authorization Request:', body);

      const params = new URLSearchParams(body);
      const clientId = params.get('client_id');
      const scope = params.get('scope');

      // Generate codes
      const deviceCode = 'device_' + Math.random().toString(36).substr(2, 20);
      const userCode = generateUserCode();

      // Store device code (will auto-approve after 5 seconds for testing)
      deviceCodes[deviceCode] = {
        userCode: userCode,
        clientId: clientId,
        scope: scope,
        status: 'pending',
        createdAt: Date.now(),
        expiresAt: Date.now() + 600000 // 10 minutes
      };

      // Auto-approve after 5 seconds for testing
      setTimeout(() => {
        if (deviceCodes[deviceCode] && deviceCodes[deviceCode].status === 'pending') {
          deviceCodes[deviceCode].status = 'approved';
          console.log(`✅ Auto-approved device code: ${userCode}`);
        }
      }, 5000);

      const response = {
        device_code: deviceCode,
        user_code: userCode,
        verification_uri: 'http://localhost:8080/realms/projetcis/device',
        verification_uri_complete: `http://localhost:8080/realms/projetcis/device?user_code=${userCode}`,
        expires_in: 600,
        interval: 5
      };

      console.log(`✅ Generated user code: ${userCode}`);
      console.log(`⏰ Will auto-approve in 5 seconds...\n`);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(response));
    });

    return;
  }

  // Token Endpoint (for polling)
  if (url.includes('/protocol/openid-connect/token') && req.method === 'POST') {
    let body = '';

    req.on('data', chunk => {
      body += chunk.toString();
    });

    req.on('end', () => {
      const params = new URLSearchParams(body);
      const grantType = params.get('grant_type');
      const deviceCode = params.get('device_code');
      const clientId = params.get('client_id');

      // Device Code Grant
      if (grantType === 'urn:ietf:params:oauth:grant-type:device_code') {
        const device = deviceCodes[deviceCode];

        if (!device) {
          console.log(`❌ Invalid device code: ${deviceCode}`);
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            error: 'invalid_grant',
            error_description: 'Invalid device code'
          }));
          return;
        }

        // Check if expired
        if (Date.now() > device.expiresAt) {
          console.log(`⏱️ Device code expired: ${device.userCode}`);
          delete deviceCodes[deviceCode];
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            error: 'expired_token',
            error_description: 'Device code has expired'
          }));
          return;
        }

        // Check status
        if (device.status === 'pending') {
          console.log(`⏳ Authorization pending for: ${device.userCode}`);
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            error: 'authorization_pending',
            error_description: 'User has not yet approved the request'
          }));
          return;
        }

        if (device.status === 'approved') {
          console.log(`✅ Issuing token for: ${device.userCode}`);

          // Issue tokens
          const accessToken = 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.mock_access_token.' + Math.random().toString(36);
          const idToken = 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.mock_id_token.' + Math.random().toString(36);

          const response = {
            access_token: accessToken,
            token_type: 'Bearer',
            expires_in: 300,
            id_token: idToken,
            scope: device.scope
          };

          // Clean up
          delete deviceCodes[deviceCode];

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(response));
          return;
        }
      }

      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        error: 'unsupported_grant_type',
        error_description: 'Grant type not supported'
      }));
    });

    return;
  }

  // Token Revocation Endpoint
  if (url.includes('/protocol/openid-connect/revoke') && req.method === 'POST') {
    let body = '';

    req.on('data', chunk => {
      body += chunk.toString();
    });

    req.on('end', () => {
      const params = new URLSearchParams(body);
      const token = params.get('token');
      const clientId = params.get('client_id');

      console.log('🔓 Token revocation request');
      console.log(`   Client: ${clientId}`);
      console.log(`   Token: ${token ? token.substring(0, 20) + '...' : 'N/A'}`);

      // Mock revocation - always succeed
      console.log('✅ Token révoqué (mock)');

      // Return 200 OK (RFC 7009 - revocation always returns 200)
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({}));
    });

    return;
  }

  // UserInfo Endpoint
  if (url.includes('/protocol/openid-connect/userinfo') && req.method === 'GET') {
    const authHeader = req.headers['authorization'];

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'unauthorized' }));
      return;
    }

    console.log('👤 UserInfo request received');

    const userInfo = {
      sub: 'test-user-uuid-12345',
      email: 'testuser@example.com',
      email_verified: true,
      name: 'Test User',
      preferred_username: 'testuser',
      given_name: 'Test',
      family_name: 'User'
    };

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(userInfo));
    return;
  }

  // Health check
  if (url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'OK', service: 'mock-keycloak' }));
    return;
  }

  // Default 404
  res.writeHead(404);
  res.end('Not Found');
});

server.listen(PORT, () => {
  console.log(`✅ Mock Keycloak Server running on http://localhost:${PORT}`);
  console.log(`📋 Available endpoints:`);
  console.log(`   - POST /realms/projetcis/protocol/openid-connect/auth/device`);
  console.log(`   - POST /realms/projetcis/protocol/openid-connect/token`);
  console.log(`   - POST /realms/projetcis/protocol/openid-connect/revoke`);
  console.log(`   - GET  /realms/projetcis/protocol/openid-connect/userinfo`);
  console.log(`\n⚡ Auto-approval enabled: Device codes will be approved after 5 seconds\n`);
  console.log(`💡 To stop: Press Ctrl+C\n`);
  console.log('═══════════════════════════════════════════════════════\n');
});

function generateUserCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Removed confusing chars
  let code = '';
  for (let i = 0; i < 8; i++) {
    if (i === 4) code += '-';
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

// Cleanup on exit
process.on('SIGINT', () => {
  console.log('\n\n🛑 Shutting down Mock Keycloak Server...');
  server.close(() => {
    console.log('✅ Server stopped\n');
    process.exit(0);
  });
});
