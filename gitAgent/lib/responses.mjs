export function textResponse(text) {
  return { content: [{ type: 'text', text: String(text ?? '') }] };
}

export function jsonResponse(value, { pretty = false } = {}) {
  const text = pretty ? JSON.stringify(value, null, 2) : JSON.stringify(value);
  return textResponse(text);
}

export function errorResponse(message) {
  return { content: [{ type: 'text', text: `Error: ${message}` }], isError: true };
}
