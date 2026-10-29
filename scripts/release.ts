import { $ } from "bun"
import { appendFile } from "node:fs/promises"
import pkg from "../package.json"

/**
 * computes the next semantic version from the commits since the last release and
 * writes the bump, the new version and the grouped release notes
 *
 * the api version is intentionally never touched here, it is static and lives in src/config.ts
 *
 * @see https://www.conventionalcommits.org
 */

// conventional commit shape
type Commit = {
  type: string
  scope: string | null
  breaking: boolean
  subject: string
  hash: string
}

// semantic bump kind, ordered by weight
type Bump = "major" | "minor" | "patch"

// unit and record separators used to split the git log safely
const US = "\x1f"
const RS = "\x1e"

// conventional commit parser: type(scope)!: subject
const COMMIT_RE = /^(\w+)(?:\(([^)]+)\))?(!)?:\s*(.+)$/

// commit type to human readable section title, order defines section order
const SECTIONS: Record<string, string> = {
  feat: "Features",
  fix: "Fixes",
  perf: "Performance",
  refactor: "Refactoring",
  docs: "Documentation",
}

/**
 * reads the most recent release tag, or null when none exists yet
 *
 * @returns latest "v*" tag or null
 */
const lastTag = async (): Promise<string | null> => {
  const out = await $`git tag --list "v*" --sort=-v:refname`.text()
  const tags = out.split("\n").filter(Boolean)
  return tags[0] ?? null
}

/**
 * collects the commits since `from` (exclusive), or the whole history when null
 *
 * @param from tag to start from, exclusive
 * @returns parsed conventional commits
 */
const commitsSince = async (from: string | null): Promise<Commit[]> => {
  const range = from ? `${from}..HEAD` : "HEAD"
  const format = `%H${US}%s${US}%b${RS}`
  const out = await $`git log ${range} --no-merges --pretty=format:${format}`.text()

  return out
    .split(RS)
    .map((record) => record.trim())
    .filter(Boolean)
    .map((record) => {
      const [hash, subject, body] = record.split(US)
      const match = subject.match(COMMIT_RE)

      // keep unconventional commits around under the "other" bucket
      if (!match) {
        return { type: "other", scope: null, breaking: false, subject, hash }
      }

      const [, type, scope, bang, description] = match
      const breaking = Boolean(bang) || /BREAKING CHANGE/.test(body ?? "")

      return { type, scope: scope ?? null, breaking, subject: description, hash }
    })
}

/**
 * decides the bump from the commit set
 *
 * breaking wins, then feat, then everything else is a patch since the release was requested on purpose
 *
 * @param commits parsed commits
 * @returns the bump to apply
 */
const resolveBump = (commits: Commit[]): Bump => {
  if (commits.some((commit) => commit.breaking)) return "major"
  if (commits.some((commit) => commit.type === "feat")) return "minor"
  return "patch"
}

/**
 * applies a bump to a semver string
 *
 * @param version current version
 * @param bump bump to apply
 * @returns the next version
 */
const applyBump = (version: string, bump: Bump): string => {
  const [major, minor, patch] = version.split(".").map((part) => Number(part) || 0)

  switch (bump) {
    case "major":
      return `${major + 1}.0.0`
    case "minor":
      return `${major}.${minor + 1}.0`
    case "patch":
      return `${major}.${minor}.${patch + 1}`
  }
}

/**
 * builds the grouped markdown body for the release
 *
 * github auto generates the "What's Changed" and "Full Changelog" sections, so this only
 * owns the curated, human readable summary that sits on top
 *
 * @param commits parsed commits
 * @returns markdown notes
 */
const renderNotes = (commits: Commit[]): string => {
  const lines: string[] = []

  // breaking changes always lead
  const breaking = commits.filter((commit) => commit.breaking)
  if (breaking.length > 0) {
    lines.push("## Breaking Changes", "")
    for (const commit of breaking) lines.push(`- ${format(commit)}`)
    lines.push("")
  }

  // one section per known type, skipping breaking ones already listed above
  for (const [type, title] of Object.entries(SECTIONS)) {
    const group = commits.filter((commit) => commit.type === type && !commit.breaking)
    if (group.length === 0) continue

    lines.push(`## ${title}`, "")
    for (const commit of group) lines.push(`- ${format(commit)}`)
    lines.push("")
  }

  return lines.join("\n").trim()
}

/**
 * formats a single commit line with an optional scope prefix
 *
 * @param commit commit to format
 * @returns bullet text
 */
const format = (commit: Commit): string => {
  const scope = commit.scope ? `**${commit.scope}:** ` : ""
  return `${scope}${commit.subject} (${commit.hash.slice(0, 7)})`
}

/**
 * exposes a value to later workflow steps via $GITHUB_OUTPUT when running in actions
 *
 * @param key output name
 * @param value output value
 */
const output = async (key: string, value: string) => {
  const file = Bun.env.GITHUB_OUTPUT
  if (!file) return
  await appendFile(file, `${key}=${value}\n`)
}

// resolve the previous tag, the commits since, and the resulting version
const previous = await lastTag()
const commits = await commitsSince(previous)

if (commits.length === 0) {
  console.error("No commits since the last release. Nothing to do.")
  process.exit(1)
}

const bump = resolveBump(commits)
const version = applyBump(pkg.version, bump)
const tag = `v${version}`
const notes = renderNotes(commits)

// persist the new version in package.json
const manifest = { ...pkg, version }
await Bun.write("package.json", `${JSON.stringify(manifest, null, 2)}\n`)

// write the curated notes for the release step to pick up
await Bun.write("RELEASE_NOTES.md", `${notes}\n`)

// hand the computed values to the workflow
await output("version", version)
await output("tag", tag)
await output("bump", bump)
await output("previous", previous ?? "")

console.info(`Bump: ${bump}`)
console.info(`Version: ${pkg.version} -> ${version}`)
console.info(`Tag: ${tag}`)
console.info(`Commits: ${commits.length}`)
