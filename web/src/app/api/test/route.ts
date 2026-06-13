import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { cookies } from 'next/headers';

export const GET = auth(async (req) => {
  const cookieStore = await cookies();
  const allCookies = cookieStore.getAll().map(c => c.name);
  return NextResponse.json({
    reqAuth: req.auth,
    cookies: allCookies,
  });
});
