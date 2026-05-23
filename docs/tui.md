# Epoch TUI Modes

The Epoch TUI (Terminal User Interface) is designed to adapt its layout and behavior based on the specific phase of development you are in. It provides several "modes" that optimize the interface for different types of work, ranging from rapid chat to autonomous engineering and deep context investigation.

## 1. Navigation & View Modes

These define the top-level layout and focus of the terminal interface:

- **Home Mode**: The "landing page" of the TUI. It provides a clean, centered interface for starting new tasks or project-wide searches. It features intelligent placeholders (e.g., "Fix a TODO", "What is the tech stack?") based on your current project context.
- **Session Mode**: The primary workspace. This is a multi-pane environment where the conversation history, tool outputs, and the active agent live. It supports:
    - **Timeline Mode**: An overlay that lets you jump back to any previous point in the conversation or "fork" the session to explore a different implementation path.
    - **Sidebar Mode**: A toggleable panel that shows project metadata, active MCP servers, and a real-time **Todo list**.
        - **Automatic Synchronization**: ToDos are automatically parsed from the `Tasks.json` (or `tasks.json`) file of the most recently modified project in your `projects/` directory.
        - **Status Indicators**:
            - `[ ]`: **Pending**
            - `[/]`, `[-]`, `[~]`: **In Progress**
            - `[x]`, `[X]`: **Completed**
        - **Real-Time Updates**: The sidebar refreshes automatically at the start of a session and after every successful tool execution by the agent, ensuring it always reflects the latest state on disk.
- **Plugin Mode**: A fully extensible view that allows local or remote plugins to take over the entire terminal real estate to provide specialized tools (like a custom database explorer or log tailer).

## 2. Agent Execution Modes

These modes change how the underlying AI interacts with your system and the degree of autonomy it has:

- **Interactive Mode (Default)**: The standard "Human-in-the-loop" experience. The agent proposes actions, and you use the TUI's reactive dialogs to approve, reject, or provide feedback on specific tool calls. A muted **"Interactive"** indicator is visible in the prompt area when this mode is active.
- **YOLO Mode (Autonomous)**: Designed for trusted workflows where the agent can chain multiple tool calls autonomously until the task is complete.
    - **Activation**: Can be enabled via the `--yolo` flag, a slash command, or toggled globally at any time using **`Ctrl+Y`**.
    - **Feedback**: Displays a high-visibility **"YOLO"** or **"Autonomous Mode"** indicator. It remains reactive, showing the "chain of thought" in real-time while suppressing permission prompts for pre-approved tool patterns.
- **Subagent Mode**: When the primary agent delegates a task (e.g., "Analyze these logs"), the TUI can spawn a "Subagent View." This is a nested context where the subagent operates on a specific subset of tools and data, isolated from the main conversation.

## 3. Visual & Observability Modes

These are "toggles" within a session that help you manage cognitive load and information density:

- **Conceal Mode**: Toggles the visibility of large code blocks or tool outputs. When enabled, the TUI "folds" these blocks into single-line summaries, allowing you to focus on the conversation flow without losing the data.
- **Thinking Mode**: Controls the visibility of the agent's internal "Chain of Thought" (reasoning parts). You can choose to see the full reasoning process as it streams (useful for debugging agent logic) or hide it for a cleaner interface.
- **Diff View Mode**: When tools like `edit` or `write` are used, the TUI provides a reactive diff viewer. You can toggle between **Word Wrap** or **No Wrap** to better inspect complex architectural changes.
- **Focus Mode (Zen)**: While not a dedicated button, the TUI is designed to be "chrome-less" when the sidebar and footer are hidden, providing a minimalist environment that focuses entirely on the code and the agent's output.

## 4. System-Level Modes

- **Dark/Light Mode**: The TUI automatically detects your terminal's background color and applies an optimized theme (like Catppuccin, Dracula, or GitHub Dark) to ensure maximum legibility and aesthetic consistency.
- **Worker Isolation Mode**: For high-intensity tasks, the TUI can move its entire rendering loop to a background worker, ensuring the UI remains responsive at 60 FPS even if the main process is under heavy load.
