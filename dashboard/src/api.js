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

export async function fetchMessages(signal) {
  const response = await fetch("/api/messages", {
    cache: "no-store",
    signal
  });

  return parseJsonResponse(response, `Mailbox API returned ${response.status}`);
}

export async function postReply({ to, thread, body, replyTo }) {
  const response = await fetch("/api/reply", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      to,
      thread,
      body,
      reply_to: replyTo
    })
  });

  return parseJsonResponse(response, `Reply API returned ${response.status}`);
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
