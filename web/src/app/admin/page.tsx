import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import AdminClient from '@/components/admin/AdminClient';

export default async function AdminPage() {
  const { userId } = await auth();

  if (!userId) {
    redirect('/sign-in');
  }

  return <AdminClient />;
}
