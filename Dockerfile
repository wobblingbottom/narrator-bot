FROM node:20-alpine

WORKDIR /app

# Sharp SVG text rendering needs system fonts; without these glyphs show as squares.
RUN apk add --no-cache \
	fontconfig \
	ttf-dejavu \
	ttf-liberation \
	font-noto \
	font-noto-cjk

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

RUN mkdir -p data

CMD ["npm", "run", "start"]
