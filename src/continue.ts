import { h } from "./dom";

const MAX_NOTE = 4000;

let dialog: HTMLDialogElement | null = null;
let noteField: HTMLTextAreaElement | null = null;
let sendButton: HTMLButtonElement | null = null;
let topicId = "";
let toastTimer = 0;

function toast(message: string, kind: "ok" | "err"): void {
  let node = document.querySelector<HTMLElement>(".toast");
  if (!node) {
    node = h("div", { class: "toast", role: "status" });
    document.body.append(node);
  }
  node.className = `toast toast-${kind}`;
  node.textContent = message;
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    node?.remove();
  }, 4200);
}

function failureMessage(status: number): string {
  if (status === 503) return "Grok Bot is not configured yet.";
  if (status === 404) return "That topic is not on the list.";
  if (status === 403 || status === 401) return "Sign in is required.";
  if (status === 429) return "Too many sends. Wait a moment.";
  if (status === 400) return "That note could not be sent.";
  return "Could not send this topic.";
}

async function send(): Promise<void> {
  if (!sendButton || !noteField) return;
  const note = noteField.value;
  sendButton.disabled = true;
  try {
    const response = await fetch("/api/continue", {
      method: "POST",
      headers: { "content-type": "application/json" },
      cache: "no-store",
      body: JSON.stringify({ topicId, note }),
    });
    if (!response.ok) {
      toast(failureMessage(response.status), "err");
      return;
    }
    dialog?.close();
    toast("Sent to Grok Bot.", "ok");
  } catch {
    toast("Could not send this topic.", "err");
  } finally {
    if (sendButton) sendButton.disabled = false;
  }
}

export function installContinueDialog(): void {
  if (dialog) return;
  noteField = h("textarea", {
    id: "grok-note",
    maxlength: String(MAX_NOTE),
    rows: "4",
  }) as HTMLTextAreaElement;
  sendButton = h("button", { class: "btn btn-primary", type: "submit" }, "Send") as HTMLButtonElement;
  const cancel = h("button", { class: "btn", type: "button" }, "Cancel") as HTMLButtonElement;
  const form = h(
    "form",
    { class: "continue-form" },
    h("h2", { id: "grok-title" }, "Continue in Grok Bot"),
    h("p", { class: "muted", id: "grok-lead" }, "Send this topic to Zakupoholik."),
    h("label", { class: "field" }, h("span", null, "Note, optional"), noteField),
    h("div", { class: "continue-actions" }, cancel, sendButton),
  ) as HTMLFormElement;
  dialog = h("dialog", { class: "continue-dialog", "aria-labelledby": "grok-title" }) as HTMLDialogElement;
  dialog.append(form);
  cancel.addEventListener("click", () => dialog?.close());
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    void send();
  });
  document.body.append(dialog);
}

export function openContinueDialog(id: string, title: string): void {
  installContinueDialog();
  topicId = id;
  const heading = document.getElementById("grok-lead");
  if (heading) heading.textContent = `Send “${title}” to Zakupoholik, with an optional note.`;
  if (noteField) noteField.value = "";
  dialog?.showModal();
  noteField?.focus();
}

export function continueButton(id: string, title: string): HTMLButtonElement {
  const button = h("button", { class: "btn grok-btn", type: "button" }, "Continue in Grok Bot") as HTMLButtonElement;
  button.addEventListener("click", () => openContinueDialog(id, title));
  return button;
}
