// proxy.ts
// import { NextResponse, type NextRequest } from 'next/server';

// export async function proxy(request: NextRequest) {
//   // 🚀 보안 로직을 대폭 완화합니다. 
//   // 일단 모든 요청을 통과시키고, 나중에 페이지 내부에서 세션을 체크하겠습니다.
//   return NextResponse.next();
// }

// export default proxy;

// export const config = {
//   // 매처를 최소화하거나 비워두어 미들웨어가 간섭하지 못하게 합니다.
//   matcher: [], 
// };

import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({
    request: { headers: request.headers },
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) { return request.cookies.get(name)?.value; },
        set(name: string, value: string, options: CookieOptions) {
          request.cookies.set({ name, value, ...options });
          response = NextResponse.next({ request: { headers: request.headers } });
          response.cookies.set({ name, value, ...options });
        },
        remove(name: string, options: CookieOptions) {
          request.cookies.set({ name, value: '', ...options });
          response = NextResponse.next({ request: { headers: request.headers } });
          response.cookies.delete({ name, ...options });
        },
      },
    }
  );

  // 🚀 세션 확인 (유저 정보를 가져옵니다)
  const { data: { user }, error } = await supabase.auth.getUser();
  const { pathname } = request.nextUrl;

  // 보호 대상 경로 설정
  // const isProtectedPage = pathname.startsWith('/delivery') || pathname.startsWith('/admin');
  const isProtectedPage = pathname.startsWith('/admin');
  const isAuthPage = pathname === '/login' || pathname === '/signup';

  // 1. 세션이 없는데 보호된 페이지에 들어오면 로그인으로 쫓아냄(여기 로그인 창으로 계속돌려보냄)
  if (!user && isProtectedPage) {
    console.log(`Path: ${pathname}, User: ${isProtectedPage}`);
    const url = new URL('/login', request.url);
    return NextResponse.redirect(url);
  }

  // 2. 이미 로그인했는데 로그인 페이지에 오면 배송관리로 보냄
  if (user && isAuthPage) {
    return NextResponse.redirect(new URL('/delivery', request.url));
  }

  return response;
}

export default proxy;

// 🚀 중요: 이제 matcher를 다시 활성화하여 페이지를 감시합니다.
export const config = {
  matcher: ['/login', '/signup', '/delivery/:path*', '/admin/:path*'],
};