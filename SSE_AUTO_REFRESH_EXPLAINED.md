# How Auto-Refresh Works with Server-Sent Events (SSE)

## 🔄 Real-Time Auto-Refresh Mechanism

The device-app at `http://localhost:4000` now uses **Server-Sent Events (SSE)** for automatic, real-time UI updates. Here's how it works:

---

## Flow Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                     BROWSER (localhost:4000)                     │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  1. Page Load                                                    │
│  ──────────                                                      │
│     window.onload = () => {                                      │
│         startEventStream();  // ← Connects to SSE immediately   │
│     };                                                           │
│                                                                  │
│  2. SSE Connection Established                                   │
│  ───────────────────────────                                    │
│     eventSource = new EventSource('/events');                   │
│                           │                                      │
│                           │ Persistent HTTP connection           │
│                           │ (stays open)                         │
│                           ▼                                      │
│                     ┌──────────┐                                │
│                     │  Server  │                                │
│                     │   SSE    │                                │
│                     │ Endpoint │                                │
│                     └──────────┘                                │
│                           │                                      │
│  3. Server Pushes Updates │                                      │
│  ──────────────────────── │                                      │
│     When state changes:   │                                      │
│     - Device flow starts  │                                      │
│     - User authenticates  │                                      │
│     - Token expires       │                                      │
│     - User logs out       │                                      │
│                           │                                      │
│                           │ Server sends:                        │
│                           │ data: {"type":"authenticated",...}  │
│                           │                                      │
│                           ▼                                      │
│  4. Browser Receives Message                                     │
│  ─────────────────────────                                      │
│     eventSource.onmessage = (event) => {                        │
│         const data = JSON.parse(event.data);                    │
│                                                                  │
│         if (data.type === 'authenticated') {                    │
│             showAuthenticated(data.user); // ← Updates UI       │
│         }                                                        │
│     };                                                           │
│                                                                  │
│  5. UI Updates Instantly                                         │
│  ─────────────────────                                          │
│     DOM is updated with new content                              │
│     - Shows user info                                            │
│     - Changes buttons                                            │
│     - Updates status                                             │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Step-by-Step: How It Works

### **Step 1: Page Loads**

When you open `http://localhost:4000` in your browser:

```javascript
window.onload = () => {
    console.log('📡 Démarrage de la connexion SSE...');
    startEventStream();  // ← Immediately connects to SSE
};
```

**What happens:**
- Page loads
- JavaScript executes `window.onload`
- `startEventStream()` is called automatically
- SSE connection established

---

### **Step 2: SSE Connection Established**

```javascript
function startEventStream() {
    // Create persistent connection to server
    eventSource = new EventSource('/events');

    // Setup message handler
    eventSource.onmessage = (event) => {
        const data = JSON.parse(event.data);
        console.log('📡 Message SSE reçu:', data);

        // Handle different message types
        if (data.type === 'authenticated') {
            showAuthenticated(data.user);  // ← Updates UI
        }
    };
}
```

**What happens:**
- `EventSource` object created
- HTTP connection to `/events` opened
- Connection stays open (persistent)
- Server immediately sends initial state: `{"type":"waiting"}`
- Browser receives and processes it

**Network:**
```
GET http://localhost:4000/events
Connection: keep-alive
Content-Type: text/event-stream
```

---

### **Step 3: Server Pushes Updates**

When something changes on the server (device-app/server.js):

```javascript
// Example: User authenticates
const userInfo = await getUserInfo(accessToken);

// Server broadcasts to ALL connected clients
notifyClients({
    type: 'authenticated',
    user: userInfo
});
```

**What happens:**
- Server detects state change (authentication successful)
- `notifyClients()` function called
- Server writes to ALL open SSE connections:
  ```
  data: {"type":"authenticated","user":{"email":"test@example.com",...}}\n\n
  ```
- Message sent over existing connection (no new HTTP request!)

---

### **Step 4: Browser Receives Message (Auto-Refresh Trigger)**

The `onmessage` handler fires **automatically**:

```javascript
eventSource.onmessage = (event) => {
    const data = JSON.parse(event.data);  // Parse the message
    console.log('📡 Message SSE reçu:', data);

    // Check message type and update UI accordingly
    if (data.type === 'authenticated') {
        eventSource.close();           // Close SSE connection
        showAuthenticated(data.user);  // ← UI UPDATES HERE!
    }
    else if (data.type === 'expired') {
        eventSource.close();
        showInitialState();            // ← UI RELOADS
    }
    else if (data.type === 'waiting') {
        eventSource.close();
        showInitialState();            // ← UI RELOADS
    }
};
```

