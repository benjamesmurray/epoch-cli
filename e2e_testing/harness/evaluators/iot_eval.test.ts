import { expect, test, describe } from "bun:test";

const TARGET_URL = process.env.TARGET_URL || "http://localhost:8080";
const WS_URL = TARGET_URL.replace(/^http/, "ws");

describe("IoT Controller Black-Box Evaluation", () => {
  
  test("Requirement 5: Web Dashboard is serving HTTP", async () => {
    const res = await fetch(TARGET_URL);
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text.toLowerCase()).toContain("html");
  });

  test("Requirement 4: REST API returns historical logs", async () => {
    const res = await fetch(`${TARGET_URL}/api/history`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(Array.isArray(data)).toBe(true);
  });

  test("Requirement 1 & 4: Device Simulator & WebSocket broadcast live updates", async () => {
    return new Promise((resolve, reject) => {
      const socket = new WebSocket(WS_URL);
      let messageReceived = false;

      const timeout = setTimeout(() => {
        socket.close();
        if (!messageReceived) {
          reject(new Error("Timed out waiting for WebSocket 'device_state' message. Check if simulator is ticking."));
        }
      }, 5000);

      socket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === "device_state" || data.type === "rule_trigger") {
            messageReceived = true;
            clearTimeout(timeout);
            socket.close();
            resolve();
          }
        } catch (e) {
          // Ignore parse errors for non-JSON heartbeats
        }
      };

      socket.onerror = (err) => {
        reject(new Error(`WebSocket connection error to ${WS_URL}: ${err}`));
      };
    });
  });

});
