const chatLog = document.getElementById("chatLog");
const promptInput = document.getElementById("promptInput");
const sendBtn = document.getElementById("sendBtn");
const apiBaseInput = document.getElementById("apiBase");
const sessionInfo = document.getElementById("sessionInfo");
const messageTemplate = document.getElementById("messageTemplate");

let sessionId = null;
let isRunning = false;
const API_CANDIDATES = ["http://localhost:3001", "http://localhost:3000"];

function nowStamp() {
  return new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function addMessage(role, body) {
  const node = messageTemplate.content.firstElementChild.cloneNode(true);
  node.classList.add(role);
  node.querySelector(".role").textContent = role.toUpperCase();
  node.querySelector(".stamp").textContent = nowStamp();

  const bodyEl = node.querySelector(".message-body");
  if (typeof body === "string") {
    bodyEl.textContent = body;
  } else {
    bodyEl.appendChild(body);
  }

  chatLog.appendChild(node);
  chatLog.scrollTop = chatLog.scrollHeight;
}

function tryParseJsonString(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  try {
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
}

function extractJsonFromFencedBlock(value) {
  if (typeof value !== "string") return null;
  const match = value.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (!match) return null;
  return tryParseJsonString(match[1]);
}

function getReadableAssistantText(output) {
  const raw = output?.formattedResponse;

  if (typeof raw !== "string") {
    return "No formatted response was returned.";
  }

  const fromDirectJson = tryParseJsonString(raw);
  if (fromDirectJson && typeof fromDirectJson.formattedResponse === "string") {
    return fromDirectJson.formattedResponse;
  }

  const fromFencedJson = extractJsonFromFencedBlock(raw);
  if (fromFencedJson && typeof fromFencedJson.formattedResponse === "string") {
    return fromFencedJson.formattedResponse;
  }

  return raw;
}

function buildTraceBlock(trace = []) {
  const wrapper = document.createElement("div");
  wrapper.className = "step-block";

  const title = document.createElement("div");
  title.className = "step-title";
  title.textContent = "Pipeline Steps";
  wrapper.appendChild(title);

  if (!trace.length) {
    const empty = document.createElement("div");
    empty.textContent = "No trace available.";
    wrapper.appendChild(empty);
    return wrapper;
  }

  for (const entry of trace) {
    const row = document.createElement("div");
    row.className = "step-row";

    const stage = (entry.phase || "unknown").toUpperCase();
    const action = entry.action || "";
    const duration = entry.durationMs ? ` (${entry.durationMs}ms)` : "";
    const reasoning = entry.reasoning ? `\nReasoning: ${entry.reasoning}` : "";

    row.textContent = `${stage}${duration}\n${action}${reasoning}`;
    wrapper.appendChild(row);
  }

  return wrapper;
}

async function triggerPipeline(userMessage) {
  const base = apiBaseInput.value.trim().replace(/\/$/, "");
  const payload = { userMessage };
  if (sessionId) payload.sessionId = sessionId;

  const res = await fetch(`${base}/message`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to trigger pipeline via ${base}/message: ${res.status} ${text}`);
  }

  return res.json();
}

async function getStatus(runId) {
  const base = apiBaseInput.value.trim().replace(/\/$/, "");
  const res = await fetch(`${base}/status/${runId}`);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Status check failed via ${base}/status/${runId}: ${res.status} ${text}`);
  }
  return res.json();
}

async function autoDetectApiBase() {
  for (const base of API_CANDIDATES) {
    try {
      const res = await fetch(`${base}/health`);
      if (!res.ok) continue;
      const data = await res.json();
      if (data.status === "ok") {
        apiBaseInput.value = base;
        addMessage("system", `Detected API base: ${base}`);
        return;
      }
    } catch {
      // try next
    }
  }

  addMessage(
    "system",
    "Could not auto-detect API server. Ensure backend is running and set API Base manually."
  );
}

function isTerminal(status) {
  return ["COMPLETED", "FAILED", "CANCELED"].includes(status);
}

async function pollUntilDone(runId) {
  let lastStatus = null;

  while (true) {
    const data = await getStatus(runId);

    if (data.status !== lastStatus) {
      addMessage("system", `Run ${runId}: ${data.status}`);
      lastStatus = data.status;
    }

    if (isTerminal(data.status)) {
      return data;
    }

    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
}

async function onSend() {
  if (isRunning) return;

  const text = promptInput.value.trim();
  if (!text) return;

  isRunning = true;
  sendBtn.disabled = true;

  addMessage("user", text);
  promptInput.value = "";

  try {
    const trigger = await triggerPipeline(text);
    sessionId = trigger.sessionId;
    sessionInfo.textContent = `Session: ${sessionId}`;

    addMessage("system", `Pipeline started (run ${trigger.runId})`);

    const final = await pollUntilDone(trigger.runId);

    if (final.status !== "COMPLETED") {
      addMessage("assistant", `Run finished with status: ${final.status}`);
      return;
    }

    const output = final.output || {};
    const responseText = getReadableAssistantText(output);

    const wrap = document.createElement("div");
    const finalText = document.createElement("div");
    finalText.textContent = responseText;
    wrap.appendChild(finalText);

    wrap.appendChild(buildTraceBlock(output.trace || []));

    if ((output.notifications || []).length) {
      const notif = document.createElement("div");
      notif.className = "step-block";
      notif.textContent = `Notifications queued: ${output.notifications.length}`;
      wrap.appendChild(notif);
    }

    addMessage("assistant", wrap);
  } catch (error) {
    addMessage("assistant", `Error: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    isRunning = false;
    sendBtn.disabled = false;
    promptInput.focus();
  }
}

sendBtn.addEventListener("click", onSend);
promptInput.addEventListener("keydown", (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
    onSend();
  }
});

addMessage(
  "system",
  "Ready. Ask a marketing question.\nTip: use Ctrl+Enter (Cmd+Enter on Mac) to send."
);

autoDetectApiBase();
