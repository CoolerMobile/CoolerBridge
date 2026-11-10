import { applyBump, parseCommits, resolveBump, type Commit } from "../../scripts/release"
import { describe, expect, test } from "bun:test"

// unit and record separators the git log format uses
const US = "\x1f"
const RS = "\x1e"

// build a minimal commit for the bump tests
const commit = (type: string, breaking = false): Commit => ({
  type,
  scope: null,
  breaking,
  subject: "subject",
  hash: "abc1234",
})

// mimic one git log record: hash US subject US body
const record = (hash: string, subject: string, body = "") => `${hash}${US}${subject}${US}${body}`

describe("resolveBump", () => {
  test("is a patch when there are only fixes and chores", () => {
    expect(resolveBump([commit("fix"), commit("chore")])).toBe("patch")
  })

  test("is a minor when any commit is a feat, even when the latest is only a fix", () => {
    // git log lists the latest first, so the feat sits behind a newer fix here
    expect(resolveBump([commit("fix"), commit("feat")])).toBe("minor")
  })

  test("is a major when any commit is breaking, even when the latest is only a feat", () => {
    expect(resolveBump([commit("feat"), commit("fix", true)])).toBe("major")
  })
})

describe("parseCommits", () => {
  test("parses every commit in the range, not just the first", () => {
    const raw =
      [record("h1", "feat(api)!: drop v0"), record("h2", "fix: a bug", "closes #1"), record("h3", "weird message")]
        .map((entry) => `${entry}${RS}`)
        .join("\n")

    const commits = parseCommits(raw)

    expect(commits).toHaveLength(3)
    expect(commits[0]).toMatchObject({ type: "feat", scope: "api", breaking: true, subject: "drop v0" })
    expect(commits[1]).toMatchObject({ type: "fix", scope: null, breaking: false, subject: "a bug" })
    expect(commits[2]).toMatchObject({ type: "other", subject: "weird message" })
  })

  test("detects a breaking change from the body", () => {
    const raw = `${record("h4", "feat: thing", "BREAKING CHANGE: removes x")}${RS}`
    expect(parseCommits(raw)[0].breaking).toBe(true)
  })
})

describe("applyBump", () => {
  test("a major resets the minor and patch", () => {
    expect(applyBump("1.6.2", "major")).toBe("2.0.0")
  })

  test("a minor resets the patch", () => {
    expect(applyBump("1.6.2", "minor")).toBe("1.7.0")
  })

  test("a patch increments the patch", () => {
    expect(applyBump("1.6.2", "patch")).toBe("1.6.3")
  })
})
