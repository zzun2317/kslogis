'use client';

import React, { useState } from 'react';
import * as XLSX from 'xlsx';
import { Save, FileUp, Table as TableIcon, Download, RefreshCcw } from 'lucide-react';

interface RawData {
  [key: string]: any;
}

export default function TransformPage() {
  const [activeTab, setActiveTab] = useState<'upload' | 'result'>('upload');
  const [rawData, setRawData] = useState<RawData[]>([]);
  const [transformedData, setTransformedData] = useState<RawData[]>([]);
  const [columns, setColumns] = useState<string[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);

  // 1. 엑셀 파일 읽기
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      const bstr = evt.target?.result;
      try {
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const data = XLSX.utils.sheet_to_json(ws) as RawData[];
        
        if (data.length === 0) {
          alert("엑셀 파일에 데이터가 없습니다.");
          return;
        }
        
        setRawData(data);
        alert(`${data.length}개의 행을 성공적으로 불러왔습니다.`);
      } catch (error) {
        console.error("파일 읽기 오류:", error);
        alert("엑셀 파일을 읽는 중 오류가 발생했습니다.");
      }
    };
    reader.readAsBinaryString(file);
  };

  // 2. 양식 변경 로직 (핵심 프로세스)
  const handleTransform = () => {
    if (rawData.length === 0) {
      alert("먼저 엑셀 파일을 업로드해주세요.");
      return;
    }

    setIsProcessing(true);

    // 연산 처리를 시각적으로 보여주기 위한 지연
    setTimeout(() => {
      const orderMap: { [key: string]: any } = {};
      let maxItems = 0;

      // 컬럼명 정의 (사용자 최신 요청 반영: 출하의뢰번호)
      const KEY_ORDER_NO = '출하의뢰번호';
      const KEY_ITEM_NAME = '품명';
      const KEY_ITEM_QTY = '요청수량';

      rawData.forEach((item) => {
        const orderNo = String(item[KEY_ORDER_NO] || '미지정');
        
        if (!orderMap[orderNo]) {
          // 1. 해당 주문건의 첫 번째 행 데이터를 기본값으로 사용
          orderMap[orderNo] = {
            ...item,
            _items: []
          };
          
          // 2. 가로로 펼칠 원본 컬럼들은 삭제 (나중에 품목명_N으로 재구성)
          delete orderMap[orderNo][KEY_ITEM_NAME];
          delete orderMap[orderNo][KEY_ITEM_QTY];
        }

        const itemName = item[KEY_ITEM_NAME] || '';
        const itemQty = item[KEY_ITEM_QTY] || 0;
        
        // 3. "품명 | 수량 : #" 포맷팅하여 배열에 저장
        orderMap[orderNo]._items.push(`${itemName} | 수량 : ${itemQty}`);
        
        // 4. 전체 데이터 중 최대 품목 수 카운트 (동적 컬럼 생성 기준)
        if (orderMap[orderNo]._items.length > maxItems) {
          maxItems = orderMap[orderNo]._items.length;
        }
      });

      // 5. 평탄화 및 동적 컬럼 할당
      const result = Object.values(orderMap).map((order) => {
        const newRow: any = { ...order };
        const items = newRow._items;
        delete newRow._items;

        // 품목명_1, 품목명_2... 형태로 동적 할당
        for (let i = 0; i < maxItems; i++) {
          newRow[`품목명_${i + 1}`] = items[i] || ""; // 데이터가 없으면 빈 문자열
        }
        return newRow;
      });

      // 6. 결과 테이블 헤더 순서 정의
      if (result.length > 0) {
        const baseKeys = Object.keys(result[0]).filter(k => !k.startsWith('품목명_'));
        const dynamicKeys = Array.from({ length: maxItems }, (_, i) => `품목명_${i + 1}`);
        setColumns([...baseKeys, ...dynamicKeys]);
      }

      setTransformedData(result);
      setIsProcessing(false);
      setActiveTab('result');
      alert(`양식 변경 완료! (총 ${result.length}건의 출하의뢰 처리)`);
    }, 600);
  };

  // 3. 변환된 데이터 엑셀 다운로드
  const handleDownload = () => {
    if (transformedData.length === 0) return;
    
    try {
      const ws = XLSX.utils.json_to_sheet(transformedData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "양식변경결과");
      XLSX.writeFile(wb, `배송양식변환_${new Date().toISOString().slice(0, 10)}.xlsx`);
    } catch (error) {
      console.error("다운로드 오류:", error);
      alert("엑셀 파일 생성 중 오류가 발생했습니다.");
    }
  };

  return (
    <div className="p-6 max-w-[1600px] mx-auto min-h-screen bg-slate-50/30 text-slate-900 font-sans">
      {/* 헤더 섹션 */}
      <div className="mb-8 flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <RefreshCcw className="w-6 h-6 text-blue-600" />
            배송 데이터 양식 변환
          </h1>
          <p className="text-slate-500 mt-1 italic text-sm">
            * 출하의뢰번호 기준으로 품명을 가로(Horizontal)로 재구성합니다.
          </p>
        </div>
        
        <div className="flex gap-2 bg-white p-1.5 rounded-xl border border-slate-200 shadow-sm">
          <button 
            onClick={() => setActiveTab('upload')}
            className={`px-5 py-2 rounded-lg text-sm font-bold transition-all flex items-center gap-2 ${activeTab === 'upload' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-500 hover:bg-slate-100'}`}
          >
            <FileUp className="w-4 h-4" />
            1. 파일 업로드
          </button>
          <button 
            onClick={() => setActiveTab('result')}
            className={`px-5 py-2 rounded-lg text-sm font-bold transition-all flex items-center gap-2 ${activeTab === 'result' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-500 hover:bg-slate-100'}`}
          >
            <TableIcon className="w-4 h-4" />
            2. 결과 확인 및 저장
          </button>
        </div>
      </div>

      {activeTab === 'upload' ? (
        <div className="grid gap-6">
          {/* 업로드 카드 */}
          <div className="bg-white border-2 border-dashed border-slate-200 rounded-2xl p-10 flex flex-col items-center justify-center transition-colors hover:border-blue-300 group">
            <div className="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
              <FileUp className="w-8 h-8 text-blue-500" />
            </div>
            <h3 className="text-lg font-bold text-slate-700">변환할 엑셀 파일을 선택하세요</h3>
            <p className="text-slate-400 text-sm mt-2 mb-8 text-center">
              필수 컬럼: <span className="text-slate-600 font-semibold underline decoration-blue-200">출하의뢰번호, 품명, 요청수량</span>
            </p>
            <label className="bg-slate-900 hover:bg-slate-800 text-white px-8 py-3 rounded-xl font-bold cursor-pointer shadow-lg transition-all active:scale-95">
              파일 찾아보기
              <input type="file" className="hidden" accept=".xlsx, .xls, .csv" onChange={handleFileUpload} />
            </label>
          </div>

          {/* 프리뷰 테이블 */}
          {rawData.length > 0 && (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                <div className="flex items-center gap-3">
                  <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></div>
                  <span className="font-bold text-slate-700">업로드 데이터 미리보기 (총 {rawData.length}건)</span>
                </div>
                <button 
                  onClick={handleTransform}
                  disabled={isProcessing}
                  className="bg-emerald-500 hover:bg-emerald-600 text-white px-6 py-2.5 rounded-xl text-sm font-black flex items-center gap-2 shadow-lg shadow-emerald-100 transition-all active:scale-95 disabled:opacity-50"
                >
                  {isProcessing ? <RefreshCcw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  변환 실행 (양식변경)
                </button>
              </div>
              <div className="overflow-x-auto max-h-[450px]">
                <table className="w-full text-sm text-left border-collapse">
                  <thead className="bg-white sticky top-0 z-10 border-b shadow-sm">
                    <tr>
                      {Object.keys(rawData[0]).map((key) => (
                        <th key={key} className="px-5 py-4 font-bold text-slate-500 whitespace-nowrap bg-white">{key}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {rawData.slice(0, 30).map((row, i) => (
                      <tr key={i} className="hover:bg-blue-50/30 transition-colors">
                        {Object.values(row).map((val, j) => (
                          <td key={j} className="px-5 py-4 text-slate-600 truncate max-w-[250px]">{String(val || '')}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
                {rawData.length > 30 && (
                  <div className="p-6 text-center text-slate-400 text-xs bg-slate-50/50 border-t">
                    데이터가 많아 상위 30개 항목만 표시 중입니다. '변환 실행'을 눌러 전체 데이터를 처리하세요.
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="animate-in fade-in duration-500">
          {/* 결과 그리드 */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl overflow-hidden">
            <div className="px-8 py-6 border-b border-slate-100 flex flex-col sm:flex-row justify-between items-center gap-4 bg-white sticky left-0">
              <div>
                <h2 className="text-lg font-bold text-slate-800">변환 결과 내역</h2>
                <div className="flex gap-2 mt-1">
                  <span className="text-xs bg-blue-100 text-blue-700 px-3 py-1 rounded-full font-bold">
                    출하건수: {transformedData.length}건
                  </span>
                  {transformedData.length > 0 && (
                    <span className="text-xs bg-emerald-100 text-emerald-700 px-3 py-1 rounded-full font-bold">
                      최대 품목 확장: {(columns.filter(c => c.startsWith('품목명_')).length)}개
                    </span>
                  )}
                </div>
              </div>
              <button 
                onClick={handleDownload}
                disabled={transformedData.length === 0}
                className="bg-slate-900 hover:bg-black text-white px-8 py-3 rounded-xl font-bold flex items-center gap-2 shadow-xl transition-all active:scale-95 disabled:opacity-30 disabled:pointer-events-none"
              >
                <Download className="w-5 h-5" />
                엑셀 파일로 내려받기
              </button>
            </div>
            
            {transformedData.length > 0 ? (
              <div className="overflow-x-auto max-h-[650px]">
                <table className="w-full text-sm text-left border-collapse">
                  <thead className="bg-slate-800 text-white sticky top-0 z-20">
                    <tr>
                      {columns.map((col) => (
                        <th key={col} className={`px-6 py-4 font-bold whitespace-nowrap border-r border-slate-700 ${col.startsWith('품목명_') ? 'text-blue-300' : ''}`}>
                          {col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {transformedData.map((row, i) => (
                      <tr key={i} className="hover:bg-blue-50 transition-colors group">
                        {columns.map((col, j) => (
                          <td key={j} className={`px-6 py-4 text-slate-600 border-r border-slate-50 whitespace-nowrap ${col.startsWith('품목명_') && row[col] ? 'bg-blue-50/30 font-semibold text-slate-900' : ''}`}>
                            {row[col] !== undefined && row[col] !== "" ? String(row[col]) : "-"}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="p-32 text-center">
                <div className="inline-flex bg-slate-50 p-6 rounded-full mb-4 text-slate-300">
                  <TableIcon className="w-12 h-12" />
                </div>
                <p className="text-slate-400 font-medium">변환된 데이터가 없습니다.<br/>업로드 탭에서 엑셀을 선택하고 '변환 실행' 버튼을 눌러주세요.</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}