# CoolerBridge

CoolerBridge is a self-hostable bridge between your [Coolify](https://coolify.io) instance(s) and your [Cooler](https://getcooler.app) companion app. It turns Coolify's notifications into real-time push notifications on your devices, without polling.

You host the bridge, link it to your CoolerCloud account, and sign into Cooler with that same account. From there, your connected bridge(s) are available to you with nothing else to configure. The bridge is meant to be a private relay you own, not a service you babysit.

## What is this?

As the name implies, CoolerBridge is a bridge between your [Coolify](https://coolify.io) instance(s) and your [Cooler](https://getcooler.app) companion app.

In order to deliver notifications for your server(s) and respective resources, Cooler relies on a polling system that verifies whether something went wrong and alerts you about it.

This is both archaic and technically unsound; it drains the battery faster and, by all accounts, is anything _but_ reliable.

CoolerBridge's role is to replace that system with a proper webhook-based one, triggered **automatically** by your own Coolify instance(s). Coolify itself owns the flow; not Cooler.

## How does it work?

You point your Coolify instance at your bridge once, and from then on Coolify owns the flow. You link the bridge to your CoolerCloud account, sign into Cooler with that same account, and your bridge(s) are there, ready to go. No per-device wiring, no push providers to configure, nothing to maintain. The only thing Cooler ever sees is what Coolify sends over; nothing more, nothing less.

In short:

1. Coolify sends a notification to your CoolerBridge webhook URL.
2. CoolerBridge normalizes the payload and stores it as an event, scoped to the originating bridge.
3. Linked devices are notified over push through [Expo](https://expo.dev), which fans out to APNs (iOS) and FCM (Android).
4. Cooler reads the event through CoolerBridge's own API.

### Features

- Webhook ingestion for Coolify notifications, with a cryptographically-random token in the URL.
- Per-bridge isolation so events never leak across instances.
- Cloud pairing and token exchange backed by Ed25519 assertions.
- Scoped sessions modeled on Coolify's own permission scopes.
- Zero-config push dispatch to linked devices through Expo, with automatic pruning of tokens Expo reports as unregistered.

### Security

Coolify [does not add a signature or shared-secret header](https://coolify.io/docs/core/notifications/channels/webhook/setup) to its notification payloads. Naturally, this poses a real privacy/security threat, if not handled correctly.

To help mitigate these possible threats, CoolerBridge adds an opaque, cryptographically-random token to your endpoint URL:

```typescript
const secret = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("base64url")
```

The resulting URL will resemble the following:

`https://<your-bridge-instance>/v1/webhooks/coolify/YEm8oNOqhvYKjpyB3q...`

### Upstream changes

Cooler doesn't understand Coolify's API reference; instead, it only understands CoolerBridge's. This way, if Coolify makes changes that, say, alter the fields and/or their respective types, the only thing that needs to be updated is CoolerBridge: Cooler itself remains untouched (and unbothered).

The current payload reference can be read in-full [here](https://coolify.io/docs/core/notifications/channels/webhook/payload-reference).

## Getting started

CoolerBridge ships as a container image published to the GitHub Container Registry. The quickest way to self-host it is with the provided Compose file, which runs the bridge alongside its PostgreSQL database.

### Requirements

- [Docker](https://docs.docker.com/get-docker/) with Compose, for self-hosting.
- A running [Coolify](https://coolify.io) instance.

### Run with Compose

1. Add a new Docker Compose resource in Coolify (or host locally):

```yaml
services:
  bridge:
    image: ghcr.io/coolermobile/coolerbridge:latest
    restart: unless-stopped
    env_file:
      - .env
    environment:
      # derived from the postgres credentials so the password lives in one place
      DATABASE_URL: postgres://${POSTGRES_USER:-coolerbridge}:${POSTGRES_PASSWORD:?set POSTGRES_PASSWORD in .env}@postgres:5432/${POSTGRES_DB:-coolerbridge}
    ports:
      - "3000:3000"
    depends_on:
      postgres:
        condition: service_healthy

  postgres:
    image: postgres:18-alpine
    restart: unless-stopped
    environment:
      POSTGRES_DB: ${POSTGRES_DB:-coolerbridge}
      POSTGRES_USER: ${POSTGRES_USER:-coolerbridge}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:?set POSTGRES_PASSWORD in .env}
    volumes:
      - coolerbridge-postgres:/var/lib/postgresql
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER:-coolerbridge} -d ${POSTGRES_DB:-coolerbridge}"]
      interval: 5s
      timeout: 5s
      retries: 5

volumes:
  coolerbridge-postgres:
```

2. Copy the example env file:

   ```bash
   cp .env.example .env
   ```

3. Generate strong secrets for the database password and the pairing pepper:

   ```bash
   echo "POSTGRES_PASSWORD=$(openssl rand -base64 24)"
   echo "PAIRING_PEPPER=$(openssl rand -base64 32)"
   ```

   Paste the output into your `.env`, replacing the `change-me` placeholders.

4. Edit `.env` (see [Configuration](#configuration) below). The two generated secrets are all you need; the CoolerCloud key is already built in.

5. Start the stack:

   ```bash
   docker compose up -d
   ```

The bridge is now available on port `3000`. The database schema is applied automatically on startup.

### Configuration

All configuration is provided through environment variables.

| Variable            | Required | Description                                                                                                      |
| ------------------- | -------- | ---------------------------------------------------------------------------------------------------------------- |
| `NODE_ENV`          | yes      | `production` uses the baked-in CoolerCloud key and JWKS discovery; `development` reads the key from `dev/keys`.  |
| `POSTGRES_DB`       | no       | Database name for the bundled Postgres. Defaults to `coolerbridge`.                                              |
| `POSTGRES_USER`     | no       | Database user for the bundled Postgres. Defaults to `coolerbridge`.                                              |
| `POSTGRES_PASSWORD` | yes      | Database password. Set a strong, unique value. Generate with `openssl rand -base64 24`.                          |
| `DATABASE_URL`      | yes      | PostgreSQL connection string. In Compose it is derived from the `POSTGRES_*` values above.                       |
| `PAIRING_PEPPER`    | yes      | Secret pepper mixed into pairing code digests. Generate with `openssl rand -base64 32`.                          |
| `CLOUD_PUBLIC_KEY`  | no       | Advanced override for the baked-in CoolerCloud public key (Ed25519 SPKI, PEM). For development and testing only. |
| `CLOUD_JWKS_URL`    | no       | Advanced override for the JWKS discovery endpoint; set empty to disable discovery. For development and testing.  |
| `PORT`              | no       | Port the bridge listens on. Defaults to `3000`.                                                                  |

The API version is static (`v1`) and is **not** tied to the bridge's release version. It only changes when the public API itself does.

### Cloud trust

The bridge verifies every pairing and access assertion against CoolerCloud's Ed25519 public key. That key is a single, fixed value owned by Cooler, not something you generate, so the bridge **ships with it built in**. There is nothing to paste and no way to set the wrong value: pairing works out of the box.

Keys do get rotated over time. To keep up without a redeploy, the bridge also performs standard [JWKS](https://datatracker.ietf.org/doc/html/rfc7517) discovery against CoolerCloud and trusts newly published keys (matched by their `kid`) over HTTPS. The baked-in key remains the offline root of trust, so a bridge that can't reach the discovery endpoint still verifies assertions signed by a known key.

`CLOUD_PUBLIC_KEY` and `CLOUD_JWKS_URL` are advanced overrides for development and testing only, such as pointing a bridge at a non-production CoolerCloud or pinning trust to a single key. Leave both unset in normal use.

### Upgrading

As of `v2.0.0`, the CoolerCloud key ships baked into the image and `CLOUD_PUBLIC_KEY` is **no longer required**. Earlier versions demanded it in production; now the bridge verifies out of the box and picks up key rotation on its own.

If you set `CLOUD_PUBLIC_KEY` on an older version, remove it from your `.env` so the bridge uses the built-in key. Its only remaining purpose is an advanced override for development or testing (see [Cloud trust](#cloud-trust)).

### Push notifications

Push notifications are handled for you. There is nothing to set up, paste, or maintain on the bridge for them to work.

When an event is ingested, the bridge forwards it to [Expo](https://expo.dev), which fans it out to APNs (iOS) and FCM (Android) and delivers it to your linked devices. The push project and its credentials (APNs key, FCM key, and any access token) live in Cooler, not in your self-hosted bridge, so you never touch a push provider.

In practice, once Coolify is pointed at your bridge and your devices are linked through your CoolerCloud account, notifications simply arrive.

## Development

CoolerBridge is built with [Bun](https://bun.sh), [Hono](https://hono.dev), and [Drizzle ORM](https://orm.drizzle.team) on PostgreSQL.

1. Install dependencies:

   ```bash
   bun install
   ```

2. Start a local database:

   ```bash
   docker compose -f compose.dev.yaml up -d
   ```

3. Generate development keys (writes to `dev/keys`):

   ```bash
   bun gen:keys
   ```

4. Apply the schema and run the dev server:

   ```bash
   bun db:push
   bun dev
   ```

Useful scripts:

| Script            | Description                                 |
| ----------------- | ------------------------------------------- |
| `bun dev`         | Run the server in watch mode (development). |
| `bun test`        | Run the test suite.                         |
| `bun db:generate` | Generate a new migration from the schema.   |
| `bun db:migrate`  | Apply migrations.                           |
| `bun db:push`     | Push the schema directly to the database.   |
| `bun db:studio`   | Open Drizzle Studio.                        |

## Releases

Releases are automated through GitHub Actions and follow [Semantic Versioning](https://semver.org), derived from [Conventional Commits](https://www.conventionalcommits.org).

To cut a release, trigger the workflow:

```bash
bun run release
```

This dispatches the `Release` workflow, which:

1. Runs the test suite.
2. Inspects the commits since the last release and computes the next version (a `feat` bumps the minor, a `fix` the patch, and a breaking change the major).
3. Updates the version in `package.json`, commits it, and tags the release.
4. Builds and pushes the container image to the GitHub Container Registry.
5. Publishes a GitHub release with a grouped changelog of the included changes.

The `bun run release` script requires the [GitHub CLI](https://cli.github.com) to be installed and authenticated.

## Issues and feature requests

Don't forget: Cooler and, by extension, CoolerBridge, are **not** affiliated or endorsed by Coolify. While the [creator of Coolify](https://x.com/heyandras) has publicly acknowledged our project, this does **not** mean Andras (or anyone else on the Coolify team) is directly involved in this project.

As such, if you _do_ encounter issues with payload delivery or webhook reliability, please **do not** open issues or PRs under Coolify's own repository. Read our Wiki, confirm whether it is related to CoolerBridge or Coolify and then, **only** then, create an issue in the corresponding repository.

## License

See [LICENSE](LICENSE).
