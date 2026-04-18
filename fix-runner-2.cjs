const fs = require('fs');
const content = fs.readFileSync('e2e_testing/harness/src/AgentRunner.ts', 'utf8');

const oldCode2 = `               } catch (e) {
                   if (e instanceof LoopException) {
                    controller.abort();
                    status = "Killed_Loop";
                    errorMessage = e.message;
                  }
               }`;

const newCode2 = `               } catch (e) {
                   if (e instanceof LoopException) {
                    controller.abort();
                    proc.kill(9);
                    status = "Killed_Loop";
                    errorMessage = e.message;
                  }
               }`;

fs.writeFileSync('e2e_testing/harness/src/AgentRunner.ts', content.replace(oldCode2, newCode2));
