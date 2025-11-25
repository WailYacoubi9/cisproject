FROM node:18-alpine

WORKDIR /app

# Copier les fichiers de dépendances
COPY package*.json ./

# Installer les dépendances
RUN npm install --only=production

# Copier le reste de l'application
COPY . .

# Exposer le port
EXPOSE 4000

# Commande de démarrage
CMD ["node", "server.js"]