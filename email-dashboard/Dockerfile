FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install

FROM node:20-alpine AS build
WORKDIR /app
ARG NEXT_PUBLIC_API_URL=""
ARG BACKEND_API_URL=""
ARG NEXTAUTH_URL=""
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV BACKEND_API_URL=$BACKEND_API_URL
ENV NEXTAUTH_URL=$NEXTAUTH_URL
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_PUBLIC_API_URL=""
ENV BACKEND_API_URL=""
ENV NEXTAUTH_URL=""

COPY --from=build /app ./

EXPOSE 3001
CMD ["npm", "run", "start", "--", "-p", "3001"]

