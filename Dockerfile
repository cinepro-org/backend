# Use the official Node image
FROM node:18-alpine

# Set working directory
WORKDIR /src/app

# Copy dependencies files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy app source
COPY . .

# Expose port
EXPOSE 3000

# Start the app
CMD ["npm", "start"]
