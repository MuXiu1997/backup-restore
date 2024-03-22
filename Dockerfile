ARG NODE_VERSION=18.13.0
ARG ALPINE_VERSION=3.17

FROM node:${NODE_VERSION}-alpine${ALPINE_VERSION}

ARG RCLONE_VERSION=1.66.0
ARG ZX_VERSION=7.1.1

ENV XDG_CONFIG_HOME=/config

COPY backup-restore.mjs /usr/local/bin/backup-restore.mjs

# Install Bash and Rclone and ZX
RUN set -eux; \
    apk add --no-cache bash ca-certificates fuse tzdata; \
    echo "user_allow_other" >> /etc/fuse.conf; \
    wget -q https://downloads.rclone.org/v${RCLONE_VERSION}/rclone-v${RCLONE_VERSION}-linux-amd64.zip; \
    unzip -q rclone-v${RCLONE_VERSION}-linux-amd64.zip; \
    mv rclone-v${RCLONE_VERSION}-linux-amd64/rclone /usr/local/bin/; \
    rm -rf rclone-v${RCLONE_VERSION}-linux-amd64.zip rclone-v${RCLONE_VERSION}-linux-amd64; \
    npm install -g zx@${ZX_VERSION}; \
    chmod +x /usr/local/bin/backup-restore.mjs

ENTRYPOINT ["/usr/local/bin/backup-restore.mjs"]
