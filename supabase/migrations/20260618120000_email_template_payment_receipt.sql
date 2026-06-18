-- Add 'payment_receipt' to the allowed email template types (sent to the
-- customer after a successful Stripe payment).
ALTER TABLE public.email_templates
  DROP CONSTRAINT IF EXISTS email_templates_template_type_check;

ALTER TABLE public.email_templates
  ADD CONSTRAINT email_templates_template_type_check
  CHECK (template_type IN
    ('invoice','quote','team_invite','work_order_submitted','payment_receipt'));
