/**
 * Backend API base URL. Set NEXT_PUBLIC_API_URL when using ngrok or a remote server
 * so the frontend (e.g. on your phone) can reach the API.
 * Examples:
 *   - Local: http://localhost:8000 (default)
 *   - ngrok: https://abc123.ngrok-free.app
 */
const API_BASE =
  (typeof process !== "undefined" && process.env.NEXT_PUBLIC_API_URL) ||
  "http://localhost:8000";

/** WebSocket base URL derived from API (http -> ws, https -> wss) */
export const WS_BASE = API_BASE.replace(/^http/, "ws");

export const API_BASE_URL = API_BASE;
