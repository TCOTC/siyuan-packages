import { escapeHtml } from "../util";

export function formatError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

export function showMessage(container: HTMLElement, message: string): void {
  container.innerHTML = `<div id="message">${escapeHtml(message)}</div>`;
}

export function showError(container: HTMLElement, message: string): void {
  container.innerHTML = `<div id="errorMessage">${escapeHtml(message)}</div>`;
}
