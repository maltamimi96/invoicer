-- Keep booking_forms' selected service/resource id arrays clean: when a
-- resource or appointment type is deleted, remove its id from every form so a
-- dangling reference can't silently restrict a form to a non-existent
-- resource/service (which showed zero availability).

CREATE OR REPLACE FUNCTION public.booking_forms_drop_deleted_resource()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.booking_forms
     SET resource_ids = array_remove(resource_ids, OLD.id)
   WHERE business_id = OLD.business_id AND OLD.id = ANY(resource_ids);
  RETURN OLD;
END $$;

DROP TRIGGER IF EXISTS trg_forms_drop_resource ON public.booking_resources;
CREATE TRIGGER trg_forms_drop_resource AFTER DELETE ON public.booking_resources
  FOR EACH ROW EXECUTE FUNCTION public.booking_forms_drop_deleted_resource();

CREATE OR REPLACE FUNCTION public.booking_forms_drop_deleted_type()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.booking_forms
     SET appointment_type_ids = array_remove(appointment_type_ids, OLD.id)
   WHERE business_id = OLD.business_id AND OLD.id = ANY(appointment_type_ids);
  RETURN OLD;
END $$;

DROP TRIGGER IF EXISTS trg_forms_drop_type ON public.appointment_types;
CREATE TRIGGER trg_forms_drop_type AFTER DELETE ON public.appointment_types
  FOR EACH ROW EXECUTE FUNCTION public.booking_forms_drop_deleted_type();
