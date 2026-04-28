import { listContacts } from "@/lib/actions/contacts";
import { ContactsClient } from "@/components/contacts/contacts-client";

export default async function ContactsPage() {
  const contacts = await listContacts();
  return <ContactsClient contacts={contacts} />;
}
