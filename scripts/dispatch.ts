import { join } from "node:path"
import { ensureSynced } from "./preflight"

/**
 * dispatches a github workflow on the default branch
 *
 * releases and docs are only ever cut from the default branch, and workflows
 * build what is on origin, so this must run from that branch with the tree
 * checked first and any unpushed commits offered for pushing
 *
 * @example bun scripts/dispatch.ts release.yml
 */

const root = join(import.meta.dir, "..")

const [workflow, ...rest] = Bun.argv.slice(2)

if (!workflow || rest.length > 0) {
  console.error("Usage: bun scripts/dispatch.ts <workflow.yml>")
  process.exit(1)
}

// default branch as origin reports it, main when origin does not say
const originHead = Bun.spawnSync(["git", "symbolic-ref", "--short", "refs/remotes/origin/HEAD"], {
  cwd: root,
})
const defaultBranch = originHead.success
  ? new TextDecoder()
      .decode(originHead.stdout)
      .trim()
      .replace(/^origin\//, "")
  : "main"

const current = Bun.spawnSync(["git", "branch", "--show-current"], { cwd: root })
const branch = new TextDecoder().decode(current.stdout).trim()

if (branch !== defaultBranch) {
  console.error(
    `\n${workflow} is only dispatched from ${defaultBranch}. Switch to ${defaultBranch} and run this again.\n`
  )
  process.exit(1)
}

ensureSynced()

const result = Bun.spawnSync(["gh", "workflow", "run", workflow, "--ref", branch], {
  cwd: root,
  stdout: "inherit",
  stderr: "inherit",
})

if (result.success) console.log(`Dispatched ${workflow} on ${branch}.`)

process.exit(result.exitCode ?? 1)
