const { Stream, Effect } = require("effect")
Stream.runCollect(Stream.empty).pipe(Effect.runPromise).then(console.log)
