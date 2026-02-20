'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';

export default function MenuAdminPage() {
  const [menus, setMenus] = useState<any[]>([]);
  const [selectedMenu, setSelectedMenu] = useState<any>(null);
  const [roles, setRoles] = useState<any[]>([]);
  const [authorizedRoles, setAuthorizedRoles] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<'ROLE' | 'USER'>('ROLE'); // 탭 상태
  const [allUsers, setAllUsers] = useState<any[]>([]); // 전체 사용자 리스트
  const [userSearch, setUserSearch] = useState(''); // 사용자 검색어
  const [authorizedUsers, setAuthorizedUsers] = useState<string[]>([]); // 이 메뉴 권한을 가진 사용자 UUID들
  const [loading, setLoading] = useState(false);
  const [searchKeyword, setSearchKeyword] = useState(''); // 검색어 입력값
  const [searchResults, setSearchResults] = useState<any[]>([]); // 검색 결과 리스트

  // 사용자 검색 함수 (이름, 이메일, 연락처 통합 검색)
  const handleUserSearch = async () => {
    if (!searchKeyword.trim()) {
      alert('검색어를 입력해주세요.');
      return;
    }
  
    setLoading(true);
    try {
      const { data, error } = await supabase
      .from('ks_users')
      .select('user_uuid, user_name, user_email, user_hpno')
      .or(`user_name.ilike.%${searchKeyword}%,user_email.ilike.%${searchKeyword}%,user_hpno.ilike.%${searchKeyword}%`)
      .limit(50);

      if (error) {
      console.error("❌ 쿼리 상세 에러:", error.message); // 여기서 구체적인 이유를 알려줍니다.
      throw error;
      }
      setSearchResults(data || []);
      if (data?.length === 0) alert('조회된 사용자가 없습니다.');
    } catch (err) {
      alert('사용자 조회 중 오류 발생');
    } finally {
      setLoading(false);
    }
  };

  // --- 신규 메뉴 입력을 위한 상태 ---
  const [isAdding, setIsAdding] = useState(false);
  const [newMenu, setNewMenu] = useState({ menu_name: '', menu_path: '', menu_sort: 0, is_use: true });

  const fetchInitialData = useCallback(async () => {
    setLoading(true);
    try {
      const { data: menuData } = await supabase.from('ks_menu').select('*').order('menu_sort', { ascending: true });
      const { data: roleData } = await supabase.from('ks_common').select('comm_ccode, comm_text1').eq('comm_mcode', '001').eq('comm_use', true).order('comm_sort');
      const { data: userData } = await supabase.from('ks_users').select('user_uuid, user_name, user_email').eq('user_usegbn', true);

      if (menuData) {
          setMenus(menuData);
          setNewMenu(prev => ({ ...prev, menu_sort: menuData.length + 1 }));
      }
      if (roleData) {
          setRoles([
            { comm_ccode: 'ALL', comm_text1: '★ 전체 공통 메뉴' }, 
            ...roleData
          ]);
      }
      if (userData) setAllUsers(userData);
    } catch (error) {
      console.error("초기 데이터 로드 에러:", error);
    } finally {
      // 🚀 이 부분이 추가되어야 '처리 중' 상태가 풀립니다.
      setLoading(false);
    }
  }, []);

  // 메뉴 리스트 내의 필드 값을 변경하는 함수
    const handleMenuFieldChange = (index: number, field: string, value: any) => {
      const updatedMenus = [...menus];
      updatedMenus[index] = { ...updatedMenus[index], [field]: value };
      setMenus(updatedMenus);
    };

  useEffect(() => { fetchInitialData(); }, [fetchInitialData]);

  // 메뉴 선택 시 권한 로드 (그룹 & 사용자)
  useEffect(() => {
    const fetchAuthData = async () => {
      if (!selectedMenu) {
        setAuthorizedRoles([]);
        setAuthorizedUsers([]);
        setSearchResults([]);
        return;
      }
      
      // 1. 그룹 권한 로드
      const { data: rData } = await supabase.from('ks_menu_auth').select('role_code').eq('menu_id', selectedMenu.menu_id);
      if (rData) setAuthorizedRoles(rData.map(item => item.role_code));

      // [중요: 현재 개별 권한이 있는 사용자 정보 로드]
      // ks_menu_user와 ks_users를 조인하여 정보를 가져옵니다.
        const { data: uAuthData, error } = await supabase
        .from('ks_menu_user')
        .select(`
          user_id,
          ks_users!inner (
            user_uuid,
            user_name,
            user_email,
            user_hpno
          )
        `)
        .eq('menu_id', selectedMenu.menu_id);

      if (uAuthData) {
        // 1. 체크박스 상태 업데이트용 UUID 배열
        const uuids = uAuthData.map((item: any) => item.user_id);
        setAuthorizedUsers(uuids);

        // 2. 검색 결과창에 현재 권한자들을 먼저 표시 (ks_users 정보만 추출)
        const existingUsers = uAuthData.map((item: any) => item.ks_users).filter(Boolean);
        setSearchResults(existingUsers);
      }
    };

    fetchAuthData();
  }, [selectedMenu]);

  // --- 메뉴 수정 저장 (is_use 포함) ---
  const handleUpdateMenu = async (menu: any) => {
    setLoading(true);
    try {
      const { error } = await supabase
        .from('ks_menu')
        .update({ 
          menu_name: menu.menu_name, 
          menu_path: menu.menu_path, 
          menu_sort: menu.menu_sort,
          is_use: menu.is_use 
        })
        .eq('menu_id', menu.menu_id);

      if (error) throw error;
      alert('메뉴 정보가 수정되었습니다.');
    } catch (e) {
      alert('수정 실패');
    } finally {
      setLoading(false);
    }
  };

  // 메뉴 선택 시 권한 로드
  useEffect(() => {
    const fetchMenuAuth = async () => {
      if (!selectedMenu) { setAuthorizedRoles([]); return; }
      const { data } = await supabase.from('ks_menu_auth').select('role_code').eq('menu_id', selectedMenu.menu_id);
      if (data) setAuthorizedRoles(data.map(item => item.role_code));
    };
    fetchMenuAuth();
  }, [selectedMenu]);

  // --- 신규 메뉴 저장 함수 ---
  const handleSaveNewMenu = async () => {
    if (!newMenu.menu_name || !newMenu.menu_path) return alert('메뉴명과 경로를 입력해주세요.');
    setLoading(true);
    try {
      const { error } = await supabase.from('ks_menu').insert([newMenu]);
      if (error) throw error;
      alert('메뉴가 추가되었습니다.');
      setIsAdding(false);
      setNewMenu({ menu_name: '', menu_path: '', menu_sort: menus.length + 2, is_use: true });
      fetchInitialData();
    } catch (e) {
      alert('저장 실패');
    } finally {
      setLoading(false);
    }
  };

  // --- 🚀 권한 저장 로직 (통합) ---
  const saveAllPermissions = async () => {
    if (!selectedMenu) return;
    setLoading(true);
    try {
      if (activeTab === 'ROLE') {
        // 그룹 권한 업데이트
        await supabase.from('ks_menu_auth').delete().eq('menu_id', selectedMenu.menu_id);
        if (authorizedRoles.length > 0) {
          await supabase.from('ks_menu_auth').insert(authorizedRoles.map(role => ({ menu_id: selectedMenu.menu_id, role_code: role })));
        }
      } else {
        // 사용자 개별 권한 업데이트
        await supabase.from('ks_menu_user').delete().eq('menu_id', selectedMenu.menu_id);
        if (authorizedUsers.length > 0) {
          await supabase.from('ks_menu_user').insert(authorizedUsers.map(uuid => ({ menu_id: selectedMenu.menu_id, user_id: uuid })));
        }
      }
      alert('권한 설정이 저장되었습니다.');
    } catch (e) {
      alert('저장 중 오류 발생');
    } finally {
      setLoading(false);
    }
  };

  // 사용자 필터링 리스트
  const filteredUsers = allUsers.filter(u => 
    u.user_name.includes(userSearch) || u.user_email.includes(userSearch)
  );

  const inputStyle = "w-full border border-slate-300 px-2 py-1 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-700";

  return (
    <div className="p-6 bg-slate-50 min-h-screen">
      <div className="max-w-7xl mx-auto flex flex-col gap-6">
        <h1 className="text-2xl font-black text-slate-800">메뉴 마스터 및 권한 설정</h1>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 h-[750px]">
          {/* [LEFT] 메뉴 리스트 (수정 가능 버전) */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col overflow-hidden">
            <div className="p-4 bg-slate-800 text-white flex justify-between items-center shrink-0">
              <span className="font-bold text-sm">메뉴 관리 ({menus.length})</span>
              <button onClick={() => setIsAdding(!isAdding)} className={`text-xs px-3 py-1.5 rounded font-bold ${isAdding ? 'bg-red-500' : 'bg-blue-600'}`}>
                {isAdding ? '취소' : '신규 추가'}
              </button>
            </div>
            
            <div className="overflow-auto flex-1">
              <table className="w-full text-left text-sm border-collapse">
                <thead className="sticky top-0 bg-slate-100 z-10 border-b">
                  <tr className="text-slate-600 text-[11px] uppercase tracking-wider">
                    <th className="p-3 w-14 text-center">순서</th>
                    <th className="p-3 w-32">메뉴명</th>
                    <th className="p-3">경로</th>
                    <th className="p-3 w-14 text-center">사용</th>
                    <th className="p-3 w-16 text-center">작업</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {/* 신규 입력 줄 */}
                  {isAdding && (
                    <tr className="bg-blue-50">
                      <td className="p-2"><input type="number" className={inputStyle} value={newMenu.menu_sort} onChange={e => setNewMenu({...newMenu, menu_sort: parseInt(e.target.value)})}/></td>
                      <td className="p-2"><input type="text" className={inputStyle} value={newMenu.menu_name} onChange={e => setNewMenu({...newMenu, menu_name: e.target.value})}/></td>
                      <td className="p-2"><input type="text" className={inputStyle} value={newMenu.menu_path} onChange={e => setNewMenu({...newMenu, menu_path: e.target.value})}/></td>
                      <td className="p-2 text-center"><input type="checkbox" checked={newMenu.is_use} onChange={e => setNewMenu({...newMenu, is_use: e.target.checked})}/></td>
                      <td className="p-2"><button onClick={() => {/* handleSaveNewMenu 호출 */}} className="w-full bg-slate-800 text-white py-1 rounded text-[10px] font-bold">저장</button></td>
                    </tr>
                  )}

                  {menus.map((menu, idx) => (
                    <tr 
                      key={menu.menu_id}
                      onClick={() => setSelectedMenu(menu)}
                      className={`transition-colors ${selectedMenu?.menu_id === menu.menu_id ? 'bg-blue-50' : 'hover:bg-slate-50'}`}
                    >
                      <td className="p-2"><input type="number" className={inputStyle} value={menu.menu_sort} onChange={e => handleMenuFieldChange(idx, 'menu_sort', parseInt(e.target.value))}/></td>
                      <td className="p-2"><input type="text" className={inputStyle} value={menu.menu_name} onChange={e => handleMenuFieldChange(idx, 'menu_name', e.target.value)} /></td>
                      <td className="p-2"><input type="text" className={inputStyle} value={menu.menu_path} onChange={e => handleMenuFieldChange(idx, 'menu_path', e.target.value)} /></td>
                      <td className="p-2 text-center">
                        <input 
                          type="checkbox" 
                          checked={menu.is_use} 
                          onChange={e => handleMenuFieldChange(idx, 'is_use', e.target.checked)}
                        />
                      </td>
                      <td className="p-2 text-center">
                        <button 
                          onClick={(e) => { e.stopPropagation(); handleUpdateMenu(menu); }}
                          className="text-blue-600 hover:text-blue-800 font-bold text-[11px]"
                        >
                          수정
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* [RIGHT] 권한 설정 */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col overflow-hidden">
            {/* 🚀 탭 헤더 추가 */}
            <div className="flex bg-slate-100 border-b shrink-0">
                <button 
                  onClick={() => setActiveTab('ROLE')} 
                  className={`flex-1 py-4 text-sm font-bold transition-all ${activeTab === 'ROLE' ? 'bg-white text-blue-600 border-t-2 border-blue-600' : 'text-slate-500 hover:bg-slate-50'}`}
                >
                  그룹별 권한 설정
                </button>
                <button 
                  onClick={() => setActiveTab('USER')} 
                  className={`flex-1 py-4 text-sm font-bold transition-all ${activeTab === 'USER' ? 'bg-white text-blue-600 border-t-2 border-blue-600' : 'text-slate-500 hover:bg-slate-50'}`}
                >
                  사용자별 개별 권한
                </button>
            </div>
            {selectedMenu ? (
              <div className="p-6 flex flex-col h-full">
                <div className="mb-6 p-4 bg-blue-50 rounded-lg border border-blue-100">
                  <p className="text-[10px] text-blue-400 font-bold uppercase">Selected Menu</p>
                  <h2 className="text-xl font-black text-slate-800">{selectedMenu.menu_name}</h2>
                  <p className="text-xs text-slate-500">{selectedMenu.menu_path}</p>
                </div>
                
                <div className="flex-1 overflow-auto">
                  {activeTab === 'ROLE' ? (
                    /* --- 1. 그룹 권한 설정 (기존 로직 유지) --- */
                    <div className="space-y-2">
                        <p className="text-sm font-bold text-slate-600 mb-3 underline decoration-blue-200 underline-offset-4">이 메뉴에 접근 가능한 그룹</p>
                        {roles.map((role) => (
                            <label key={role.comm_ccode} className={`flex items-center p-3 rounded-lg border cursor-pointer transition-all ${authorizedRoles.includes(role.comm_ccode) ? 'border-blue-500 bg-blue-50' : 'border-slate-100 hover:bg-slate-50'}`}>
                                <input type="checkbox" className="w-5 h-5 rounded text-blue-600" checked={authorizedRoles.includes(role.comm_ccode)} onChange={() => setAuthorizedRoles(prev => prev.includes(role.comm_ccode) ? prev.filter(r => r !== role.comm_ccode) : [...prev, role.comm_ccode])}/>
                                <div className="ml-3">
                                    <span className="block font-bold text-slate-700">{role.comm_text1}</span>
                                    <span className="block text-xs text-slate-400">{role.comm_ccode}</span>
                                </div>
                            </label>
                        ))}
                    </div>
                  ) : (
                    /* --- 2.사용자별 개별 권한 설정 (조회 기반으로 변경) --- */
                    <div className="flex flex-col h-full">
                    {/* 조회 조건 영역 */}
                    <div className="mb-4 sticky top-0 bg-white z-10 pb-2">
                        <p className="text-[11px] font-bold text-slate-500 mb-2 uppercase">User Search</p>
                        <div className="flex gap-2">
                        <input 
                            type="text" 
                            placeholder="이름, 이메일, 연락처로 검색..." 
                            value={searchKeyword} // 🚀 searchKeyword로 상태 변경
                            onChange={(e) => setSearchKeyword(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleUserSearch()} // 엔터키 지원
                            className="flex-1 border-2 border-slate-200 rounded-lg px-4 py-2.5 text-sm text-black font-medium focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 outline-none transition-all placeholder:text-slate-400"
                        />
                        <button 
                            onClick={handleUserSearch} // 🚀 DB 조회 함수 호출
                            className="px-5 py-2.5 bg-emerald-600 text-white rounded-lg text-sm font-bold hover:bg-emerald-700 transition-all active:scale-95 shrink-0 shadow-sm"
                        >
                            조회
                        </button>
                        </div>
                    </div>

                    {/* 조회된 결과 리스트 */}
                    <div className="space-y-2 pb-4 flex-1 overflow-auto border-t pt-4">
                    {searchResults.length > 0 ? (
                        <>
                        <p className="text-[10px] text-slate-400 mb-3 font-bold uppercase tracking-wider">
                            {searchKeyword ? '검색 결과' : '현재 권한 보유자'} ({searchResults.length}명)
                        </p>
                        
                        {searchResults.map((user) => {
                            // 🚀 현재 사용자가 체크된 상태(권한 부여 대상)인지 확인
                            const isAlreadyAuth = authorizedUsers.includes(user.user_uuid);

                            return (
                            <label 
                                key={user.user_uuid} 
                                className={`flex items-center p-3 rounded-lg border cursor-pointer transition-all ${
                                isAlreadyAuth 
                                    ? 'border-emerald-500 bg-emerald-50 shadow-sm' 
                                    : 'border-slate-100 hover:bg-slate-50'
                                }`}
                            >
                                <input 
                                type="checkbox" 
                                className="w-5 h-5 rounded text-emerald-600 focus:ring-emerald-500" 
                                checked={isAlreadyAuth} 
                                onChange={() => setAuthorizedUsers(prev => 
                                    prev.includes(user.user_uuid) 
                                    ? prev.filter(id => id !== user.user_uuid) 
                                    : [...prev, user.user_uuid]
                                )}
                                />
                                
                                <div className="ml-3 flex-1 flex justify-between items-center">
                                <div>
                                    <span className="block font-bold text-black text-sm">
                                    {user.user_name} 
                                    <span className="ml-2 text-[10px] text-slate-400 font-normal">
                                        [{user.user_hpno || '연락처없음'}]
                                    </span>
                                    </span>
                                    <span className="block text-[11px] text-slate-500 font-medium">
                                    {user.user_email}
                                    </span>
                                </div>
                                
                                {/* 🚀 권한 상태 배지 (체크된 상태일 때만 표시) */}
                                {isAlreadyAuth && (
                                    <span className="text-[9px] bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-black border border-emerald-200">
                                    AUTHORIZED
                                    </span>
                                )}
                                </div>
                            </label>
                            );
                        })}
                        </>
                    ) : (
                        /* 검색 결과가 없을 때의 가이드 뷰 */
                        <div className="h-full flex flex-col items-center justify-center py-20 text-slate-300">
                        <span className="text-3xl mb-2">🔍</span>
                        <p className="text-sm">조회된 사용자가 없습니다.</p>
                        </div>
                    )}
                    </div>
                </div>
                )}
            </div>
                
                <button 
                onClick={saveAllPermissions} 
                disabled={loading} 
                className="mt-6 w-full py-4 bg-slate-800 text-white rounded-xl font-bold hover:bg-slate-900 transition-all active:scale-[0.98] disabled:bg-slate-300"
                >
                {loading 
                    ? '처리 중...' 
                    : `${activeTab === 'ROLE' ? '그룹별 권한' : '사용자 개별 권한'} 저장하기`
                }
                </button>
              </div>
            ) : (
              <div className="h-full flex items-center justify-center text-slate-300 p-10 text-center">
                <p>좌측 리스트에서 메뉴를 선택하여<br/>접근 권한을 부여하세요.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}