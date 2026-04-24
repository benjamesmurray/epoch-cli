# Model Configuration Guide

Epoch CLI utilizes a **Dual-Model Architecture** optimized for high-performance coding and reliable background supervision. This environment uses a unified proxy architecture (**llama-swap**) to manage model transitions efficiently.

## 1. Unified Architecture (llama-swap)

Instead of managing separate URLs and ports, all models are served through a single transparent proxy on one port. This allows the system to dynamically swap models in VRAM as needed while maintaining a consistent client configuration.

*   **Unified API Endpoint:** `http://localhost:8085/v1`
*   **Protocol:** OpenAI Compatible
*   **Authentication:** Shared API Key (e.g., `2250`)

## 2. Configuration (`epochcli.jsonc`)

Your configuration should define both `local-main` (Coding) and `local-side` (Supervisor) providers pointing to the same endpoint. The proxy handles the routing based on the `model` ID requested in the payload.

### Unified Setup Example

```jsonc
{
  "model": "local-main/qwen3.6-35b-a3b-coding", 
  "side_model": "local-side/nemotron-3-nano",
  "provider": {
    "local-main": {
      "npm": "@ai-sdk/openai-compatible",
      "name": "Local Main (Coding)",
      "options": {
        "baseURL": "http://localhost:8085/v1",
        "apiKey": "2250"
      },
      "models": {
        "qwen3.6-35b-a3b-coding": { 
          "name": "Qwen 3.6 35B Coding",
          "limit": { "context": 64000, "output": 4096 }
        }
      }
    },
    "local-side": {
      "npm": "@ai-sdk/openai-compatible",
      "name": "Local Side (Clerk)",
      "options": {
        "baseURL": "http://localhost:8085/v1",
        "apiKey": "2250"
      },
      "models": {
        "nemotron-3-nano": { 
          "name": "Nemotron 3 Nano",
          "limit": { "context": 32000, "output": 2048 }
        }
      }
    }
  }
}
```

## 3. How Epoch CLI Identifies Models

Epoch CLI uses **keyword matching** on the Model ID string to apply specific architectural optimizations. You do not need to manually configure prompts or behaviors for different models as long as the ID is named correctly:

*   **Qwen Optimized:** If the ID contains `"qwen"` (e.g., `qwen3.6-35b-a3b-coding`), the CLI automatically sets the temperature to `0.55` and Top-P to `1.0`.
*   **Gemma Optimized:** If the ID contains `"gemma-4"`, the CLI enables reasoning token injection (`<|think|>`), specialized system prompts, and the Three-Stage Sanitizer to repair potential JSON errors.

## 4. Operational Considerations

### The "Cold Start" (Model Swapping)
The environment uses a **SWAP approach** to maximize VRAM for high-context models. Only one model is active in memory at a time.
*   **Instant Response:** If you request the model that is already "hot" in memory.
*   **Swap Delay:** If you request a model that is currently swapped out, the proxy will load it automatically. This adds a **15–20 second delay** to the first request.

### Context Persistence & TTL
Models stay active in VRAM for **60 minutes** of inactivity before being automatically unloaded. This ensures subsequent requests within the same hour are nearly instantaneous.

## 5. Monitoring & Maintenance

*   **Dashboard:** You can monitor which model is currently active and view proxy status at `http://localhost:8085/ui`.
*   **Restart Stack:** If you need to restart the entire dual-model stack, use the provided launch script:
    ```bash
    /home/llm/utils/launch/launch-dual.sh
    ```
