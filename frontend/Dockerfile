FROM node:20-alpine AS build

WORKDIR /app

ARG REACT_APP_BACKEND_URL=""
ENV REACT_APP_BACKEND_URL=${REACT_APP_BACKEND_URL}

COPY frontend/package.json ./
RUN yarn install --network-timeout 600000

COPY frontend/ ./
RUN NODE_ENV=production GENERATE_SOURCEMAP=false yarn build

FROM nginx:1.27-alpine

COPY --from=build /app/build /usr/share/nginx/html
COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

