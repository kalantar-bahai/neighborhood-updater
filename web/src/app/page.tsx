import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import AppClient from '@/components/AppClient';

export default async function Home() {
  const { userId } = await auth();

  if (!userId) {
    redirect('/sign-in');
  }

  return <AppClient />;
}
