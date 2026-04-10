const { lexer } = require('marked');
const fs = require('fs');

const content = fs.readFileSync('projects/active/gemma-4-dual-model/Tasks.md', 'utf8');
const tokens = lexer(content);

let tasks = [];
function processTokens(toks) {
  for (const t of toks) {
    if (t.type === 'list_item') {
      const firstLine = t.text.split('\n')[0];
      const textToMatch = firstLine.replace(/^\[[ xX]\]\s+/, '').trim();
      const match = textToMatch.match(/^(\d+(?:\.\d+)*)\.?(.*)$/);
      if (match) {
        tasks.push({ id: match[1], completed: !!t.checked });
      }
    }
    if (t.tokens) processTokens(t.tokens);
    if (t.items) processTokens(t.items);
  }
}
processTokens(tokens);

console.log(tasks);