**What happens:**
- Message arrives from server
- `onmessage` callback executes **instantly**
- Message parsed from JSON
- Appropriate UI update function called
- No polling, no delay!

---

### **Step 5: UI Updates Instantly**

When `showAuthenticated()` is called:

```javascript
function showAuthenticated(user) {
    // Replace entire page content with success screen
    document.getElementById('app-content').innerHTML = `
        <div class="status authenticated">
            <h2>✅ Appareil connecté avec succès !</h2>
        </div>

        <div class="user-info">
            <h3>👤 Utilisateur connecté :</h3>
            <p><strong>Email:</strong> ${user.email}</p>
            <p><strong>Nom:</strong> ${user.name}</p>
            <p><strong>ID:</strong> ${user.sub}</p>
        </div>

        <button class="btn btn-danger" onclick="logout()">
            🚪 Déconnexion
        </button>
    `;
}
```

**What happens:**
- DOM is updated with new HTML
- Old content (pending/waiting) is replaced
- User sees authenticated screen
- All happens in **<100ms** from server notification!

---

## Complete Authentication Flow Timeline

```
Time    Browser                          Server                    Keycloak
──────  ───────────────────────────      ─────────────────────    ────────────

0ms     Page loads
        ├─ SSE connection opens ─────→   Accepts SSE connection
        ←─ Initial state ───────────────  Sends {"type":"waiting"}
        UI shows: "En attente..."

User clicks "Démarrer l'authentification"

100ms   POST /start-device-flow ─────→   Receives request
                                         ├─ Calls Keycloak ────→  Generates codes
                                         ←─ Returns codes ────────┘
                                         ├─ Starts polling
                                         │  (every 5 seconds)
        ←─ Response with user_code ─────┘
        UI shows: "Code: XXXX-XXXX"

        SSE pushes update ──────────────→ notifyClients({
                                            type: 'pending',
                                            user_code: 'XXXX-XXXX'
                                          })
        ←─ SSE message ─────────────────┘
        UI updates automatically

User enters code on phone and approves

5000ms                                   Polling: POST /token ─→  Code pending
                                         ←─ authorization_pending ─┘

10000ms                                  Polling: POST /token ─→  Code approved!
                                         ←─ Returns access_token ──┘
                                         ├─ Gets user info ─────→  Returns user
                                         ←────────────────────────┘

        SSE pushes update ──────────────→ notifyClients({
                                            type: 'authenticated',
                                            user: {...}
                                          })
        ←─ SSE message ─────────────────┘

10100ms ✅ UI UPDATES INSTANTLY!
        Shows user info
        No page refresh needed!
```

**Total latency:** ~100ms from authentication to UI update

---

## Key Differences: HTTP Polling vs SSE

### ❌ **OLD: HTTP Polling** (Before SSE)

```javascript
// OLD CODE (removed)
setInterval(async () => {
    const response = await fetch('/status');  // New request every 2s
    const data = await response.json();

    if (data.authenticated) {
        showAuthenticated(data.user);
    }
}, 2000);  // Poll every 2 seconds
```

**Problems:**
- ❌ Checks every 2 seconds (wasteful)
- ❌ 30 requests per minute per client
- ❌ 0-2 second delay to detect changes
- ❌ High server load
- ❌ Wasted bandwidth

---

### ✅ **NEW: Server-Sent Events (SSE)**

```javascript
// NEW CODE (current)
eventSource = new EventSource('/events');

eventSource.onmessage = (event) => {
    const data = JSON.parse(event.data);
    if (data.type === 'authenticated') {
        showAuthenticated(data.user);  // Updates immediately!
    }
};
```

**Benefits:**
- ✅ **1 persistent connection** (no repeated requests)
- ✅ **0 polling requests** (server pushes updates)
- ✅ **<100ms latency** (real-time)
- ✅ **Low server load** (one connection per client)
- ✅ **Minimal bandwidth** (only when state changes)

---

## Real Example: Authentication Sequence

Let me show you the actual messages sent:

### **1. Initial Connection**

**Browser:**
```
GET /events HTTP/1.1
Host: localhost:4000
Accept: text/event-stream
```

