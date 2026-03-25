'use client';

import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase'; // 설정된 경로에 맞게 수정 필요

export default function SabangnetVerifyPage() {
  const [orders, setOrders] = useState<any[]>([]);
  const [searchDate, setSearchDate] = useState('');
  const [isLoading, setIsLoading] = useState(false);
	const [originalOrders, setOriginalOrders] = useState<any[]>([]);
	const topScrollRef = useRef<HTMLDivElement>(null);
  const tableContainerRef = useRef<HTMLDivElement>(null);

  // 1. 초기 시스템 날짜 설정 (오늘 날짜)
  useEffect(() => {
    const today = new Date().toISOString().split('T')[0];
    setSearchDate(today);
    fetchTempOrders(today);
  }, []);

	// 스크롤 동기화 함수
  const syncScroll = (
		source: React.RefObject<HTMLDivElement | null>, // | null 추가
		target: React.RefObject<HTMLDivElement | null>  // | null 추가
	) => {
		if (source.current && target.current) {
			target.current.scrollLeft = source.current.scrollLeft;
		}
	};

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
			setOriginalOrders(JSON.parse(JSON.stringify(data || [])));
		} catch (error) {
			console.error('데이터 조회 오류:', error);
			alert('데이터를 가져오는 중 오류가 발생했습니다.');
		} finally {
			setIsLoading(false);
		}
	};

	// 3. ERP 세트명 실시간 수정 핸들러 (독립적으로 선언)
  const handleErpNameChange = (tempSeq: number, newValue: string) => {
    setOrders(prev => 
      prev.map(order => 
        order.temp_seq === tempSeq ? { ...order, erp_set_name: newValue } : order
      )
    );
  };

	// 특정 행의 데이터가 변경되었는지 확인
	const isRowChanged = (item: any) => {
			const original = originalOrders.find(o => o.temp_seq === item.temp_seq);
			return original && original.erp_set_name !== item.erp_set_name;
	};

	// 컴포넌트 내부 handleErpNameChange 아래에 추가
	const handleSaveRow = async (item: any) => {
		if (!isRowChanged(item)) return;
		if (!item.erp_set_name) {
			alert('ERP 세트품명을 입력해 주세요.');
			return;
		}

		try {
			setIsLoading(true);
			const { error } = await supabase.rpc('fn_insert_shopitem_from_sabang', {
				p_idx: item.idx,
				p_erp_set_name: item.erp_set_name
			});

			if (error) throw error;

			alert('성공적으로 저장되었습니다.');

			// 방법 1: 전체 데이터를 다시 불러와서 동기화 (가장 확실함)
			await fetchTempOrders(searchDate); 

			/* // 방법 2: 전체 재조회 없이 해당 행만 원본 데이터와 동기화 (네트워크 비용 절감)
			setOriginalOrders(prev => 
				prev.map(original => 
					original.temp_seq === item.temp_seq 
						? { ...original, erp_set_name: item.erp_set_name } 
						: original
				)
			);
			*/
			
		} catch (error) {
			console.error('저장 중 오류 발생:', error);
			alert('저장 처리 중 오류가 발생했습니다.');
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

          <div className="flex items-center gap-3 bg-white bg-slate-100 p-2 rounded-xl border border-slate-200">
            <label className="text-sm font-bold text-slate-700 ml-2">수집일자 조회</label>
            <input 
              type="date" 
              value={searchDate}
              onChange={(e) => setSearchDate(e.target.value)}
              className="border border-slate-300 px-3 h-10 rounded-lg bg-white text-black focus:ring-2 focus:ring-blue-500 outline-none"
            />
            <button 
							onClick={() => fetchTempOrders(searchDate)}
							disabled={isLoading}
							className="bg-slate-900 text-white px-5 h-10 rounded-lg font-bold hover:bg-blue-600 transition-all active:scale-95 disabled:bg-slate-400 flex items-center gap-2"
						>
							{isLoading ? '조회 중...' : (
								<>
									<span>데이터 조회</span>
									<span className="bg-blue-500 text-[11px] px-2 py-0.5 rounded-full shadow-inner">
										{orders.length.toLocaleString()}건
									</span>
								</>
							)}
						</button>
          </div>
        </div>
      </div>

			{/* 상단 가로 스크롤 동기화용 더미 바 */}
      <div 
        ref={topScrollRef}
        onScroll={() => syncScroll(topScrollRef, tableContainerRef)}
        className="overflow-x-auto overflow-y-hidden border-b border-slate-100 custom-scrollbar"
        style={{ height: '12px' }} // 스크롤바 두께만큼 확보
      >
        <div style={{ width: tableContainerRef.current?.scrollWidth || '2500px', height: '1px' }}></div>
      </div>

      {/* 테이블 섹션 */}
      <div className="flex-1 p-6 overflow-hidden">
        <div className="h-full border border-slate-300 rounded-2xl bg-white shadow-xl overflow-hidden flex flex-col">
          <div className="overflow-x-auto overflow-y-auto custom-scrollbar flex-1">
						<div 
							ref={tableContainerRef}
							onScroll={() => syncScroll(tableContainerRef, topScrollRef)}
							className="flex-1 overflow-auto custom-scrollbar"
						>
							<table className="min-w-full border-collapse text-[13px]">
								<thead className="bg-slate-900 sticky top-0 z-20">
									<tr>
										<th className="px-4 py-4 text-white font-bold border-r border-slate-700 whitespace-nowrap">주문번호(ID)</th>
										<th className="px-4 py-4 text-white font-bold border-r border-slate-700 whitespace-nowrap">주문일자</th>
										<th className="px-4 py-4 text-white font-bold border-r border-slate-700 whitespace-nowrap min-w-[150px]">거래처(매체)</th>
										<th className="px-4 py-4 text-white font-bold border-r border-slate-700 whitespace-nowrap min-w-[120px]">주문인</th>
										<th className="px-4 py-4 text-white font-bold border-r border-slate-700 whitespace-nowrap min-w-[300px]">납품처 (수취인/연락처/주소)</th>
										<th className="px-4 py-4 text-white font-bold border-r border-slate-700 whitespace-nowrap min-w-[250px]">품목(상품명)</th>
										<th className="px-3 py-4 text-white font-bold border-r border-slate-700 whitespace-nowrap w-[60px] text-center">저장</th>
										<th className="px-4 py-4 text-white font-bold border-r border-slate-700 whitespace-nowrap min-w-[250px]">ERP세트품명</th>
										<th className="px-4 py-4 text-white font-bold border-r border-slate-700 whitespace-nowrap">수량</th>
										<th className="px-4 py-4 text-white font-bold border-r border-slate-700 whitespace-nowrap min-w-[100px]">단가</th>
										<th className="px-4 py-4 text-white font-bold border-r border-slate-700 whitespace-nowrap text-center min-w-[100px]">창고</th>
										<th className="px-4 py-4 text-white font-bold whitespace-nowrap min-w-[250px]">비고</th>
									</tr>
								</thead>
								<tbody className="divide-y divide-slate-200">
									{orders.length > 0 ? (
										orders.map((item) => {
											const isMappingFailed = !item.erp_set_name;
											// 이제 raw_data를 거칠 필요 없이 item에서 직접 추출합니다.
											return (
												<tr key={item.temp_seq} className="hover:bg-blue-50 transition-colors">
													<td className="px-4 py-3 font-medium text-slate-900 border-r border-slate-100">
														<div className="flex flex-col">
															<span className="text-[11px] text-blue-600 font-bold">{item.idx}</span>
															<span>{item.order_id}</span>
														</div>
													</td>
													{/* 주문일자 및 수집일시 (중요!) */}
													<td className="px-4 py-3 border-r border-slate-100 text-center">
														<div className="flex flex-col items-center">
															<span className="text-slate-700 font-medium">{item.order_date}</span>
															<span className="text-[11px] text-slate-400 mt-0.5">
																수집: {item.reg_date ? `${item.reg_date.substring(8,10)}:${item.reg_date.substring(10,12)}` : '-'}
															</span>
														</div>
													</td>
													<td className="px-4 py-3 text-slate-700 border-r border-slate-100 whitespace-nowrap">
														{item.mall_id}
													</td>
													<td className="px-4 py-3 text-slate-700 border-r border-slate-100 whitespace-nowrap">
														<div className="font-bold">{item.user_name}</div>
														<div className="text-[11px] text-slate-400">{item.user_cel}</div>
													</td>
													<td className="px-4 py-3 text-slate-700 border-r border-slate-100">
														<div className="text-[12px] text-slate-700 leading-snug line-clamp-3 whitespace-pre-wrap">
															{item.receive_info}
														</div>
													</td>
													<td className="px-4 py-3 border-r border-slate-100 min-w-max">
														<div className="flex flex-col min-w-[300px]">
															<div className="text-[11px] text-slate-400 italic whitespace-nowrap">
																#{item.mall_product_id}
															</div>
															<div className={`font-medium text-[13px] leading-snug whitespace-pre-wrap break-all ${isMappingFailed ? 'text-red-600 font-bold' : 'text-slate-700'}`}>
																{item.product_name}
																{isMappingFailed && <span className="ml-1 text-[10px] text-red-500 animate-pulse">[미매칭]</span>}
															</div>
														</div>
													</td>

													<td className="px-2 py-3 text-center align-middle border-r border-slate-100 bg-white min-w-[60px]">
														<button 
															onClick={() => handleSaveRow(item)} 
															disabled={!isRowChanged(item)} // 변경사항 없으면 버튼 비활성화
															className={`p-1.5 transition-all rounded-md shadow-sm active:scale-90
																${isRowChanged(item) 
																	? 'text-blue-600 hover:bg-blue-50 bg-blue-50/50 cursor-pointer' 
																	: 'text-slate-200 cursor-not-allowed opacity-50'
																}`}
															title={isRowChanged(item) ? "변경사항 저장" : "변경내용 없음"}
														>
															<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
																<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path>
																<polyline points="17 21 17 13 7 13 7 21"></polyline>
																<polyline points="7 3 7 8 15 8"></polyline>
															</svg>
														</button>
													</td>

													{/* 2. ERP세트품명 부분 수정 */}
													{/* ERP세트품명: 수정 가능한 Input 필드로 변경 */}
													<td className="px-4 py-2 text-slate-700 border-r border-slate-100 bg-blue-50/30 min-w-max">
														<div className="flex flex-col min-w-[300px]">
															<input
																type="text"
																value={item.erp_set_name || ''}
																onChange={(e) => handleErpNameChange(item.temp_seq, e.target.value)}
																placeholder="매칭 정보 입력"
																className={`w-full px-3 py-2 text-[12px] font-bold rounded-lg border transition-all outline-none
																	${!item.erp_set_name 
																		? 'bg-red-50 border-red-200 text-red-600 focus:border-red-400' 
																		: 'bg-white border-slate-200 text-blue-700 focus:border-blue-500 focus:ring-2 focus:ring-blue-100'
																	}`}
															/>
															{!item.erp_set_name && (
																<div className="text-[10px] text-red-400 mt-1 ml-1 font-medium italic animate-pulse">
																	* 마스터 데이터와 매칭되지 않았습니다. 직접 입력해 주세요.
																</div>
															)}
														</div>
													</td>
													<td className="px-4 py-3 text-slate-900 font-bold border-r border-slate-100 text-right">
														{Number(item.sale_cnt).toLocaleString()}
													</td>
													<td className="px-4 py-3 text-slate-600 border-r border-slate-100 text-right whitespace-nowrap">
														{Number(item.pay_cost).toLocaleString()}
													</td>
													<td className="px-4 py-3 text-slate-700 border-r border-slate-100 text-center whitespace-nowrap">
														{item.dpartner_id}
													</td>
													<td className="px-4 py-3 text-slate-500">
														<div className="line-clamp-3 text-[12px] leading-snug">
															{item.delv_msg1 || '-'}
														</div>
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