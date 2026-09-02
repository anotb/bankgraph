/**
 * Shared JSON response helpers for API endpoints.
 * Centralises CORS headers, Content-Type, and Cache-Control. Versioned KV is
 * the response cache; clients must re-enter the Worker so the publication
 * gate can stop reads during a multi-stage refresh.
 */

export function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-store'
    }
  });
}

export function errorResponse(message: string, status: number): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-store'
    }
  });
}
