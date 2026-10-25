# CoolerBridge

## What is this?

As the name implies, CoolerBridge is a bridge between your [Coolify](https://coolify.io) instance(s) and your [Cooler](https://getcooler.app) companion app.

In order to deliver notifications for your server(s) and respective resources, Cooler relies on a polling system that verifies whether something went wrong and alerts you about it.

This is both archaic and technically unsound; it drains the battery faster and, by all accounts, is anything _but_ reliable.

CoolerBridge's role is to replace that system with a proper webhook-based one, triggered **automatically** by your own Coolify instance(s). Coolify itself owns the flow; not Cooler.

## How does it work?

After setting up your webhook URL in Coolify, simply add it in Cooler, and you'll be good to go. The only thing Cooler ever sees is what Coolify sends over; nothing more, nothing less.

### Security

Coolify [does not add a signature or shared-secret header](https://coolify.io/docs/core/notifications/channels/webhook/setup) to its notification payloads. Naturally, this poses a real privacy/security threat, if not handled correctly.

To help mitigate these possible threats, CoolerBridge adds an opaque, cryptographically-random token to your endpoint URL:

```typescript
const secret = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("base64url")
```

The resulting URL will resemble the following:

`https://bridge.getcooler.app/v1/webhooks/coolify/YEm8oNOqhvYKjpyB3q...`

### Upstream changes

Cooler doesn't understand Coolify's API reference; instead, it only understands CoolerBridge's. This way, if Coolify makes changes that, say, alter the fields and/or their respective types, the only thing that needs to be updated is CoolerBridge - Cooler itself remains untouched (and unbothered).

The current payload reference can be read in-full [here](https://coolify.io/docs/core/notifications/channels/webhook/payload-reference).

## Issues and feature requests

Don't forget: Cooler and, by extension, CoolerBridge, are **not** affiliated or endorsed by Coolify. While the [creator of Coolify](https://x.com/heyandras) has publicly acknowledged our project, this does **not** mean Andras (or anyone else on the Coolify team) is directly involved in this project.

As such, if you _do_ encounter issues with payload delivery or webhook reliability, please **do not** open issues or PRs under Coolify's own repository. Read our Wiki, confirm whether it is related to CoolerBridge or Coolify and then, **only** then, create an issue in the corresponding repository.
