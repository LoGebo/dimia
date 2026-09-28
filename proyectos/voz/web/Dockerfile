# Panel en EKS (§3.5): Next.js standalone, sin el árbol completo de node_modules en la imagen.
FROM node:22-alpine AS dependencias
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

FROM node:22-alpine AS construccion
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1 NEXT_OUTPUT=standalone
COPY --from=dependencias /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
RUN addgroup -g 10001 panel && adduser -u 10001 -G panel -D panel
COPY --from=construccion --chown=panel:panel /app/.next/standalone ./
COPY --from=construccion --chown=panel:panel /app/.next/static ./.next/static
COPY --from=construccion --chown=panel:panel /app/public ./public
USER panel
EXPOSE 3000
CMD ["node", "server.js"]
