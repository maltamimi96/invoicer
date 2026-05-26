-- Link appointments to a customer so they appear on the customer access hub
-- (portal) alongside invoices / quotes / work orders. Nullable — walk-in
-- bookings from unknown people stay unlinked.
ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_appointments_customer
  ON public.appointments (customer_id, starts_at)
  WHERE customer_id IS NOT NULL;
