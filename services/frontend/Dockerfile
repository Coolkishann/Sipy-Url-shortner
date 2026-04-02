FROM node:20-alpine AS builder

WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

FROM nginx:alpine
# Copy built files
COPY --from=builder /app/dist /usr/share/nginx/html
# Copy nginx config template
COPY nginx.conf /etc/nginx/templates/default.conf.template

# Default backend URL (can be overridden via environment variable)
ENV API_URL=https://sipy-url-shortner-1.onrender.com

EXPOSE 80
# Use envsubst to replace $API_URL in the template before starting nginx
CMD ["/bin/sh", "-c", "envsubst '${API_URL}' < /etc/nginx/templates/default.conf.template > /etc/nginx/conf.d/default.conf && exec nginx -g 'daemon off;'"]

