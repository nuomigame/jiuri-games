FROM node:20-alpine

WORKDIR /app

# 先拷贝依赖清单（本项目无第三方依赖，仅用内置模块）
COPY package.json ./
COPY server ./server
COPY public ./public

# 数据目录：部署时把平台的“持久磁盘”挂到 /data，游戏/用户/封面都存这里，重启不丢
RUN mkdir -p /data
ENV NODE_ENV=production
ENV PORT=3009
ENV DATA_DIR=/data

EXPOSE 3009

CMD ["node", "server/server.js"]
