# Use the official Node image
FROM node:18-alpine

# Set working directory
WORKDIR /

# Copy dependencies files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy app source
COPY . .

# Expose port
ARG PORT=3000
ENV PORT=${PORT}
EXPOSE ${PORT}

# Start the app
CMD ["npm", "deploy"]
