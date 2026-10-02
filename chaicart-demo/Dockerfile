FROM node:24-alpine
WORKDIR /app
COPY --chown=node:node package*.json server.js auth.js ./
COPY --chown=node:node public ./public
RUN npm ci --omit=dev && mkdir data && chown node:node data
USER node
ENV PORT=8080
EXPOSE 8080
CMD ["npm", "start"]
