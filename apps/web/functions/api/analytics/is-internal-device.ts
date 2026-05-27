import {
  INTERNAL_DEVICE_COOKIE,
  isInternalCookiePresent,
  type PagesContext,
} from './_lib';

export const onRequestGet = ({ request }: PagesContext) => {
  const cookieHeader = request.headers.get('cookie') ?? '';
  const isInternalDevice = isInternalCookiePresent(
    cookieHeader,
    INTERNAL_DEVICE_COOKIE,
  );
  return new Response(JSON.stringify({ isInternalDevice }), {
    status: 200,
    headers: {
      'content-type': 'application/json',
      'cache-control': 'no-store',
    },
  });
};
