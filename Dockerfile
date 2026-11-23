# ─── منصة الاستضافة: Railway (تدعم Dockerfile تلقائيًا) ───
# لا أسرار هنا. المفتاح يُضبط في لوحة Railway فقط.
FROM node:22-alpine

WORKDIR /app

# اعتماديات الإنتاج فقط
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund

# الكود
COPY . .

ENV NODE_ENV=production
EXPOSE 8080

# مستخدم غير جذري
RUN addgroup -S mirath && adduser -S mirath -G mirath \
  && chown -R mirath:mirath /app
USER mirath

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+ (process.env.PORT||8080) +'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server/server.js"]