**Server Response:**
```http
HTTP/1.1 200 OK
Content-Type: text/event-stream
Cache-Control: no-cache
Connection: keep-alive

data: {"type":"waiting"}

```

**UI State:** Shows "En attente..."

---

### **2. User Starts Device Flow**

**Browser:** Clicks "Démarrer l'authentification"

**Server Broadcasts via SSE:**
```
data: {"type":"pending","user_code":"L36M-WRPZ","verification_uri":"http://localhost:8080/realms/projetcis/device"}

```

**UI State:** Shows code "L36M-WRPZ" and QR code (**auto-updated via SSE!**)

---

### **3. User Approves on Phone**

**Server Detects Approval** (via polling Keycloak)

**Server Broadcasts via SSE:**
```
data: {"type":"authenticated","user":{"email":"test@example.com","name":"Test User","sub":"123-456"}}

```

**UI State:** Shows success screen with user info (**auto-updated via SSE!**)

---

## How to See It in Action

### **1. Open Browser Console**

Visit `http://localhost:4000` and open DevTools (F12)

You'll see:
```
📡 Démarrage de la connexion SSE...
📡 Connexion au flux SSE...
📡 Message SSE reçu: {type: "waiting"}
```

### **2. Watch Network Tab**

In DevTools → Network → Filter by "events":

- You'll see ONE request to `/events`
- Status: `200 (pending)` or `200 (streaming)`
- Type: `eventsource`
- Connection stays open!

### **3. Start Device Flow**

Click "Démarrer l'authentification"

Console shows:
```
📡 Message SSE reçu: {type: "pending", user_code: "XXXX-XXXX", ...}
```

UI updates automatically without page refresh!

### **4. Complete Authentication**

When approved, console shows:
```
📡 Message SSE reçu: {type: "authenticated", user: {...}}
```

UI shows success screen **instantly**!

---

## Backend: How Server Sends Notifications

### **SSE Endpoint (device-app/server.js:197)**

```javascript
app.get('/events', (req, res) => {
    // Set SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    console.log('📡 Nouveau client SSE connecté');

    // Send current state immediately
    const currentState = getCurrentState();
    res.write(`data: ${JSON.stringify(currentState)}\n\n`);

    // Add client to list
    const client = { id: Date.now(), res };
    sseClients.push(client);

    // Cleanup on disconnect
    req.on('close', () => {
        console.log('📡 Client SSE déconnecté');
        sseClients = sseClients.filter(c => c.id !== client.id);
    });
});
```

### **Broadcasting Updates (device-app/server.js:25)**

```javascript
function notifyClients(data) {
    console.log(`📡 Notification SSE à ${sseClients.length} client(s):`, data.type);

    sseClients.forEach(client => {
        try {
            // Write to each connected client
            client.res.write(`data: ${JSON.stringify(data)}\n\n`);
        } catch (error) {
            console.error('❌ Erreur lors de l\'envoi SSE:', error.message);
        }
    });
}
```

### **Triggered on State Changes:**

1. **Device flow starts** (line 74):
   ```javascript
   notifyClients({
       type: 'pending',
       user_code: deviceFlowState.user_code,
       verification_uri: deviceFlowState.verification_uri
   });
   ```

2. **User authenticates** (line 126):
   ```javascript
   notifyClients({
       type: 'authenticated',
       user: userInfo
   });
   ```

3. **Token expires** (line 141):
   ```javascript
   notifyClients({ type: 'expired' });
   ```

4. **User logs out** (line 226):
   ```javascript
   notifyClients({ type: 'waiting' });
   ```

---

## Summary

### **How Auto-Refresh Works:**

1. ✅ **Page loads** → SSE connection opens automatically
2. ✅ **Server detects change** → Calls `notifyClients()`
3. ✅ **Message pushed** → Sent over existing SSE connection
4. ✅ **Browser receives** → `onmessage` handler fires
5. ✅ **UI updates** → DOM modified with new content

### **No Polling Required:**

- **Before:** Browser asks "Are we there yet?" every 2 seconds
- **After:** Server says "We're here!" the instant it happens

### **Performance:**

- **Latency:** <100ms (vs 0-2 seconds with polling)
- **Requests:** 1 connection (vs 30 requests/minute)
- **Bandwidth:** Minimal (vs constant overhead)

---

**The page "auto-refreshes" because the server actively pushes updates to the browser in real-time via the persistent SSE connection!**
