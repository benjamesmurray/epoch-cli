const fs = require("fs");
const file = "packages/epochcli/src/session/processor.ts";
let content = fs.readFileSync(file, "utf8");
content = content.replace(/\.provide\(SessionStatus\.layer\.pipe\(Layer\.provide\(Bus\.layer\)\)\),\n        Layer\.provide\(Bus\.layer\),\n        Layer\.provide\(Config\.defaultLayer\),\n      \),\n    \),\n  \)\n}\n\.provide\(SessionStatus\.layer\.pipe\(Layer\.provide\(Bus\.layer\)\)\),\n        Layer\.provide\(Bus\.layer\),\n        Layer\.provide\(Config\.defaultLayer\),\n      \),\n    \),\n  \)\n}/, ".provide(SessionStatus.layer.pipe(Layer.provide(Bus.layer))),\n        Layer.provide(Bus.layer),\n        Layer.provide(Config.defaultLayer),\n      ),\n    ),\n  )\n}");
fs.writeFileSync(file, content, "utf8");
