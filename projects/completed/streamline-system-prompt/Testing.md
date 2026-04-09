# Testing

## Manual Testing Steps
1. Run `bun run dev run "Hi"` in the terminal.
2. Check the `.agent_logs/audit.log` or the console output to verify the system prompt payload.
3. Observe that the payload size is noticeably smaller.
4. Verify that "Skills provide specialized instructions..." is no longer printed.
5. Verify that the `<directories>` ... `</directories>` element is no longer printed.
6. Verify that the CLI successfully responds to the message (e.g. outputs "Hello!").

## Feedback
Testing is complete and visually verified during the implementation phase.
