// ============================================================
// src/analytics.js — D1 analytics event tracking
// ============================================================

import { json } from "./helpers.js";
import { getIpFromRequest } from "./ratelimit.js";

export async function handleTrack(request, env) {
  const ip = getIpFromRequest(request);
  const ua = request.headers.get("user-agent") || "";
  const body = await request.json().catch(() => ({}));
  const event = String(body.event || "").slice(0, 64);
  const clientId = String(body.clientId || request.headers.get("x-client-id") || "").slice(0, 128);
  const tool = body.tool ? String(body.tool).slice(0, 64) : null;

  if (!event || !clientId) return json({ ok: false, error: "BAD_REQUEST" }, 400, env);

  await trackEvent(env, {
    event, clientId,
    userId: body.userId || null,
    sessionId: body.sessionId || null,
    ip, userAgent: ua, tool,
    jobId: body.jobId || null,
    batchId: body.batchId || null,
    planType: body.planType || null,
    revenue: body.revenue || null,
    metadata: body.metadata || {},
  });

  return json({ ok: true }, 200, env);
}

export async function trackEvent(env, { event, clientId, userId, sessionId, ip, userAgent, tool, jobId, batchId, planType, revenue, metadata }) {
  try {
    await env.DB.prepare(
      `INSERT INTO analytics_events (
        event_id, event, client_id, user_id, session_id, ip, user_agent,
        tool, job_id, batch_id, plan_type, revenue, metadata, created_at
      ) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14)`
    ).bind(
      crypto.randomUUID(), event, clientId, userId, sessionId, ip, userAgent,
      tool, jobId, batchId, planType, revenue,
      JSON.stringify(metadata || {}), new Date().toISOString()
    ).run();
  } catch (e) {
    console.warn("trackEvent failed", e);
  }
}
