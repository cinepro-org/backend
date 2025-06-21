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

# Add api key
ENV TMDB_API_KEY=ea021b3b0775c8531592713ab727f254

# Start the app
CMD ["npm", "deploy"]
