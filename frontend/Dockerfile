FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

# Ensure node_modules binaries are executable
RUN chmod -R +x node_modules/.bin/

EXPOSE 3000

CMD ["npx", "next", "dev", "-p", "3000"]
