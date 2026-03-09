'use client';

import React, { useEffect, useState, useRef } from 'react';
import Script from 'next/script';
import { supabase } from '@/lib/supabase';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';
import { useAuth } from '@/hook/useAuth';

declare global {
  interface Window {
    kakao: any;
  }
}

const SEQUENCE_COLORS = [
  '#2563eb', // Blue
  '#16a34a', // Green
  '#ea580c', // Orange
  '#7c3aed', // Purple
  '#db2777', // Pink
  '#0891b2', // Cyan
];

const getSimpleDistance = (p1: {lat: number, lng: number}, p2: {lat: number, lng: number}) => {
  return Math.sqrt(Math.pow(p1.lat - p2.lat, 2) + Math.pow(p1.lng - p2.lng, 2));
};

export default function DeliveryMapPage() {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [drivers, setDrivers] = useState<any[]>([]);
  const [selectedDriver, setSelectedDriver] = useState('');
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [deliveryList, setDeliveryList] = useState<any[]>([]);
  
  const mapRef = useRef<HTMLDivElement>(null); 
  const [mapInstance, setMapInstance] = useState<any>(null);
  const [markers, setMarkers] = useState<any[]>([]);
  const [overlays, setOverlays] = useState<any[]>([]);
  const [polyline, setPolyline] = useState<any>(null);
  const { 
    user, 
    isLocalManager, 
    userCenterList, 
    isDriver, 
    canEdit 
  } = useAuth();
  
  const YANGJU_BASE = { lat: 37.7853, lng: 127.0457 };
  // 환경 변수에서 가져오기
  const KAKAO_KEY = process.env.NEXT_PUBLIC_KAKAO_JS_KEY;
  useEffect(() => {
    const fetchDrivers = async () => {
      // 🌟 user가 로드되지 않았거나 권한 정보가 없으면 대기
      if (!user?.user_role) return;

      let query = supabase
        .from('ks_driver')
        .select('driver_id, driver_name, driver_email, driver_center')
        .order('driver_name');

      // 001003(USER) 권한일 경우 본인 센터 기사만 필터링
      if (isLocalManager) {
        query = query.in('driver_center', userCenterList);
      }

      const { data, error } = await query;
      if (error) {
        console.error('기사 로드 실패:', error);
        return;
      }
      if (data) setDrivers(data);
    };
    
    fetchDrivers();
  }, [user, isLocalManager, userCenterList]); // 의존성 배열에 추가

  // 🌟 보안 처리: 기사 권한(001004)은 지도 편집 페이지 접근 차단
  if (!user || isDriver) {
    return (
      <div className="flex items-center justify-center h-screen bg-slate-50">
        <p className="text-slate-500 font-bold">페이지 접근 권한이 없습니다.</p>
      </div>
    );
  }

  useEffect(() => {
    // if (window.kakao && window.kakao.maps) {
    //   window.kakao.maps.load(() => { initMap(); });
    // }
    const container = mapRef.current;
  
    const drawMap = () => {
      if (window.kakao && window.kakao.maps && container) {
        // 기존 내용을 비우고 새로 생성 (재진입 시 잔상 방지)
        container.innerHTML = ''; 
        const options = { 
          center: new window.kakao.maps.LatLng(YANGJU_BASE.lat, YANGJU_BASE.lng), 
          level: 8 
        };
        const map = new window.kakao.maps.Map(container, options);
        setMapInstance(map);
      }
    };

    if (window.kakao && window.kakao.maps) {
      // 이미 스크립트가 로드된 상태라면 즉시 로드 함수 호출
      window.kakao.maps.load(drawMap);
    }
    // 스크립트가 아직 로드 전이라면 Script 컴포넌트의 onLoad가 처리함
  }, []);

  const initMap = () => {
    if (window.kakao && window.kakao.maps && mapRef.current) {
      mapRef.current.innerHTML = '';
      const options = { center: new window.kakao.maps.LatLng(YANGJU_BASE.lat, YANGJU_BASE.lng), level: 8 };
      const map = new window.kakao.maps.Map(mapRef.current, options);
      setMapInstance(map);
    }
  };

  const clearMap = () => {
    markers.forEach(m => m.setMap(null));
    overlays.forEach(o => o.setMap(null));
    if (polyline) polyline.setMap(null);
    setMarkers([]);
    setOverlays([]);
    setPolyline(null);
  };

  // ✅ 수정됨: 양주 본점 경로 제외, 순수 배송지 간 경로만 추출
  const fetchRoadPath = async (list: any[]) => {
    if (list.length < 2) return []; // 지점이 2개 미만이면 경로를 그릴 필요가 없음
    const allLinePaths: any[] = [];
    
    // list 자체가 이미 최적화된 배송지 목록임 (본점 제외)
    const fullPath = [...list];

    for (let i = 0; i < fullPath.length - 1; i += 5) {
      const chunk = fullPath.slice(i, i + 6);
      if (chunk.length < 2) break;
      const origin = `${chunk[0].lng},${chunk[0].lat}`;
      const destination = `${chunk[chunk.length - 1].lng},${chunk[chunk.length - 1].lat}`;
      const waypoints = chunk.slice(1, -1).map(item => `${item.lng},${item.lat}`).join('|');
      
      try {
        const response = await fetch('/api/proxy-route', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ origin, destination, waypoints }),
        });
        const data = await response.json();
        if (data.routes && data.routes[0]) {
          data.routes[0].sections.forEach((section: any) => {
            section.roads.forEach((road: any) => {
              road.vertexes.forEach((vertex: number, idx: number) => {
                if (idx % 2 === 0) {
                  allLinePaths.push(new window.kakao.maps.LatLng(road.vertexes[idx + 1], road.vertexes[idx]));
                }
              });
            });
          });
        }
      } catch (error) { console.error('경로 호출 실패:', error); }
    }
    return allLinePaths.length > 0 ? allLinePaths : fullPath.map(item => new window.kakao.maps.LatLng(item.lat, item.lng));
  };

  const redrawMapLayers = async (list: any[]) => {
    if (!mapInstance) return;
    clearMap();
    const newMarkers: any[] = [];
    const newOverlays: any[] = [];

    list.forEach((item, idx) => {
      const coords = new window.kakao.maps.LatLng(item.lat, item.lng);
      const marker = new window.kakao.maps.Marker({ 
        map: mapInstance, 
        position: coords,
        title: item.displayName 
      });
      const bgColor = SEQUENCE_COLORS[idx % SEQUENCE_COLORS.length];

      const content = `
        <div style="background:${bgColor}; color:white; border-radius:15px; padding: 2px 10px;
             display:flex; align-items:center; justify-content:center; font-size:12px; font-weight:bold; 
             border:2px solid white; box-shadow:0 2px 4px rgba(0,0,0,0.3); transform:translateY(-40px); white-space:nowrap;">
          ${idx + 1}${item.displayCount > 1 ? ` (${item.displayCount})` : ''}
        </div>`;
      
      const overlay = new window.kakao.maps.CustomOverlay({ position: coords, content: content, yAnchor: 1 });
      overlay.setMap(mapInstance);
      newMarkers.push(marker);
      newOverlays.push(overlay);
    });

    setMarkers(newMarkers);
    setOverlays(newOverlays);

    // 경로 그리기 호출
    const roadPath = await fetchRoadPath(list);
    if (roadPath.length > 0) {
      const newLine = new window.kakao.maps.Polyline({
        path: roadPath, strokeWeight: 5, strokeColor: '#2563eb', strokeOpacity: 0.7,
      });
      newLine.setMap(mapInstance);
      setPolyline(newLine);
    }
  };

  const fetchDriverDeliveries = async () => {
    if (!selectedDriver) return alert('기사를 선택해주세요.');

    // 카카오맵 서비스 라이브러리 로드 체크
    if (!window.kakao || !window.kakao.maps || !window.kakao.maps.services) {
      alert('지도가 화면에 보이지 않을 경우 새로고침(F5) 후 조회 바랍니다.');
      return;
    }

    setLoading(true);
    
    const { data, error } = await supabase
      .from('ks_devcustm')
      .select('*')
      .eq('cust_devid', selectedDriver)
      .eq('cust_devdate', selectedDate);

    if (error) { setLoading(false); return; }
    if (!data || data.length === 0) {
      alert('해당 조건의 배송 데이터가 없습니다.');
      setDeliveryList([]); clearMap(); setLoading(false); return;
    }

    const geocoder = new window.kakao.maps.services.Geocoder();
    const itemsWithCoords = await Promise.all(data.map(async (item) => {
      return new Promise((resolve) => {
        geocoder.addressSearch(item.cust_address, (result: any, status: any) => {
          if (status === window.kakao.maps.services.Status.OK) {
            resolve({ ...item, lat: parseFloat(result[0].y), lng: parseFloat(result[0].x) });
          } else { resolve(null); }
        });
      });
    }));

    const validItems = (itemsWithCoords.filter(i => i !== null) as any[]);

    const groupedMap = new Map();
    validItems.forEach(item => {
      const key = `${item.lat},${item.lng}`;
      if (!groupedMap.has(key)) {
        groupedMap.set(key, { 
          ...item, 
          items: [item], 
          displayCount: 1,
          displayName: item.cust_name 
        });
      } else {
        const existing = groupedMap.get(key);
        existing.items.push(item);
        existing.displayCount += 1;
        existing.displayName = `${existing.items[0].cust_name} 외 ${existing.displayCount - 1}건`;
      }
    });

    let unvisited = Array.from(groupedMap.values());
    
    const optimizedList: any[] = [];
    let currentPos = { lat: YANGJU_BASE.lat, lng: YANGJU_BASE.lng };

    while (unvisited.length > 0) {
      let closestIdx = 0;
      let minDistance = getSimpleDistance(currentPos, unvisited[0]);

      for (let i = 1; i < unvisited.length; i++) {
        const dist = getSimpleDistance(currentPos, unvisited[i]);
        if (dist < minDistance) {
          minDistance = dist;
          closestIdx = i;
        }
      }

      const nextStop = unvisited.splice(closestIdx, 1)[0];
      optimizedList.push(nextStop);
      currentPos = nextStop;
    }

    setDeliveryList(optimizedList);
    await redrawMapLayers(optimizedList);

    const bounds = new window.kakao.maps.LatLngBounds();
    // ✅ 지도 범위(Bounds) 설정에서는 본점을 포함하여 기사님이 위치를 가늠하게 함
    bounds.extend(new window.kakao.maps.LatLng(YANGJU_BASE.lat, YANGJU_BASE.lng));
    optimizedList.forEach(item => bounds.extend(new window.kakao.maps.LatLng(item.lat, item.lng)));
    if (mapInstance && optimizedList.length > 0) mapInstance.setBounds(bounds);
    setLoading(false);
  };

  const handleSaveSequence = async () => {
    if (deliveryList.length === 0) return;
    setSaving(true);
    try {
      const updates: any[] = [];
      let globalIdx = 1;
      deliveryList.forEach((group) => {
        group.items.forEach((item: any) => {
          updates.push({ cust_ordno: item.cust_ordno, cust_devno: globalIdx });
        });
        globalIdx++;
      });

      const { error } = await supabase.from('ks_devcustm').upsert(updates, { onConflict: 'cust_ordno' });
      if (error) throw error;
      alert('순서가 저장되었습니다.');
      await fetchDriverDeliveries();
    } catch (err) { alert('저장 중 오류가 발생했습니다.'); } finally { setSaving(false); }
  };

  const onDragEnd = async (result: DropResult) => {
    if (!result.destination) return;
    const items = Array.from(deliveryList);
    const [reorderedItem] = items.splice(result.source.index, 1);
    items.splice(result.destination.index, 0, reorderedItem);
    setDeliveryList(items);
    await redrawMapLayers(items);
  };

  return (
    <div className="flex flex-col h-screen bg-slate-50">
      {/* <Script 
        strategy="afterInteractive"
        src={`//dapi.kakao.com/v2/maps/sdk.js?appkey=${KAKAO_KEY}&autoload=false&libraries=services`}
        onLoad={() => { if (window.kakao) window.kakao.maps.load(initMap); }}
      /> */}

      <header className="bg-white border-b border-slate-200 p-4 flex items-center justify-between shadow-sm z-10">
        <div className="flex items-center gap-4">
            <h1 className="text-xl font-black text-slate-800 mr-4">배송 순서 편집</h1>
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-slate-500">배송일자</span>
              <input 
                type="date" 
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="border border-slate-300 rounded-lg px-3 py-2 text-sm font-bold text-slate-900 bg-white outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <select 
              value={selectedDriver}
              onChange={(e) => setSelectedDriver(e.target.value)}
              className="border border-slate-300 rounded-lg px-3 py-2 text-sm font-bold text-slate-900 bg-white outline-none focus:ring-2 focus:ring-blue-500 min-w-[180px]"
            >
              <option value="" className="text-slate-400">배송 기사 선택</option>
              {drivers.map(d => (
                <option key={d.driver_id} value={d.driver_id} className="text-slate-900">
                  {d.driver_name} ({d.driver_center})
                </option>
              ))}
            </select>

            <button 
              onClick={fetchDriverDeliveries}
              disabled={loading}
              className="bg-slate-900 text-white px-6 py-2 rounded-lg font-bold hover:bg-slate-700 active:scale-95 disabled:opacity-50 transition-all"
            >
              {loading ? '조회 중...' : '최적 경로 조회'}
            </button>
        </div>

        <button 
          onClick={handleSaveSequence}
          disabled={saving || deliveryList.length === 0}
          className="bg-blue-600 text-white px-8 py-2 rounded-lg font-bold hover:bg-blue-700 active:scale-95 disabled:opacity-50 transition-all shadow-lg"
        >
          {saving ? '저장 중...' : '순서 저장하기'}
        </button>
      </header>

      <main className="flex flex-1 overflow-hidden">
        <div className="w-80 bg-white border-r border-slate-200 overflow-y-auto">
          <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
            <span className="text-xs font-black text-slate-400 uppercase tracking-wider">배송 순서 편집</span>
            <span className="text-[10px] bg-blue-100 text-blue-600 px-2 py-0.5 rounded font-bold">통합 최적화</span>
          </div>
          
          <DragDropContext onDragEnd={onDragEnd}>
            <Droppable droppableId="deliveryList">
              {(provided) => (
                <div {...provided.droppableProps} ref={provided.innerRef}>
                  {deliveryList.map((group, idx) => (
                    <Draggable key={`${group.cust_ordno}-${idx}`} draggableId={`${group.cust_ordno}-${idx}`} index={idx}>
                      {(provided, snapshot) => (
                        <div 
                          ref={provided.innerRef}
                          {...provided.draggableProps}
                          {...provided.dragHandleProps}
                          onClick={() => !snapshot.isDragging && mapInstance.panTo(new window.kakao.maps.LatLng(group.lat, group.lng))}
                          className={`p-4 border-b border-slate-50 transition-colors cursor-grab active:cursor-grabbing ${
                            snapshot.isDragging ? 'bg-slate-100 shadow-md scale-105 z-50' : 'bg-white hover:bg-blue-50'
                          }`}
                        >
                          <div className="flex items-center gap-2 mb-1">
                            <span 
                              style={{ backgroundColor: SEQUENCE_COLORS[idx % SEQUENCE_COLORS.length] }}
                              className="text-white text-[10px] w-5 h-5 flex items-center justify-center rounded-full font-black shadow-sm"
                            >
                              {idx + 1}
                            </span>
                            <span className="font-black text-sm text-slate-900">
                              {group.displayName}
                            </span>
                          </div>
                          <p className="text-xs text-slate-600 truncate">{group.cust_address}</p>
                          {group.displayCount > 1 && (
                            <div className="mt-2 pl-6 space-y-1">
                              {group.items.map((sub: any, sIdx: number) => (
                                <p key={sIdx} className="text-[10px] text-blue-500 font-medium leading-none">
                                  • {sub.cust_name} (No.{sub.cust_ordno})
                                </p>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </Draggable>
                  ))}
                  {provided.placeholder}
                </div>
              )}
            </Droppable>
          </DragDropContext>
        </div>

        <div className="flex-1 relative">
          <div ref={mapRef} className="w-full h-full bg-slate-200" />
          <div className="absolute top-4 right-4 bg-white/90 backdrop-blur px-3 py-1.5 rounded-md shadow-sm border border-slate-200 z-10">
            <p className="text-[10px] font-bold text-slate-600 italic">Starting from: 양주 본사 🏁</p>
          </div>
        </div>
      </main>
    </div>
  );
}