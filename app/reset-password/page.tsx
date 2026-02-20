// 비밀번호 재설정 화면
'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';

export default function ResetPasswordPage() {
  const [newPassword, setNewPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

const handleUpdatePassword = async (e: React.FormEvent) => {
  e.preventDefault();
  setLoading(true);

  const { error } = await supabase.auth.updateUser({
    password: newPassword,
  });

  if (error) {
    alert('변경 실패: ' + error.message);
  } else {
    // ✨ 핵심: 변경 직후 세션을 강제로 로그아웃 시켜서 깨끗하게 만듭니다.
    await supabase.auth.signOut(); 
    
    alert('비밀번호가 변경되었습니다. 새 비밀번호로 다시 로그인해 주세요.');
    window.location.href = '/login'; // router.push 대신 강제 페이지 이동 추천
  }
  setLoading(false);
};

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
      <div className="w-full max-w-md bg-white p-8 rounded-3xl shadow-xl border border-slate-100">
        <h1 className="text-2xl font-black text-slate-800 mb-2">🔒 새 비밀번호 설정</h1>
        <p className="text-slate-400 text-sm mb-8 font-bold">새롭게 사용할 비밀번호를 입력하세요.</p>

        <form onSubmit={handleUpdatePassword} className="flex flex-col gap-4">
          <input 
            type="password" 
            placeholder="새 비밀번호 입력"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:ring-blue-500 font-bold"
            required
            minLength={6}
          />
          
          <button 
            type="submit" 
            disabled={loading}
            className="w-full py-4 bg-blue-600 text-white rounded-2xl font-black text-lg shadow-lg hover:bg-blue-700 transition-all"
          >
            {loading ? '변경 중...' : '비밀번호 변경 완료'}
          </button>
        </form>
      </div>
    </div>
  );
}