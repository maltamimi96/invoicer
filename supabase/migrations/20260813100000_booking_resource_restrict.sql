-- Deleting a booking resource must not delete its appointments.
--
-- appointments.resource_id was ON DELETE CASCADE, and deleteResource() removed
-- the row unconditionally from a bare trash icon with no confirmation. An owner
-- tidying up after a worker left destroyed that worker's ENTIRE appointment
-- history -- past and future -- with no undo. booking_audit_log.appointment_id
-- is ON DELETE SET NULL, so even the audit trail lost its anchor.
--
-- RESTRICT makes the database refuse. The application soft-deletes instead
-- (booking_resources.active = false), which is what the `active` column was
-- always for: an inactive resource stops being offered for new bookings while
-- everything already booked with it stays intact.

ALTER TABLE public.appointments
  DROP CONSTRAINT IF EXISTS appointments_resource_id_fkey;

ALTER TABLE public.appointments
  ADD CONSTRAINT appointments_resource_id_fkey
  FOREIGN KEY (resource_id) REFERENCES public.booking_resources(id)
  ON DELETE RESTRICT;

COMMENT ON CONSTRAINT appointments_resource_id_fkey ON public.appointments IS
  'RESTRICT, not CASCADE: deleting a resource must never wipe its appointment history. Deactivate the resource instead (booking_resources.active = false).';
