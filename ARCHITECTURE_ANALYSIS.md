# Analyse Architecturale - Conformité au Sujet OpenID Connect OAuth2

**Date:** 2025-11-28
**Contexte:** Analyse de l'architecture actuelle par rapport aux recommandations du sujet 2

---

## 1. Architecture Actuelle

### Composants Déployés

```
┌─────────────────────────────────────────────────────────────────┐
│                   ARCHITECTURE ACTUELLE                          │
└─────────────────────────────────────────────────────────────────┘

┌──────────────────┐         ┌──────────────────┐
│   Keycloak IDM   │         │   WebApp2        │
│  (port 8080)     │◄────────┤  (port 3000)     │
│                  │  OAuth2 │                  │
│  - Auth Server   │  PKCE   │  - Web Client    │
│  - Token Issue   │         │  - HTTPS         │
│  - UserInfo      │         │  - Sessions      │
└──────────────────┘         └──────────────────┘
        ▲                            │
        │                            │ HTTP Polling
        │ Device Flow                │ /api/status
        │ Polling                    ▼
        │                    ┌──────────────────┐
        │                    │   Device-App     │
        └────────────────────┤  (port 4000)     │
                             │                  │
                             │  - HTTP Server   │
                             │  - Device Flow   │
                             │  - SSE Events    │
                             │  - UI (EJS)      │
                             └──────────────────┘
```

### Flux de Communication

1. **WebApp2 → Keycloak** : Authorization Code Flow + PKCE (✅ Correct)
2. **Device-App → Keycloak** : Device Flow polling (✅ Correct)
3. **WebApp2 → Device-App** : HTTP polling `/api/status` (⚠️ Problématique)
4. **Browser → Device-App** : HTTPS/HTTP interface utilisateur (❌ **PROBLÈME**)

---

## 2. Problèmes Architecturaux Identifiés

### ❌ **PROBLÈME MAJEUR : Device-App en tant que Serveur HTTP**

**État actuel:**
```javascript
// device-app/server.js
const PORT = process.env.PORT || 4000;

app.listen(PORT, () => {
  console.log(`Device App HTTP démarrée sur http://localhost:${PORT}`);
});
```

**Ce qui est fait:**
- Device-App écoute sur le port 4000
- Accepte des connexions HTTP entrantes
- Expose des endpoints publics: `/`, `/start-device-flow`, `/logout`, `/events`, `/api/status`
- Sert une interface web (EJS templates)

**Pourquoi c'est incorrect selon le sujet:**

> "un 'device' fait tourner une application qui n'est qu'un **client**, l'application peut se connecter à distance sur des serveurs mais **ne peut pas accepter de connexions**"

**Raisons:**
1. Un device réel est derrière NAT/firewall
2. Pas d'IP publique accessible
3. Ne peut que faire des requêtes sortantes
4. Typiquement: IoT devices, smart TVs, imprimantes, terminaux embarqués

**Exemple de device réel:**
```
┌─────────────────────────────────────┐
│         NAT / Firewall              │
│  (Réseau domestique 192.168.x.x)    │
│                                     │
│   ┌────────────────────┐            │
│   │  Smart TV / IoT    │            │
│   │  192.168.1.50      │            │      Internet
│   │                    │────────────┼──────────────►
│   │  - Pas de serveur  │   Outbound │   (Keycloak)
│   │  - Client only     │   Only     │
│   └────────────────────┘            │
│                                     │
└─────────────────────────────────────┘

