# build image
FROM docker.axosoft.com/node-base-image:latest as build

WORKDIR /build
COPY package.json .
COPY package-lock.json .

RUN npm install


# final image
FROM keymetrics/pm2:8-alpine

EXPOSE 3004
ENV PORT 3004

WORKDIR /app

COPY --from=build /build/node_modules ./node_modules
COPY package.json .
COPY *.js ./
COPY *.html ./
COPY config.json .

CMD [ "pm2-docker", "." ]
