# Setup Complet avec PostgreSQL

Ce guide explique comment configurer le projet avec PostgreSQL pour Keycloak (données persistantes).

## 📋 Prérequis

- Docker Desktop installé et démarré
- Node.js installé
- Git installé

---

## 🚀 Installation Complète - Étape par Étape

### 1. Créer le Réseau Docker

```powershell
# PowerShell (Windows)
docker network create keycloak-network
```

```bash
# Linux/Mac
docker network create keycloak-network
```

---

### 2. Démarrer PostgreSQL

```powershell
# PowerShell (Windows)
docker run -d --name postgres-keycloak `
  --network keycloak-network `
  -e POSTGRES_DB=keycloak `
  -e POSTGRES_USER=keycloak `
  -e POSTGRES_PASSWORD=keycloak_db_password `
  -v keycloak-postgres-data:/var/lib/postgresql/data `
  postgres:15
```

```bash
# Linux/Mac
docker run -d --name postgres-keycloak \
  --network keycloak-network \
  -e POSTGRES_DB=keycloak \
  -e POSTGRES_USER=keycloak \
  -e POSTGRES_PASSWORD=keycloak_db_password \
  -v keycloak-postgres-data:/var/lib/postgresql/data \
  postgres:15
```

**Vérifier que PostgreSQL est démarré:**
```powershell
docker logs postgres-keycloak
# Tu devrais voir: "database system is ready to accept connections"
```

---

### 3. Démarrer Keycloak avec PostgreSQL

```powershell
# PowerShell (Windows)
docker run -d --name keycloak-dev `
  --network keycloak-network `
  -p 8080:8080 `
  -e KC_BOOTSTRAP_ADMIN_USERNAME=admin `
  -e KC_BOOTSTRAP_ADMIN_PASSWORD=admin `
  -e KC_DB=postgres `
  -e KC_DB_URL=jdbc:postgresql://postgres-keycloak:5432/keycloak `
  -e KC_DB_USERNAME=keycloak `
  -e KC_DB_PASSWORD=keycloak_db_password `
  -v ${PWD}/imports:/opt/keycloak/data/import `
  quay.io/keycloak/keycloak:latest `
  start-dev --import-realm
```

```bash
# Linux/Mac
docker run -d --name keycloak-dev \
  --network keycloak-network \
  -p 8080:8080 \
  -e KC_BOOTSTRAP_ADMIN_USERNAME=admin \
  -e KC_BOOTSTRAP_ADMIN_PASSWORD=admin \
  -e KC_DB=postgres \
  -e KC_DB_URL=jdbc:postgresql://postgres-keycloak:5432/keycloak \
  -e KC_DB_USERNAME=keycloak \
  -e KC_DB_PASSWORD=keycloak_db_password \
  -v $(pwd)/imports:/opt/keycloak/data/import \
  quay.io/keycloak/keycloak:latest \
  start-dev --import-realm
```

**Attendre 30-60 secondes** que Keycloak démarre et configure la base de données.

**Vérifier les logs:**
```powershell
docker logs keycloak-dev

# Tu devrais voir à la fin:
# "Keycloak ... started in ...ms"
```

---

### 4. Installer les Dépendances Node.js

```powershell
# Device-App
cd device-app
npm install

# WebApp2
cd ../webapp2
npm install
cd ..
```

---

### 5. Configurer WebApp2

**Créer `webapp2/.env`:**

1. Connecte-toi à Keycloak: `http://localhost:8080`
   - Username: `admin`
   - Password: `admin`

2. Sélectionne le realm **`projetcis`**

3. Va dans **Clients → webapp → Credentials**

4. Copie le **Client Secret**

5. Crée le fichier `webapp2/.env`:

```env
# Configuration Keycloak
KEYCLOAK_URL=http://localhost:8080
REALM=projetcis
CLIENT_ID=webapp
CLIENT_SECRET=<colle le secret ici>

# Configuration serveur
PORT=3000
REDIRECT_URI=https://localhost:3000/auth/callback
```

---

### 6. Démarrer les Applications

**Terminal 1 - Device-App:**
```powershell
cd device-app
node server.js
```

**Terminal 2 - WebApp2:**
```powershell
cd webapp2
npm start
```

