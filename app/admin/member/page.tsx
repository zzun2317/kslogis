'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

interface CommonCode {
  comm_mcode: string;
  comm_ccode: string;
  comm_text1: string;
}

interface CommonCodesState {
  roles: CommonCode[];
  centers: CommonCode[];
  areas: CommonCode[];
}

export default function UserManagePage() {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [commonCodes, setCommonCodes] = useState<CommonCodesState>({ roles: [], centers: [], areas: [] });
  // 모달 제어를 위한 상태 (컴포넌트 내부)
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<any>(null); // 현재 수정 중인 유저 데이터
  const [editFormData, setEditFormData] = useState<any>({});    // 수정용 폼 데이터
  
  const [search, setSearch] = useState({
    name: '',
    hpno: '',
    email: '',
    role: '',
    center: ''
  });

  const handleEditClick = async (user: any) => {
    let combinedData = { ...user };

    if (user.user_role === '001004') {
      const { data: driverData } = await supabase
        .from('ks_driver')
        .select(`
          *,
          center_info:ks_common!driver_center(comm_text1),
          area_info:ks_common!driver_area(comm_text1)
        `)
        .eq('driver_id', user.user_id)
        .single();
      
      if (driverData) {
        combinedData = { ...combinedData, ...driverData };
      }
    }
    setSelectedUser(user);
    setEditFormData(combinedData);
    setIsModalOpen(true);
  };

  const handleUpdateUser = async () => {
    try {
      // 1. ks_users 공통 업데이트
      const { error: userError } = await supabase
        .from('ks_users')
        .update({
          user_hpno: editFormData.user_hpno,
          user_role: editFormData.user_role,
          user_center: editFormData.user_center
        })
        .eq('user_id', editFormData.user_id);

      if (userError) throw userError;

      // 2. 기사인 경우 ks_driver 추가 업데이트
      if (selectedUser.user_role === '001004') {
        const { error: driverError } = await supabase
          .from('ks_driver')
          .update({
            driver_hpno: editFormData.user_hpno, // 유저정보와 연동
            driver_carno: editFormData.driver_carno,
            driver_center: editFormData.driver_center,
            driver_area: editFormData.driver_area
          })
          .eq('driver_id', editFormData.user_id);

        if (driverError) throw driverError;
      }

      alert('사용자 정보가 성공적으로 수정되었습니다.');
      setIsModalOpen(false);
      fetchUsers(); // 목록 새로고침
    } catch (error: any) {
      alert('수정 중 오류 발생: ' + error.message);
    }
  };

  // 스타일 가이드 적용 
  const filterInputStyle = "border border-slate-300 bg-white rounded-lg px-2 py-1.5 text-xs font-black text-slate-900 outline-none placeholder:text-slate-400 placeholder:font-normal focus:ring-2 focus:ring-blue-500 transition-all w-full";
  const headerStyle = "sticky top-0 z-20 bg-slate-900 p-3 text-xs font-black text-slate-400 uppercase tracking-wider border-r border-slate-800 text-center select-none";
  const cellStyle = "p-2 border-r border-slate-100 text-sm text-center align-middle whitespace-nowrap";
  const dataCellStyle = `p-2 border-r border-slate-100 text-sm text-center align-middle whitespace-nowrap font-bold text-slate-700`;
  const nameCellStyle = `p-2 border-r border-slate-100 text-sm text-center align-middle whitespace-nowrap font-black text-blue-600`;

  useEffect(() => {
    const fetchCommonCodes = async () => {
      const { data } = await supabase.from('ks_common').select('*');
      setCommonCodes({
        roles: data?.filter(c => c.comm_mcode === '001') || [],
        centers: data?.filter(c => c.comm_mcode === '004') || [],
        areas: data?.filter(c => c.comm_mcode === '007') || []
        
      });
    };
    fetchCommonCodes();
    fetchUsers(); // 초기 로드
  }, []);

  const fetchUsers = async () => {
    setLoading(true);
    let query = supabase
      .from('ks_users')
      .select(`
        *,
        role_info:ks_common!user_role(comm_text1),
        center_info:ks_common!user_center(comm_text1)
      `);

    if (search.name) query = query.ilike('user_name', `%${search.name}%`);
    if (search.hpno) query = query.ilike('user_hpno', `%${search.hpno}%`);
    if (search.email) query = query.ilike('user_email', `%${search.email}%`);
    if (search.role) query = query.eq('user_role', search.role);
    if (search.center) query = query.eq('user_center', search.center);

    const { data, error } = await query.order('user_name', { ascending: true });
    if (!error) setUsers(data || []);
    setLoading(false);
  };

  return (
    <div className="h-[100dvh] bg-slate-100 p-3 flex flex-col overflow-hidden">
      {/* --- 상단 필터 영역 (배송수정 페이지 스타일)  --- */}
      <div className="flex flex-wrap items-center justify-between mb-3 gap-3 bg-white p-4 rounded-xl shadow-sm border border-slate-200 shrink-0">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
          {/* 이름 검색 */}
          <div className="flex items-center gap-1.5">
            <span className="text-[12px] font-black w-8 text-slate-400 uppercase">이름</span>
            <input 
              className={`${filterInputStyle} w-50`}
              onChange={(e) => setSearch({...search, name: e.target.value})} 
              onKeyDown={(e) => e.key === 'Enter' && fetchUsers()}
            />
          </div>

          {/* 연락처 검색 */}
          <div className="flex items-center gap-1.5">
            <span className="text-[12px] font-black w-12 text-slate-400 uppercase">연락처</span>
            <input 
              className={`${filterInputStyle} w-80`}
              onChange={(e) => setSearch({...search, hpno: e.target.value})} 
              onKeyDown={(e) => e.key === 'Enter' && fetchUsers()}
            />
          </div>

          {/* 권한 필터 */}
          <div className="flex items-center gap-1.5 sm:border-l sm:pl-4 border-slate-200">
            <span className="text-[12px] font-black w-8 text-slate-400 uppercase">권한</span>
            <select 
              className={filterInputStyle}
              onChange={(e) => setSearch({...search, role: e.target.value})}
            >
              <option value="">전체 권한</option>
              {commonCodes.roles.map(r => <option key={r.comm_ccode} value={r.comm_ccode}>{r.comm_text1}</option>)}
            </select>
          </div>

          {/* 물류센터 필터 */}
          <div className="flex items-center gap-1.5 sm:border-l sm:pl-4 border-slate-200">
            <span className="text-[12px] font-black w-15 text-slate-400 uppercase">물류센터</span>
            <select 
              className={filterInputStyle}
              onChange={(e) => setSearch({...search, center: e.target.value})}
            >
              <option value="">전체 센터</option>
              {commonCodes.centers.map(c => <option key={c.comm_ccode} value={c.comm_ccode}>{c.comm_text1}</option>)}
            </select>
          </div>
        </div>

        {/* 조회 버튼 */}
        <button 
          onClick={fetchUsers} 
          disabled={loading} 
          className="bg-slate-900 text-white px-5 py-2 rounded-xl font-black text-xs hover:bg-blue-600 transition-all disabled:opacity-50 flex items-center gap-2 shadow-lg"
        >
          {loading ? '조회 중...' : '조회하기'}
          {!loading && <span className="bg-white/20 px-1.5 py-0.5 rounded text-[10px]">{users.length}</span>}
        </button>
      </div>

      {/* --- 메인 테이블 영역 (배송수정 페이지 스타일) --- */}
      <div className="bg-white rounded-xl shadow-xl border border-slate-200 flex-1 overflow-hidden flex flex-col">
        <div className="overflow-auto custom-scrollbar flex-1">
          <table className="w-full border-collapse border-spacing-0">
            <thead>
              <tr className="bg-slate-900">
                <th className={`${headerStyle} sticky left-0 z-30 w-16`}>No</th>
                <th className={headerStyle}>아이디</th>
                <th className={headerStyle}>이름</th>
                <th className={headerStyle}>연락처</th>
                <th className={headerStyle}>이메일</th>
                <th className={headerStyle}>권한</th>
                <th className={headerStyle}>물류센터</th>
                <th className={headerStyle}>동의여부</th>
                <th className={`${headerStyle} w-20`}>관리</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {users.map((user, idx) => (
                <tr key={user.user_uuid} className="hover:bg-slate-50 transition-colors">
                  <td className={`${cellStyle} sticky left-0 bg-white z-10 font-black text-slate-400 text-[11px]`}>{idx + 1}</td>
                  <td className={`${dataCellStyle} font-bold text-slate-700`}>{user.user_id}</td>
                  <td className={`${nameCellStyle} font-black text-blue-600`}>{user.user_name}</td>
                  <td className={dataCellStyle}>{user.user_hpno}</td>
                  <td className={dataCellStyle}>{user.user_email}</td>
                  <td className={dataCellStyle}>
                    <span className="bg-slate-100 px-2 py-1 rounded text-[11px] font-bold">
                      {user.role_info?.comm_text1 || user.user_role}
                    </span>
                  </td>
                  <td className={dataCellStyle}>{user.center_info?.comm_text1 || user.user_center}</td>
                  <td className={dataCellStyle}>
                    <div className="flex justify-center items-center">
                      <input
                        type="checkbox"
                        checked={user.user_agree}
                        readOnly // 조회 화면이므로 우선 readOnly 처리
                        className="
                          w-4 h-4 
                          cursor-default
                          accent-blue-600 
                          rounded 
                          border-slate-300 
                          transition-all 
                          transform scale-125
                        "
                      />
                    </div>
                  </td>
                  <td className={dataCellStyle}>
                    <button onClick={() => handleEditClick(user)} className="text-blue-600 font-black text-xs underline underline-offset-4 hover:text-blue-800">
                      수정
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {isModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden border border-slate-200">
            {/* 모달 헤더 */}
            <div className="bg-slate-900 p-4 flex justify-between items-center">
              <h2 className="text-white font-black text-sm uppercase tracking-widest">사용자 정보 수정</h2>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-white text-xl">✕</button>
            </div>

            <div className="p-6 space-y-4">
              {/* 공통 수정 불가 항목 (아이디, 이메일) */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase mb-1">아이디 (수정불가)</label>
                  <input value={editFormData.user_id} readOnly className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs font-bold text-slate-500 cursor-not-allowed" />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase mb-1">이메일 (수정불가)</label>
                  <input value={editFormData.user_email} readOnly className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs font-bold text-slate-500 cursor-not-allowed" />
                </div>
              </div>

              {/* 연락처 수정 (000-0000-0000) */}
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase mb-1">연락처</label>
                <input 
                  value={editFormData.user_hpno || ''} 
                  onChange={(e) => setEditFormData({...editFormData, user_hpno: e.target.value, driver_hpno: e.target.value})}
                  className="w-full border border-slate-300 rounded-lg p-2 text-xs font-black text-slate-900 focus:ring-2 focus:ring-blue-500 outline-none" 
                />
              </div>

              {/* 일반 사용자 vs 기사별 분기 입력창 */}
              {selectedUser.user_role === '001004' ? (
                /* 기사 전용 수정 항목 */
                <div className="space-y-4 pt-4 border-t border-slate-100">
                  <span className="text-[10px] font-black text-blue-600 uppercase">기사 전용 정보</span>
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase mb-1">차량번호</label>
                    <input 
                      value={editFormData.driver_carno || ''} 
                      onChange={(e) => setEditFormData({...editFormData, driver_carno: e.target.value})}
                      className="w-full border border-slate-300 rounded-lg p-2 text-xs font-black text-slate-900 focus:ring-2 focus:ring-blue-500 outline-none" 
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[10px] font-black text-slate-400 uppercase mb-1">소속 물류센터</label>
                      <select 
                        value={editFormData.driver_center || ''} 
                        onChange={(e) => setEditFormData({...editFormData, driver_center: e.target.value})}
                        className="w-full border border-slate-300 rounded-lg p-2 text-xs font-black text-slate-900 focus:ring-2 focus:ring-blue-500 outline-none"
                      >
                        {commonCodes.centers.map(c => <option key={c.comm_ccode} value={c.comm_ccode}>{c.comm_text1}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10px] font-black text-slate-400 uppercase mb-1">배송지역</label>
                        <select 
                          // editFormData에 저장된 6자리 코드가 value와 매칭됩니다.
                          value={editFormData.driver_area || ''} 
                          onChange={(e) => setEditFormData({...editFormData, driver_area: e.target.value})}
                          className="w-full border border-slate-300 rounded-lg p-2 text-xs font-black text-slate-900 focus:ring-2 focus:ring-blue-500 outline-none"
                        >
                          <option value="">지역 선택</option>
                          {commonCodes.areas.map((a) => (
                            <option key={a.comm_ccode} value={a.comm_ccode}>
                              {a.comm_text1}
                            </option>
                          ))}
                        </select>
                    </div>
                  </div>
                </div>
              ) : (
                /* 일반 사용자 전용 수정 항목 */
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase mb-1">권한 설정</label>
                    <select 
                      value={editFormData.user_role || ''} 
                      onChange={(e) => setEditFormData({...editFormData, user_role: e.target.value})}
                      className="w-full border border-slate-300 rounded-lg p-2 text-xs font-black text-slate-900 focus:ring-2 focus:ring-blue-500 outline-none"
                    >
                      {commonCodes.roles.map(r => <option key={r.comm_ccode} value={r.comm_ccode}>{r.comm_text1}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase mb-1">소속 물류센터</label>
                    <select 
                      value={editFormData.user_center || ''} 
                      onChange={(e) => setEditFormData({...editFormData, user_center: e.target.value})}
                      className="w-full border border-slate-300 rounded-lg p-2 text-xs font-black text-slate-900 focus:ring-2 focus:ring-blue-500 outline-none"
                    >
                      {commonCodes.centers.map(c => <option key={c.comm_ccode} value={c.comm_ccode}>{c.comm_text1}</option>)}
                    </select>
                  </div>
                </div>
              )}
            </div>

            {/* 모달 푸터 (저장 버튼) */}
            <div className="p-4 bg-slate-50 flex gap-2">
              <button onClick={() => setIsModalOpen(false)} className="flex-1 py-3 text-xs font-black text-slate-500 hover:bg-slate-200 rounded-xl transition-all">취소</button>
              <button onClick={handleUpdateUser} className="flex-[2] py-3 text-xs font-black text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-lg shadow-blue-200 transition-all">정보 업데이트 저장</button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}