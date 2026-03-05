'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hook/useAuth';
import { Search, Plus, Save, Trash2, RefreshCw, X } from 'lucide-react';

export default function KakaoPushAgentPage() {
  const { user } = useAuth();
  
  // 1. 상태 관리
  const [loading, setLoading] = useState(false);
  const [agents, setAgents] = useState<any[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<any>(null); // 현재 편집 중인 데이터
  const [isNew, setIsNew] = useState(false); // 신규 모드 여부

  // 조회 조건 상태
  const [searchFilter, setSearchFilter] = useState({
    hp: '',
    name: '',
    useGbn: 'all',
  });

  // 2. 연락처 포맷팅 함수 (숫자만 추출 후 000-0000-0000 적용)
  const formatHP = (val: string) => {
    const s = val.replace(/[^0-9]/g, '');
    if (s.length <= 3) return s;
    if (s.length <= 7) return `${s.substring(0, 3)}-${s.substring(3)}`;
    return `${s.substring(0, 3)}-${s.substring(3, 7)}-${s.substring(7, 11)}`;
  };

  // 3. 데이터 조회 (READ)
  const fetchAgents = useCallback(async () => {
    setLoading(true);
    try {
      let query = supabase.from('kakao_pushagent').select('*');

      if (searchFilter.hp) {
        const pureHp = searchFilter.hp.replace(/[^0-9]/g, '');
        query = query.ilike('push_agenthpno', `%${pureHp}%`);
      }
      if (searchFilter.name) {
        query = query.ilike('push_agentname', `%${searchFilter.name}%`);
      }
      if (searchFilter.useGbn !== 'all') {
        query = query.eq('push_usegbn', searchFilter.useGbn === 'true');
      }

      const { data, error } = await query.order('push_no', { ascending: false });
      if (error) throw error;
      setAgents(data || []);
    } catch (error: any) {
      alert('조회 중 오류 발생: ' + error.message);
    } finally {
      setLoading(false);
    }
  }, [searchFilter]);

  useEffect(() => {
    fetchAgents();
  }, [fetchAgents]);

  // 4. 저장 로직 (CREATE / UPDATE)
  const handleSave = async () => {
    if (!selectedAgent.push_agentname || !selectedAgent.push_agenthpno) {
      alert('매장명과 연락처는 필수 입력 사항입니다.');
      return;
    }

    setLoading(true);
    try {
      const payload = {
        push_agentname: selectedAgent.push_agentname,
        push_agenthpno: selectedAgent.push_agenthpno,
        push_usegbn: selectedAgent.push_usegbn,
        push_reguuid: user?.id, // 등록자 UUID
      };

      if (isNew) {
        // [신규] Max+1 채번 로직
        const { data: maxData } = await supabase.from('kakao_pushagent').select('push_no').order('push_no', { ascending: false }).limit(1).single();
        const nextNo = maxData ? maxData.push_no + 1 : 1;
        
        const { error } = await supabase.from('kakao_pushagent').insert({ ...payload, push_no: nextNo });
        if (error) throw error;
        alert('신규 등록되었습니다.');
      } else {
        // [수정]
        const { error } = await supabase.from('kakao_pushagent').update(payload).eq('push_no', selectedAgent.push_no);
        if (error) throw error;
        alert('수정되었습니다.');
      }

      setSelectedAgent(null);
      setIsNew(false);
      fetchAgents();
    } catch (error: any) {
      alert('저장 오류: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  // 5. 삭제 로직 (DELETE)
  const handleDelete = async (pushNo: number) => {
    if (!confirm('해당 매장을 삭제하시겠습니까?')) return;
    
    try {
      const { error } = await supabase.from('kakao_pushagent').delete().eq('push_no', pushNo);
      if (error) throw error;
      alert('삭제되었습니다.');
      fetchAgents();
    } catch (error: any) {
      alert('삭제 오류: ' + error.message);
    }
  };

  return (
    <div className="flex flex-col h-screen bg-slate-50 p-4 md:p-6 overflow-hidden">
      {/* 제목 및 버튼 바 */}
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
          <div className="w-2 h-8 bg-blue-600 rounded-full" />
          알림톡 발송요청 매장 관리
        </h1>
        <div className="flex gap-2">
          <button onClick={fetchAgents} className="flex items-center gap-1 px-4 py-2 bg-white border text-black border-slate-200 rounded-lg hover:bg-slate-50 transition-all text-sm font-semibold shadow-sm">
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} /> 조회
          </button>
          <button 
            onClick={() => {
              setSelectedAgent({ push_agentname: '', push_agenthpno: '', push_usegbn: true });
              setIsNew(true);
            }} 
            className="flex items-center gap-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-all text-sm font-semibold shadow-md"
          >
            <Plus size={16} /> 신규등록
          </button>
        </div>
      </div>

      {/* 조회 조건 섹션 */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 bg-white p-4 rounded-xl shadow-sm border border-slate-200 mb-6">
        <div>
          <label className="block text-xs font-bold text-slate-500 mb-1 uppercase">매장명</label>
          <input 
            type="text" 
            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-all text-slate-900 font-medium"
            placeholder="매장명 입력"
            value={searchFilter.name}
            onChange={(e) => setSearchFilter({...searchFilter, name: e.target.value})}
          />
        </div>
        <div>
          <label className="block text-xs font-bold text-slate-500 mb-1 uppercase">연락처</label>
          <input 
            type="text" 
            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-all text-slate-900 font-bold font-mono"
            placeholder="숫자만 입력"
            value={searchFilter.hp}
            onChange={(e) => setSearchFilter({...searchFilter, hp: formatHP(e.target.value)})}
          />
        </div>
        <div>
          <label className="block text-xs font-bold text-slate-500 mb-1 uppercase">사용구분</label>
          <select 
            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-slate-900 font-medium"
            value={searchFilter.useGbn}
            onChange={(e) => setSearchFilter({...searchFilter, useGbn: e.target.value})}
          >
            <option value="all">전체</option>
            <option value="true">사용</option>
            <option value="false">미사용</option>
          </select>
        </div>
      </div>

      {/* 데이터 테이블 섹션 */}
      <div className="flex-1 overflow-hidden bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col">
        <div className="overflow-y-auto custom-scrollbar flex-1">
          <table className="w-full text-left border-collapse">
            <thead className="sticky top-0 bg-slate-900 text-white z-10">
              <tr>
                <th className="px-4 py-3 text-sm font-medium">No.</th>
                <th className="px-4 py-3 text-sm font-medium">매장명</th>
                <th className="px-4 py-3 text-sm font-medium">연락처</th>
                <th className="px-4 py-3 text-sm font-medium text-center">사용여부</th>
                <th className="px-4 py-3 text-sm font-medium">등록일시</th>
                <th className="px-4 py-3 text-sm font-medium text-center">관리</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {agents.map((agent) => (
                <tr 
                  key={agent.push_no} 
                  className="hover:bg-blue-50/50 cursor-pointer transition-colors"
                  onClick={() => { setSelectedAgent(agent); setIsNew(false); }}
                >
                  <td className="px-4 py-3 text-sm text-slate-600 font-mono">{agent.push_no}</td>
                  <td className="px-4 py-3 text-sm font-bold text-slate-800">{agent.push_agentname}</td>
                  <td className="px-4 py-3 text-sm text-slate-900 font-bold font-mono">{agent.push_agenthpno}</td>
                  <td className="px-4 py-3 text-sm text-center">
                    <span className={`px-2 py-1 rounded-full text-[10px] font-bold ${agent.push_usegbn ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                      {agent.push_usegbn ? '사용' : '미사용'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-400">
                    {new Date(agent.push_regdatetime).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <button 
                      onClick={(e) => { e.stopPropagation(); handleDelete(agent.push_no); }}
                      className="p-1.5 text-slate-400 hover:text-red-600 transition-colors"
                    >
                      <Trash2 size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 수정/신규 입력 팝업 (모달) */}
      {selectedAgent && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="bg-slate-900 p-4 text-white flex justify-between items-center">
              <h3 className="font-bold flex items-center gap-2">
                {isNew ? <Plus size={18} /> : <RefreshCw size={18} />}
                {isNew ? '매장 신규 등록' : '매장 정보 수정'}
              </h3>
              <button onClick={() => setSelectedAgent(null)}><X size={20} /></button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1">매장명</label>
                <input 
                  type="text" 
                  className="w-full px-4 py-2 border rounded-lg outline-none focus:ring-2 focus:ring-blue-500 text-slate-900 font-bold text-lg"
                  value={selectedAgent.push_agentname}
                  onChange={(e) => setSelectedAgent({...selectedAgent, push_agentname: e.target.value})}
                />
              </div>
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1">연락처</label>
                <input 
                  type="text" 
                  className="w-full px-4 py-2 border rounded-lg outline-none focus:ring-2 focus:ring-blue-500 font-mono text-slate-900 font-bold text-lg"
                  placeholder="010-0000-0000"
                  value={selectedAgent.push_agenthpno}
                  onChange={(e) => setSelectedAgent({...selectedAgent, push_agenthpno: formatHP(e.target.value)})}
                />
              </div>
              <div className="flex items-center gap-2 pt-2">
                <input 
                  type="checkbox" 
                  id="usegbn"
                  className="w-5 h-5 accent-blue-600"
                  checked={selectedAgent.push_usegbn}
                  onChange={(e) => setSelectedAgent({...selectedAgent, push_usegbn: e.target.checked})}
                />
                <label htmlFor="usegbn" className="text-sm font-bold text-slate-700">현재 매장 사용함</label>
              </div>
            </div>
            <div className="p-4 bg-slate-50 flex gap-2">
              <button onClick={() => setSelectedAgent(null)} className="flex-1 py-3 text-slate-600 font-bold hover:bg-slate-200 rounded-xl transition-all">취소</button>
              <button onClick={handleSave} className="flex-1 py-3 bg-blue-600 text-white font-bold hover:bg-blue-700 rounded-xl shadow-lg transition-all flex items-center justify-center gap-2">
                <Save size={18} /> 저장하기
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}