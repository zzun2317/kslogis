'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/useAuthStore';
import { useRouter } from 'next/navigation';

export default function CommonCodePage() {
  const router = useRouter();
  const { role, isLoggedIn, user_level } = useAuthStore();
  const userLevel = Number(user_level);
  const [loading, setLoading] = useState(false);
  
  // 상태 관리
  const [mainCodes, setMainCodes] = useState<any[]>([]); // 왼쪽: 대분류 리스트
  const [selectedMCode, setSelectedMCode] = useState<string | null>(null);
  const [subCodes, setSubCodes] = useState<any[]>([]); // 오른쪽: 소분류 리스트
  
  const [isAddingMain, setIsAddingMain] = useState(false);
  const [newMainMemo, setNewMainMemo] = useState('');
  const [isAddingSub, setIsAddingSub] = useState(false);
  const [newSub, setNewSub] = useState({
    comm_text1: '', comm_text2: '', comm_use: true, comm_sort: '1', comm_memo: '', comm_hex: ''
  });
  // 권한 맵 상태 추가
  const [authMap, setAuthMap] = useState<Record<string, { level: number; label: string }>>({});
  // superadmin 여부 확인 (역할 '001001' & 레벨 100)
  const isSuperAdmin = role === '001001' && userLevel === 100;
  const canEdit = userLevel >= 80;

  // 권한 설정 정보 로드
  const fetchAuthSettings = async () => {
    const { data } = await supabase
      .from('ks_common')
      .select('comm_text1, comm_text2, comm_memo')
      .eq('comm_mcode', '000');
    
    if (data) {
      const map = data.reduce((acc: any, cur) => {
        acc[cur.comm_text1] = {
        level: Number(cur.comm_text2) || 80, // 권한 레벨
        label: cur.comm_memo || ''           // 표시될 명칭
      };
        return acc;
      }, {});
      setAuthMap(map);
    }
  };

  // 1. 초기 데이터 로드 (대분류 리스트)
  const fetchMainCodes = useCallback(async () => {
    setLoading(true);
    try {
      // 1. 권한 및 명칭 설정 정보(000 그룹) 조회
      const { data: authData, error: authError } = await supabase
        .from('ks_common')
        .select('comm_text1, comm_text2, comm_memo')
        .eq('comm_mcode', '000');
      
      if (authError) throw authError;

      const tempAuthMap: Record<string, { level: number; label: string }> = {};
      authData?.forEach(item => {
        tempAuthMap[item.comm_text1] = {
          level: Number(item.comm_text2),
          label: item.comm_memo || '' // 000 그룹에 정의된 메모를 명칭으로 사용
        };
      });
      setAuthMap(tempAuthMap);
      // comm_sort = '1'인 데이터를 기준으로 그룹 목록 조회
      const { data, error } = await supabase
        .from('ks_common')
        .select('comm_mcode, comm_memo')
        .eq('comm_sort', '1')
        .order('comm_mcode', { ascending: true });
              
      if (error) throw error;

      // authMap을 기준으로 필터링
      const filtered = (data || []).filter(main => {
        const requiredLevel = tempAuthMap[main.comm_mcode]?.level ?? 80;
        return userLevel >= requiredLevel;
      })
      .map(main => ({
        ...main,
        // 명칭도 authMap에 있는 label(메모)을 우선 사용
        comm_memo: tempAuthMap[main.comm_mcode]?.label || main.comm_memo
      }));

      setMainCodes(filtered);
    } catch (err) {
      console.error("대분류 로드 에러:", err);
    } finally {
      setLoading(false);
    }
  }, [userLevel]);

  useEffect(() => {
    // 1. 인증 로딩이 끝났고(false)
    // 2. 로그인 상태이며
    // 3. 권한이 관리자('001001')일 때만 호출
    // if (isLoggedIn && role === '001001') {
      fetchAuthSettings();
      fetchMainCodes();
    // }
  }, [isLoggedIn, role, fetchMainCodes]);

  // 2. 소분류 데이터 로드 (특정 대분류 선택 시)
  // useEffect(() => {
  //   const fetchSubCodes = async () => {
  //     if (!selectedMCode) {
  //       setSubCodes([]);
  //       return;
  //     }
  //     setLoading(true);
  //     try {
  //       const { data, error } = await supabase
  //         .from('ks_common')
  //         .select('*')
  //         .eq('comm_mcode', selectedMCode)
  //         .order('comm_sort', { ascending: true })
  //         .order('comm_ccode', { ascending: true });

  //       if (error) throw error;
  //       setSubCodes(data || []);
  //     } catch (err) {
  //       console.error("소분류 로드 에러:", err);
  //     } finally {
  //       setLoading(false);
  //     }
  //   };
  //   fetchSubCodes();
  // }, [selectedMCode]);

  // 소분류 데이터 로드 함수 분리
  const fetchSubCodes = useCallback(async (mcode: string) => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('ks_common')
        .select('*')
        .eq('comm_mcode', mcode)
        .order('comm_sort', { ascending: true })
        .order('comm_ccode', { ascending: true });

      if (error) throw error;
      setSubCodes(data || []);
    } catch (err) {
      console.error("소분류 로드 에러:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedMCode) {
      fetchSubCodes(selectedMCode);
    } else {
      setSubCodes([]);
    }
  }, [selectedMCode, fetchSubCodes]);

  // 3. 대분류 신규 저장 로직 (mcode + 1 및 001 자동생성)
  const handleSaveMain = async () => {

    if (!isSuperAdmin) {
      alert('그룹 생성 권한이 없습니다.');
      return;
    }

    if (!newMainMemo.trim()) return alert('그룹 설명을 입력해주세요.');
    setLoading(true);
    try {
      // 마지막 mcode 찾기
      const lastCode = mainCodes.length > 0 ? mainCodes[mainCodes.length - 1].comm_mcode : '000';
      const nextMCode = (parseInt(lastCode) + 1).toString().padStart(3, '0');
      const nextCCode = nextMCode + '001'; // 첫 번째 소분류 코드 자동 생성

      const { error } = await supabase.from('ks_common').insert([{
        comm_mcode: nextMCode,
        comm_ccode: nextCCode,
        comm_memo: newMainMemo,
        comm_text1: newMainMemo, // 초기 명칭은 메모와 동일하게 설정
        comm_sort: '1',
        comm_use: true
      }]);

      if (error) throw error;
      alert(`새 그룹 [${nextMCode}]이 생성되었습니다.`);
      setIsAddingMain(false);
      setNewMainMemo('');
      fetchMainCodes();
    } catch (err) {
      alert('대분류 저장 실패');
    } finally {
      setLoading(false);
    }
  };

  // 4. 소분류 신규 저장 로직
  const handleSaveSub = async () => {
    if (!selectedMCode) return alert('대분류를 먼저 선택해주세요.');
    setLoading(true);
    try {
      // 1. DB에서 해당 대분류(mcode)의 가장 큰 소분류(ccode)를 직접 조회
      const { data: lastData, error: fetchError } = await supabase
        .from('ks_common')
        .select('comm_ccode, comm_sort, comm_memo')
        .eq('comm_mcode', selectedMCode)
        .lt('comm_ccode', selectedMCode + '900') // 900번대(관리자용) 제외. 사용자용 공통코드범위 : 00#001 ~ 00#899
        .order('comm_ccode', { ascending: false })
        .limit(1)
        .single();

      if (fetchError && fetchError.code !== 'PGRST116') { // PGRST116은 데이터가 없을 때 발생하는 코드
        throw fetchError;
      }
      // 2. 신규 코드 결정
      // 데이터가 있으면 마지막 값 + 1, 없으면 mcode + '001'
      let nextCCode;
      let nextSort;
      let setmemo;
      if (lastData) {
        nextCCode = (BigInt(lastData.comm_ccode) + BigInt(1)).toString().padStart(6, '0');
        nextSort = (Number(lastData.comm_sort || 0) + 1).toString();
        setmemo = lastData.comm_memo;
      } else {
        nextCCode = selectedMCode + '001';
        nextSort = '1';
        setmemo = '';
      }
      // 현재 그룹의 마지막 ccode 찾기
      // const lastSub = subCodes.length > 0 ? subCodes[subCodes.length - 1].comm_ccode : selectedMCode + '000';
      // const nextCCode = (BigInt(lastSub) + BigInt(1)).toString().padStart(6, '0');
      // console.log("-------------------------------");
      // console.log("선택된 대분류(MCode):", selectedMCode);
      // console.log("마지막 소분류(LastSub):", lastSub);
      // console.log("생성된 신규코드(NextCCode):", nextCCode);
      // console.log("데이터 타입:", typeof nextCCode);
      // console.log("-------------------------------");

      const { error } = await supabase.from('ks_common').insert([{
        ...newSub,
        comm_mcode: selectedMCode,
        comm_ccode: nextCCode,
        comm_sort: nextSort
      }]);

      if (error) throw error;
      alert('소분류가 추가되었습니다.');
      setIsAddingSub(false);
      setNewSub({ comm_text1: '', comm_text2: '', comm_use: true, comm_sort: (Number(nextSort) + 1).toString(), comm_memo: setmemo, comm_hex: '' });
      // 목록 새로고침을 위해 selectedMCode를 다시 세팅하거나 수동 페치
      // setSelectedMCode(selectedMCode); 
      fetchSubCodes(selectedMCode);
    } catch (err) {
      alert('소분류 저장 실패');
    } finally {
      setLoading(false);
    }
  };

  // 5. 공통 수정 로직
  const handleUpdate = async (item: any) => {
    setLoading(true);
    try {
      const { error } = await supabase
        .from('ks_common')
        .update({
          comm_text1: item.comm_text1,
          comm_text2: item.comm_text2,
          comm_use: item.comm_use,
          comm_sort: item.comm_sort,
          comm_memo: item.comm_memo,
          comm_hex: item.comm_hex
        })
        .eq('comm_mcode', item.comm_mcode)
        .eq('comm_ccode', item.comm_ccode);

      if (error) throw error;
      alert('수정되었습니다.');
    } catch (err) {
      alert('수정 실패');
    } finally {
      setLoading(false);
    }
  };

  const inputStyle = "w-full border border-slate-300 px-2 py-1 rounded text-sm text-slate-700 focus:ring-2 focus:ring-blue-500 outline-none";

  return (
    <div className="p-6 bg-slate-50 min-h-screen">
      <div className="max-w-7xl mx-auto flex flex-col gap-6">
        <h1 className="text-2xl font-black text-slate-800">공통코드 관리</h1>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-[750px]">
          {/* [LEFT] 대분류 목록 */}
          <div className="lg:col-span-1 bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col overflow-hidden">
            <div className="p-4 bg-slate-800 text-white flex justify-between items-center shrink-0">
              <span className="font-bold text-sm">대분류 (comm_mcode)</span>
                {isSuperAdmin && (
                  <button onClick={() => setIsAddingMain(!isAddingMain)} className="text-xs bg-blue-600 px-3 py-1.5 rounded font-bold hover:bg-blue-700 transition-all">
                    {isAddingMain ? '취소' : '그룹 추가'}
                  </button>
                )}
            </div>
            
            <div className="overflow-auto flex-1">
              <table className="w-full text-left text-sm">
                <thead className="sticky top-0 bg-slate-100 z-10 border-b">
                  <tr className="text-slate-500 text-[11px] uppercase">
                    <th className="p-3 w-20 text-center">코드</th>
                    <th className="p-3">그룹 설명 (memo)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {isAddingMain && (
                    <tr className="bg-blue-50">
                      <td className="p-2 text-center text-slate-400 font-bold">자동</td>
                      <td className="p-2 flex gap-2">
                        <input 
                          className={inputStyle} 
                          placeholder="새 그룹 설명 입력" 
                          value={newMainMemo} 
                          onChange={e => setNewMainMemo(e.target.value)}
                        />
                        <button onClick={handleSaveMain} className="bg-slate-800 text-white px-3 rounded text-xs shrink-0">저장</button>
                      </td>
                    </tr>
                  )}
                  {mainCodes.map((main) => (
                    <tr 
                      key={main.comm_mcode} 
                      onClick={() => setSelectedMCode(main.comm_mcode)}
                      className={`cursor-pointer transition-colors ${selectedMCode === main.comm_mcode ? 'bg-blue-50' : 'hover:bg-slate-50'}`}
                    >
                      <td className="p-3 text-center font-bold text-blue-600">{main.comm_mcode}</td>
                      <td className="p-3 font-medium text-slate-700">{main.comm_memo}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* [RIGHT] 소분류 상세 설정 */}
          <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col overflow-hidden">
            <div className="p-4 bg-white border-b flex justify-between items-center shrink-0">
              <h2 className="font-black text-slate-800">
                {selectedMCode ? `[${selectedMCode}] 소분류 상세 : 명칭수정시 전산담당자 확인 필수` : '대분류를 선택해주세요'}
              </h2>
              {selectedMCode && (
                <button 
                  onClick={() => {
                    if (!isAddingSub) {
                      // 추가 모드로 전환될 때 번호 계산
                      const lastSort = subCodes.length > 0 
                        ? Math.max(...subCodes.map(s => Number(s.comm_sort || 0))) 
                        : 0;
                      
                      setNewSub({
                        ...newSub,
                        comm_sort: (lastSort + 1).toString(),
                        comm_text1: '', comm_text2: '', comm_memo: '', comm_hex: '', comm_use: true
                      });
                    }
                    setIsAddingSub(!isAddingSub);
                  }} 
                  className="text-xs bg-emerald-600 text-white px-3 py-1.5 rounded font-bold hover:bg-emerald-700 transition-all">
                  {isAddingSub ? '취소' : '상세 추가'}
                </button>
              )}
            </div>

            <div className="overflow-auto flex-1">
              {selectedMCode ? (
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="sticky top-0 bg-slate-50 z-10 border-b text-slate-500">
                    <tr>
                      <th className="p-2 w-20 text-center">코드</th>
                      <th className="p-2">명칭(text1)</th>
                      <th className="p-2 w-24">상세(text2)</th>
                      <th className="p-2 w-12 text-center">사용</th>
                      <th className="p-2 w-12 text-center">정렬</th>
                      <th className="p-2 w-24">설명(memo)</th>
                      <th className="p-2 w-14 text-center">수정</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {/* 소분류 신규 추가 줄 */}
                    {isAddingSub && (
                      <tr className="bg-emerald-50">
                        <td className="p-2 text-center text-emerald-600 font-bold italic">자동</td>
                        <td className="p-1"><input className={inputStyle} value={newSub.comm_text1} onChange={e => setNewSub({...newSub, comm_text1: e.target.value})}/></td>
                        <td className="p-1"><input className={inputStyle} value={newSub.comm_text2} onChange={e => setNewSub({...newSub, comm_text2: e.target.value})}/></td>
                        <td className="p-1 text-center"><input type="checkbox" checked={newSub.comm_use} onChange={e => setNewSub({...newSub, comm_use: e.target.checked})}/></td>
                        <td className="p-1"><input className={inputStyle} value={newSub.comm_sort} onChange={e => setNewSub({...newSub, comm_sort: e.target.value})}/></td>
                        <td className="p-1"><input className={inputStyle} value={newSub.comm_memo} onChange={e => setNewSub({...newSub, comm_memo: e.target.value})}/></td>
                        <td className="p-1 text-center"><button onClick={handleSaveSub} className="bg-emerald-600 text-white px-2 py-1 rounded font-bold">저장</button></td>
                      </tr>
                    )}
                    {subCodes.map((sub, idx) => (
                      <tr key={sub.comm_ccode} className="hover:bg-slate-50">
                        <td className="p-2 text-center font-mono text-slate-400">{sub.comm_ccode}</td>
                        <td className="p-1"><input className={inputStyle} value={sub.comm_text1} onChange={e => {
                          const updated = [...subCodes]; updated[idx].comm_text1 = e.target.value; setSubCodes(updated);
                        }}/></td>
                        <td className="p-1"><input className={inputStyle} value={sub.comm_text2 || ''} onChange={e => {
                          const updated = [...subCodes]; updated[idx].comm_text2 = e.target.value; setSubCodes(updated);
                        }}/></td>
                        <td className="p-1 text-center">
                          <input type="checkbox" checked={sub.comm_use} onChange={e => {
                            const updated = [...subCodes]; updated[idx].comm_use = e.target.checked; setSubCodes(updated);
                          }}/>
                        </td>
                        <td className="p-1 text-center"><input className={inputStyle} value={sub.comm_sort} onChange={e => {
                          const updated = [...subCodes]; updated[idx].comm_sort = e.target.value; setSubCodes(updated);
                        }}/></td>
                        <td className="p-1"><input className={inputStyle} value={sub.comm_memo || ''} onChange={e => {
                          const updated = [...subCodes]; updated[idx].comm_memo = e.target.value; setSubCodes(updated);
                        }}/></td>
                        <td className="p-1 text-center">
                          <button onClick={() => handleUpdate(sub)} className="text-blue-600 font-bold hover:underline">수정</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="h-full flex items-center justify-center text-slate-300">
                  대분류를 선택하면 상세 코드가 표시됩니다.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}