import fs from "fs"

const migrationFile = "packages/epoch/src/storage/json-migration.ts"
let content = fs.readFileSync(migrationFile, "utf-8")

// Remove the shares field from the return object
content = content.replace(/        permissions: 0,\n        shares: 0,\n        errors: \[\] as string\[\],\n      }/g, "        permissions: 0,\n        errors: [] as string[],\n      }")

// Remove the shares block entirely
const startMarker = "    // Migrate session shares"
const endMarker = '    sqlite.exec("COMMIT")'

const startIdx = content.indexOf(startMarker)
const endIdx = content.indexOf(endMarker, startIdx)
if (startIdx !== -1 && endIdx !== -1) {
  content = content.substring(0, startIdx) + content.substring(endIdx)
}

fs.writeFileSync(migrationFile, content)

const testFile = "packages/epoch/test/storage/json-migration.test.ts"
let testContent = fs.readFileSync(testFile, "utf-8")
// Fix any remaining `SessionShareTable` references
testContent = testContent.replace(/    const shares = db\.select\(\)\.from\(SessionShareTable\)\.all\(\)\n    expect\(shares\.length\)\.toBe\(1\)\n    expect\(shares\[0\]\.session_id\)\.toBe\("ses_test456def"\)\n    expect\(shares\[0\]\.id\)\.toBe\("share_123"\)\n    expect\(shares\[0\]\.secret\)\.toBe\("supersecretkey"\)\n    expect\(shares\[0\]\.url\)\.toBe\("https:\/\/share\.example\.com\/ses_test456def"\)\n/g, "")
testContent = testContent.replace(/    expect\(db\.select\(\)\.from\(SessionShareTable\)\.all\(\)\.length\)\.toBe\(1\)\n/g, "")

fs.writeFileSync(testFile, testContent)

console.log("Done")
