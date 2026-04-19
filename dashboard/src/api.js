async function parseJsonResponse(response, fallbackMessage) {
  let payload = {};

  try {
    payload = await response.json();
  } catch {
    payload = {};
  }

  if (!response.ok) {
    throw new Error(payload.error || payload.details || fallbackMessage);
  }

  return payload;
}

export async function fetchMessages(signal, project) {
  const params = new URLSearchParams();

  if (project) {
    params.set("project", project);
  }

  const suffix = params.size > 0 ? `?${params.toString()}` : "";
  const response = await fetch(`/api/messages${suffix}`, {
    cache: "no-store",
    signal
  });

  return parseJsonResponse(response, `Mailbox API returned ${response.status}`);
}

export async function archiveMessage({ relativePath, resolution }) {
  const response = await fetch("/api/archive", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      relativePath,
      resolution
    })
  });

  return parseJsonResponse(response, `Archive API returned ${response.status}`);
}

export async function postNote({ relativePath, note }) {
  const response = await fetch("/api/notes", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      relativePath,
      note
    })
  });

  return parseJsonResponse(response, `Notes API returned ${response.status}`);
}

export async function fetchAgentMessages({ project, signal } = {}) {
  if (!project) {
    throw new Error("project is required for fetchAgentMessages");
  }
  const params = new URLSearchParams({ project });
  const response = await fetch(`/api/agent/messages?${params.toString()}`, {
    cache: "no-store",
    signal
  });
  return parseJsonResponse(response, `Agent API returned ${response.status}`);
}
