'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuthStore } from '@/store/useAuthStore';

// 1. 권한 공통코드 상수 정의
const ROLE_CODE = {
  SUPERADMIN: '001001',
  ADMIN: '001002',
  USER: '001003',
  DRIVER: '001004', // 배송기사 코드
  GUEST: '001005',
};

// 🌟 이메일 마스킹 유틸리티 함수
const maskEmail = (email: string) => {
  const [id, domain] = email.split('@');
  if (id.length <= 2) return `${id}*@${domain}`;
  return `${id.substring(0, 2)}${'*'.repeat(id.length - 2)}@${domain}`;
};

// 1. 실시간 하이픈 포맷팅 함수 (연락처 입력 시 호출)
const formatPhoneNumber = (value: string) => {
  if (!value) return value;
  const phoneNumber = value.replace(/[^\d]/g, ''); // 숫자만 남기기
  const cpLen = phoneNumber.length;

  if (cpLen < 4) return phoneNumber;
  if (cpLen < 7) return `${phoneNumber.slice(0, 3)}-${phoneNumber.slice(3)}`;
  if (cpLen < 11) return `${phoneNumber.slice(0, 3)}-${phoneNumber.slice(3, 6)}-${phoneNumber.slice(6)}`;
  return `${phoneNumber.slice(0, 3)}-${phoneNumber.slice(3, 7)}-${phoneNumber.slice(7, 11)}`;
};

