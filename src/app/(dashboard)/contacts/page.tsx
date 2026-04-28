import { listContacts } from "@/lib/actions/contacts";
import { ContactsClient } from "@/components/contacts/contacts-client";

export default async function ContactsPage() {
  const contacts = await listContacts();
  return (
    <div data-theme="console" className="bg-background text-foreground rounded-lg p-6 sm:p-10 min-h-full">
      <ContactsClient contacts={contacts} />
    </div>
  );
}