❌ Aucune connexion entrante possible
✅ Connexions sortantes autorisées (HTTPS vers Keycloak)
```

---

### ❌ **PROBLÈME 2 : Confusion entre "Device Client" et "Device Interface"**

**Ce qui existe actuellement:**

L'application `device-app` joue **deux rôles contradictoires** :

1. **Serveur HTTP** (interface web pour simuler un device)
   - Port 4000 accessible depuis le navigateur
   - Sert des pages EJS
   - Endpoint SSE `/events`

2. **Client OAuth2 Device Flow** (correct)
   - Fait des requêtes sortantes vers Keycloak
   - Polling pour le token
   - Révocation de token

**Ce qui devrait exister selon les recommandations:**

```
┌─────────────────────────────────────────────────────────┐
│  OPTION 1: Simulation de Device Réel                    │
│─────────────────────────────────────────────────────────│
│                                                          │
│  Device Client (script CLI, pas de serveur)             │
│  ├── Exécute Device Flow                                │
│  ├── Polling vers Keycloak (sortant uniquement)         │
│  ├── Affiche user_code dans le terminal                 │
│  └── Pas d'interface web                                │
│                                                          │
│  Comment le backend est informé?                         │
│  → Via Keycloak Events/Webhooks                          │
│  → Via polling backend → Keycloak                        │
│  → Via reverse proxy (voir Option 2)                    │
│                                                          │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│  OPTION 2: Device Flow avec Backend Proxy               │
│─────────────────────────────────────────────────────────│
│                                                          │
│  Device Client (derrière NAT)                           │
│  └── Connexions sortantes uniquement                    │
│      └── Vers Backend Proxy                             │
│                                                          │
│  Backend (WebApp2)                                       │
│  ├── Endpoint: POST /api/device/register                │
│  ├── Endpoint: GET /api/device/status                   │
│  ├── Fait le Device Flow pour le compte du device       │
│  └── Reverse proxy vers Keycloak                        │
│                                                          │
│  Keycloak                                                │
│  └── IDM/Auth server                                    │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

---

## 3. Recommandations du Sujet

### ✅ **Interaction Directe avec IDM**

> "les recommendations sont de **toujours le faire directement**, de toute façon certaines étapes ne peuvent pas se faire autrement"

**Ce qui est correct actuellement:**
- ✅ Device-App appelle directement Keycloak pour:
  - POST `/auth/device` (initiation)
  - POST `/token` (polling)
  - POST `/revoke` (révocation)
  - GET `/userinfo` (infos utilisateur)

- ✅ WebApp2 appelle directement Keycloak pour:
  - Authorization Code Flow
  - Token exchange
  - UserInfo

**Pas d'intermédiaire superflu** ✅

---

### ⚠️ **Séparation Application vs Auth Server**

> "on distingue l'application par exemple www.monapp.fr et le serveur d'authn/z par exemple auth.monapp.fr qui peut être situé derrière un reverse proxy"

**État actuel:**
```
Application Web: https://localhost:3000 (WebApp2)
Auth Server:     http://localhost:8080 (Keycloak)
Device Interface: http://localhost:4000 (Device-App) ← Pas dans les recommandations
```

**Ce qui manque:**
- Reverse proxy (nginx) devant Keycloak
- Noms de domaine séparés
- Configuration production avec TLS

**Architecture recommandée pour production:**
```
┌────────────────────────────────────────────────────┐
│              Reverse Proxy (nginx)                 │
│                                                    │
│  www.monapp.fr ──────► WebApp2 (port 3000)        │
│  auth.monapp.fr ─────► Keycloak (port 8080)       │
│                                                    │
└────────────────────────────────────────────────────┘
```

---

### ⚠️ **Backend Informé de l'Ajout de Devices**

> "pour ce qui est du device flow il y a plusieurs façons pour votre backend d'être informé de l'ajout d'un device"

**Options mentionnées:**

#### **Option A: Reverse Proxy**
```
Device → Backend → Keycloak
         (proxy)

Device appelle Backend qui fait proxy vers Keycloak
Backend voit toutes les requêtes et peut tracker les devices
```

#### **Option B: Keycloak Webhooks/Events**
```
Device ──────────► Keycloak
                       │
                       │ Event: Device Authenticated
                       ▼
                   Backend (webhook listener)
```

Keycloak Events disponibles:
- `REGISTER`
- `LOGIN`
- `LOGOUT`
- `CODE_TO_TOKEN`

#### **Option C: Backchannel Notifications**
```
Device ──────────► Keycloak
                       │
                       │ Backchannel notification
                       ▼
                   Backend (endpoint)
```

#### **Option D: Backend Polling** (moins recommandé)
```
Device ──────────► Keycloak
                       ▲
                       │
                   Backend (polling Keycloak API)
```

**Ce qui est fait actuellement:**
- ❌ WebApp2 fait du polling vers Device-App (`/api/status`)
- ❌ Device-App est un serveur HTTP intermédiaire (incorrect)

**Ce qui devrait être fait:**
- ✅ WebApp2 polling **directement Keycloak** pour lister les sessions actives
- ✅ OU WebApp2 écoute les **Keycloak Events** (webhooks)
- ✅ OU WebApp2 fait **reverse proxy** pour le Device Flow

---

## 4. Architecture Recommandée

### **Option 1: Device Client CLI (Plus Réaliste)**

