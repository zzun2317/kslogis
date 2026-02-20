'use client';

import React, { useState, useRef, useEffect } from 'react';
import * as XLSX from 'xlsx';
import Script from 'next/script';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

const KAKAO_KEY = process.env.NEXT_PUBLIC_KAKAO_JS_KEY;
declare global {
  interface Window {
    kakao: any;
    daum: any;
  }
}

interface ValidationError {
  row: number;
  column: string;
  message: string;
}

const formatExcelDate = (value: any): string => {
  if (!value) return '';
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) {
    return value.substring(0, 10);
  }
  if (value instanceof Date) {
    return value.toISOString().split('T')[0];
  }
  if (typeof value === 'number') {
    const date = XLSX.SSF.parse_date_code(value);
    const y = date.y;
    const m = String(date.m).padStart(2, '0');
    const d = String(date.d).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  return String(value);
};

export default function ExcelUploadPage() {
  const [previewData, setPreviewData] = useState<any[]>([]); 
  const [headers, setHeaders] = useState<string[]>([]);      
  const [fileName, setFileName] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [loadingText, setLoadingText] = useState('처리 중입니다...');
  const [columnWidths, setColumnWidths] = useState<{ [key: string]: number }>({});
  
  const [userId, setUserId] = useState<string>('');
  const [userEmail, setUserEmail] = useState<string>('');

  const tableContainerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [errors, setErrors] = useState<ValidationError[]>([]); 
  const [isValidated, setIsValidated] = useState(false);

  const ROW_HEIGHT_CLASS = "h-12";
  const ROW_HEIGHT_PX = 48; 

  const REQUIRED_COLUMNS = [
    '수주번호', '출하의뢰번호', '상차(요청)일', '하차(배송)일', 
    '품번', '요청수량', '주소1', '휴대전화번호'
  ];

  const DATE_COLUMNS = ['상차(요청)일', '하차(배송)일', '수주일'];
  const EDITABLE_COLUMNS = ['상차(요청)일', '하차(배송)일', '주소1', '주소2', '전화번호', '휴대전화번호'];

  useEffect(() => {
    const fetchUser = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          setUserId(user.id);
          setUserEmail(user.email || '');
        }
      } catch (e) {
        console.error("Auth fetch error:", e);
      }
    };
    fetchUser();
  }, []);

  const errorRowIndices = new Set(errors.map(err => err.row));
  const errorRowsArray = Array.from(new Set(errors.map(err => err.row)));

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    setLoadingText('엑셀 파일을 읽는 중...');
    setFileName(file.name);

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const data = evt.target?.result;
        const wb = XLSX.read(data, { type: 'binary', cellDates: true });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rawData: any[] = XLSX.utils.sheet_to_json(ws);

        if (rawData.length > 0) {
          const formattedData = rawData.map(row => {
            const newRow = { ...row };
            DATE_COLUMNS.forEach(col => {
              if (newRow[col]) {
                newRow[col] = formatExcelDate(newRow[col]);
              }
            });
            return newRow;
          });

          const columnNames = Object.keys(formattedData[0]);
          setHeaders(['No.', ...columnNames]);
          setPreviewData(formattedData); 
          setColumnWidths({});
          setErrors([]);
          setIsValidated(false);
        }
      } catch (err) {
        console.error("Excel Parsing Error:", err);
        alert("엑셀 파일 파싱 중 오류가 발생했습니다.");
      } finally {
        setLoading(false);
      }
    };
    reader.readAsBinaryString(file);
  };

  const handleClear = () => {
    if (window.confirm("업로드된 데이터를 초기화하시겠습니까?")) {
      setPreviewData([]);
      setHeaders([]);
      setFileName('');
      setErrors([]);
      setIsValidated(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const getCoordinates = async (address: string): Promise<{lat: number | null, lng: number | null}> => {
    return new Promise((resolve) => {
      if (!window.kakao || !window.kakao.maps || !window.kakao.maps.services) {
        resolve({ lat: null, lng: null });
        return;
      }

      const geocoder = new window.kakao.maps.services.Geocoder();
      const cleanAddress = address.trim();

      geocoder.addressSearch(cleanAddress, (result: any, status: any) => {
        if (status === window.kakao.maps.services.Status.OK && result.length > 0) {
          resolve({ lat: parseFloat(result[0].y), lng: parseFloat(result[0].x) });
        } else {
          resolve({ lat: null, lng: null });
        }
      });
    });
  };

  // ✅ 보완된 handleValidate 함수
  const handleValidate = async () => {
    setLoading(true);
    setLoadingText('차량 코드 매핑 및 주소 좌표를 검증 중입니다...');

    const newErrors: ValidationError[] = [];
    const updatedData = [...previewData];

    try {
      // 1. 차량 코드 정보 가져오기 (에러 핸들링 강화)
      const { data: commonCodes, error: commonError } = await supabase
        .from('ks_common')
        .select('comm_ccode, comm_text2')
        .eq('comm_mcode', '004')
        .abortSignal(AbortSignal.timeout(10000)); // 10초 타임아웃 추가

      if (commonError) {
        // AbortError인 경우 재시도 유도 또는 알림
        if (commonError.message.includes('AbortError')) {
          throw new Error('데이터베이스 연결이 일시적으로 중단되었습니다. 다시 시도해 주세요.');
        }
        throw commonError;
      }

      const vehicleCodeMap = new Map();
      commonCodes?.forEach(item => {
        if (item.comm_text2) vehicleCodeMap.set(item.comm_text2.trim(), item.comm_ccode);
      });

      for (let rowIndex = 0; rowIndex < updatedData.length; rowIndex++) {
        const row = updatedData[rowIndex];

        REQUIRED_COLUMNS.forEach(col => {
          const value = row[col]?.toString().trim();
          if (!value) {
            newErrors.push({ row: rowIndex, column: col, message: `${col}은(는) 필수 입력 항목입니다.` });
          }
        });

        const vehicleName = row['차량']?.toString().trim();
        let mappedCenterCode = '004001'; 
        if (vehicleName && vehicleCodeMap.has(vehicleName)) {
          mappedCenterCode = vehicleCodeMap.get(vehicleName);
        }
        
        updatedData[rowIndex] = { ...updatedData[rowIndex], cust_devcenter: mappedCenterCode };

        if (row['주소1'] && row['주소1'].trim() !== '') {
          const coords = await getCoordinates(row['주소1']);
          if (coords.lat && coords.lng) {
            updatedData[rowIndex] = { ...updatedData[rowIndex], cust_lat: coords.lat, cust_lng: coords.lng };
          } else {
            newErrors.push({ row: rowIndex, column: '주소1', message: `좌표를 찾을 수 없는 주소입니다.` });
            updatedData[rowIndex] = { ...updatedData[rowIndex], cust_lat: null, cust_lng: null };
          }
        }
      }

      setPreviewData(updatedData);
      setErrors(newErrors);
      setIsValidated(true);
      
      if (newErrors.length === 0) {
        alert('데이터 검증 완료: 차량 매핑 및 모든 항목이 정상입니다.');
      } else {
        alert(`검증 결과: ${newErrors.length}건의 오류가 발견되었습니다.`);
      }

    } catch (err: any) {
      console.error("Validation Error:", err);
      alert(err.message || "검증 작업 중 알 수 없는 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  const openPostcode = (rowIndex: number) => {
    if (!window.daum || !window.daum.Postcode) {
      alert("주소 서비스 스크립트가 아직 로드되지 않았습니다.");
      return;
    }
    new window.daum.Postcode({
      oncomplete: (data: any) => {
        const finalAddress = data.roadAddress || data.address;
        handleCellChange(rowIndex, '주소1', finalAddress);
      }
    }).open();
  };

  const handleCellChange = (rowIndex: number, column: string, value: string) => {
    const newData = [...previewData];
    const targetOrderNumber = newData[rowIndex]['수주번호'];

    if (EDITABLE_COLUMNS.includes(column) && targetOrderNumber) {
      newData.forEach((row, idx) => {
        if (row['수주번호'] === targetOrderNumber) {
          newData[idx] = { ...newData[idx], [column]: value };
        }
      });
    } else {
      newData[rowIndex] = { ...newData[rowIndex], [column]: value };
    }

    setPreviewData(newData);
    if (isValidated) setIsValidated(false);

    if (errors.length > 0) {
      setErrors(prev => prev.filter(err => {
        const isSameColumn = err.column === column;
        const isTargetRow = targetOrderNumber ? newData[err.row]?.['수주번호'] === targetOrderNumber : err.row === rowIndex;
        return !(isSameColumn && isTargetRow);
      }));
    }
  };

  const scrollToError = (rowIndex: number) => {
    if (tableContainerRef.current) {
      tableContainerRef.current.scrollTo({ top: rowIndex * ROW_HEIGHT_PX, behavior: 'smooth' });
    }
  };

  const handleMouseDown = (header: string, e: React.MouseEvent) => {
    const startX = e.pageX;
    const headerElement = (e.target as HTMLElement).parentElement;
    const startWidth = headerElement?.offsetWidth || 150;
    const onMouseMove = (moveEvent: MouseEvent) => {
      const currentWidth = startWidth + (moveEvent.pageX - startX);
      setColumnWidths((prev) => ({ ...prev, [header]: currentWidth > 50 ? currentWidth : 50 }));
    };
    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  };

  const getCellError = (rowIndex: number, columnName: string) => {
    return errors.find(err => err.row === rowIndex && err.column === columnName);
  };

  const handleSaveToDB = async () => {
    if (!isValidated || errors.length > 0 || !userId) {
      alert("검증 완료 후 진행해 주세요.");
      return;
    }
    if (!window.confirm("검증된 데이터를 저장하시겠습니까?")) return;
    
    setLoading(true);
    setLoadingText('데이터베이스에 저장 중...');
    try {
      const { error } = await supabase.rpc('process_excel_upload', {
        p_user_id: userId,
        p_json_data: previewData.map((row, index) => ({ ...row, 'No.': index + 1 }))
      });
      if (error) throw error;
      alert('저장이 완료되었습니다.');
      setPreviewData([]); setHeaders([]); setFileName(''); setErrors([]); setIsValidated(false);
    } catch (error: any) {
      alert(error.message || '업로드 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={`flex flex-col min-h-screen bg-slate-50 text-slate-900 ${loading ? 'pointer-events-none cursor-wait' : ''}`}>
      <Script src={`//dapi.kakao.com/v2/maps/sdk.js?appkey=${KAKAO_KEY}&libraries=services&autoload=false`} onLoad={() => window.kakao.maps.load()} />
      <Script src="//t1.kakaocdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js" strategy="lazyOnload" />

      <header className="sticky top-[64px] z-30 bg-white border-b px-8 py-4 shadow-sm flex justify-between items-center">
        <div className="flex items-center gap-6">
          <div className="flex flex-col">
            <h1 className="text-xl font-bold text-slate-800">고객배송정보 관리</h1>
            {userEmail && <span className="text-xs text-slate-400 font-normal">담당자: {userEmail}</span>}
          </div>
          <div className="flex items-center gap-3">
            <label htmlFor="file-upload" className="cursor-pointer bg-slate-100 hover:bg-slate-200 text-slate-700 px-4 py-2 rounded-md border border-slate-300 text-sm font-medium transition">
              {fileName ? '파일 변경' : '엑셀 파일 선택'}
            </label>
            <input id="file-upload" ref={fileInputRef} type="file" accept=".xlsx, .xls" onChange={handleFileChange} className="hidden" />
            {fileName && <span className="text-sm text-blue-600 font-medium">{fileName}</span>}
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          {previewData.length > 0 && (
            <button onClick={handleClear} className="px-4 py-2 rounded-md font-bold text-slate-500 hover:text-red-500 border border-slate-200 bg-white shadow-sm transition">초기화</button>
          )}
          <button onClick={handleValidate} disabled={previewData.length === 0 || loading} className="px-6 py-2 rounded-md font-bold transition border bg-white text-blue-600 border-blue-600 hover:bg-blue-50 disabled:text-slate-300 disabled:border-slate-200">
            데이터 검증 {previewData.length > 0 && `(${previewData.length}건)`}
          </button>
          <button onClick={handleSaveToDB} disabled={previewData.length === 0 || loading || !isValidated || errors.length > 0} className="px-8 py-2 rounded-md font-bold text-white bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 shadow-sm transition">
            {loading ? '처리 중...' : '데이터 저장하기'}
          </button>
        </div>
      </header>

      <main className="flex-1 p-8 overflow-hidden relative">
        {previewData.length > 0 ? (
          <div className="flex gap-4 h-full">
            <div ref={tableContainerRef} className="flex-1 bg-white rounded-lg shadow border border-slate-200 overflow-auto max-h-[calc(100vh-200px)] scroll-smooth">
              <table className="text-left text-sm border-collapse table-auto w-max">
                <thead className="bg-slate-50 border-b border-slate-200 sticky top-0 z-20">
                  <tr className={ROW_HEIGHT_CLASS}>
                    {headers.map((header) => (
                      <th key={header} style={columnWidths[header] ? { width: `${columnWidths[header]}px` } : {}} className={`relative px-4 font-semibold text-slate-700 bg-slate-100 align-middle border-r border-slate-200 last:border-r-0 ${header === 'No.' ? 'sticky left-0 z-40 w-16 text-center border-r-2 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]' : ''}`}>
                        <div className="truncate" style={!columnWidths[header] && header !== 'No.' ? { maxWidth: '300px' } : {}}>{header}</div>
                        {header !== 'No.' && (
                          <div onMouseDown={(e) => handleMouseDown(header, e)} className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize hover:bg-blue-400 transition-colors" />
                        )}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {previewData.map((row, index) => {
                    const hasErrorInRow = errorRowIndices.has(index);
                    return (
                      <tr key={index} className={`${ROW_HEIGHT_CLASS} hover:bg-slate-50 transition`}>
                        {headers.map((header) => {
                          if (header === 'No.') {
                            return <td key={header} className={`sticky left-0 z-10 px-4 text-center font-bold border-r-2 transition-colors ${hasErrorInRow ? 'bg-red-500 text-white border-red-600' : 'bg-white text-slate-400 border-slate-200'}`}>{index + 1}</td>;
                          }
                          const cellError = getCellError(index, header);
                          const isEditable = EDITABLE_COLUMNS.includes(header);
                          const isAddress1 = header === '주소1';
                          return (
                            <td key={header} title={cellError?.message} className={`align-middle border-r border-slate-100 last:border-r-0 transition-colors p-0 ${cellError ? 'bg-red-50 text-red-600 font-bold' : 'text-slate-600'}`}>
                              {isEditable ? (
                                <input 
                                  type="text" 
                                  readOnly={isAddress1}
                                  value={row[header] || ''} 
                                  onClick={() => isAddress1 && openPostcode(index)}
                                  onFocus={(e) => !isAddress1 && e.target.select()}
                                  onChange={(e) => !isAddress1 && handleCellChange(index, header, e.target.value)} 
                                  className={`w-full h-11 px-4 outline-none focus:ring-2 focus:ring-blue-400 transition-all bg-transparent focus:bg-white ${isAddress1 ? 'cursor-pointer hover:bg-blue-50' : ''}`} 
                                  placeholder={isAddress1 ? "주소 검색" : ""}
                                />
                              ) : (
                                <div className={`px-4 py-3 truncate`} style={columnWidths[header] ? { width: `${columnWidths[header]}px` } : { maxWidth: '300px' }}>{row[header]?.toString() || ''}</div>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            
            {/* ✅ 다시 추가된 우측 에러 표시바 (미니맵) */}
            {errors.length > 0 && (
              <div className="w-4 bg-slate-100 rounded border border-slate-200 relative overflow-hidden shadow-inner shrink-0" style={{ height: 'calc(100vh - 200px)' }}>
                {errorRowsArray.map((rowIndex) => (
                  <div 
                    key={rowIndex} 
                    onClick={() => scrollToError(rowIndex)} 
                    className="absolute left-0 w-full bg-red-500 hover:bg-red-700 cursor-pointer transition-colors" 
                    style={{ 
                      top: `${(rowIndex / previewData.length) * 100}%`, 
                      height: `${Math.max(2, 100 / previewData.length)}%` 
                    }} 
                    title={`${rowIndex + 1}행에 오류가 있습니다.`} 
                  />
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-[60vh] border-2 border-dashed border-slate-300 rounded-xl bg-white text-slate-400">
            <p className="text-lg font-medium">업로드할 파일을 선택해 주세요.</p>
          </div>
        )}
      </main>

      {loading && (
        <div className="fixed inset-0 z-[9999] bg-slate-900/30 backdrop-blur-sm flex items-center justify-center">
          <div className="bg-white p-6 rounded-2xl shadow-2xl flex flex-col items-center gap-4">
            <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
            <p className="text-sm font-bold text-slate-700">{loadingText}</p>
          </div>
        </div>
      )}
    </div>
  );
}