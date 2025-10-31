# Usa una imagen base liviana con Node.js
FROM node:20-alpine

# Establece el directorio de trabajo dentro del contenedor
WORKDIR /usr/src/app

# Copia los archivos de dependencias primero (aprovecha cache)
COPY package*.json ./

# Instala las dependencias
RUN npm install

# Copia el resto del código fuente
COPY . .

# Expone el puerto de la app (NestJS por defecto es 3000)
EXPOSE 3000

# Comando por defecto (modo desarrollo)
CMD ["npm", "run", "start:dev"]
