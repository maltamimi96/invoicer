import { listContacts } from "@/lib/actions/contacts";
import { ContactsClient } from "@/components/contacts/contacts-client";

export default async function ContactsPage() {
  const contacts = await listContacts();
  return (
    <div data-theme="console" className="-mx-4 -my-6 sm:-mx-6 sm:-my-8 px-4 py-6 sm:px-8 sm:py-10 min-h-[calc(100vh-4rem)] bg-background text-foreground">
      <ContactsClient contacts={contacts} />
    </div>
  );
}