```
┌─────────────────────────────────────────────────────────────┐
│                                                              │
│  Device Client (Node.js CLI - pas de serveur)               │
│  ──────────────────────────────────────────────────────────│
│                                                              │
│  $ node device-client.js                                    │
│                                                              │
│  [1] POST /auth/device → Keycloak                           │
│  [2] Affiche: "Code: ABCD-1234"                             │
│  [3] Affiche: "URL: https://auth.monapp.fr/device"          │
│  [4] Polling: POST /token (chaque 5s)                       │
│  [5] Token reçu → Stocke localement                         │
│  [6] Requêtes API avec Bearer token                         │
│                                                              │
│  Pas d'interface web, pas de port ouvert                    │
│                                                              │
└─────────────────────────────────────────────────────────────┘

                          │
                          │ HTTPS (sortant uniquement)
                          ▼

                    ┌──────────┐
                    │ Keycloak │
                    │ (IDM)    │
                    └──────────┘
                          ▲
                          │ Admin API / Events
                          │
                    ┌──────────┐
                    │ WebApp2  │
                    │ Backend  │
                    └──────────┘

WebApp2 interroge Keycloak Admin API:
- GET /admin/realms/{realm}/sessions
- Liste tous les devices connectés
- Affiche dans l'interface admin
```

**Avantages:**
- ✅ Respecte la contrainte "device = client uniquement"
- ✅ Pas de serveur HTTP sur le device
- ✅ Fonctionne derrière NAT/firewall
- ✅ Interaction directe avec Keycloak

**Code example:**
```javascript
// device-client.js (CLI only, no HTTP server)
const axios = require('axios');
const readline = require('readline');

const KEYCLOAK_URL = 'https://auth.monapp.fr';
const REALM = 'projetcis';
const CLIENT_ID = 'devicecis';

async function main() {
  console.log('🔐 Device Client - OAuth2 Device Flow\n');

  // Step 1: Initiate device flow
  const response = await axios.post(
    `${KEYCLOAK_URL}/realms/${REALM}/protocol/openid-connect/auth/device`,
    new URLSearchParams({ client_id: CLIENT_ID })
  );

  const { device_code, user_code, verification_uri, interval } = response.data;

  console.log(`📱 Votre code d'activation: ${user_code}`);
  console.log(`🔗 Rendez-vous sur: ${verification_uri}`);
  console.log(`\n⏳ En attente d'autorisation...\n`);

  // Step 2: Poll for token
  const token = await pollForToken(device_code, interval);

  console.log(`\n✅ Authentification réussie!`);
  console.log(`🔑 Token: ${token.substring(0, 20)}...`);

  // Step 3: Use token for API calls
  await makeAuthenticatedRequest(token);
}

async function pollForToken(deviceCode, interval) {
  while (true) {
    await sleep(interval * 1000);

    try {
      const response = await axios.post(
        `${KEYCLOAK_URL}/realms/${REALM}/protocol/openid-connect/token`,
        new URLSearchParams({
          grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
          device_code: deviceCode,
          client_id: CLIENT_ID
        })
      );

      return response.data.access_token;
    } catch (error) {
      if (error.response?.data?.error === 'authorization_pending') {
        process.stdout.write('.');
        continue;
      }
      throw error;
    }
  }
}

main().catch(console.error);
```

---

### **Option 2: Backend Reverse Proxy pour Device Flow**

```
┌────────────────────────────────────────────────────────────┐
│  Device Client (derrière NAT)                              │
│────────────────────────────────────────────────────────────│
│                                                             │
│  const response = await fetch(                             │
│    'https://www.monapp.fr/api/device/register'             │
│  );                                                         │
│                                                             │
│  // Pas d'appel direct à Keycloak, tout passe par backend  │
│                                                             │
└────────────────────────────────────────────────────────────┘
                          │
                          │ HTTPS (sortant)
                          ▼
