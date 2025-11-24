# Use Apify base image
FROM apify/actor-node:18

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install --omit=dev --omit=optional

# Copy source code
COPY . ./

# Build TypeScript
RUN npm run build

# Run the compiled code
CMD npm start
