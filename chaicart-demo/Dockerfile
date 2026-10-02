FROM node:24-alpine
WORKDIR /app
COPY --chown=node:node package*.json server.js ./
COPY --chown=node:node public ./public
RUN mkdir data && chown node:node data
USER node
ENV PORT=8080
EXPOSE 8080
CMD ["npm", "start"]