┌────────────────────────────────────────────────────────────┐
│  WebApp2 Backend (www.monapp.fr)                           │
│────────────────────────────────────────────────────────────│
│                                                             │
│  app.post('/api/device/register', async (req, res) => {    │
│    // Proxy vers Keycloak                                  │
│    const deviceFlow = await keycloak.deviceAuthorization({ │
│      client_id: 'devicecis'                                │
│    });                                                      │
│                                                             │
│    // Stocker en DB                                        │
│    await db.devices.create({                               │
│      device_code: deviceFlow.device_code,                  │
│      user_code: deviceFlow.user_code,                      │
│      created_at: new Date()                                │
│    });                                                      │
│                                                             │
│    res.json(deviceFlow);                                   │
│  });                                                        │
│                                                             │
│  // Backend fait le polling vers Keycloak                  │
│  async function pollDeviceTokens() {                       │
│    const pendingDevices = await db.devices.findPending();  │
│                                                             │
│    for (const device of pendingDevices) {                  │
│      const token = await keycloak.deviceToken({            │
│        device_code: device.device_code                     │
│      });                                                    │
│                                                             │
│      if (token) {                                          │
│        // Device authenticated!                            │
│        await db.devices.update(device.id, {                │
│          status: 'authenticated',                          │
│          token: token.access_token                         │
│        });                                                  │
│                                                             │
│        // Notify via WebSocket/SSE                         │
│        io.emit('device:authenticated', device);            │
│      }                                                      │
│    }                                                        │
│  }                                                          │
│                                                             │
│  setInterval(pollDeviceTokens, 5000);                      │
│                                                             │
└────────────────────────────────────────────────────────────┘
                          │
                          │ Admin API / Device Flow
                          ▼
                    ┌──────────┐
                    │ Keycloak │
                    │ (IDM)    │
                    └──────────┘
```

**Avantages:**
- ✅ Device reste un simple client
- ✅ Backend a la visibilité complète
- ✅ Centralisation de la logique
- ✅ Facilite la gestion multi-devices

---

### **Option 3: Keycloak Events/Webhooks**

```
┌────────────────────────────────────────────────────────────┐
│  Keycloak Configuration                                     │
│────────────────────────────────────────────────────────────│
│                                                             │
│  Realm Settings → Events                                   │
│  ├── Event Listeners: [ webhook-listener ]                 │
│  └── Webhook URL: https://www.monapp.fr/api/keycloak/events│
│                                                             │
│  Events to track:                                          │
│  - LOGIN (device authenticated)                            │
│  - LOGOUT (device disconnected)                            │
│  - CODE_TO_TOKEN (device flow completed)                   │
│                                                             │
└────────────────────────────────────────────────────────────┘

When device authenticates via Device Flow:

Device → Keycloak → Token issued
                │
                │ Event: CODE_TO_TOKEN
                ▼
         POST /api/keycloak/events
         {
           "type": "CODE_TO_TOKEN",
           "realmId": "projetcis",
           "clientId": "devicecis",
           "userId": "uuid-123",
           "time": 1638360000000
         }
                │
                ▼
         WebApp2 Backend
         ├── Receive event
         ├── Update device list in real-time
         └── Notify admin interface via SSE/WebSocket
```

**Configuration Keycloak:**

1. **Install Event Listener SPI**
   ```bash
   # Deploy custom event listener
   # ou utiliser Keycloak Event Listener extension
   ```

2. **Enable Events**
   ```
   Realm Settings → Events → Config
   - Save Events: ON
   - Event Listeners: Add "webhook"
   ```

3. **Configure Webhook**
   ```json
   {
     "webhook": {
       "url": "https://www.monapp.fr/api/keycloak/events",
       "secret": "shared-secret-key",
       "events": ["LOGIN", "LOGOUT", "CODE_TO_TOKEN"]
     }
   }
   ```

**Backend Handler:**
```javascript
// WebApp2 Backend
app.post('/api/keycloak/events', async (req, res) => {
  const event = req.body;

  // Verify signature
  const signature = req.headers['x-keycloak-signature'];
  if (!verifySignature(event, signature)) {
    return res.status(401).send('Invalid signature');
  }

  // Handle event
  if (event.type === 'CODE_TO_TOKEN' && event.clientId === 'devicecis') {
    console.log(`✅ New device authenticated: ${event.userId}`);

    // Update database
    await db.devices.create({
      user_id: event.userId,
      client_id: event.clientId,
      authenticated_at: new Date(event.time)
    });

    // Notify admin interface in real-time
    io.emit('device:new', {
      userId: event.userId,
      time: event.time
    });
  }

  res.status(200).send('OK');
});
```

---

## 5. Comparaison des Options

| Critère | Option 1: CLI Client | Option 2: Backend Proxy | Option 3: Webhooks |
|---------|---------------------|------------------------|-------------------|
| **Device = Client only** | ✅ Oui | ✅ Oui | ✅ Oui |
| **Interaction directe IDM** | ✅ Oui | ⚠️ Via proxy | ✅ Oui |
| **Backend informé** | Via Keycloak API | ✅ Immédiat | ✅ Temps réel |
| **Complexité** | 🟢 Simple | 🟡 Moyenne | 🔴 Élevée |
| **Réalisme device** | ✅ Très réaliste | ✅ Réaliste | ✅ Réaliste |
| **Production ready** | ✅ Oui | ✅ Oui | ⚠️ Nécessite SPI |

---

## 6. Actions Recommandées

### **Priorité 1: Corriger l'Architecture Device-App**

**Actuellement:**
```javascript
// device-app/server.js - INCORRECT pour un device réel
app.listen(4000, () => {
  console.log('Device App HTTP démarrée sur http://localhost:4000');
});
```

**Recommandé: Option 1 (Device CLI Client)**
```javascript
// device-client.js - CORRECT pour un device réel
// Pas de serveur HTTP, juste un client
async function main() {
  const deviceFlow = await initiateDeviceFlow();
  console.log(`Code: ${deviceFlow.user_code}`);

  const token = await pollForToken(deviceFlow.device_code);
  console.log('Authenticated!');
}

