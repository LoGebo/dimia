# Relevo de transición (corte a AWS): las URLs de Fly siguen vivas y reenvían todo a CloudFront.
FROM nginx:1.29-alpine
COPY templates/ /etc/nginx/templates/
ENV RELEVO_SECRETO=""
EXPOSE 8080
