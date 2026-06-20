FROM node:20-alpine

WORKDIR /app

# Install dumb-init for proper signal handling
RUN apk add --no-cache dumb-init

# Copy package files
COPY server/package*.json ./

# Install production dependencies only
RUN npm ci --omit=dev

# Copy server code
COPY server/src ./src

# Create non-root user
RUN addgroup -S nodejs && adduser -S nodejs -G nodejs
USER nodejs

EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD node -e "const req=require('http').get('http://localhost:4000/health',(res)=>{res.resume();res.on('end',()=>process.exit(res.statusCode===200?0:1))});req.on('error',()=>process.exit(1));req.setTimeout(2000,()=>{req.destroy();process.exit(1)})"

ENTRYPOINT ["dumb-init", "--"]

CMD ["sh", "-c", "npm run migrate && node src/server.js"]