main();
```

**OU Recommandé: Option 2 (Backend Proxy)**
```javascript
// webapp2/routes/device.js
router.post('/api/device/register', async (req, res) => {
  // Backend fait le Device Flow pour le compte du device
  const deviceFlow = await keycloak.deviceAuthorization({
    client_id: 'devicecis'
  });

  // Stocker et tracker
  await deviceService.register(deviceFlow);

  res.json(deviceFlow);
});
```

### **Priorité 2: WebApp2 Interroge Keycloak Directement**

**Au lieu de:**
```javascript
// WebApp2 → Device-App (INCORRECT)
const response = await fetch('http://localhost:4000/api/status');
```

**Faire:**
```javascript
// WebApp2 → Keycloak directement (CORRECT)
const response = await keycloak.adminClient.sessions.find({
  realm: 'projetcis',
  client: 'devicecis'
});
```

### **Priorité 3: Ajouter Reverse Proxy (Production)**

```nginx
# /etc/nginx/sites-available/monapp

# Auth Server
server {
    listen 443 ssl;
    server_name auth.monapp.fr;

    ssl_certificate /etc/ssl/certs/monapp.crt;
    ssl_certificate_key /etc/ssl/private/monapp.key;

    location / {
        proxy_pass http://localhost:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}

# Web Application
server {
    listen 443 ssl;
    server_name www.monapp.fr;

    ssl_certificate /etc/ssl/certs/monapp.crt;
    ssl_certificate_key /etc/ssl/private/monapp.key;

    location / {
        proxy_pass https://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

---

## 7. Résumé des Non-Conformités

### ❌ **Actuellement Non-Conforme:**

1. **Device-App est un serveur HTTP**
   - Écoute sur port 4000
   - Accepte des connexions entrantes
   - Sert une interface web
   - **Violation:** Un device ne peut pas accepter de connexions

2. **WebApp2 interroge Device-App au lieu de Keycloak**
   - Polling HTTP vers `/api/status`
   - **Violation:** Devrait interroger directement l'IDM

3. **Pas de séparation claire Application vs Auth Server**
   - Tout en localhost
   - Pas de reverse proxy
   - **Note:** Acceptable pour dev, mais pas pour prod

### ✅ **Déjà Conforme:**

1. **Interaction directe avec Keycloak**
   - Device-App appelle directement Keycloak (POST /auth/device, /token, etc.)
   - WebApp2 appelle directement Keycloak (Authorization Code + PKCE)

2. **OAuth2/OIDC Standards**
   - Device Flow (RFC 8628)
   - Authorization Code + PKCE (RFC 7636)
   - Token Revocation (RFC 7009)

---

## 8. Conclusion

**Pour respecter pleinement le sujet 2:**

1. **Transformer device-app** en vrai client (CLI ou app mobile simulée)
   - Supprimer le serveur HTTP
   - Garder uniquement la logique client Device Flow

2. **WebApp2 doit être informé via:**
   - Keycloak Admin API (polling sessions)
   - OU Keycloak Events/Webhooks
   - OU Backend Proxy pour Device Flow

3. **Architecture production:**
   - Reverse proxy nginx
   - Séparation domaines (www.monapp.fr / auth.monapp.fr)
   - TLS partout

**Recommandation:** Implémenter **Option 1 (Device CLI)** + **Keycloak Admin API** pour simplicité et conformité maximale.
