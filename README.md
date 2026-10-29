# CoolerBridge

CoolerBridge is a self-hostable bridge between your [Coolify](https://coolify.io) instance(s) and your [Cooler](https://getcooler.app) companion app. It turns Coolify's notifications into real-time push notifications on your devices, without polling.

## What is this?

As the name implies, CoolerBridge is a bridge between your [Coolify](https://coolify.io) instance(s) and your [Cooler](https://getcooler.app) companion app.

In order to deliver notifications for your server(s) and respective resources, Cooler relies on a polling system that verifies whether something went wrong and alerts you about it.

This is both archaic and technically unsound; it drains the battery faster and, by all accounts, is anything _but_ reliable.

CoolerBridge's role is to replace that system with a proper webhook-based one, triggered **automatically** by your own Coolify instance(s). Coolify itself owns the flow; not Cooler.

## How does it work?

After setting up your webhook URL in Coolify, simply add it in Cooler, and you'll be good to go. The only thing Cooler ever sees is what Coolify sends over; nothing more, nothing less.

In short:

1. Coolify sends a notification to your CoolerBridge webhook URL.
2. CoolerBridge normalizes the payload and stores it as an event, scoped to the originating bridge.
3. Linked devices are notified over push (APNs for iOS, FCM for Android).
4. Cooler reads the event through CoolerBridge's own API.

### Features

- Webhook ingestion for Coolify notifications, with a cryptographically-random token in the URL.
- Per-bridge isolation so events never leak across instances.
- Cloud pairing and token exchange backed by Ed25519 assertions.
- Scoped sessions modeled on Coolify's own permission scopes.
- Push dispatch to linked devices via APNs and FCM.

### Security

Coolify [does not add a signature or shared-secret header](https://coolify.io/docs/core/notifications/channels/webhook/setup) to its notification payloads. Naturally, this poses a real privacy/security threat, if not handled correctly.

To help mitigate these possible threats, CoolerBridge adds an opaque, cryptographically-random token to your endpoint URL:

```typescript
const secret = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("base64url")
```

The resulting URL will resemble the following:

`https://bridge.getcooler.app/v1/webhooks/coolify/YEm8oNOqhvYKjpyB3q...`

### Upstream changes

Cooler doesn't understand Coolify's API reference; instead, it only understands CoolerBridge's. This way, if Coolify makes changes that, say, alter the fields and/or their respective types, the only thing that needs to be updated is CoolerBridge: Cooler itself remains untouched (and unbothered).

The current payload reference can be read in-full [here](https://coolify.io/docs/core/notifications/channels/webhook/payload-reference).

## Getting started

CoolerBridge ships as a container image published to the GitHub Container Registry. The quickest way to self-host it is with the provided Compose file, which runs the bridge alongside its PostgreSQL database.

### Requirements

- [Docker](https://docs.docker.com/get-docker/) with Compose, for self-hosting.
- A running [Coolify](https://coolify.io) instance.
- The Cooler cloud public key, used to verify pairing and access assertions.

### Run with Compose

1. Copy the example env file:

   ```bash
   cp .env.example .env
   ```

2. Generate strong secrets for the database password and the pairing pepper:

   ```bash
   echo "POSTGRES_PASSWORD=$(openssl rand -base64 24)"
   echo "PAIRING_PEPPER=$(openssl rand -base64 32)"
   ```

   Paste the output into your `.env`, replacing the `change-me` placeholders.

3. Edit `.env` (see [Configuration](#configuration) below). Besides the secrets above, set `CLOUD_PUBLIC_KEY`.

4. Start the stack:

   ```bash
   docker compose up -d
   ```

The bridge is now available on port `3000`. The database schema is applied automatically on startup.

### Configuration

All configuration is provided through environment variables.

| Variable            | Required          | Description                                                                                       |
| ------------------- | ----------------- | ------------------------------------------------------------------------------------------------- |
| `NODE_ENV`          | yes               | `production` reads the cloud key from `CLOUD_PUBLIC_KEY`; `development` reads it from `dev/keys`.  |
| `POSTGRES_DB`       | no                | Database name for the bundled Postgres. Defaults to `coolerbridge`.                                |
| `POSTGRES_USER`     | no                | Database user for the bundled Postgres. Defaults to `coolerbridge`.                                |
| `POSTGRES_PASSWORD` | yes               | Database password. Set a strong, unique value. Generate with `openssl rand -base64 24`.           |
| `DATABASE_URL`      | yes               | PostgreSQL connection string. In Compose it is derived from the `POSTGRES_*` values above.         |
| `CLOUD_PUBLIC_KEY`  | yes in production | Cooler cloud public key (Ed25519 SPKI, PEM). On a single line, with `\n` for newlines.            |
| `PAIRING_PEPPER`    | yes               | Secret pepper mixed into pairing code digests. Generate with `openssl rand -base64 32`.            |
| `PORT`              | no                | Port the bridge listens on. Defaults to `3000`.                                                   |

The API version is static (`v1`) and is **not** tied to the bridge's release version. It only changes when the public API itself does.

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

| Script             | Description                                      |
| ------------------ | ------------------------------------------------ |
| `bun dev`          | Run the server in watch mode (development).      |
| `bun test`         | Run the test suite.                              |
| `bun db:generate`  | Generate a new migration from the schema.        |
| `bun db:migrate`   | Apply migrations.                                |
| `bun db:push`      | Push the schema directly to the database.        |
| `bun db:studio`    | Open Drizzle Studio.                             |

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
