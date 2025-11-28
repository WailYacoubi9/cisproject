# Plan d'Action - Corrections Architecturales

**Objectif:** Rendre le projet conforme aux recommandations du sujet OpenID Connect OAuth2

---

## 📋 Résumé des Changements Requis

### Priorité 1 (Critique - Non-conformité au sujet)
1. ✅ **Transformer device-app en client CLI** (pas de serveur HTTP)
2. ✅ **WebApp2 interroge Keycloak directement** (pas device-app)

### Priorité 2 (Recommandé pour production)
3. ⚠️ **Ajouter reverse proxy nginx** (séparation domaines)

---

## 🔧 PRIORITÉ 1: Changements Critiques

### **Changement 1: Device Client CLI**

#### **1.1 Créer le nouveau client device (CLI uniquement)**

**Fichier à créer:** `/home/user/cisproject/device-client/device-cli.js`

```javascript
#!/usr/bin/env node

/**
 * Device Client CLI - OAuth2 Device Flow
 * Pure client - No HTTP server, outbound connections only
 */

const axios = require('axios');
const qrcode = require('qrcode');

const KEYCLOAK_URL = process.env.KEYCLOAK_URL || 'http://localhost:8080';
const REALM = process.env.REALM || 'projetcis';
const CLIENT_ID = process.env.CLIENT_ID || 'devicecis';

let accessToken = null;
let refreshToken = null;

async function main() {
  console.log('🔐 Device Client - OAuth2 Device Authorization Flow\n');
  console.log('═══════════════════════════════════════════════════════\n');

  // Step 1: Initiate Device Flow
  const deviceFlow = await initiateDeviceFlow();

  // Step 2: Display user code
  displayUserCode(deviceFlow);

  // Step 3: Poll for token
  const tokens = await pollForToken(deviceFlow.device_code, deviceFlow.interval);

  // Step 4: Get user info
  const userInfo = await getUserInfo(tokens.access_token);

  // Step 5: Display success
  console.log('\n✅ Authentification réussie!\n');
  console.log('👤 Utilisateur:', userInfo.name || userInfo.preferred_username);
  console.log('📧 Email:', userInfo.email);
  console.log('🆔 User ID:', userInfo.sub);

  accessToken = tokens.access_token;
  refreshToken = tokens.refresh_token;

  // Step 6: Keep alive (simulate device running)
  console.log('\n💡 Device authenticated. Press Ctrl+C to logout.\n');

  // Wait for Ctrl+C
  process.on('SIGINT', async () => {
    await logout();
    process.exit(0);
  });

  // Keep process alive
  await new Promise(() => {});
}

async function initiateDeviceFlow() {
  console.log('🚀 Initiation du Device Flow...\n');

  const response = await axios.post(
    `${KEYCLOAK_URL}/realms/${REALM}/protocol/openid-connect/auth/device`,
    new URLSearchParams({
      client_id: CLIENT_ID,
      scope: 'openid profile email'
    }),
    {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    }
  );

  return {
    device_code: response.data.device_code,
    user_code: response.data.user_code,
    verification_uri: response.data.verification_uri,
    verification_uri_complete: response.data.verification_uri_complete,
    expires_in: response.data.expires_in,
    interval: response.data.interval || 5
  };
}

async function displayUserCode(deviceFlow) {
  console.log('═══════════════════════════════════════════════════════');
  console.log('                  CODE D\'ACTIVATION                    ');
  console.log('═══════════════════════════════════════════════════════\n');

  console.log(`   📱 Code: ${deviceFlow.user_code}`);
  console.log(`   🔗 URL:  ${deviceFlow.verification_uri}\n`);

  // Generate QR code in terminal
  const qrCodeString = await qrcode.toString(deviceFlow.verification_uri_complete, {
    type: 'terminal',
    small: true
  });

  console.log('   Scannez ce QR code avec votre smartphone:\n');
  console.log(qrCodeString);

  console.log('═══════════════════════════════════════════════════════\n');
  console.log(`⏳ En attente d'autorisation (expire dans ${deviceFlow.expires_in}s)...\n`);
}