---

### 7. Créer un Utilisateur

1. Va sur `http://localhost:8080`
2. Connecte-toi avec `admin` / `admin`
3. Sélectionne realm **`projetcis`**
4. **Users → Add user**
   - Username: `testuser`
   - Email: `test@example.com`
   - First name: `Test`
   - Last name: `User`
   - Email verified: **ON**
   - Enabled: **ON**
5. **Create**
6. Onglet **Credentials → Set password**
   - Password: `Test1234!`
   - Temporary: **OFF**
   - **Save**

---

### 8. Tester le Système

**A. Device Flow:**

1. Ouvre: `http://localhost:4000`
2. Clique: "Démarrer l'authentification"
3. Note le code (ex: `ABCD-1234`)

**B. WebApp2:**

1. Ouvre: `https://localhost:3000`
2. Clique: "Se connecter"
3. Email: `test@example.com`
4. Password: `Test1234!`
5. Entre le code du device
6. Confirme

**C. Vérifier les Devices:**

1. Sur WebApp2: "Gérer mes appareils"
2. Tu devrais voir le device connecté avec toutes les infos

---

## 🔧 Gestion des Containers

### Arrêter tout

```powershell
docker stop keycloak-dev postgres-keycloak
```

### Redémarrer

```powershell
docker start postgres-keycloak
Start-Sleep -Seconds 5
docker start keycloak-dev
```

### Supprimer tout (réinitialisation complète)

```powershell
docker stop keycloak-dev postgres-keycloak
docker rm keycloak-dev postgres-keycloak
docker volume rm keycloak-postgres-data
docker network rm keycloak-network
```

### Voir les logs

```powershell
docker logs -f keycloak-dev      # Keycloak
docker logs -f postgres-keycloak # PostgreSQL
```

---

## ✅ Avantages de PostgreSQL

| Aspect | Sans PostgreSQL | Avec PostgreSQL |
|--------|----------------|-----------------|
| **Persistance** | ❌ Données perdues au redémarrage | ✅ Données conservées |
| **Production** | ❌ Non recommandé | ✅ Production-ready |
| **Performance** | ⚠️ Moyenne | ✅ Excellente |
| **Scaling** | ❌ Limité | ✅ Scalable |
| **Backup** | ❌ Impossible | ✅ Facile |

---

## 🐛 Troubleshooting

### PostgreSQL ne démarre pas

```powershell
docker logs postgres-keycloak
```

Problème courant: port 5432 déjà utilisé
```powershell
# Windows: trouver le processus
netstat -ano | findstr :5432

# Tuer le processus
taskkill /PID <PID> /F
```

### Keycloak ne se connecte pas à PostgreSQL

```powershell
# Vérifier que les deux sont sur le même réseau
docker network inspect keycloak-network

# Tu devrais voir postgres-keycloak et keycloak-dev
```

### Reset complet de la base de données

```powershell
docker stop keycloak-dev postgres-keycloak
docker rm postgres-keycloak
docker volume rm keycloak-postgres-data

# Puis recommencer depuis l'étape 2
```

---

## 📊 Vérifier la Configuration

### Test de connexion PostgreSQL

```powershell
docker exec -it postgres-keycloak psql -U keycloak -d keycloak

# Dans psql:
\dt  # Liste les tables (devrait montrer les tables Keycloak)
\q   # Quitter
```

### Vérifier les données persistantes

```powershell
# Arrêter Keycloak
docker stop keycloak-dev

# Redémarrer
docker start keycloak-dev

# Les utilisateurs et configurations devraient encore exister !
```

---

## 🎯 URLs de Référence

- **Keycloak Admin:** http://localhost:8080
- **Device-App:** http://localhost:4000
- **WebApp2:** https://localhost:3000
- **PostgreSQL:** localhost:5432 (interne au réseau Docker)

---

## 📝 Notes

- Les données PostgreSQL sont stockées dans le volume `keycloak-postgres-data`
- Le réseau `keycloak-network` permet la communication entre containers
- Le realm `projetcis` est automatiquement importé depuis `imports/realm.json`
- Les certificats HTTPS pour WebApp2 doivent être générés avec mkcert (voir README.md)
