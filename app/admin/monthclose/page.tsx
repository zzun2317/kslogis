'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { format } from 'date-fns';
import { useAuth } from '@/hook/useAuth';

interface DeliveryClose {
  no: number;
  close_month: string;
  close_gubun: boolean;
  close_uuid: string;
  close_datetime: string;
  user_info?: {
    user_name: string;
  };
}

export default function DeliveryClosePage() {
  const [dataList, setDataList] = useState<DeliveryClose[]>([]);
  const [loading, setLoading] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const { isMaster, userLevel } = useAuth();
  // 권한 조건: Admin 이상(isMaster) AND 레벨 90 이상
  const canManage = isMaster && userLevel >= 90;
  
  // 폼 데이터 상태
  const [formData, setFormData] = useState({
    no: 0,
    close_month: '',
    close_gubun: false
  });

  // 스타일 가이드 (기존 코드와 동일)
  const filterInputStyle = "border border-slate-300 bg-white rounded-lg px-2 py-1.5 text-xs font-black text-slate-900 outline-none focus:ring-2 focus:ring-blue-500 transition-all w-full";
  const headerStyle = "sticky top-0 z-20 bg-slate-900 p-3 text-xs font-black text-slate-400 uppercase tracking-wider border-r border-slate-800 text-center select-none";
  const cellStyle = "p-2 border-r border-slate-100 text-sm text-center align-middle whitespace-nowrap font-bold text-slate-700";

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('ks_deliveryclose')
      .select(`
        *,
        user_info:ks_users!close_uuid(user_name)
      `)
      .order('close_month', { ascending: false });

    if (!error) setDataList(data || []);
    setLoading(false);
  };

  const handleOpenModal = (item?: DeliveryClose) => {
    if (item) {
      setIsEditMode(true);
      // yyyymm -> yyyy-mm 변환 (input month 타입 대응)
      const formattedMonth = `${item.close_month.slice(0, 4)}-${item.close_month.slice(4, 6)}`;
      setFormData({
        no: item.no,
        close_month: formattedMonth,
        close_gubun: item.close_gubun
      });
    } else {
      setIsEditMode(false);
      setFormData({ no: 0, close_month: '', close_gubun: false });
    }
    setIsModalOpen(true);
  };

  const handleSave = async () => {
    if (!canManage) {
      alert('등록 및 수정 권한이 없습니다. 관리자에게 권한을 요청바랍니다.');
      return;
    }

    try {
      const { data: { user } } = await supabase.auth.getUser();
      const rawMonth = formData.close_month.replace('-', ''); // yyyy-mm -> yyyymm
      if (!rawMonth) return alert('마감년월을 선택해주세요.');

      if (isEditMode) {
        // 수정 로직
        const { error } = await supabase
          .from('ks_deliveryclose')
          .update({
            close_gubun: formData.close_gubun,
            close_uuid: user?.id,
            close_datetime: new Date().toISOString()
          })
          .eq('no', formData.no);
        if (error) throw error;
      } else {
        // 신규 등록 로직
        // 1. 중복 체크
        const { data: existing } = await supabase
          .from('ks_deliveryclose')
          .select('close_month')
          .eq('close_month', rawMonth)
          .maybeSingle(); // 데이터가 없어도 에러를 내지 않음

        if (existing) return alert('이미 해당 년월의 마감 데이터가 존재합니다.');

        // 2. No 채번 (Max + 1)
        const { data: maxData } = await supabase
          .from('ks_deliveryclose')
          .select('no')
          .order('no', { ascending: false })
          .limit(1)
          .maybeSingle();
        
        const nextNo = (maxData?.no || 0) + 1;

        // 3. 사용자 정보 가져오기 (세션 등에서 가져온다고 가정)
        // const { data: { user } } = await supabase.auth.getUser();

        const { error } = await supabase
          .from('ks_deliveryclose')
          .insert({
            no: nextNo,
            close_month: rawMonth,
            close_gubun: formData.close_gubun,
            close_uuid: user?.id,
            close_datetime: new Date().toISOString()
          });
        if (error) throw error;
      }

      alert('성공적으로 저장되었습니다.');
      setIsModalOpen(false);
      fetchData();
    } catch (error: any) {
      alert('오류 발생: ' + error.message);
    }
  };

  return (
    <div className="h-[100dvh] bg-slate-100 p-3 flex flex-col overflow-hidden">
      {/* 상단 헤더 영역 */}
      <div className="flex items-center justify-between mb-3 bg-white p-4 rounded-xl shadow-sm border border-slate-200">
        <h1 className="text-sm font-black text-slate-900 uppercase tracking-tight">월별 배송 마감 관리</h1>
        <div className="flex gap-2">
          <button onClick={fetchData} className="bg-slate-900 text-white px-4 py-2 rounded-xl font-black text-xs hover:bg-slate-800 transition-all">조회하기</button>
          {/* 권한이 있는 경우에만 신규 등록 버튼 노출 */}
          {canManage && (
            <button 
              onClick={() => handleOpenModal()} 
              className="bg-blue-600 text-white px-4 py-2 rounded-xl font-black text-xs shadow-lg shadow-blue-100 hover:bg-blue-700 transition-all"
            >
              신규 마감 등록
            </button>
          )}
        </div>
      </div>

      {/* 메인 테이블 */}
      <div className="bg-white rounded-xl shadow-xl border border-slate-200 flex-1 overflow-hidden flex flex-col">
        <div className="overflow-auto flex-1">
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-slate-900">
                <th className={`${headerStyle} w-16`}>No</th>
                <th className={headerStyle}>마감년월</th>
                <th className={headerStyle}>마감여부</th>
                <th className={headerStyle}>등록자</th>
                <th className={headerStyle}>등록일시</th>
                <th className={`${headerStyle} w-20`}>관리</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {dataList.map((item) => (
                <tr key={item.no} className="hover:bg-slate-50 transition-colors">
                  <td className={`${cellStyle} text-slate-400 text-[11px]`}>{item.no}</td>
                  <td className={`${cellStyle} font-black text-blue-600`}>
                    {item.close_month.slice(0, 4)}년 {item.close_month.slice(4, 6)}월
                  </td>
                  <td className={cellStyle}>
                    {item.close_gubun ? (
                      <span className="bg-blue-50 text-blue-700 px-3 py-1 rounded-full text-[11px] font-black border border-blue-100">마감완료</span>
                    ) : (
                      <span className="bg-slate-100 text-slate-500 px-3 py-1 rounded-full text-[11px] font-black">미마감</span>
                    )}
                  </td>
                  <td className={cellStyle}>{item.user_info?.user_name || '시스템'}</td>
                  <td className={`${cellStyle} text-slate-500 text-[12px]`}>
                    {item.close_datetime ? format(new Date(item.close_datetime), 'yyyy.MM.dd HH:mm:ss') : '-'}
                  </td>
                  <td className={cellStyle}>
                    {canManage ? (
                      <button 
                        onClick={() => handleOpenModal(item)} 
                        className="text-blue-600 font-black text-xs underline underline-offset-4 hover:text-blue-800"
                      >
                        수정
                      </button>
                    ) : (
                      <span className="text-slate-300 font-black text-xs cursor-not-allowed">수정불가</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 등록/수정 모달 */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden border border-slate-200">
            <div className="bg-slate-900 p-4 flex justify-between items-center">
              <h2 className="text-white font-black text-sm uppercase tracking-widest">
                {isEditMode ? '마감 정보 수정' : '신규 마감 등록'}
              </h2>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-white">✕</button>
            </div>
            
            <div className="p-6 space-y-5">
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase mb-1">마감년월 선택</label>
                <input 
                  type="month" 
                  value={formData.close_month}
                  onChange={(e) => setFormData({...formData, close_month: e.target.value})}
                  readOnly={isEditMode}
                  className={`${filterInputStyle} ${isEditMode ? 'bg-slate-100 text-slate-500 cursor-not-allowed' : ''}`}
                />
              </div>

              <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-100">
                <span className="text-xs font-black text-slate-700">마감 처리 완료</span>
                <input 
                  type="checkbox" 
                  checked={formData.close_gubun}
                  onChange={(e) => setFormData({...formData, close_gubun: e.target.checked})}
                  className="w-5 h-5 accent-blue-600 cursor-pointer"
                />
              </div>
            </div>

            <div className="p-4 bg-slate-50 flex gap-2">
              <button onClick={() => setIsModalOpen(false)} className="flex-1 py-3 text-xs font-black text-slate-500 hover:bg-slate-200 rounded-xl">취소</button>
              <button onClick={handleSave} className="flex-[2] py-3 text-xs font-black text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-lg shadow-blue-100">
                {isEditMode ? '정보 수정 저장' : '마감 데이터 등록'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}