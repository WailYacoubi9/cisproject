# OAuth2 Device Flow - Projet CIS

## Quick Start

Si vous venez de cloner ce projet :

```bash
# 1. Installer les dépendances
cd webapp2
npm install

cd ../device-app
npm install

# 2. Démarrer Keycloak (Docker)
docker run -d --name keycloak-dev \
  -p 8080:8080 \
  -e KC_BOOTSTRAP_ADMIN_USERNAME=admin \
  -e KC_BOOTSTRAP_ADMIN_PASSWORD=admin \
  -v $(pwd)/imports:/opt/keycloak/data/import \
  quay.io/keycloak/keycloak:latest start-dev --import-realm

# 3. Configurer webapp2/.env (voir README.md)

# 4. Démarrer les apps
# Terminal 1:
cd device-app
node server.js

# Terminal 2:
cd webapp2
npm start

# 5. Ouvrir dans le navigateur
# - WebApp: https://localhost:3000
# - Device: http://localhost:4000
# - Keycloak: http://localhost:8080
```

---

## Architecture

```
┌─────────────────┐
│   Keycloak      │  Port 8080 - Identity Provider
│   (IDM)         │  - OAuth2 Device Flow
└────────┬────────┘  - Token management
         │
    ┌────┴────┐
    │         │
    ▼         ▼
┌─────────┐ ┌──────────────┐
│ WebApp2 │ │  Device-App  │
│ (3000)  │ │  (4000)      │
└─────────┘ └──────────────┘
```

### Components

**1. Keycloak (port 8080)**
- Identity and Access Management
- OAuth2/OIDC server
- Clients: `webapp` (Authorization Code + PKCE) et `devicecis` (Device Flow)

**2. WebApp2 (port 3000)**
- Application web principale
- Authentification: Authorization Code Flow + PKCE
- Interface utilisateur pour gérer les devices

**3. Device-App (port 4000)**
- Simule un appareil IoT (Raspberry Pi, Smart TV, etc.)
- OAuth2 Device Flow
- Interface web pour voir l'état

---

## Changes Made

### What Was Added

**1. Server-Sent Events (SSE)**
- Remplace HTTP polling (30 req/min) par 1 connexion persistante
- Real-time updates (<100ms latency)
- device-app/server.js: `/events` endpoint
- device-app/views/device-home.ejs: EventSource API

**2. Token Revocation**
- Logout appelle maintenant `/revoke` endpoint (RFC 7009)
- Keycloak termine la session correctement
- Fix: webapp montrait toujours device connecté après logout

### Files Modified

```
device-app/
├── server.js
│   ├── sseClients[] - Liste des connexions SSE
│   ├── notifyClients() - Broadcast aux clients
│   ├── getCurrentState() - État actuel du device
│   ├── GET /events - Endpoint SSE
│   └── POST /logout - Ajout révocation token
└── views/device-home.ejs
    ├── EventSource - Remplace setInterval polling
    ├── startEventStream() - Connexion SSE
    └── Auto-reconnect on state changes
```

### Why These Changes

