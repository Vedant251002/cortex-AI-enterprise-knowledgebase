# Cortex frontend — React 18 + TypeScript + Vite, multi-stage build
# ---- Stage 1: build static assets ----
FROM node:20-alpine AS build

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

# Build-time API base URL for the SPA to call the backend service.
# Override at build time with: docker build --build-arg VITE_API_BASE_URL=http://localhost:8000
ARG VITE_API_BASE_URL=http://localhost:8000
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL

RUN npm run build

# ---- Stage 2: serve with nginx ----
FROM nginx:1.27-alpine AS serve

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
