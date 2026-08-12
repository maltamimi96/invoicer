-- Per-campaign email branding.
--
-- Outreach design (font, accent, text colour, width, logo, signature) lived
-- only on outreach_settings, so every campaign a business ran looked identical.
-- A roofer pitching strata managers and the same roofer pitching handyman
-- trades are different conversations and can want different marks.
--
-- Stored as a SPARSE object: only the keys this campaign overrides. An absent
-- key inherits from outreach_settings at render time (resolveOutreachDesign in
-- src/lib/outreach/render.ts). Copying the whole design in at create time would
-- freeze each campaign at whatever the business looked like that day, so a
-- later brand change would silently miss them.
--
-- NULL / {} = inherit everything, which is exactly today's behaviour — so every
-- existing campaign is unaffected.

ALTER TABLE outreach_campaigns
  ADD COLUMN IF NOT EXISTS design JSONB;

COMMENT ON COLUMN outreach_campaigns.design IS
  'Sparse per-campaign overrides of outreach_settings email design. Absent key = inherit. Keys: email_font, email_accent, email_text_color, email_width, email_show_logo, signature_html, logo_url.';
