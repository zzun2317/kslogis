import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

// export async function proxy(request: NextRequest) {
export async function middleware(request: NextRequest) {
  console.log("🚨🚨🚨 [MIDDLEWARE RUNNING] 현재 경로:", request.nextUrl.pathname);
  const { pathname } = request.nextUrl;
  // 1. 불필요한 정적 파일(이미지, 폰트 등)은 미들웨어 검사 제외 (성능 향상)
  if (
    pathname.startsWith('/_next') || 
    pathname.includes('.') || // .jpg, .png, .css 등 제외
    pathname.startsWith('/api')
  ) {
    return NextResponse.next();
  }
  let response = NextResponse.next({
    request: { headers: request.headers },
  });
  console.log("🍪 전체 쿠키 확인:", request.cookies.getAll().map(c => c.name));
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          // 요청 헤더와 응답 쿠키를 동시에 동기화 (중요!)
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // 🚀 세션 확인 (유저 정보를 가져옵니다)
  const { data: { session } } = await supabase.auth.getSession();
  // const customToken = request.cookies.get('sb-access-token')?.value;
  const user = session?.user;
  // const { data: { user } } = await supabase.auth.getUser();
  // const { pathname } = request.nextUrl;
  
  // 보호 대상 경로 설정
  // const isProtectedPage = pathname.startsWith('/delivery') || pathname.startsWith('/admin');
  const protectedPaths = ['/delivery', '/admin', '/upload-menu'];
  const isProtectedPage = pathname === '/' || protectedPaths.some(p => pathname.startsWith(p));
  const isAuthPage = pathname === '/login' || pathname === '/signup';
  const isProtected = pathname === '/' || pathname.startsWith('/delivery') || pathname.startsWith('/admin');
  console.log("🍪 전체 쿠키 확인:", request.cookies.getAll().map(c => c.name));
  console.log(`[Middleware] 경로: ${pathname}, 세션존재: ${!!user}, 보호경로여부: ${isProtectedPage}`);
  // 1. 세션이 없는데 보호된 페이지에 들어오면 로그인으로 쫓아냄(여기 로그인 창으로 계속돌려보냄)
  // if (!user && isProtectedPage) {
  //   console.log("🚫 [미들웨어] 미인증 사용자 -> 로그인 이동:", pathname);
  //   const url = request.nextUrl.clone();
  //   url.pathname = '/login';
  //   return NextResponse.redirect(url);
  // }
  if (!session && isProtectedPage && isProtected) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }
  // 2. 이미 로그인했는데 로그인 페이지에 오면 배송관리로 보냄
  // if (user && isAuthPage) {
  //   const url = request.nextUrl.clone();
  //   // url.pathname = '/delivery'; // 혹은 /admin/menu
  //   url.pathname = '/'; // 혹은 /admin/menu
  //   return NextResponse.redirect(url);
  // }

  return response;
}

// export default proxy;
export default middleware;

// 🚀 중요: 이제 matcher를 다시 활성화하여 페이지를 감시합니다.
export const config = {
  // matcher: ['/login', '/signup', '/delivery/:path*', '/admin/:path*', '/upload-menu/:path*'],
  // matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)',],
  matcher: ['/', '/((?!api|_next/static|_next/image|favicon.ico).*)'],
};