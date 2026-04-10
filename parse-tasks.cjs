const fs = require('fs');
const content = fs.readFileSync('projects/active/gemma-4-dual-model/Tasks.md', 'utf8');

const tasks = [];
let stack = [];

const lines = content.split('\n');
for (const line of lines) {
    const match = line.match(/^(\s*)-\s*\[([ xX])\]\s*(.*)$/);
    if (match) {
        const indent = match[1].length;
        const completed = match[2] === 'x' || match[2] === 'X';
        const rawText = match[3];

        // Extract ID
        let id = '';
        let title = rawText;
        const idMatch = rawText.match(/^([0-9\.]+)\.\s*(.*)$/);
        if (idMatch) {
            id = idMatch[1];
            title = idMatch[2];
        }

        const task = { id, title, completed, indent, children: [] };
        
        while (stack.length > 0 && stack[stack.length - 1].indent >= indent) {
            stack.pop();
        }

        if (stack.length > 0) {
            stack[stack.length - 1].children.push(task);
        } else {
            tasks.push(task);
        }
        stack.push(task);
    }
}
console.log(JSON.stringify(tasks, null, 2));

const areTasksDone = (ts) => ts.every(t => t.completed && (t.children.length === 0 || areTasksDone(t.children)));
console.log("All complete?", tasks.length > 0 && areTasksDone(tasks));
