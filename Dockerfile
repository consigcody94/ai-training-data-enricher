# Use Apify base image
FROM apify/actor-node:18

# Copy package files
COPY package*.json ./

# Install ALL dependencies (including dev for build)
RUN npm install

# Copy source code
COPY . ./

# Build TypeScript
RUN npm run build

# Remove dev dependencies after build
RUN npm prune --omit=dev

# Run the compiled code
CMD npm start