async function pollForToken(deviceCode, interval) {
  const startTime = Date.now();

  while (true) {
    await sleep(interval * 1000);

    try {
      const response = await axios.post(
        `${KEYCLOAK_URL}/realms/${REALM}/protocol/openid-connect/token`,
        new URLSearchParams({
          grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
          device_code: deviceCode,
          client_id: CLIENT_ID
        }),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
          }
        }
      );

      return {
        access_token: response.data.access_token,
        refresh_token: response.data.refresh_token,
        id_token: response.data.id_token,
        expires_in: response.data.expires_in
      };

    } catch (error) {
      if (error.response?.data?.error === 'authorization_pending') {
        process.stdout.write('.');
        continue;
      } else if (error.response?.data?.error === 'slow_down') {
        console.log('\n⚠️  Ralentissement demandé par le serveur');
        interval += 5;
        continue;
      } else if (error.response?.data?.error === 'expired_token') {
        console.log('\n❌ Le code a expiré');
        process.exit(1);
      } else {
        throw error;
      }
    }
  }
}

async function getUserInfo(token) {
  const response = await axios.get(
    `${KEYCLOAK_URL}/realms/${REALM}/protocol/openid-connect/userinfo`,
    {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    }
  );

  return response.data;
}

async function logout() {
  if (!accessToken) return;

  console.log('\n\n🚪 Déconnexion...');

  try {
    await axios.post(
      `${KEYCLOAK_URL}/realms/${REALM}/protocol/openid-connect/revoke`,
      new URLSearchParams({
        client_id: CLIENT_ID,
        token: accessToken,
        token_type_hint: 'access_token'
      }),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      }
    );

    console.log('✅ Token révoqué');
    console.log('👋 Au revoir!\n');
  } catch (error) {
    console.error('⚠️  Erreur lors de la révocation:', error.message);
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Start
main().catch(error => {
  console.error('\n❌ Erreur:', error.message);
  process.exit(1);
});
```

#### **1.2 Créer package.json pour device-client**

**Fichier à créer:** `/home/user/cisproject/device-client/package.json`

```json
{
  "name": "device-client-cli",
  "version": "1.0.0",
  "description": "OAuth2 Device Flow CLI Client",
  "main": "device-cli.js",
  "bin": {
    "device-cli": "./device-cli.js"
  },
  "scripts": {
    "start": "node device-cli.js"
  },
  "keywords": ["oauth2", "device-flow", "oidc"],
  "author": "",
  "license": "MIT",
  "dependencies": {
    "axios": "^1.6.0",
    "qrcode": "^1.5.3",
    "dotenv": "^16.0.0"
  }
}
```

#### **1.3 Installation**

```bash
cd /home/user/cisproject/device-client
npm install
chmod +x device-cli.js
```

#### **1.4 Test**

```bash
# Terminal 1: Keycloak (ou mock)
node /home/user/cisproject/mock-keycloak.js

# Terminal 2: Device Client
cd /home/user/cisproject/device-client
./device-cli.js
```

---

### **Changement 2: WebApp2 interroge Keycloak directement**

#### **2.1 Installer Keycloak Admin Client**

```bash
cd /home/user/cisproject/webapp2
npm install @keycloak/keycloak-admin-client
```

#### **2.2 Créer service pour lister les devices**

**Fichier à créer:** `/home/user/cisproject/webapp2/services/deviceService.js`

```javascript
const KcAdminClient = require('@keycloak/keycloak-admin-client').default;

class DeviceService {
  constructor() {
    this.kcAdminClient = null;
  }

  async initialize() {
    this.kcAdminClient = new KcAdminClient({
      baseUrl: process.env.KEYCLOAK_URL,
      realmName: process.env.REALM
    });

    // Authenticate admin client
    await this.kcAdminClient.auth({
      username: process.env.KEYCLOAK_ADMIN_USERNAME || 'admin',
      password: process.env.KEYCLOAK_ADMIN_PASSWORD,
      grantType: 'password',
      clientId: 'admin-cli'
    });
  }

  /**
   * Get all active device sessions from Keycloak
   */
  async getActiveDevices() {
    try {
      // Refresh token if needed
      await this.kcAdminClient.auth({
        username: process.env.KEYCLOAK_ADMIN_USERNAME || 'admin',
        password: process.env.KEYCLOAK_ADMIN_PASSWORD,
        grantType: 'password',
        clientId: 'admin-cli'
      });

      // Get all sessions for the device client
      const sessions = await this.kcAdminClient.users.listSessions({
        realm: process.env.REALM
      });

      // Filter sessions for device client only
      const deviceSessions = [];

      for (const session of sessions) {
        // Get session details
        const clients = session.clients || {};

        if (clients['devicecis']) {
          // This session has device client
          const user = await this.kcAdminClient.users.findOne({
            id: session.userId,
            realm: process.env.REALM
          });

          deviceSessions.push({
            sessionId: session.id,
            userId: session.userId,
            username: user?.username,
            email: user?.email,
            ipAddress: session.ipAddress,
            start: new Date(session.start),
            lastAccess: new Date(session.lastAccess)
          });
        }
      }

      return deviceSessions;

    } catch (error) {
      console.error('Error fetching device sessions:', error.message);
      throw error;
    }
  }

  /**
   * Terminate a device session
   */
  async terminateDevice(sessionId) {
    try {
      await this.kcAdminClient.sessions.del({
        id: sessionId,
        realm: process.env.REALM
      });

      return { success: true };
    } catch (error) {
      console.error('Error terminating session:', error.message);
      throw error;
    }
  }
}

module.exports = new DeviceService();
```

#### **2.3 Créer route API pour les devices**

**Fichier à créer:** `/home/user/cisproject/webapp2/routes/devices.js`

```javascript
const express = require('express');
const router = express.Router();
const deviceService = require('../services/deviceService');
const { requireAuth } = require('../middleware/auth');

/**
 * GET /api/devices
 * Liste tous les devices connectés (depuis Keycloak)
 */
router.get('/api/devices', requireAuth, async (req, res) => {
  try {
    const devices = await deviceService.getActiveDevices();
    res.json({
      success: true,
      devices: devices
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * DELETE /api/devices/:sessionId
 * Terminer une session device
 */
router.delete('/api/devices/:sessionId', requireAuth, async (req, res) => {
  try {
    await deviceService.terminateDevice(req.params.sessionId);
    res.json({
      success: true,
      message: 'Device session terminated'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
```

#### **2.4 Modifier server.js pour initialiser deviceService**

**Fichier à modifier:** `/home/user/cisproject/webapp2/server.js`

Ajouter après l'initialisation de Keycloak:

```javascript
// Initialiser Keycloak
const keycloakClient = await initializeKeycloak();

// Initialiser Device Service
const deviceService = require('./services/deviceService');
await deviceService.initialize();

// Import des routes
const authRoutes = require('./routes/auth');
const pageRoutes = require('./routes/pages');
const deviceRoutes = require('./routes/devices'); // NOUVEAU

// Utilisation des routes
app.use('/', authRoutes);
app.use('/', pageRoutes);
app.use('/', deviceRoutes); // NOUVEAU
```

#### **2.5 Mettre à jour .env avec credentials admin**

**Fichier à modifier:** `/home/user/cisproject/webapp2/.env`

Ajouter:

```env
KEYCLOAK_ADMIN_USERNAME=admin
KEYCLOAK_ADMIN_PASSWORD=votre_password_admin
```

#### **2.6 Modifier la page devices pour appeler la nouvelle API**

**Fichier à modifier:** `/home/user/cisproject/webapp2/views/pages/devices.ejs`

Remplacer:

```javascript
// ANCIEN CODE (à supprimer)
const response = await fetch('http://localhost:4000/api/status');

// NOUVEAU CODE
const response = await fetch('/api/devices', {
  headers: {
    'Accept': 'application/json'
  },
  credentials: 'same-origin'
});

const data = await response.json();

if (data.success) {
  // Afficher les devices depuis Keycloak
  data.devices.forEach(device => {
    // ... afficher chaque device
  });
}
```

---

### **Changement 3: Supprimer/Archiver l'ancien device-app**

#### **3.1 Renommer device-app en device-app-old**

```bash
cd /home/user/cisproject
mv device-app device-app-old
```

#### **3.2 Mettre à jour .gitignore**

```
# Ancien device-app (non conforme)
device-app-old/
```

#### **3.3 Créer README pour expliquer**

**Fichier à créer:** `/home/user/cisproject/device-app-old/README_ARCHIVE.md`

```markdown
# Device-App (Archivé)

⚠️ **Cette version est archivée car non-conforme au sujet**

## Pourquoi archivé?

L'ancienne implémentation `device-app` agissait comme un **serveur HTTP**:
- Écoutait sur le port 4000
- Acceptait des connexions entrantes
- Servait une interface web

**Problème:** Un device réel ne peut **pas** accepter de connexions (NAT/firewall).

## Nouvelle implémentation

Voir `/device-client/` - CLI uniquement, pure client, conforme au sujet.

## Fonctionnalités conservées

- ✅ OAuth2 Device Flow
- ✅ Interaction directe avec Keycloak
- ✅ Token revocation
- ✅ SSE pour notifications temps réel

## Fonctionnalités retirées

- ❌ Serveur HTTP (port 4000)
- ❌ Interface web EJS
- ❌ Endpoint /api/status (remplacé par Keycloak Admin API)
```

---

## 🔧 PRIORITÉ 2: Améliorations Production

### **Changement 4: Reverse Proxy Nginx**

#### **4.1 Créer configuration nginx**

**Fichier à créer:** `/home/user/cisproject/nginx/nginx.conf`

```nginx
# Reverse Proxy Configuration

# Auth Server (Keycloak)
server {
    listen 443 ssl http2;
    server_name auth.monapp.fr;

    ssl_certificate /etc/ssl/certs/monapp.crt;
    ssl_certificate_key /etc/ssl/private/monapp.key;

    # SSL Configuration
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;

    # Keycloak Backend
    location / {
        proxy_pass http://localhost:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # WebSocket support (for Keycloak Admin Console)
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}

# Web Application (WebApp2)
server {
    listen 443 ssl http2;
    server_name www.monapp.fr monapp.fr;

    ssl_certificate /etc/ssl/certs/monapp.crt;
    ssl_certificate_key /etc/ssl/private/monapp.key;

    # SSL Configuration
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;

    # WebApp2 Backend
    location / {
        proxy_pass https://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Session cookies
        proxy_cookie_path / /;
        proxy_cookie_secure on;
    }
}

# Redirect HTTP to HTTPS
server {
    listen 80;
    server_name auth.monapp.fr www.monapp.fr monapp.fr;
    return 301 https://$server_name$request_uri;
}
```

#### **4.2 Docker Compose pour nginx**

**Fichier à créer:** `/home/user/cisproject/docker-compose.yml`

```yaml
version: '3.8'

services:
  keycloak:
    image: quay.io/keycloak/keycloak:latest
    command: start-dev --import-realm
    environment:
      KC_BOOTSTRAP_ADMIN_USERNAME: admin
      KC_BOOTSTRAP_ADMIN_PASSWORD: ${KEYCLOAK_ADMIN_PASSWORD}
      KEYCLOAK_DEFAULT_REALM: projetcis
    volumes:
      - ./imports:/opt/keycloak/data/import
      - keycloak-data:/opt/keycloak/data
    networks:
      - app-network

  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx/nginx.conf:/etc/nginx/conf.d/default.conf
      - ./nginx/certs:/etc/ssl/certs
      - ./nginx/private:/etc/ssl/private
    depends_on:
      - keycloak
    networks:
      - app-network

volumes:
  keycloak-data:

networks:
  app-network:
    driver: bridge
```

---

## 📊 Résumé des Fichiers à Créer/Modifier

### ✅ Fichiers à CRÉER

```
/home/user/cisproject/
├── device-client/
│   ├── device-cli.js          (nouveau client CLI)
│   ├── package.json           (dépendances)
│   └── .env                   (config)
├── webapp2/
│   ├── services/
│   │   └── deviceService.js   (Keycloak Admin API)
│   └── routes/
│       └── devices.js         (nouvelle route API)
├── nginx/
│   └── nginx.conf             (reverse proxy)
├── docker-compose.yml         (orchestration)
└── ACTION_PLAN.md             (ce document)
```

### ⚠️ Fichiers à MODIFIER

```
/home/user/cisproject/
├── webapp2/
│   ├── server.js              (init deviceService)
│   ├── .env                   (admin credentials)
│   ├── package.json           (+ @keycloak/keycloak-admin-client)
│   └── views/pages/devices.ejs (nouveau fetch /api/devices)
```

### 🗑️ Fichiers à ARCHIVER

```
/home/user/cisproject/
└── device-app/  →  renommer en device-app-old/
```

---

## 🚀 Ordre d'Exécution

### **Phase 1: Créer le nouveau device client**

```bash
# 1. Créer le dossier
mkdir -p /home/user/cisproject/device-client

# 2. Créer les fichiers
# - device-cli.js (copier le code ci-dessus)
# - package.json (copier le code ci-dessus)

# 3. Installer dépendances
cd /home/user/cisproject/device-client
npm install

# 4. Test
chmod +x device-cli.js
./device-cli.js
```

### **Phase 2: Modifier WebApp2**

```bash
cd /home/user/cisproject/webapp2

# 1. Installer Keycloak Admin Client
npm install @keycloak/keycloak-admin-client

# 2. Créer deviceService.js (copier code ci-dessus)
mkdir -p services
# Créer services/deviceService.js

# 3. Créer routes/devices.js (copier code ci-dessus)
# Créer routes/devices.js

# 4. Modifier server.js (ajouter deviceService.initialize())

# 5. Modifier .env (ajouter KEYCLOAK_ADMIN_USERNAME/PASSWORD)

# 6. Modifier views/pages/devices.ejs (nouveau fetch)
```

### **Phase 3: Archiver ancien device-app**

```bash
cd /home/user/cisproject

# 1. Renommer
mv device-app device-app-old

# 2. Créer README_ARCHIVE.md

# 3. Git ignore
echo "device-app-old/" >> .gitignore
```

### **Phase 4: Test complet**

```bash
# Terminal 1: Keycloak
docker run ... # ou mock-keycloak.js

# Terminal 2: WebApp2
cd webapp2
npm start

# Terminal 3: Device Client
cd device-client
./device-cli.js

# Terminal 4: Test dans navigateur
# https://localhost:3000 → Devices page
# Devrait voir le device connecté via Keycloak Admin API
```

---

## ✅ Checklist de Validation

Après avoir fait tous les changements, vérifier:

- [ ] Device client est un CLI (pas de serveur HTTP)
- [ ] Device client fait uniquement des connexions sortantes
- [ ] WebApp2 appelle Keycloak Admin API (pas device-app)
- [ ] Liste des devices affichée depuis Keycloak
- [ ] Logout device fonctionne (terminateSession)
- [ ] Ancien device-app archivé
- [ ] Tests passent
- [ ] Documentation à jour

---

## 🎯 Résultat Final

**Avant (non-conforme):**
```
Device-App (HTTP server :4000) ←─ WebApp2 (polling)
    ↓
Keycloak
```

**Après (conforme):**
```
Device Client (CLI)  →  Keycloak
                           ↑
                    WebApp2 (Admin API)
```

**Conformité:**
- ✅ Device = client uniquement
- ✅ Pas de serveur HTTP sur le device
- ✅ Interaction directe avec IDM
- ✅ Backend informé via Keycloak API
- ✅ Architecture réaliste (NAT/firewall compatible)
