FROM node:22.18.0-alpine as builder

# install yarn
RUN apk add --no-cache yarn

# Set the working directory
WORKDIR /app

# Install dependencies
COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile

# Copy remaining files for build step. Note only the build dir will be copied into the runner
COPY . .

# Build the app
RUN yarn tailwind:build
RUN yarn build

# Create fresh runner image
FROM node:22.18.0-alpine as runner

WORKDIR /app

# Copy only the built assets and dependency lock into a new runner image
COPY --from=builder /app/build ./build 
COPY package.json yarn.lock ./

# Only install prod dependencies
RUN yarn install --production --frozen-lockfile

ENTRYPOINT [ "yarn", "start" ]
