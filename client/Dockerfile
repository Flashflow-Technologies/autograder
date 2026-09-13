# Build the React app, then serve the static bundle with nginx (all free).
# Uses full node:20 (not alpine) — Alpine's musl libc can break esbuild/rollup
# native binaries that Vite depends on.
FROM node:20 AS build
WORKDIR /app
COPY package*.json ./
RUN npm install --no-audit --no-fund
COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
