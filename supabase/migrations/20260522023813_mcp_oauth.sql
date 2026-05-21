-- MCP OAuth 2.1 authorization server tables.
--
-- Lets claude.ai (and any OAuth MCP client) connect to the Kirei MCP server
-- via a normal sign-in flow instead of a pasted API key. The flow ends by
-- minting one of our existing inv_* business API keys as the access token,
-- so the MCP route's authenticateApiKey() keeps working unchanged.
--
-- Both tables are touched ONLY by the OAuth route handlers via the service
-- role (admin) client, so RLS is enabled with no policies (deny-all to
-- anon/authenticated; service role bypasses RLS).

CREATE TABLE IF NOT EXISTS public.oauth_clients (
  client_id     TEXT PRIMARY KEY,
  client_name   TEXT,
  redirect_uris TEXT[] NOT NULL DEFAULT '{}',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.oauth_codes (
  code           TEXT PRIMARY KEY,
  client_id      TEXT NOT NULL,
  business_id    UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  user_id        UUID NOT NULL,
  redirect_uri   TEXT NOT NULL,
  code_challenge TEXT NOT NULL,
  scope          TEXT NOT NULL DEFAULT 'admin',
  expires_at     TIMESTAMPTZ NOT NULL,
  used           BOOLEAN NOT NULL DEFAULT FALSE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS oauth_codes_expires_idx ON public.oauth_codes(expires_at);

ALTER TABLE public.oauth_clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.oauth_codes   ENABLE ROW LEVEL SECURITY;
