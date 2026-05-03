
import { json } from "./http.js";

// CORS — supports multiple origins via comma-separated ALLOWED_ORIGIN
// e.g. ALLOWED_ORIGIN = "https://mirpdf.com,https://mirpdff.pages.dev"

function getAllowedOrigins(env) {
  const raw = (env.ALLOWED_ORIGIN || "").trim();
  return raw.split(",").map(o => o.trim()).filter(Boolean);
}

function matchOrigin(env, origin) {
  const allowed = getAllowedOrigins(env);
  return allowed.includes(origin) || allowed.includes("*");
}

export function handleOptions(request, env){
  const origin = request.headers.get("Origin") || "";
  const h = {
    "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, Stripe-Signature",
    "Access-Control-Max-Age": "86400",
  };
  if (matchOrigin(env, origin)) {
    h["Access-Control-Allow-Origin"] = origin;
    h["Access-Control-Allow-Credentials"] = "true";
    h["Vary"] = "Origin";
  }
  return new Response(null, { status: 204, headers: h });
}

export function cors(env, req, headers={}){
  const origin = req?.headers?.get?.("Origin") || "";
  if (matchOrigin(env, origin)) {
    return { ...headers, "Access-Control-Allow-Origin": origin, "Access-Control-Allow-Credentials": "true", "Vary": "Origin" };
  }
  return headers;
}