export default function LoginPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [password, setPassword] = useState('');
  const [email, setEmail] = useState<string>('');
  const { setAuth } = useAuthStore();

  // 🌟 아이디 찾기 모달 관련 상태
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [findInfo, setFindInfo] = useState({ name: '', phone: '' });
  const [foundEmail, setFoundEmail] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedEmail = localStorage.getItem('remembered_email');
      if (savedEmail) {
        setEmail(savedEmail);
      }
    }
  }, []);

  // 🌟 아이디 찾기 처리 함수
  const handleFindId = async () => {
    if (!findInfo.name || !findInfo.phone) {
      alert("이름과 연락처를 모두 입력해주세요.");
      return;
    }

    // 1. 입력값에서 하이픈 제거 (01056103736)
  const pureInputPhone = findInfo.phone.replace(/[^\d]/g, '');

  try {
      // 2. rpc를 쓰지 않고도 filter를 활용해 숫자만 비교하는 방식
      // .or()이나 .filter()를 쓰기보다 가장 확실한 'raw' 쿼리 느낌의 필터링을 시도합니다.
      const { data, error } = await supabase
        .from('ks_users')
        .select('user_email')
        .eq('user_name', findInfo.name.trim())
        // ⭐ 핵심: DB의 user_hpno 컬럼에서 하이픈(-)을 제거한 값과 입력한 숫자를 비교
        .filter('user_hpno', 'cs', pureInputPhone) 
        // 만약 위 filter가 안먹힌다면 아래 eq를 사용하세요 (하이픈 포함 비교)
        // .eq('user_hpno', findInfo.phone.trim()) 
        .maybeSingle();

      // --- 만약 위 방식이 안되면 최후의 수단 (두 가지 경우 다 체크) ---
      if (!data) {
        const { data: retryData } = await supabase
          .from('ks_users')
          .select('user_email')
          .eq('user_name', findInfo.name.trim())
          .or(`user_hpno.eq.${pureInputPhone},user_hpno.eq.${findInfo.phone.trim()}`)
          .maybeSingle();
          
        if (retryData) {
          setFoundEmail(`찾으시는 아이디는 [ ${maskEmail(retryData.user_email)} ] 입니다.`);
          return;
        }
        setFoundEmail("회원 정보가 없습니다.");
      } else {
        setFoundEmail(`찾으시는 아이디는 [ ${maskEmail(data.user_email)} ] 입니다.`);
      }
    } catch (err) {
      setFoundEmail("시스템 오류가 발생했습니다.");
    }
  };

  const handleResetPassword = async () => {
    if (!email) {
      alert("이메일을 먼저 입력해 주세요. 해당 이메일로 재설정 링크를 보내드립니다.");
      return;
    }
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (error) alert("오류: " + error.message);
    else alert("비밀번호 재설정 이메일이 발송되었습니다!");
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return; 
    setLoading(true);

    try {
      // 1. Supabase 인증 시도
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password: password.trim(),
      });

      if (authError) {
        console.error("❌ [Error] Supabase 인증 실패:", authError.message);
        alert('로그인 실패: ' + authError.message);
        setLoading(false);
        return;
      }

      if (authData?.user?.email) {
        // 2. 백엔드 사용자 권한/정보 확인
        let userData = { user_role: ROLE_CODE.GUEST, user_name: '사용자', user_id: '', user_center: '' };

        try {
          const response = await fetch('/api/auth/login-check', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: authData.user.email.trim() }),
          });

          if (response.ok) {
            const fetchedData = await response.json();
            if (fetchedData) userData = fetchedData;
          }
        } catch (fetchErr) {
          console.error("❌ [Error] 백엔드 서버 연결 실패:", fetchErr);
        }

        // ⭐ [권한 필터링] 배송기사(001004) 권한 웹 로그인 강력 차단
        if (String(userData.user_role) === ROLE_CODE.DRIVER) {
          alert('배송기사 권한은 웹 로그인을 할 수 없습니다.');
          await supabase.auth.signOut();
          localStorage.removeItem('is_logged_in');
          localStorage.removeItem('user_role');
          localStorage.removeItem('user_uuid');
          document.cookie = "sb-access-token=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
          document.cookie = "my-auth-token=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
          setLoading(false);
          window.location.reload();
          return; 
        }

        // 3. Zustand 글로벌 스토어 저장
        setAuth(
          {
            id: authData.user.id,
            email: authData.user.email,
            userName: userData.user_name || '사용자',
            user_center: userData.user_center,
          },
          userData.user_role
        );

        // 4. 로컬 데이터 저장
        localStorage.setItem('last_logged_in_email', email.trim());
        localStorage.setItem('driver_email', email.trim());
        localStorage.setItem('driver_name', userData.user_name || '');
        localStorage.setItem('user_id', userData.user_id || '');
        localStorage.setItem('user_role', userData.user_role);
        localStorage.setItem('user_center', userData.user_center || '');
        localStorage.setItem('remembered_email', email.trim());
        localStorage.setItem('is_logged_in', 'true');
        // 사용자별 개별 메뉴 권한 조회를 위해 UUID 저장
        localStorage.setItem('user_uuid', authData.user.id);

        if (authData?.session) {
          // 1. 아이디(이메일)는 창을 닫아도 기억해야 하므로 LocalStorage에 저장
          localStorage.setItem('saved_email', email); 
          
          // 2. 로그인 상태(is_logged_in)는 창을 닫으면 날아가야 하므로 SessionStorage에 저장 🚀
          sessionStorage.setItem('is_logged_in', 'true');
          
          // 나머지 정보들(역할 등)도 보안을 위해 SessionStorage로 옮기는 것이 좋습니다.
          sessionStorage.setItem('user_role', userData.user_role);
          //sessionStorage.setItem('driver_email', userData.driver_email);
          alert(`${userData.user_name}님, 환영합니다!`);
          window.location.replace('/delivery');
          // setTimeout(() => {
          //   window.location.href = '/delivery';
          // }, 100);
        }
        setLoading(false);
      }
    } catch (error: any) {
      console.error("❌ [Critical Error] 로그인 프로세스 중 예외 발생:", error);
      alert("로그인 처리 중 에러가 발생했습니다.");
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen flex items-center justify-center p-4 overflow-hidden">
      <div 
        className="absolute inset-0 -z-10 w-full h-full bg-cover bg-center bg-no-repeat"
        style={{ 
          backgroundImage: "url('/images/login_img.jpg')",
          filter: "brightness(0.5)"
        }}
      />
      <div className="w-full max-w-md bg-white/95 backdrop-blur-md p-10 rounded-[2.5rem] shadow-2xl border border-white/20">
        <div className="text-center mb-10">
          <h1 className="text-3xl font-black text-blue-600 tracking-tighter mb-1">KS Logistics</h1>
          <p className="text-slate-500 text-sm font-bold uppercase tracking-widest">Login System</p>
        </div>
        <form onSubmit={handleLogin} className="flex flex-col gap-5">
          <div className="space-y-1">
            <label className="text-xs font-black text-slate-600 ml-2">이메일 계정</label>
            <input 
              type="email" 
              placeholder="example@gmail.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required 
              className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl text-slate-900 font-bold outline-none focus:ring-2 focus:ring-blue-500 transition-all"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-black text-slate-600 ml-2">비밀번호</label>
            <input 
              type="password" 
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl text-slate-900 font-bold outline-none focus:ring-2 focus:ring-blue-500 transition-all"
            />
          </div>
          <button 
            type="submit" 
            disabled={loading}
            className="w-full py-4 mt-4 bg-blue-600 text-white rounded-2xl font-black text-lg shadow-lg hover:bg-blue-700 active:scale-[0.98] transition-all disabled:bg-slate-400"
          >
            {loading ? '인증 확인 중...' : '로그인'}
          </button>
        </form>
        <div className="mt-8 flex flex-col gap-3 text-center">
          {/* 아이디 찾기 버튼 추가 */}
          <button 
            onClick={() => { setIsModalOpen(true); setFoundEmail(null); }}
            className="text-sm text-blue-600 hover:text-blue-800 font-bold underline underline-offset-4 transition-all"
          >
            아이디를 잊으셨나요?
          </button>
          
          <button 
            onClick={handleResetPassword}
            className="text-sm text-slate-400 hover:text-blue-600 font-bold underline underline-offset-4 transition-all"
          >
            비밀번호를 잊으셨나요?
          </button>
          <div className="h-px bg-slate-100 w-1/2 mx-auto my-1" />
          <p className="text-sm text-slate-500 font-medium">
            아직 계정이 없으신가요?{' '}
            <Link 
              href="/signup" 
              className="text-blue-600 hover:text-blue-800 font-black underline underline-offset-4 transition-all"
            >
              회원가입 하러가기
            </Link>
          </p>
        </div>
      </div>

      {/* 🌟 아이디 찾기 모달 UI */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
          <div className="bg-white p-8 rounded-[2rem] w-full max-w-md shadow-2xl">
            <h2 className="text-2xl font-black text-slate-800 mb-2">아이디 찾기</h2>
            <p className="text-sm text-slate-500 mb-6 font-medium">등록된 이름과 연락처를 입력해주세요.</p>
            
            <div className="space-y-4">
              {/* 이름 입력창 */}
              <input
                type="text"
                placeholder="사용자 이름"
                value={findInfo.name}
                className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl font-bold outline-none focus:ring-2 focus:ring-blue-500 text-slate-900 placeholder:text-slate-400" // text-slate-900 추가
                onChange={(e) => setFindInfo({ ...findInfo, name: e.target.value })}
              />

              {/* 연락처 입력창 */}
              <input
                type="text"
                placeholder="연락처 (예: 010-0000-0000)"
                value={findInfo.phone}
                maxLength={13}
                className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl font-bold outline-none focus:ring-2 focus:ring-blue-500 text-slate-900 placeholder:text-slate-400" // text-slate-900 추가
                onChange={(e) => {
                  const formatted = formatPhoneNumber(e.target.value);
                  setFindInfo({ ...findInfo, phone: formatted });
                }}
              />
            </div>

            {foundEmail && (
              <div className="mt-6 p-4 bg-blue-50 text-blue-700 rounded-xl text-center font-bold border border-blue-100 animate-in fade-in zoom-in duration-300">
                {foundEmail}
              </div>
            )}

            <div className="flex gap-3 mt-8">
              <button 
                onClick={() => setIsModalOpen(false)}
                className="flex-1 py-4 bg-slate-100 text-slate-600 rounded-xl font-black hover:bg-slate-200 transition-all"
              >
                닫기
              </button>
              <button 
                onClick={handleFindId}
                className="flex-1 py-4 bg-blue-600 text-white rounded-xl font-black hover:bg-blue-700 shadow-lg transition-all"
              >
                아이디 확인
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}