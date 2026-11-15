import { join } from "node:path"
import { ensureSynced } from "./preflight"

/**
 * dispatches a github workflow on the current branch
 *
 * workflows build what is on origin, so the tree is checked first and any
 * unpushed commits are offered for pushing
 *
 * @example bun scripts/dispatch.ts release.yml
 */

const [workflow, ...rest] = Bun.argv.slice(2)

if (!workflow || rest.length > 0) {
  console.error("Usage: bun scripts/dispatch.ts <workflow.yml>")
  process.exit(1)
}

const branch = ensureSynced()

const result = Bun.spawnSync(["gh", "workflow", "run", workflow, "--ref", branch], {
  cwd: join(import.meta.dir, ".."),
  stdout: "inherit",
  stderr: "inherit",
})

if (result.success) console.log(`Dispatched ${workflow} on ${branch}.`)

process.exit(result.exitCode ?? 1)
