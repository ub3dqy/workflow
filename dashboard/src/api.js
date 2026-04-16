export async function fetchMessages(signal) {
  const response = await fetch("/api/messages", {
    cache: "no-store",
    signal
  });

  if (!response.ok) {
    throw new Error(`Mailbox API returned ${response.status}`);
  }

  return response.json();
}
