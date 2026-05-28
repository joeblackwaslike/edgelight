FROM mcr.microsoft.com/devcontainers/base:ubuntu

ARG USERNAME=vscode
ENV DEBIAN_FRONTEND=noninteractive

# asdf shared data dir — root writes here during build, vscode reads at runtime
ENV ASDF_DATA_DIR=/home/vscode/.asdf
# pipx routes all tool binaries to /usr/local/bin (accessible to all users)
ENV PIPX_HOME=/usr/local/pipx
ENV PIPX_BIN_DIR=/usr/local/bin
# add asdf shims to PATH so post-install RUN layers can call installed tools
ENV PATH="/home/vscode/.asdf/shims:/home/vscode/.asdf/bin:${PATH}"

RUN localedef -i en_US -f UTF-8 en_US.UTF-8

# macOS path alias — settings.json MCP paths (/Users/joe/...) resolve inside the container
RUN mkdir -p /Users && ln -sf /home/vscode /Users/joe && \
    mkdir -p /home/vscode/.asdf

# ── System packages ─────────────────────────────────────────────────────────

ADD --chmod=755 \
    https://raw.githubusercontent.com/seatgeek/bash-aptfile/master/bin/aptfile \
    /usr/local/bin/aptfile

COPY .zshrc /home/$USERNAME/
COPY .mytheme.omp.yaml /home/$USERNAME/
COPY Aptfile /home/$USERNAME/

RUN aptfile /home/$USERNAME/Aptfile

