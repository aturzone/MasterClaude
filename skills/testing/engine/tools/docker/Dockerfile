# The image tag MUST equal the pinned @playwright/test version so browser builds match.
# Update both together (the CLI preflight checks this).
FROM mcr.microsoft.com/playwright:v1.61.1-noble

# Deterministic font rendering for visual baselines — bake in a webfont for reproducible glyphs.
COPY tools/docker/fonts/ /usr/share/fonts/truetype/project/
RUN fc-cache -f

# pnpm via corepack
RUN corepack enable

WORKDIR /repo
# Source is bind-mounted by docker-compose; results/ and baselines/ write back to the host.
ENV CI=""
