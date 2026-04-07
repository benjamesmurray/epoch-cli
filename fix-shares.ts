import fs from "fs"

const testFile = "packages/epoch/test/storage/json-migration.test.ts"
let content = fs.readFileSync(testFile, "utf-8")
content = content.replace('import { SessionShareTable } from "../../src/share/share.sql"\n', "")
content = content.replace('  await fs.mkdir(path.join(storageDir, "session_share"), { recursive: true })\n', "")
content = content.replace(/  test\("migrates session shares", async \(\) => \{[\s\S]*?\}\)\n\n/, "")
content = content.replace(/    expect\(stats\?.shares\)\.toBe\(1\)\n/g, "")
content = content.replace(/    expect\(stats\.shares\)\.toBe\(0\)\n/g, "")
content = content.replace(/    expect\(stats\.shares\)\.toBe\(1\)\n/g, "")
content = content.replace(/    expect\(db\.select\(\)\.from\(SessionShareTable\)\.all\(\)\.length\)\.toBe\(1\)\n/g, "")
content = content.replace(/    await Bun\.write\([\s\S]*?"session_share"[\s\S]*?\)\n/g, "")
content = content.replace(/    expect\(db\.select\(\)\.from\(SessionShareTable\)\.all\(\)\.length\)\.toBe\(1\)\n/g, "")
fs.writeFileSync(testFile, content)

const githubFile = "packages/epoch/src/cli/cmd/github.ts"
let githubContent = fs.readFileSync(githubFile, "utf-8")
githubContent = githubContent.replace(/          await Session\.share\(session\.id\)\n/g, "")
fs.writeFileSync(githubFile, githubContent)

const sessionRoutesFile = "packages/epoch/src/server/routes/session.ts"
let sessionRoutesContent = fs.readFileSync(sessionRoutesFile, "utf-8")
sessionRoutesContent = sessionRoutesContent.replace(/        await Session\.share\(sessionID\)\n/g, "")
fs.writeFileSync(sessionRoutesFile, sessionRoutesContent)

console.log("Done")
