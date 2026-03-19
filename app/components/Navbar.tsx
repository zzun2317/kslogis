'use client';

import { useEffect, useState, useRef } from 'react';
import { supabase } from '@/lib/supabase'; 
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { useAuthStore } from '@/store/useAuthStore';

export default function Navbar() {
  const { user, role, isLoggedIn } = useAuthStore();
  const userLevel = Number(user?.user_level || 0);
  const router = useRouter();
  const pathname = usePathname(); 
  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // 메뉴 그룹핑
  const [groupedMenuList, setGroupedMenuList] = useState<{ [key: string]: any[] }>({});
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [modalPos, setModalPos] = useState({ top: 0, left: 0 });
  const toggleCategory = (e: React.MouseEvent<HTMLDivElement>, key: string) => {
  // 이벤트 버블링 방지 (부모의 클릭 이벤트가 실행되지 않도록)
    e.stopPropagation();

    if (activeCategory === key) {
      setActiveCategory(null); // 이미 열려있으면 닫기
    } else {
      const rect = e.currentTarget.getBoundingClientRect();
      setModalPos({ 
        top: rect.bottom, // + window.scrollY, 
        left: rect.left + window.scrollX 
      });
      setActiveCategory(key); // 새 카테고리 열기
    }
  };

  useEffect(() => {
    const handleClickOutside = () => {
      setActiveCategory(null);
    };

    if (activeCategory) {
      // 모달이 열려있을 때만 문서 전체에 클릭 이벤트 리스너 등록
      window.addEventListener('click', handleClickOutside);
    }

    return () => {
      window.removeEventListener('click', handleClickOutside);
    };
  }, [activeCategory]);

  // --- DB에서 가져온 메뉴 리스트 ---
  const [menuList, setMenuList] = useState<any[]>([]);

  // 스크롤 감지를 위한 Ref와 상태
  const scrollRef = useRef<HTMLDivElement>(null);
  const [showLeftArrow, setShowLeftArrow] = useState(false);
  const [showRightArrow, setShowRightArrow] = useState(false);

  // 화면 상단 메뉴나오는 부분 숨김처리 메뉴리스트(로그아웃 라인)
  const isAuthPage = pathname === '/login' || pathname === '/signup' || pathname?.startsWith('/view-images') || pathname?.startsWith('/privacy');

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

  // 2. 🔥 [중요] 유저 정보나 권한이 확인된 시점에 메뉴 로드 (추가)
  useEffect(() => {
    // 세션 정보가 있고, 스토어에 role과 user 정보가 들어왔을 때 실행
    if (session && (role || user?.id)) {
      fetchDynamicMenus();
    }
  }, [session, role, user?.id]); // 의존성 추가

  // 메뉴 로딩 후 초기 스크롤 체크
  useEffect(() => {
    checkScroll();
  }, [menuList]);

  // --- 권한별 메뉴 가져오기 ---
  const fetchDynamicMenus = async () => {
    const storeRole = useAuthStore.getState().role; // 스토어 직접 조회
    const storageRole = sessionStorage.getItem('user_role');
    // const userRole = localStorage.getItem('user_role'); // 저장된 권한 코드 확인
    // const userUuid = localStorage.getItem('user_uuid'); // 로그인 시 저장여부 확인
    const userRole = (storageRole && storageRole !== 'user') ? storageRole : storeRole;
    const userUuid = user?.id || sessionStorage.getItem('user_uuid');
    const storageLevel = sessionStorage.getItem('user_level');
    const userLevel = Number(user?.user_level || storageLevel || 0);
    console.log("🔍 [메뉴로드] 현재 상태:", { userRole, userUuid, storeUser: user?.id });
    console.log("🔍 메뉴 로드 시도:", { userRole, userUuid, userLevel });
    
    // const userRole = storeRole || storageRole;
    // const userUuid = user?.id || sessionStorage.getItem('user_uuid');
    console.log("🚀 [Navbar 검사] 스토어Role:", storeRole, " / 스토리지Role:", storageRole);

    if (!userRole || !userUuid) {
      console.warn("⚠️ 권한 정보가 없어 메뉴를 불러올 수 없습니다.");
      window.location.href = '/login';
      return;
    }

    try {
      // 1. 그룹 권한(Role) 조회
      const { data: roleMenus, error: roleErr } = await supabase
        .from('ks_menu_auth')
        .select('menu_id')
        .or(`role_code.eq.${userRole},role_code.eq.ALL`);

        console.log("🔍 [메뉴로드] RoleMenus 결과:", roleMenus, "에러:", roleErr);

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
      const roleMenuIds = roleMenus?.map(m => m.menu_id) || [];
      const userMenuIds = userMenus?.map(m => m.menu_id) || [];
      const uniqueMenuIds = Array.from(new Set([...roleMenuIds, ...userMenuIds]));
      console.log("🔍 [메뉴로드] 최종 Menu IDs:", uniqueMenuIds);

      if (uniqueMenuIds.length === 0) {
        console.warn("⚠️ [메뉴로드] 할당된 메뉴 ID가 하나도 없음");
        return setMenuList([]);
      }

      // 메뉴 카테고리 추가
      const { data, error } = await supabase
        .from('ks_menu')
        .select(`
          menu_id, menu_name, menu_path, menu_group,
          ks_common:menu_group (
            comm_ccode,
            comm_text1,
            comm_sort
          )
        `)
        .in('menu_id', uniqueMenuIds)
        .eq('is_use', true)
        // 카테고리 정렬 후 메뉴 정렬 적용
        .order('comm_sort', { foreignTable: 'ks_common', ascending: true })
        .order('menu_sort', { ascending: true });

      if (data) {
        const filteredData = data.filter((item: any) => {
          const isUserSpecific = userMenuIds.includes(item.menu_id);
          // A. 개인 권한(ks_menu_user)에 등록된 메뉴라면 무조건 패스
          // 배송기사(001004)인 경우의 필터링 강화
          if (userRole === '001004') {
            // 배송기사는 ALL이나 그룹 권한이 있어도 무시하고,
            // 오직 개별 권한(ks_menu_user)에 등록된 메뉴만 보여줌
            return isUserSpecific;
          }

          // '배송기사 관리' 메뉴(/drivers)에 대한 세부 레벨 제어
          if (item.menu_path === '/drivers') {
            // 레벨이 30 이하(30 포함)이면 숨김 (즉, 31 이상만 보임)
            if (userLevel <= 30) return false;
          }
          return true; // 나머지 메뉴는 통과
        });

        // 3. 데이터를 카테고리별로 그룹화
        const grouped = filteredData.reduce((acc: any, item: any) => {
          const categoryCode = item.menu_group;
          const categoryName = item.ks_common?.comm_text1 || '기타';

          // comm_ccode가 '001005'(HOME)인 경우 별도 처리
          const groupKey = categoryCode === '001005' ? '_HOME_' : categoryName;

          if (!acc[groupKey]) acc[groupKey] = [];
          acc[groupKey].push(item);
          return acc;
        }, {});
        setGroupedMenuList(grouped);
      }
    } catch (err) {
      console.error("메뉴 로드 중 에러:", err);
    }
  };


      // 4. 최종 메뉴 정보 로드
  //     const { data, error } = await supabase
  //       .from('ks_menu')
  //       .select('menu_id, menu_name, menu_path')
  //       .in('menu_id', uniqueMenuIds)
  //       .eq('is_use', true)
  //       .order('menu_sort', { ascending: true });

  //     if (data) setMenuList(data);
  //   } catch (err) {
  //     console.error("메뉴 로드 중 에러:", err);
  //   }
  // };

  // 로그인/회원가입 페이지에서는 네비바를 숨깁니다.
  if (isAuthPage) return null;
  // 세션이 없으면 네비바를 렌더링하지 않습니다 (미들웨어에 의해 어차피 /login으로 튕길 예정)
  // if (loading || !session) return null;

  // if (loading || !session) {
  //   console.warn("❌ 인증 만료 또는 창 새로고침 감지 -> 로그인으로 이동");
  //   window.location.href = '/login';
  //   return;
  // }
  const { clearAuth } = useAuthStore();
  // 🚀 로그아웃 처리 로직
  const handleSignOut = async () => {
    if (confirm("로그아웃 하시습니까?")) {
      try {
        console.log("📍 [Navbar] 로그아웃 프로세스 시작...");

        await supabase.auth.signOut();
        clearAuth();

        localStorage.removeItem('is_logged_in');
        // localStorage.removeItem('user_email'); // driver_email
        localStorage.removeItem('user_role');
        localStorage.removeItem('user_name');
        localStorage.removeItem('user_level');
        localStorage.removeItem('user_center');
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
      <div className="max-w-[1400px] mx-auto px-6 py-4 flex items-center justify-between">
        
        {/* [왼쪽] 로고 - 고정 */}
        {/* <Link href="/delivery" className="text-xl font-black tracking-tighter text-blue-400 uppercase shrink-0 mr-4"> */}
        <div className="text-xl font-black tracking-tighter text-blue-400 uppercase shrink-0 mr-4">
          KS Logistics
        </div>  
        {/* </Link> */}
        
        {/* [가운데] 메뉴 리스트 영역 - 가변 및 스크롤 */}
        <div className="relative flex-1 flex items-center">

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
            className="flex gap-6 md:gap-8 text-sm font-semibold items-center overflow-x-auto overflow-y-visible scrollbar-hide py-4 w-full"
            style={{ msOverflowStyle: 'none', scrollbarWidth: 'none' }}
          >
            {Object.keys(groupedMenuList).map((key) => (
              key === '_HOME_' ? (
                // [HOME 그룹] - 드롭다운 없이 바로 노출
                groupedMenuList[key].map((menu) => (
                  <Link key={menu.menu_id} href={menu.menu_path} className={getMenuClass(menu.menu_path)}>
                    {menu.menu_name}
                  </Link>
                ))
              ) : (
                // [일반 카테고리] - 드롭다운 형식
                <div 
                  key={key} 
                  className="group relative cursor-pointer"
                  onClick={(e) => toggleCategory(e, key)}
                >
                  <span className="text-white group-hover:text-blue-400 transition-colors flex items-center gap-1 whitespace-nowrap">
                    {key} <span className="text-[10px] opacity-50 group-hover:rotate-180 transition-transform">▼</span>
                  </span>
                  
                  {/* 드롭다운 박스 */}
                  {/* <div className="absolute hidden group-hover:block top-[calc(100%-5px)] left-0 bg-slate-800 shadow-2xl rounded-md min-w-[200px] py-3 border border-slate-700 z-[9999]">
                    {groupedMenuList[key].map((menu) => (
                      <Link 
                        key={menu.menu_id} 
                        href={menu.menu_path} 
                        className={`block px-5 py-2.5 text-[13px] transition-all ${pathname === menu.menu_path ? 'text-blue-400 bg-slate-700/50' : 'text-slate-300 hover:bg-slate-700 hover:text-white'}`}
                      >
                        {menu.menu_name}
                      </Link>
                    ))}
                  </div> */}
                </div>
              )
            ))}
          </nav>
          {/* 최상위 모달 레이어 */}
          {activeCategory && activeCategory !== '_HOME_' && (
            // <div 
            //   className="fixed inset-0 z-[9999]" 
            //   onMouseMove={() => setActiveCategory(null)} // 배경 영역에 가면 닫힘
            // >
              <div 
                className="fixed bg-slate-800 shadow-2xl rounded-md min-w-[200px] py-3 border border-slate-700 animate-in fade-in slide-in-from-top-1"
                style={{ 
                  top: `${modalPos.top + 5}px`, 
                  left: `${modalPos.left}px` 
                }}
                onClick={(e) => e.stopPropagation()}
              >
                {groupedMenuList[activeCategory].map((menu: any) => (
                  <Link 
                    key={menu.menu_id} 
                    href={menu.menu_path}
                    onClick={() => setActiveCategory(null)}
                    className="block px-5 py-2.5 text-slate-300 hover:bg-slate-700 hover:text-blue-400 text-[13px] transition-all"
                  >
                    {menu.menu_name}
                  </Link>
                ))}
              </div>
            // </div>
          )}

          {/* <nav 
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
          </nav> */}

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