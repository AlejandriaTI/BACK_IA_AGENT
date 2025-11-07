# Imagen base
FROM node:20-slim

WORKDIR /usr/src/app

# Copiá solo package.json primero
COPY package*.json ./

# Instalá dependencias con cache persistente
RUN npm ci

# Copiá el resto del proyecto
COPY . .

EXPOSE 3000

CMD ["npm", "run", "start:dev"]