**SSE Benefits:**
- 100% reduction HTTP requests
- Instant updates (pas d'attente 2-5s)
- Less server load
- Better UX

**Token Revocation Benefits:**
- Proper session termination
- Security best practice
- Webapp sees correct state
- Prevents token reuse

---

## How It Works

### Device Flow

```
1. User starts device-app
   → Génère device_code + user_code

2. Device affiche: "Code: ABCD-1234"

3. User va sur webapp → /activation
   → Entre le code ABCD-1234

4. User s'authentifie sur Keycloak

5. Device reçoit access_token
   → SSE notifie: {type: "authenticated"}
   → UI update instantané

6. User clique logout
   → Token révoqué dans Keycloak
   → SSE notifie: {type: "waiting"}
```

### SSE Flow

```javascript
// Client (device-home.ejs)
const eventSource = new EventSource('/events');

eventSource.onmessage = (event) => {
  const data = JSON.parse(event.data);

  if (data.type === 'authenticated') {
    showUser(data.user);
  } else if (data.type === 'waiting') {
    showLoginPrompt();
  }
};

// Server (server.js)
function notifyClients(data) {
  sseClients.forEach(client => {
    client.res.write(`data: ${JSON.stringify(data)}\n\n`);
  });
}
```

---

## Configuration

### webapp2/.env

```env
KEYCLOAK_URL=http://localhost:8080
REALM=projetcis
CLIENT_ID=webapp
CLIENT_SECRET=<get from Keycloak admin>

PORT=3000
REDIRECT_URI=http://localhost:3000/auth/callback
```

### device-app/.env (optionnel)

```env
KEYCLOAK_URL=http://localhost:8080
REALM=projetcis
CLIENT_ID=devicecis
```

---

## Running Tests

Tests require **real Keycloak** running (not mock).

### Setup for Tests

```bash
# 1. Start Keycloak
docker run -d --name keycloak-dev \
  -p 8080:8080 \
  -e KC_BOOTSTRAP_ADMIN_USERNAME=admin \
  -e KC_BOOTSTRAP_ADMIN_PASSWORD=admin \
  -v $(pwd)/imports:/opt/keycloak/data/import \
  quay.io/keycloak/keycloak:latest start-dev --import-realm

# 2. Start device-app
cd device-app
node server.js
```

### Run Tests

```bash
# SSE tests (9 tests)
node test-sse.js

# Token revocation tests
node test-logout-revocation.js
```

Tests will:
- Connect to device-app on localhost:4000
- Device-app connects to real Keycloak on localhost:8080
- Test full OAuth2 Device Flow
- Test SSE notifications
- Test token revocation

---

## Troubleshooting

**Device-app ne démarre pas:**
```bash
cd device-app
npm install
node server.js
```

**WebApp2 erreur HTTPS:**
```bash
cd webapp2
# Générer certificats
mkcert localhost 127.0.0.1 ::1
mkdir certs
mv localhost+2.pem certs/
mv localhost+2-key.pem certs/
```

**Keycloak non accessible:**
```bash
docker ps  # Vérifier que container tourne
docker logs keycloak-dev
```

**SSE ne fonctionne pas:**
- Vérifier que device-app tourne
- Ouvrir DevTools → Network → EventStream
- Chercher connexion `/events`

---

## Development Notes

### Key Endpoints

**Device-App (4000):**
- `GET /` - Interface web
- `GET /api/status` - État device (avec CORS)
- `POST /start-device-flow` - Initier OAuth2 flow
- `POST /logout` - Déconnexion + revoke token
- `GET /events` - SSE stream
- `GET /health` - Health check

**WebApp2 (3000):**
- `GET /` - Home (authentification requise)
- `GET /activation` - Page activation device
- `GET /devices` - Gestion devices
- `GET /auth/login` - Initie Authorization Code Flow
- `GET /auth/callback` - OAuth2 callback
- `POST /auth/logout` - Déconnexion

### OAuth2 Flows Used

**Authorization Code + PKCE (webapp):**
```
1. Generate code_verifier + code_challenge
2. Redirect to Keycloak /authorize
3. User login
4. Callback with authorization_code
5. Exchange code for tokens (+ code_verifier)
6. Store in session
```

**Device Flow (devicecis):**
```
1. POST /auth/device → {device_code, user_code}
2. Display user_code to user
3. Poll POST /token every 5s
4. User activates on webapp
5. Receive access_token
6. Use token for API calls
```

### Security

- PKCE (S256) for webapp prevents authorization code interception
- Device Flow: public client (no secret)
- HTTPS for webapp (certificates in /certs)
- HTTP for device-app (local only)
- CORS enabled on device-app for webapp
- Secure cookies (httpOnly, secure) for sessions

---

## Next Steps

Si vous voulez améliorer :

1. **Production deployment**
   - Reverse proxy (nginx)
   - TLS everywhere
   - Environment-specific configs

2. **WebApp device management**
   - List all connected devices
   - Revoke from webapp
   - Device history

3. **Device improvements**
   - QR code display
   - Refresh token usage
   - Persistent storage

---

## Git Workflow

```bash
# Créer une feature branch
git checkout -b feature/my-feature

# Développer...
git add .
git commit -m "Add: feature description"

# Push
git push -u origin feature/my-feature
```

---

## Resources

- [RFC 8628 - Device Flow](https://datatracker.ietf.org/doc/html/rfc8628)
- [RFC 7009 - Token Revocation](https://datatracker.ietf.org/doc/html/rfc7009)
- [Keycloak Docs](https://www.keycloak.org/docs/latest/)
- [Server-Sent Events](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events)
