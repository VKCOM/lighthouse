FROM nginx:1.23.1-alpine
RUN rm -rf /usr/share/nginx/html/*
COPY . /usr/share/nginx/html
EXPOSE 80
CMD ["nginx","-g","daemon off;"]