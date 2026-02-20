'use client';

import { useEffect, useState, useRef } from 'react';
import { supabase } from '@/lib/supabase'; 
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';

export default function Navbar() {
  const router = useRouter();
  const pathname = usePathname(); 
  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // --- DB에서 가져온 메뉴 리스트 ---
  const [menuList, setMenuList] = useState<any[]>([]);

  // 스크롤 감지를 위한 Ref와 상태
  const scrollRef = useRef<HTMLDivElement>(null);
  const [showLeftArrow, setShowLeftArrow] = useState(false);
  const [showRightArrow, setShowRightArrow] = useState(false);

  const isAuthPage = pathname === '/login' || pathname === '/signup';

  // 스크롤 위치에 따라 화살표 표시 여부 결정
  const checkScroll = () => {
    if (scrollRef.current) {
      const { scrollLeft, scrollWidth, clientWidth } = scrollRef.current;
      setShowLeftArrow(scrollLeft > 0); // 왼쪽으로 갈 곳이 있으면 표시
      // 오른쪽으로 더 스크롤할 내용이 있는지 확인 (오차 범위 1px)
      setShowRightArrow(scrollLeft + clientWidth < scrollWidth - 1);
    }
  };

  // --- 스크롤 이동 함수 ---
  const scroll = (direction: 'left' | 'right') => {
    if (scrollRef.current) {
      const scrollAmount = 200; // 한번 클릭 시 이동할 거리
      const newScrollLeft = direction === 'left' 
        ? scrollRef.current.scrollLeft - scrollAmount 
        : scrollRef.current.scrollLeft + scrollAmount;
      
      scrollRef.current.scrollTo({
        left: newScrollLeft,
        behavior: 'smooth' // 부드러운 이동 효과
      });
    }
  };

  useEffect(() => {
    // 1. 세션 체크 로직 [cite: 5]
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) fetchDynamicMenus(); // 세션이 있을 때만 메뉴 로드
      setLoading(false);
  });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    // 윈도우 크기 조절 시 화살표 체크
    window.addEventListener('resize', checkScroll);
    return () => {
      subscription.unsubscribe();
      window.removeEventListener('resize', checkScroll);
    };
  }, [router, isAuthPage]);

  // 메뉴 로딩 후 초기 스크롤 체크
  useEffect(() => {
    checkScroll();
  }, [menuList]);

  // --- 권한별 메뉴 가져오기 ---
  const fetchDynamicMenus = async () => {
    const userRole = localStorage.getItem('user_role'); // 저장된 권한 코드 확인
    const userUuid = localStorage.getItem('user_uuid'); // 로그인 시 저장여부 확인
    if (!userRole || !userUuid) return;

    try {
      // 1. 그룹 권한(Role) 조회
      const { data: roleMenus } = await supabase
        .from('ks_menu_auth')
        .select('menu_id')
        .or(`role_code.eq.${userRole},role_code.eq.ALL`);

      // 2. 사용자 개별 권한(UUID) 조회
      const { data: userMenus } = await supabase
        .from('ks_menu_user')
        .select('menu_id')
        .eq('user_id', userUuid); // UUID로 필터링

      // 3. ID 합치기 및 중복 제거
      const combinedIds = [
        ...(roleMenus?.map(m => m.menu_id) || []),
        ...(userMenus?.map(m => m.menu_id) || [])
      ];
      const uniqueMenuIds = Array.from(new Set(combinedIds));

      if (uniqueMenuIds.length === 0) return setMenuList([]);

      // 4. 최종 메뉴 정보 로드
      const { data, error } = await supabase
        .from('ks_menu')
        .select('menu_id, menu_name, menu_path')
        .in('menu_id', uniqueMenuIds)
        .eq('is_use', true)
        .order('menu_sort', { ascending: true });

      if (data) setMenuList(data);
    } catch (err) {
      console.error("메뉴 로드 중 에러:", err);
    }
  };

  // 로그인/회원가입 페이지에서는 네비바를 숨깁니다.
  if (isAuthPage) return null;
  // 세션이 없으면 네비바를 렌더링하지 않습니다 (미들웨어에 의해 어차피 /login으로 튕길 예정)
  if (loading || !session) return null;

  // 🚀 로그아웃 처리 로직
  const handleSignOut = async () => {
    if (confirm("로그아웃 하시습니까?")) {
      try {
        console.log("📍 [Navbar] 로그아웃 프로세스 시작...");

        await supabase.auth.signOut();

        localStorage.removeItem('is_logged_in');
        localStorage.removeItem('driver_email');
        localStorage.removeItem('user_role');
        localStorage.removeItem('user_name');
        sessionStorage.clear();

        const deleteCookie = (name: string) => {
          document.cookie = `${name}=; path=/; expires=Thu, 01 Jan 1970 00:00:01 GMT;`;
          document.cookie = `${name}=; path=/; expires=Thu, 01 Jan 1970 00:00:01 GMT; domain=${window.location.hostname};`;
        };

        const targetCookies = ['sb-access-token', 'my-auth-token', 'sb-refresh-token'];
        targetCookies.forEach(deleteCookie);

        console.log("✅ [Navbar] 모든 인증 정보 삭제 완료");
        window.location.href = '/login';
        
      } catch (error) {
        console.error("로그아웃 중 에러 발생:", error);
        window.location.href = '/login';
      }
    }
  };

  const getMenuClass = (path: string) => {
    const baseClass = "transition-colors font-bold whitespace-nowrap";
    const activeClass = "text-blue-400 border-b-2 border-blue-400 pb-1"; 
    const defaultClass = "text-white hover:text-blue-400"; 
    return `${baseClass} ${pathname === path ? activeClass : defaultClass}`;
  };

  return (
    <header className="bg-slate-900 text-white sticky top-0 z-[100] shadow-md w-full">
      <div className="max-w-[1400px] mx-auto px-4 py-4 flex items-center justify-between">
        
        {/* [왼쪽] 로고 - 고정 */}
        <Link href="/delivery" className="text-xl font-black tracking-tighter text-blue-400 uppercase shrink-0 mr-8">
          KS Logistics
        </Link>
        
        {/* [가운데] 메뉴 리스트 영역 - 가변 및 스크롤 */}
        <div className="relative flex-1 flex items-center overflow-hidden mr-4">

          {/* 왼쪽 화살표 버튼 */}
          {showLeftArrow && (
            <button 
              onClick={() => scroll('left')}
              className="absolute left-0 z-10 h-full w-8 bg-gradient-to-r from-slate-900 to-transparent flex items-center justify-start text-blue-400 hover:text-white transition-all"
            >
              ◀
            </button>
          )}

          <nav 
            ref={scrollRef}
            onScroll={checkScroll}
            className="flex gap-6 md:gap-8 text-sm font-semibold items-center overflow-x-auto scrollbar-hide"
            style={{ msOverflowStyle: 'none', scrollbarWidth: 'none' }} // 스크롤바 숨기기
          >
            {menuList.map((menu) => (
              <Link key={menu.menu_id} href={menu.menu_path} className={getMenuClass(menu.menu_path)}>
                {menu.menu_name}
              </Link>
            ))}
          </nav>

          {/* 오른쪽 화살표 버튼 */}
          {showRightArrow && (
            <button 
              onClick={() => scroll('right')}
              className="absolute right-0 z-10 h-full w-8 bg-gradient-to-l from-slate-900 to-transparent flex items-center justify-end text-blue-400 hover:text-white transition-all"
            >
              ▶
            </button>
          )}
        </div>
        
        {/* [오른쪽] 사용자 정보 및 로그아웃 - 고정 */}
        <div className="flex items-center gap-4 shrink-0 border-l border-slate-700 pl-4">
          <div className="hidden sm:flex items-center gap-2 text-[11px] font-medium">
            <span className="bg-slate-800 px-3 py-1 rounded-full text-slate-300 border border-slate-700 max-w-[150px] truncate">
              {session?.user?.email}
            </span>
          </div>
          <button onClick={handleSignOut} className="text-red-400 hover:text-red-300 text-sm font-bold transition-colors">
            로그아웃
          </button>
        </div>

      </div>
    </header>
  );
}