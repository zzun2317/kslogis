'use client';

import { useState, useEffect } from 'react';

export default function SabangnetPage() {
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [orderStatus, setOrderStatus] = useState('002'); // 기본값: 주문확인(order list)
  const [orders, setOrders] = useState([]);
  const [isLoading, setIsLoading] = useState(false);

  // 페이지 접속 시 오늘 날짜로 초기화하는 로직 추가
  useEffect(() => {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    
    const formattedDate = `${year}-${month}-${day}`;
    
    setStartDate(formattedDate);
    setEndDate(formattedDate);
  }, []);

  // 사방넷 API 호출 함수 (나중에 API Route와 연결)
  const fetchSabangnetOrders = async () => {
    // 날짜 선택 여부 체크
    if (!startDate || !endDate) {
      alert('수집 기간을 선택해 주세요.');
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch('/external/sabangnet/api', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          startDate,
          endDate,
          orderStatus,
        }),
      });

      const result = await response.json();

      if (result.success) {
        // 사방넷에서 데이터가 없는 경우 빈 배열 처리
        setOrders(result.data || []);
        if (result.data.length === 0) {
          alert('해당 기간에 수집된 주문이 없습니다.');
        }
      } else {
        alert(`에러 발생: ${result.error}`);
      }
    } catch (error) {
      console.error('사방넷 호출 오류:', error);
      alert('데이터를 가져오는 중 네트워크 오류가 발생했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  // 임시 테이블 인서트 함수 (기능 구현 시 사용)
  const handleInsertTempTable = async () => {
    if (orders.length === 0) {
      alert('인서트할 데이터가 없습니다. 먼저 데이터를 가져와 주세요.');
      return;
    }
    // TODO: 인서트 로직 구현
    alert(`${orders.length}건의 데이터를 임시 테이블에 저장합니다.`);
  };

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">사방넷 주문 데이터 수집</h1>
      
      {/* 1. 조회 조건 필터 */}
      <div className="bg-white p-5 rounded-xl mb-6 flex flex-wrap gap-6 items-end border border-gray-200 shadow-sm">
        <div className="flex items-center gap-4">
          <label className="text-sm font-bold text-black whitespace-nowrap">주문 수집일</label>
          <div className="flex items-center gap-2">
            <input 
              type="date" 
              value={startDate} 
              onChange={(e) => setStartDate(e.target.value)}
              className="border border-gray-300 px-3 h-11 rounded-lg w-44 text-black focus:ring-2 focus:ring-blue-500 outline-none"
            />
            <span className="text-gray-500 font-bold">~</span>
            <input 
              type="date" 
              value={endDate} 
              onChange={(e) => setEndDate(e.target.value)}
              className="border border-gray-300 px-3 h-11 rounded-lg w-44 text-black focus:ring-2 focus:ring-blue-500 outline-none"
            />
          </div>
        </div>
        
        {/* 주문상태 영역 */}
        <div className="flex items-center gap-4">
          <label className="text-sm font-bold text-black whitespace-nowrap">주문상태</label>
          <select 
            value={orderStatus} 
            onChange={(e) => setOrderStatus(e.target.value)}
            className="border border-gray-300 px-3 h-11 rounded-lg w-40 text-black focus:ring-2 focus:ring-blue-500 outline-none bg-white"
          >
            <option value="001">신규주문</option>
            <option value="002">주문확인</option>
            <option value="004">출고완료</option>
          </select>
        </div>
        
        {/* 조회 버튼 */}
        <button 
          onClick={fetchSabangnetOrders}
          disabled={isLoading}
          className="bg-blue-600 text-white px-8 h-11 rounded-lg font-bold hover:bg-blue-700 disabled:bg-blue-300 transition-colors shadow-md flex items-center justify-center ml-auto"
        >
          {isLoading ? (
            '가져오는 중...'
          ) : (
            <>
              사방넷 데이터 가져오기
              {orders.length > 0 && (
                <span className="ml-2 bg-blue-800 px-2 py-0.5 rounded-full text-xs">
                  {orders.length.toLocaleString()}건
                </span>
              )}
            </>
          )}
        </button>

        <button 
          onClick={handleInsertTempTable}
          disabled={isLoading || orders.length === 0}
          className="bg-green-600 text-white px-6 h-11 rounded-lg font-bold hover:bg-green-700 disabled:bg-gray-300 transition-colors shadow-md flex items-center justify-center"
        >
          임시 테이블에 저장
        </button>

      </div>

      {/* 2. 데이터 프리뷰 테이블 */}
      <div className="border rounded-lg overflow-hidden bg-white shadow-sm border-gray-300">
        <div className="overflow-x-auto h-[500px] custom-scrollbar">
          <table className="min-w-full divide-y divide-gray-300 text-sm">
            <thead className="bg-gray-200 sticky top-0 z-10">
              <tr>
                {/* 헤더 부분: text-black 및 font-bold 적용 */}
                <th className="px-4 py-3 text-left text-black font-bold border-b border-gray-300">사방넷번호(IDX)</th>
                <th className="px-4 py-3 text-left text-black font-bold border-b border-gray-300">쇼핑몰주문번호</th>
                <th className="px-4 py-3 text-left text-black font-bold border-b border-gray-300">쇼핑몰명</th>
                <th className="px-4 py-3 text-left text-black font-bold border-b border-gray-300">쇼핑몰ID</th>
                <th className="px-4 py-3 text-left text-black font-bold border-b border-gray-300">수취인명</th>
                <th className="px-4 py-3 text-left text-black font-bold border-b border-gray-300">상품명(확정)</th>
                <th className="px-4 py-3 text-left text-black font-bold border-b border-gray-300">수량</th>
                <th className="px-4 py-3 text-left text-black font-bold border-b border-gray-300">상태</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white">
              {orders.length > 0 ? (
                orders.map((order: any) => (
                  <tr key={order.IDX} className="hover:bg-blue-50 transition-colors">
                    {/* 데이터 부분: text-black 및 font-medium 적용 */}
                    <td className="px-4 py-3 text-black font-medium">{order.IDX}</td>
                    <td className="px-4 py-3 text-black font-medium">{order.ORDER_ID}</td>
                    <td className="px-4 py-3 text-black font-medium">{order.MALL_ID}</td>
                    <td className="px-4 py-3 text-black font-medium">{order.MALL_USER_ID}</td>
                    <td className="px-4 py-3 text-black font-medium">{order.RECEIVE_NAME}</td>
                    <td className="px-4 py-3 text-black font-medium">{order.P_PRODUCT_NAME}</td>
                    <td className="px-4 py-3 text-black font-medium">{order.SALE_CNT}</td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-100 text-blue-800">
                        {order.ORDER_STATUS === '002' ? '주문확인' : order.ORDER_STATUS}
                      </span>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="px-4 py-20 text-center text-gray-900 font-bold">
                    데이터가 없습니다. 조건을 변경 후 조회를 실행해 주세요.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}