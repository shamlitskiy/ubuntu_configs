# Build-less static serve using Nginx
FROM nginx:1.27-alpine

# Copy static demo to nginx html root
COPY . /usr/share/nginx/html/demo

# Minimal nginx tweak: ensure index is available under /demo/
RUN sed -i 's|index  index.html index.htm;|index  index.html;|g' /etc/nginx/conf.d/default.conf \
 && sed -i 's|location / {|location / { try_files $uri $uri/ =404; }|g' /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
