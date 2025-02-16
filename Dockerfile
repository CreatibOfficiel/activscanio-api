# Choisir une image Node (support ARM pour Mac M1) 
FROM node:18-alpine

# Création du répertoire pour l’app
WORKDIR /app

# Copier package.json et installer
COPY package*.json ./
RUN npm install

# Copier le reste des sources
COPY . .

# Construire le projet NestJS
RUN npm run build

# Lancer l’application (en mode prod par exemple)
CMD ["npm", "run", "start:dev"]
