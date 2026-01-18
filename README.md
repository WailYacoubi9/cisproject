# Configuration Keycloak & Application Node.js

## Etape préliminaire: Configuration de Https locale
L’application utilise HTTPS obligatoire pour respecter PKCE + OIDC.
Pour cela, on génère un certificat SSL local avec mkcert.

### Installer mkcert

Pour Windows:
```bash
choco install mkcert
```

### Générer les certificats HTTPS

```bash
mkcert localhost 127.0.0.1 ::1
```
Cela génère :

localhost+2.pem (certificat)

localhost+2-key.pem (clé privée)

### Placer les certificats dans votre projet
Créer le dossier :
```bash
/certs
```
Puis déplacer les fichiers générés dedans :
```bash
/certs/localhost+2.pem
/certs/localhost+2-key.pem
```
/certs est déjà placé dans .gitignore

## Etape préliminaire 2: Configuration de la base de données PostgreSQL pour Keycloak

### Créer un réseau Docker

D'abord, créez un réseau pour que Keycloak et PostgreSQL puissent communiquer :

```bash
docker network create keycloak-network
```

### Démarrer le conteneur PostgreSQL

```bash
docker run -d --name postgres-keycloak \
  --network keycloak-network \
  -e POSTGRES_DB=keycloak \
  -e POSTGRES_USER=keycloak \
  -e POSTGRES_PASSWORD=keycloak_db_password \
  -v keycloak-postgres-data:/var/lib/postgresql/data \
  postgres:15
```

**PowerShell (Windows):**
```powershell
docker run -d --name postgres-keycloak `
  --network keycloak-network `
  -e POSTGRES_DB=keycloak `
  -e POSTGRES_USER=keycloak `
  -e POSTGRES_PASSWORD=keycloak_db_password `
  -v keycloak-postgres-data:/var/lib/postgresql/data `
  postgres:15
```

---

## 1. Installation et lancement de Keycloak

### 1.1 Pull des images Docker

```bash
docker pull quay.io/keycloak/keycloak
docker pull postgres:15
```

### 1.2 Lancement de Keycloak avec PostgreSQL

#### Option A: Avec PostgreSQL (RECOMMANDÉ - Production)

```bash
docker run -d --name keycloak-dev \
  --network keycloak-network \
  -p 8080:8080 \
  -e KC_BOOTSTRAP_ADMIN_USERNAME=admin \
  -e KC_BOOTSTRAP_ADMIN_PASSWORD=admin \
  -e KC_DB=postgres \
  -e KC_DB_URL=jdbc:postgresql://postgres-keycloak:5432/keycloak \
  -e KC_DB_USERNAME=keycloak \
  -e KC_DB_PASSWORD=keycloak_db_password \
  -v ${PWD}/imports:/opt/keycloak/data/import \
  quay.io/keycloak/keycloak:latest \
  start-dev --import-realm
```

**PowerShell (Windows):**
```powershell
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

#### Option B: Sans PostgreSQL (DEV uniquement - données volatiles)

```bash
docker run -d --name keycloak-dev \
  -p 8080:8080 \
  -e KC_BOOTSTRAP_ADMIN_USERNAME=admin \
  -e KC_BOOTSTRAP_ADMIN_PASSWORD=admin \
  -v ${PWD}/imports:/opt/keycloak/data/import \
  quay.io/keycloak/keycloak:latest \
  start-dev --import-realm
```

**PowerShell (Windows):**
```powershell
docker run -d --name keycloak-dev `
  -p 8080:8080 `
  -e KC_BOOTSTRAP_ADMIN_USERNAME=admin `
  -e KC_BOOTSTRAP_ADMIN_PASSWORD=admin `
  -v ${PWD}/imports:/opt/keycloak/data/import `
  quay.io/keycloak/keycloak:latest `
  start-dev --import-realm
```

### 1.3 Accéder à Keycloak

Ouvrir dans le navigateur :

http://localhost:8080

Identifiants admin :

- **username** : admin  
- **password** : <password>


---

## 2. Configuration Keycloak

### 2.1 Sélection du Realm

Le realm **`projetcis`** a été automatiquement importé grâce au fichier `realm.json`.

Pour le sélectionner :

1. **En haut à gauche** de l'interface Keycloak, cliquez sur le **dropdown des realms** (par défaut il affiche "master")
2. Dans la liste, sélectionnez **`projetcis`**
3. Le realm est maintenant actif (vérifié par le nom affiché en haut à gauche)

**Note:** Si le realm `projetcis` n'apparaît pas dans la liste, vérifiez que l'import s'est bien déroulé en consultant les logs Docker :
```bash
docker logs keycloak-dev | grep -i import
```

---

### 2.2 Le Client WebApp

Aller dans : **Clients → webapp**

#### Paramètres configurées par realm.json :

| Champ | Valeur |
|-------|--------|
| **Client ID** | webapp |
| **Name** | WebApp Client |
| **Client type** | OpenID Connect |
| **Client authentication** | ON |
| **Authorization** | OFF |
| **Standard flow** | ON |
| **Direct access grants** | OFF |
| **Service accounts** | OFF |
| **OAuth Device Flow** | OFF |
| **PKCE** | Required |
| **Code challenge method** | S256 |

#### Redirections :

| Paramètre Keycloak | Valeur |
|--------------------|--------|
| **Valid Redirect URIs** | http://localhost:3000/auth/callback |
| **Valid Post Logout Redirect URIs** | http://localhost:3000/* |
| **Web Origins** | http://localhost:3000/ |

---

### 2.3 Récupérer le secret du client

1. Aller dans l’onglet **Credentials**  
2. Copier le champ **Client Secret**

---

## 3. Configuration de l’application Node.js

Créer un fichier **.env** à la racine du projet :

```
# Configuration Keycloak
KEYCLOAK_URL=http://localhost:8080
REALM=projetcis
CLIENT_ID=webapp
CLIENT_SECRET=<collez ici le secret que vous avez copié>

# Configuration serveur
PORT=3000
REDIRECT_URI=http://localhost:3000/auth/callback

```

---

## 4. Lancer l’application

Installer les dépendances :

```bash
npm install
```

Démarrer le serveur :

```bash
nodemon server.js
```

Accéder à l’application :

http://localhost:3000
