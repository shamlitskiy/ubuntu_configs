# Build-less static serve using Nginx
FROM nginx:1.27-alpine

# Copy static demo to nginx html root under /demo
COPY . /usr/share/nginx/html/demo

# Keep default nginx config unmodified to avoid syntax errors
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