# PostgreSQL 18 via official PGDG apt repo
RUN curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc \
      | gpg --dearmor -o /usr/share/keyrings/postgresql-keyring.gpg && \
    echo "deb [signed-by=/usr/share/keyrings/postgresql-keyring.gpg] \
      http://apt.postgresql.org/pub/repos/apt $(. /etc/os-release && echo "$VERSION_CODENAME")-pgdg main" \
      > /etc/apt/sources.list.d/pgdg.list && \
    apt-get update && apt-get install -y postgresql-18 postgresql-client-18 libpq-dev && \
    rm -rf /var/lib/apt/lists/*

# 1Password CLI (enables cloudflare + porkbun MCP servers via `op run`)
RUN curl -sS https://downloads.1password.com/linux/keys/1password.asc \
      | gpg --dearmor --output /usr/share/keyrings/1password-archive-keyring.gpg && \
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/1password-archive-keyring.gpg] \
      https://downloads.1password.com/linux/debian/$(dpkg --print-architecture) stable main" \
      > /etc/apt/sources.list.d/1password.list && \
    apt-get update && apt-get install -y 1password-cli && \
    rm -rf /var/lib/apt/lists/*

# ── asdf runtime manager ─────────────────────────────────────────────────────

# architecture-aware binary download
RUN ASDF_ARCH=$(case "$(uname -m)" in aarch64|arm64) echo arm64;; *) echo amd64;; esac) && \
    curl -sSL \
      "https://github.com/asdf-vm/asdf/releases/download/v0.18.1/asdf-v0.18.1-linux-${ASDF_ARCH}.tar.gz" \
      -o /tmp/asdf.tar.gz && \
    tar -xzf /tmp/asdf.tar.gz -C /usr/local/bin/ && \
    chmod 755 /usr/local/bin/asdf && \
    rm /tmp/asdf.tar.gz

# ── Language runtimes (one layer per runtime for cache granularity) ──────────

RUN asdf plugin add python && asdf install python latest:3
RUN asdf plugin add nodejs && asdf install nodejs lts
RUN asdf plugin add ruby  && asdf install ruby  latest:4
RUN asdf plugin add golang https://github.com/asdf-community/asdf-golang.git && \
    asdf install golang latest:1
RUN asdf plugin add rust       && asdf install rust       stable
RUN asdf plugin add bun        && asdf install bun        latest:1
RUN asdf plugin add pnpm       && asdf install pnpm       latest:10
RUN asdf plugin add deno       && asdf install deno       latest
RUN asdf plugin add awscli     && asdf install awscli     latest:2
RUN asdf plugin add gcloud     && asdf install gcloud     latest
RUN asdf plugin add pipx       && asdf install pipx       latest:1
RUN asdf plugin add supabase-cli && asdf install supabase-cli latest
RUN asdf plugin add yarn       && asdf install yarn       latest
RUN asdf plugin add jq         && asdf install jq         latest
RUN asdf plugin add yq         && asdf install yq         latest
RUN asdf plugin add just       && asdf install just       latest

# Write /home/vscode/.tool-versions so asdf shims resolve at runtime (as vscode user)
RUN for plugin in python nodejs ruby golang rust bun pnpm deno awscli gcloud pipx \
        supabase-cli yarn jq yq just; do \
      version=$(asdf list "$plugin" 2>/dev/null | grep -v '^ *$' | tail -1 | tr -d ' *'); \
      [ -n "$version" ] && echo "$plugin $version"; \
    done > /home/vscode/.tool-versions

# ── Language-ecosystem tools ─────────────────────────────────────────────────

# Rust/cargo tools → /usr/local/bin via CARGO_INSTALL_ROOT so they're globally accessible
RUN . "$ASDF_DATA_DIR/installs/rust/stable/env" && \
    CARGO_INSTALL_ROOT=/usr/local cargo install \
      diskus \
      du-dust \
      eza \
      hyperfine \
      procs \
      sad \
      git-delta

# npm globals — reshim after so asdf shims are created for installed CLIs
RUN npm install -g \
    @anthropic-ai/claude-code \
    @devcontainers/cli \
    @google/gemini-cli \
    tsx && \
    asdf reshim nodejs

# Go tools → /usr/local/bin via GOPATH
RUN GOPATH=/usr/local go install github.com/steveyegge/beads/cmd/bd@latest && \
    GOPATH=/usr/local go install golang.org/x/tools/cmd/stringer@latest && \
    GOPATH=/usr/local go install github.com/gastownhall/gastown/cmd/gt@latest && \
    GOPATH=/usr/local go install github.com/walles/moor/v2/cmd/moor@latest

# ── Install-script tools ─────────────────────────────────────────────────────

# oh-my-posh prompt engine
RUN curl -s https://ohmyposh.dev/install.sh | bash -s -- -d /usr/local/bin

# uv — fast Python package/project manager
RUN curl -LsSf https://astral.sh/uv/install.sh | UV_INSTALL_DIR=/usr/local/bin sh

# volta — supplemental JS toolchain manager for volta-pinned repos
RUN curl https://get.volta.sh | VOLTA_HOME=/usr/local/share/volta bash -s -- --skip-setup && \
    ln -sf /usr/local/share/volta/bin/volta /usr/local/bin/volta

# ── GitHub release binaries (architecture-aware) ────────────────────────────

RUN set -eux && \
    case "$(uname -m)" in \
      aarch64|arm64) ARCH=arm64; GARCH=arm64 ;; \
      *)             ARCH=amd64; GARCH=x86_64 ;; \
    esac && \
    \
    # dolt — Git for data (SQL database with versioning)
    curl -fsSL "https://github.com/dolthub/dolt/releases/latest/download/dolt-linux-${ARCH}.tar.gz" \
      | tar -xz --strip-components=2 -C /usr/local/bin && \
    \
    # glow — markdown renderer for the terminal
    GLW=$(curl -fsSL https://api.github.com/repos/charmbracelet/glow/releases/latest \
          | jq -r '.tag_name | ltrimstr("v")') && \
    curl -fsSL "https://github.com/charmbracelet/glow/releases/download/v${GLW}/glow_${GLW}_Linux_${GARCH}.tar.gz" \
      | tar -xz -C /usr/local/bin glow && \
    \
    # mkcert — local CA and TLS certificate generation
    MKV=$(curl -fsSL https://api.github.com/repos/FiloSottile/mkcert/releases/latest \
          | jq -r .tag_name) && \
    curl -fsSL "https://github.com/FiloSottile/mkcert/releases/download/${MKV}/mkcert-${MKV}-linux-${ARCH}" \
      -o /usr/local/bin/mkcert && chmod +x /usr/local/bin/mkcert && \
    \
    # step — Smallstep certificate CLI
    STV=$(curl -fsSL https://api.github.com/repos/smallstep/cli/releases/latest \
          | jq -r '.tag_name | ltrimstr("v")') && \
    STDIR=$(mktemp -d) && \
    curl -fsSL "https://github.com/smallstep/cli/releases/download/v${STV}/step_linux_${STV}_${ARCH}.tar.gz" \
      | tar -xz -C "$STDIR" && \
    find "$STDIR" -name 'step' -type f -exec install -m755 {} /usr/local/bin/step \; && \
    rm -rf "$STDIR"

# ── Python tools (pipx) ──────────────────────────────────────────────────────

# PIPX_BIN_DIR=/usr/local/bin routes executables to system PATH
RUN pipx install sqlfluff && pipx install csvkit

# ── Ownership fix ────────────────────────────────────────────────────────────

# Make the vscode user own all asdf data so runtime tool additions work
RUN chown -R vscode:vscode /home/vscode/.asdf /home/vscode/.tool-versions 2>/dev/null || true
