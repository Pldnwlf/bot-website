FROM node:20 AS build
WORKDIR /app
COPY . .
RUN npm install && npm run build --prod

# Production Stage
FROM nginx:alpine
COPY --from=build /app/dist/your-angular-app-name /usr/share/nginx/html
COPY frontend/nginx.conf /etc/nginx/nginx.conf
