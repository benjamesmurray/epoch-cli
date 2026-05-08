const { spawn } = require("child_process");

const massiveText = "A".repeat(80000);

const cp = spawn("bun", ["packages/epochcli/src/cli.ts", "run", "Test", "-m", "openai:gpt-3.5-turbo", "Tell me about " + massiveText], {
  env: { ...process.env, OPENAI_API_KEY: "none", OPENAI_API_BASE_URL: "http://0.0.0.0:8085/v1" }
});

cp.stdout.on("data", (d) => process.stdout.write(d));
cp.stderr.on("data", (d) => process.stderr.write(d));

cp.on("close", (code) => {
  console.log("Finished with code", code);
});
