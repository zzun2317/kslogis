'use client';

import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';

export default function HomePage() {
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [drivers, setDrivers] = useState<any[]>([]); 
  const [selectedDriverEmail, setSelectedDriverEmail] = useState<string>('all');
  const [selectedDate, setSelectedDate] = useState(() => {
    const now = new Date();
    const offset = now.getTimezoneOffset() * 60000; 
    const localDate = new Date(now.getTime() - offset).toISOString().split('T')[0];
    return localDate;
  });
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [deliveries, setDeliveries] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  
  const [selectedAddress, setSelectedAddress] = useState<string | null>(null);
  const [isMapOpen, setIsMapOpen] = useState(false);

  // 1. [인증 체크 및 초기화]
  useEffect(() => {
    const initApp = async () => {
      console.log("📍 [Page Step 1] 메인 페이지 인증 확인 시작...");
      try {
        // (1) 로컬스토리지 데이터 확인 (가장 먼저 수행)
        const savedEmail = localStorage.getItem('driver_email');
        const savedRole = localStorage.getItem('user_role');
        const isLoggedIn = localStorage.getItem('is_logged_in');

        console.log("📍 [Page Step 2] 로컬 정보:", { savedEmail, savedRole, isLoggedIn });

        // (2) Supabase 세션 확인
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        console.log("📍 [Page Step 3] Supabase 세션 여부:", !!session);

        // [핵심 로직 수정] 
        if (!session || isLoggedIn !== 'true') {
          console.warn("❌ 인증 만료 또는 창 새로고침 감지 -> 로그인으로 이동");
          
          // 혹시 남아있을지 모를 Supabase 세션 정리 (확실한 로그아웃)
          await supabase.auth.signOut();
          sessionStorage.clear(); 
          // ※ localStorage는 건드리지 않습니다 (아이디 저장용으로 남겨둠)

          window.location.href = '/login';
          return;
        }

        // (3) 권한에 따른 초기 필터 설정
        if (savedEmail && (savedRole !== 'admin' && savedRole !== 'user' && savedRole !== '001001')) {
          console.log("📍 [Page Step 4] 기사 권한 감지 - 본인 데이터로 고정");
          setSelectedDriverEmail(savedEmail);
        }

        // (4) 인증 통과 처리
        console.log("✅ [Page Step 5] 인증 통과! 로딩 해제");
        setIsAuthLoading(false);
        
        // (5) 기사 목록 로드
        const { data: driverData } = await supabase
          .from('ks_driver')
          .select('driver_email, driver_name')
          .order('driver_name', { ascending: true });
        
        if (driverData) setDrivers(driverData);

        // (6) 첫 데이터 로드
        const isAdmin = (savedRole === 'admin' || savedRole === 'user' || savedRole === '001001');
        const initialEmail = (isAdmin) ? 'all' : (savedEmail || 'all');
        fetchDashboardData(initialEmail, selectedDate, 'all');

      } catch (err) {
        console.error("❌ 초기 로딩 에러:", err);
        window.location.href = '/login';
      }
    };

    initApp();
  }, []);

  // 2. 배송 데이터 조회 함수
  const fetchDashboardData = useCallback(async (email: string, date: string, status: string) => {
    if (loading) return;
    setLoading(true);
    try {
      let query = supabase
        .from('ks_devcustm')
        .select(`
          cust_ordno, 
          cust_name, 
          cust_address, 
          cust_reqdate, 
          cust_hpno1,
          cust_memo, 
          cust_devstatus,
          ks_devcustd ( 
            cust_purqty, 
            cust_purcode,
            ks_item ( item_name ) 
          )
        `)
        .eq('cust_devdate', date);

      if (email && email !== 'all') {
        query = query.eq('cust_devemail', email);
      }
      
      if (status && status !== 'all') {
        query = query.eq('cust_devstatus', status);
      }

      const { data, error } = await query.order('cust_ordno', { ascending: true });

      if (error) throw error;
      setDeliveries(data || []);
    } catch (err) {
      console.error("데이터 조회 오류:", err);
    } finally {
      setLoading(false);
    }
  }, [loading]);

  // 3. 필터 변경 시 리로드
  useEffect(() => {
    if (!isAuthLoading) {
      fetchDashboardData(selectedDriverEmail, selectedDate, selectedStatus);
    }
  }, [selectedDriverEmail, selectedDate, selectedStatus, isAuthLoading]);

  // --- 통계 계산 ---
  const totalCount = deliveries.length;
  const pendingCount = deliveries.filter(d => String(d.cust_devstatus) === '0' || !d.cust_devstatus).length;
  const shippingCount = deliveries.filter(d => String(d.cust_devstatus) === '1').length;
  const completedCount = deliveries.filter(d => String(d.cust_devstatus) === '2').length;

  const updateDeliveryStatus = async (ordNo: string, nextStatus: string) => {
    const { error } = await supabase
      .from('ks_devcustm')
      .update({ cust_devstatus: nextStatus })
      .eq('cust_ordno', ordNo);
    if (!error) fetchDashboardData(selectedDriverEmail, selectedDate, selectedStatus);
  };

const handleLogout = async () => {
  if (!confirm("로그아웃 하시겠습니까?")) return;

  console.log("📍 [로그아웃] 모든 흔적 삭제 시작...");

  try {
    // 1. Supabase 공식 로그아웃
    await supabase.auth.signOut();

    // 2. 로컬스토리지 & 세션스토리지 비우기
    localStorage.clear();
    sessionStorage.clear();

    // 3. 쿠키 완전 삭제 함수
    const deleteCookie = (name: string) => {
      // 일반 삭제
      document.cookie = name + '=; expires=Thu, 01 Jan 1970 00:00:01 GMT; path=/;';
      // 도메인 포함 삭제 (localhost용)
      document.cookie = name + '=; expires=Thu, 01 Jan 1970 00:00:01 GMT; path=/; domain=' + window.location.hostname + ';';
      // 혹시 모를 닷(.) 도메인 삭제
      document.cookie = name + '=; expires=Thu, 01 Jan 1970 00:00:01 GMT; path=/; domain=.localhost;';
    };

    // 우리가 만든 쿠키와 Supabase 쿠키 모두 삭제
    const targetCookies = ['sb-access-token', 'my-auth-token', 'sb-refresh-token'];
    targetCookies.forEach(deleteCookie);

    console.log("✅ [로그아웃] 쿠키 청소 완료. 이동합니다.");

    // 4. 즉시 로그인 페이지로 강제 이동 (replace 대신 href로 시도하여 히스토리 갱신)
    window.location.href = '/login';
    
  } catch (err) {
    console.error("로그아웃 실패:", err);
    window.location.href = '/login';
  }
};

  // 🚀 최우선 순위: 인증 대기 화면
  if (isAuthLoading) {
    return (
      <div className="min-h-screen bg-white flex flex-col items-center justify-center">
        <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-4"></div>
        <p className="font-black text-slate-800 text-lg animate-pulse">시스템 보안 확인 중...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 pb-20">
      <main className="p-4 md:p-8 max-w-5xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-2xl font-black text-slate-800 tracking-tight italic">🚚 KS Logistics</h1>
            <p className="text-xs text-blue-600 font-bold">실시간 배송 관제 시스템</p>
          </div>
          <button 
            onClick={handleLogout}
            className="px-4 py-2 bg-white border border-slate-200 text-slate-500 rounded-xl text-xs font-black hover:bg-red-50 hover:text-red-600 transition-all shadow-sm"
          >
            로그아웃
          </button>
        </div>

        {/* 필터 섹션 */}
        <div className="bg-white p-6 rounded-[2rem] shadow-xl shadow-slate-200/50 border border-white mb-8">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="flex flex-col gap-2">
                <label className="text-[10px] font-black text-slate-400 ml-1 uppercase tracking-widest">Driver</label>
                <select 
                  value={selectedDriverEmail} 
                  onChange={(e) => setSelectedDriverEmail(e.target.value)} 
                  className="w-full border-none rounded-2xl px-4 py-3 text-sm font-bold text-slate-700 bg-slate-100 outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="all">전체 기사</option>
                  {drivers.map((d) => (
                    <option key={d.driver_email} value={d.driver_email}>{d.driver_name}</option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-2">
                <label className="text-[10px] font-black text-slate-400 ml-1 uppercase tracking-widest">Date</label>
                <input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} className="w-full border-none rounded-2xl px-4 py-3 text-sm font-bold text-slate-700 bg-slate-100 outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div className="flex flex-col gap-2">
                 <label className="text-[10px] font-black text-slate-400 ml-1 uppercase tracking-widest">Status</label>
                 <div className="flex bg-slate-100 p-1 rounded-2xl h-[46px] gap-1">
                   {[
                    { id: 'all', label: '전체', count: totalCount },
                    { id: '0', label: '대기', count: pendingCount },
                    { id: '1', label: '배송중', count: shippingCount },
                    { id: '2', label: '완료', count: completedCount }
                   ].map(tab => (
                    <button key={tab.id} onClick={() => setSelectedStatus(tab.id)} className={`flex-1 flex items-center justify-center gap-1 text-[11px] font-black rounded-xl transition-all ${selectedStatus === tab.id ? 'bg-white text-blue-600 shadow-md' : 'text-slate-400'}`}>
                      <span>{tab.label}</span>
                      {tab.count > 0 && <span className="px-1.5 py-0.5 rounded-full text-[9px] bg-blue-100 text-blue-600">{tab.count}</span>}
                    </button>
                   ))}
                 </div>
              </div>
            </div>
        </div>

        {/* 배송 리스트 */}
        {loading ? (
          <div className="flex flex-col items-center py-20 gap-4">
              <div className="w-8 h-8 border-4 border-slate-200 border-t-blue-500 rounded-full animate-spin"></div>
              <p className="text-slate-400 font-bold text-sm">데이터 조회 중...</p>
          </div>
        ) : (
          <div className="grid gap-4">
            {deliveries.length === 0 ? (
              <div className="text-center py-24 bg-white rounded-[2.5rem] border-2 border-dashed border-slate-200 text-slate-300 font-bold">
                배송 내역이 없습니다.
              </div>
            ) : (
              deliveries.map((item) => (
                <div key={item.cust_ordno} className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm hover:shadow-xl transition-all duration-300">
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <h3 className="text-lg font-black text-slate-800">{item.cust_name} 고객님</h3>
                      <p className="text-[10px] text-slate-400 font-bold mt-1">Order #{item.cust_ordno}</p>
                    </div>
                    <span className={`px-4 py-1.5 rounded-full text-[9px] font-black tracking-widest ${
                      String(item.cust_devstatus) === '2' ? 'bg-green-100 text-green-600' : 
                      String(item.cust_devstatus) === '1' ? 'bg-orange-100 text-orange-600' : 'bg-blue-100 text-blue-600'
                    }`}>
                      {String(item.cust_devstatus) === '2' ? 'COMPLETED' : String(item.cust_devstatus) === '1' ? 'SHIPPING' : 'PENDING'}
                    </span>
                  </div>
                  
                  <div className="bg-slate-50 p-4 rounded-2xl mb-6 cursor-pointer" onClick={() => {setSelectedAddress(item.cust_address); setIsMapOpen(true);}}>
                    <p className="text-sm text-slate-600 font-bold flex items-center gap-2">
                      <span className="text-blue-500">📍</span> {item.cust_address}
                    </p>
                  </div>

                  <div className="flex gap-3">
                    <button onClick={() => updateDeliveryStatus(item.cust_ordno, '1')} className="flex-1 py-4 bg-blue-600 text-white rounded-2xl text-[11px] font-black hover:bg-blue-700 transition-all">배송 출발</button>
                    <button onClick={() => updateDeliveryStatus(item.cust_ordno, '2')} className="flex-1 py-4 bg-slate-900 text-white rounded-2xl text-[11px] font-black hover:bg-black transition-all">배송 완료</button>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </main>

      {/* 지도 모달 */}
      {isMapOpen && (
        <div className="fixed inset-0 z-[9999] bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-white rounded-[2.5rem] w-full max-w-xl overflow-hidden shadow-2xl">
              <div className="p-8 border-b flex justify-between items-center">
                <span className="font-black text-xl text-slate-800">위치 확인</span> 
                <button onClick={()=>setIsMapOpen(false)} className="text-slate-400 text-2xl">×</button>
              </div>
              <iframe width="100%" height="400" src={`https://maps.google.com/maps?q=${encodeURIComponent(selectedAddress || '')}&t=&z=17&ie=UTF8&iwloc=&output=embed`} />
              <button onClick={()=>setIsMapOpen(false)} className="w-full py-6 bg-slate-900 text-white font-black text-sm hover:bg-black">닫기</button>
          </div>
        </div>
      )}
    </div>
  );
}