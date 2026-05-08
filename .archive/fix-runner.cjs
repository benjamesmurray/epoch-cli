const fs = require('fs');
const content = fs.readFileSync('e2e_testing/harness/src/AgentRunner.ts', 'utf8');

const oldCode = `               } catch (e) {
                  if (e instanceof LoopException) {
                    controller.abort();
                    status = "Killed_Loop";
                    errorMessage = e.message;
                    return; // Stop reading on loop detection
                  }
                  throw e;
                }`;

const newCode = `               } catch (e) {
                  if (e instanceof LoopException) {
                    controller.abort();
                    proc.kill(9); // Forceful kill
                    status = "Killed_Loop";
                    errorMessage = e.message;
                    return; // Stop reading on loop detection
                  }
                  throw e;
                }`;

fs.writeFileSync('e2e_testing/harness/src/AgentRunner.ts', content.replace(oldCode, newCode));
