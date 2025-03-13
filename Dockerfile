# Choose a Node image (ARM support for Mac M1)
FROM node:18-alpine

# Create the directory for the app
WORKDIR /app

# Copy package.json and install
COPY package*.json ./
RUN npm install

# Copy the rest of the sources
COPY . .

# Build the NestJS project
RUN npm run build

# Start the application in production mode
CMD ["npm", "run", "start:prod"]
