'use client';

import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase'; // 설정된 경로에 맞게 수정 필요

export default function SabangnetVerifyPage() {
  const [orders, setOrders] = useState<any[]>([]);
  const [searchDate, setSearchDate] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // 1. 초기 시스템 날짜 설정 (오늘 날짜)
  useEffect(() => {
    const today = new Date().toISOString().split('T')[0];
    setSearchDate(today);
    fetchTempOrders(today);
  }, []);

  // 2. 데이터 조회 함수
  const fetchTempOrders = async (date: string) => {
		setIsLoading(true);
		try {
			// 직접 쿼리 대신 생성하신 RPC 함수(예: fn_get_sabangnet_verify_list)를 호출합니다.
			const { data, error } = await supabase.rpc('fn_get_sabangnet_verify_list', { 
				search_date: date.replace(/-/g, '') // '2026-03-24' -> '20260324' (사방넷 포맷)
			});

			if (error) throw error;

			// 함수에서 반환된 가공된 데이터를 상태에 저장합니다.
			setOrders(data || []);
		} catch (error) {
			console.error('데이터 조회 오류:', error);
			alert('데이터를 가져오는 중 오류가 발생했습니다.');
		} finally {
			setIsLoading(false);
		}
	};

  return (
    <div className="flex flex-col h-screen bg-slate-50">
      {/* 헤더 섹션 */}
      <div className="p-6 bg-white border-b border-slate-200 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-black text-slate-900 flex items-center gap-2">
              <span className="w-2 h-8 bg-blue-600 rounded-full"></span>
              사방넷 수집 데이터 검증
            </h1>
            <p className="text-slate-500 text-sm mt-1 font-medium">임시 테이블에 저장된 주문 건을 확인합니다.</p>
          </div>

          <div className="flex items-center gap-3 bg-slate-100 p-2 rounded-xl border border-slate-200">
            <label className="text-sm font-bold text-slate-700 ml-2">수집일자 조회</label>
            <input 
              type="date" 
              value={searchDate}
              onChange={(e) => setSearchDate(e.target.value)}
              className="border border-slate-300 px-3 h-10 rounded-lg text-black focus:ring-2 focus:ring-blue-500 outline-none"
            />
            <button 
              onClick={() => fetchTempOrders(searchDate)}
              disabled={isLoading}
              className="bg-slate-900 text-white px-5 h-10 rounded-lg font-bold hover:bg-blue-600 transition-all active:scale-95 disabled:bg-slate-400"
            >
              {isLoading ? '조회 중...' : '데이터 조회'}
            </button>
          </div>
        </div>
      </div>

      {/* 테이블 섹션 */}
      <div className="flex-1 p-6 overflow-hidden">
        <div className="h-full border border-slate-300 rounded-2xl bg-white shadow-xl overflow-hidden flex flex-col">
          <div className="overflow-x-auto overflow-y-auto custom-scrollbar flex-1">
            <table className="min-w-full border-collapse text-[13px]">
              <thead className="bg-slate-900 sticky top-0 z-20">
                <tr>
                  <th className="px-4 py-4 text-white font-bold border-r border-slate-700 whitespace-nowrap">주문번호(ID)</th>
                  <th className="px-4 py-4 text-white font-bold border-r border-slate-700 whitespace-nowrap">주문일자</th>
                  <th className="px-4 py-4 text-white font-bold border-r border-slate-700 whitespace-nowrap">거래처(매체)</th>
                  <th className="px-4 py-4 text-white font-bold border-r border-slate-700 whitespace-nowrap">주문인</th>
                  <th className="px-4 py-4 text-white font-bold border-r border-slate-700 whitespace-nowrap">납품처 (수취인/연락처/주소)</th>
                  <th className="px-4 py-4 text-white font-bold border-r border-slate-700 whitespace-nowrap">품목(상품명)</th>
                  <th className="px-4 py-4 text-white font-bold border-r border-slate-700 whitespace-nowrap text-right">수량</th>
                  <th className="px-4 py-4 text-white font-bold border-r border-slate-700 whitespace-nowrap text-right">단가</th>
                  <th className="px-4 py-4 text-white font-bold border-r border-slate-700 whitespace-nowrap">창고</th>
                  <th className="px-4 py-4 text-white font-bold whitespace-nowrap">비고</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
								{orders.length > 0 ? (
									orders.map((item) => {
										// 이제 raw_data를 거칠 필요 없이 item에서 직접 추출합니다.
										return (
											<tr key={item.temp_seq} className="hover:bg-blue-50 transition-colors">
												<td className="px-4 py-3 font-medium text-slate-900 border-r border-slate-100">
													<div className="flex flex-col">
														<span className="text-[11px] text-blue-600 font-bold">{item.idx}</span>
														<span>{item.order_id}</span>
													</div>
												</td>
												<td className="px-4 py-3 text-slate-700 border-r border-slate-100 text-center">
													{item.order_date}
												</td>
												<td className="px-4 py-3 text-slate-700 border-r border-slate-100">
													{item.mall_id}
												</td>
												<td className="px-4 py-3 text-slate-700 border-r border-slate-100">
													<div className="font-bold">{item.user_name}</div>
													<div className="text-[11px] text-slate-400">{item.user_cel}</div>
												</td>
												<td className="px-4 py-3 text-slate-700 border-r border-slate-100 max-w-xs">
													{/* DB RPC에서 가공해서 내려준 receive_info를 그대로 사용합니다. */}
													<div className="text-[12px] text-slate-700 leading-snug whitespace-pre-wrap">
														{item.receive_info}
													</div>
												</td>
												<td className="px-4 py-3 text-slate-700 border-r border-slate-100">
													<div className="text-[11px] text-slate-400 italic">#{item.mall_product_id}</div>
													<div className="font-medium">{item.product_name}</div>
												</td>
												<td className="px-4 py-3 text-slate-900 font-bold border-r border-slate-100 text-right">
													{Number(item.sale_cnt).toLocaleString()}
												</td>
												<td className="px-4 py-3 text-slate-600 border-r border-slate-100 text-right">
													{Number(item.pay_cost).toLocaleString()}원
												</td>
												<td className="px-4 py-3 text-slate-700 border-r border-slate-100 text-center">
													{item.dpartner_id}
												</td>
												<td className="px-4 py-3 text-slate-500">
													{item.delv_msg1 || '-'}
												</td>
											</tr>
										);
									})
								) : (
									<tr>
										<td colSpan={10} className="px-4 py-32 text-center text-slate-400 font-bold bg-slate-50">
											데이터가 존재하지 않습니다. 수집일자를 확인해 주세요.
										</td>
									</tr>
								)}
							</tbody>
            </table>
          </div>
        </div>
      </div>

      <style jsx global>{`
        .custom-scrollbar::-webkit-scrollbar { width: 8px; height: 8px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: #f1f5f9; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #94a3b8; }
      `}</style>
    </div>
  );
}