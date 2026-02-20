'use client';

import React, { useEffect, useState, useRef } from 'react';
import Script from 'next/script';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hook/useAuth';

declare global {
  interface Window {
    kakao: any;
  }
}

type ViewOption = 'default' | 'status' | 'carrier';

// 범례 아이템 타입 정의
interface LegendItem {
  code: string;
  text: string;
  hex: string;
}

export default function DeliveryStatusPage() {
  const [loading, setLoading] = useState(false);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [viewOption, setViewOption] = useState<ViewOption>('default');
  const { user, isLocalManager, userCenterList } = useAuth();
  
  // ✅ 범례 데이터 상태 추가
  const [legends, setLegends] = useState<LegendItem[]>([]);
  
  const mapRef = useRef<HTMLDivElement>(null); 
  const [mapInstance, setMapInstance] = useState<any>(null);
  const [markers, setMarkers] = useState<any[]>([]);

  const YANGJU_BASE = { lat: 37.7853, lng: 127.0457 };
  // 환경 변수에서 가져오기
  const KAKAO_KEY = process.env.NEXT_PUBLIC_KAKAO_JS_KEY;

  useEffect(() => {
    const initMap = () => {
      if (window.kakao && window.kakao.maps) {
        window.kakao.maps.load(() => {
          if (mapRef.current) {
            const options = { 
              center: new window.kakao.maps.LatLng(YANGJU_BASE.lat, YANGJU_BASE.lng), 
              level: 8 
            };
            const map = new window.kakao.maps.Map(mapRef.current, options);
            setMapInstance(map);
          }
        });
      }
    };

    if (window.kakao && window.kakao.maps) {
      initMap();
    } else {
      const timer = setInterval(() => {
        if (window.kakao && window.kakao.maps) {
          initMap();
          clearInterval(timer);
        }
      }, 500);
      return () => clearInterval(timer);
    }
  }, []);

  const clearMap = () => {
    markers.forEach(m => m.setMap(null));
    setMarkers([]);
  };

  const createMarkerImage = (color: string) => {
    if (!color) return null;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24"><path fill="${color}" stroke="white" stroke-width="1.5" d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>`;
    const blob = new Blob([svg], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const size = new window.kakao.maps.Size(32, 32);
    const option = { offset: new window.kakao.maps.Point(16, 32) };
    return new window.kakao.maps.MarkerImage(url, size, option);
  };

  const fetchAllDeliveriesByDate = async () => {
    if (!selectedDate) return alert('배송일자를 선택해주세요.');
    if (!mapInstance) return alert('지도가 아직 준비되지 않았습니다.');
    if (!user) return; // 권한정보 로드 대기

    setLoading(true);
    clearMap();
    setLegends([]); // 범례 초기화

    try {
      // 1. 배송 데이터 조회
      let query = supabase
        .from('ks_devcustm')
        .select('cust_ordno, cust_name, cust_address, cust_lat, cust_lng, cust_devstatus, cust_devcenter')
        .eq('cust_devdate', selectedDate);

      // 001003 권한일 경우 본인 센터 데이터만 가져옴
      if (isLocalManager) {
        query = query.in('cust_devcenter', userCenterList);
      }  

      const { data: deliveryData, error: deliveryError } = await query;
      if (deliveryError) throw deliveryError;

      // 2. 공통 코드(컬러 및 명칭) 데이터 조회
      let colorMap: Record<string, string> = {};
      if (viewOption !== 'default') {
        const mCode = viewOption === 'status' ? '002' : '004';
        const { data: commonCode } = await supabase
          .from('ks_common')
          .select('comm_ccode, comm_hex, comm_text1, comm_sort')
          .eq('comm_mcode', mCode)
          .order('comm_sort', { ascending: true });
        
        if (commonCode) {
          const newLegends = commonCode.map(item => ({
            code: item.comm_ccode,
            text: item.comm_text1,
            hex: item.comm_hex
          }));
          setLegends(newLegends); // 범례 상태 업데이트

          commonCode.forEach(item => {
            colorMap[item.comm_ccode] = item.comm_hex;
          });
        }
      }

      if (!deliveryData || deliveryData.length === 0) {
        alert('조회된 데이터가 없습니다.');
        setLoading(false);
        return;
      }

      const newMarkers: any[] = [];
      const bounds = new window.kakao.maps.LatLngBounds();

      deliveryData.forEach((item) => {
        if (item.cust_lat && item.cust_lng) {
          const coords = new window.kakao.maps.LatLng(item.cust_lat, item.cust_lng);
          
          let markerColor = '';
          if (viewOption === 'status') markerColor = colorMap[item.cust_devstatus];
          else if (viewOption === 'carrier') markerColor = colorMap[item.cust_devcenter];

          const markerOptions: any = {
            map: mapInstance,
            position: coords,
            title: item.cust_name
          };

          if (markerColor) {
            markerOptions.image = createMarkerImage(markerColor);
          }

          const marker = new window.kakao.maps.Marker(markerOptions);
          newMarkers.push(marker);
          bounds.extend(coords);
        }
      });

      setMarkers(newMarkers);
      if (newMarkers.length > 0) mapInstance.setBounds(bounds);

    } catch (err) {
      console.error(err);
      alert('데이터를 가져오는 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-screen bg-slate-50">
      <Script 
        strategy="afterInteractive"
        src={`//dapi.kakao.com/v2/maps/sdk.js?appkey=${KAKAO_KEY}&autoload=false&libraries=services`}
      />

      <header className="bg-white border-b border-slate-200 p-4 flex flex-col gap-4 shadow-sm z-10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <h1 className="text-xl font-black text-slate-800 mr-4">📍 일자별 배송 현황</h1>
            
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-slate-500">배송일자</span>
              <input 
                type="date" 
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="border border-slate-300 rounded-lg px-3 py-2 text-sm font-bold text-slate-900 bg-white outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <button 
              onClick={fetchAllDeliveriesByDate}
              disabled={loading}
              className="bg-blue-600 text-white px-6 py-2 rounded-lg font-bold hover:bg-blue-700 active:scale-95 disabled:opacity-50 transition-all"
            >
              {loading ? '조회 중...' : '현황 조회'}
            </button>

            <div className="flex items-center gap-4 ml-4 bg-slate-100 px-4 py-2 rounded-lg border border-slate-200">
              {[
                { id: 'default', label: '기본' },
                { id: 'status', label: '배송상태별' },
                // 🌟 isLocalManager(001003)가 아닐 때만 '물류사별' 옵션을 추가
                ...(isLocalManager ? [] : [{ id: 'carrier', label: '물류사별' }])
              ].map((option) => (
                <label key={option.id} className="flex items-center gap-2 cursor-pointer group">
                  <input 
                    type="radio" 
                    name="viewOption"
                    value={option.id}
                    checked={viewOption === option.id}
                    onChange={(e) => setViewOption(e.target.value as ViewOption)}
                    className="w-4 h-4 text-blue-600 border-slate-300 focus:ring-blue-500 cursor-pointer"
                  />
                  <span className={`text-sm font-bold transition-colors ${
                    viewOption === option.id ? 'text-blue-600' : 'text-slate-600 group-hover:text-slate-900'
                  }`}>
                    {option.label}
                  </span>
                </label>
              ))}
            </div>
          </div>
          
          <div className="text-sm font-bold text-slate-400">
            표시된 배송지: {markers.length}건
          </div>
        </div>

        {/* ✅ 범례(Legend) 표시 영역 */}
        {legends.length > 0 && (
          <div className="flex items-center gap-6 px-2 py-1 border-t border-slate-100 pt-3">
            <span className="text-xs font-black text-slate-400 uppercase tracking-wider">범례</span>
            <div className="flex items-center gap-4 overflow-x-auto">
              {legends.map((legend) => (
                <div key={legend.code} className="flex items-center gap-1.5 whitespace-nowrap">
                  <span 
                    className="w-3 h-3 rounded-full" 
                    style={{ backgroundColor: legend.hex }}
                  ></span>
                  <span 
                    className="text-sm font-bold" 
                    style={{ color: legend.hex }}
                  >
                    {legend.text}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </header>

      <main className="flex-1 relative overflow-hidden">
        <div ref={mapRef} className="w-full h-full bg-slate-200" style={{ minHeight: 'calc(100vh - 120px)' }} />
        {loading && (
          <div className="absolute inset-0 bg-white/50 flex items-center justify-center z-20">
            <div className="bg-white p-5 rounded-xl shadow-xl font-bold flex flex-col items-center gap-3">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              데이터를 분석 중입니다...
            </div>
          </div>
        )}
      </main>
    </div>
  );
}