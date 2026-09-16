# Builds the frontend and backend, then serves both from the Express server on $PORT.
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json* ./
COPY server/package.json server/
COPY web/package.json web/
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/server/package.json ./server/
COPY --from=build /app/server/dist ./server/dist
COPY --from=build /app/server/db ./server/db
COPY --from=build /app/server/scripts ./server/scripts
COPY --from=build /app/web/dist ./web/dist
EXPOSE 4000
CMD ["node", "server/dist/index.js"]
