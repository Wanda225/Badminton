
import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { Side, PlayerPosition, MatchState, HistoryEntry, Player } from './types';

const DEFAULT_MASTER_LIST: Player[] = [];

const App: React.FC = () => {
  const [view, setView] = useState<'Lobby' | 'Match' | 'Settings'>('Lobby');
  const [players, setPlayers] = useState<Player[]>(() => {
    const saved = localStorage.getItem('badminton_players');
    return saved ? JSON.parse(saved) : DEFAULT_MASTER_LIST;
  });

  const [match, setMatch] = useState<MatchState | null>(null);
  const [showStatsDrawer, setShowStatsDrawer] = useState(false);
  const [winningPlayer, setWinningPlayer] = useState<Side | null>(null);
  
  // 分隊相關狀態
  const [showAssignmentModal, setShowAssignmentModal] = useState(false);
  const [assignedTeams, setAssignedTeams] = useState<{team1: Player[], team2: Player[]} | null>(null);
  const [pairingIndex, setPairingIndex] = useState(0); // 0: 1+4 vs 2+3, 1: 1+2 vs 3+4, 2: 1+3 vs 2+4

  const [newPlayerName, setNewPlayerName] = useState('');
  const [newPlayerLevel, setNewPlayerLevel] = useState(5);
  const [editingPlayer, setEditingPlayer] = useState<Player | null>(null);

  useEffect(() => {
    localStorage.setItem('badminton_players', JSON.stringify(players));
  }, [players]);

  const sortedPlayers = useMemo(() => {
    return [...players].sort((a, b) => a.matchesPlayed - b.matchesPlayed || b.level - a.level);
  }, [players]);

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  
  const autoPickPlayers = () => {
    const top4 = sortedPlayers.slice(0, 4).map(p => p.id);
    setSelectedIds(top4);
  };

  const toggleSelection = (id: string) => {
    if (selectedIds.includes(id)) {
      setSelectedIds(selectedIds.filter(i => i !== id));
    } else {
      if (selectedIds.length < 4) setSelectedIds([...selectedIds, id]);
    }
  };

  // 預備比賽：進入分隊確認環節
  const prepareMatch = () => {
    if (selectedIds.length !== 4) {
      alert('請挑選 4 位球員進行雙打比賽');
      return;
    }
    const selected = players.filter(p => selectedIds.includes(p.id)).sort((a, b) => b.level - a.level);
    generatePairing(selected, 0); // 預設使用最強+最弱的平衡組合
    setPairingIndex(0);
    setShowAssignmentModal(true);
  };

  const generatePairing = (p: Player[], index: number) => {
    let t1: Player[] = [];
    let t2: Player[] = [];
    
    // p 已經按等級從高到低排序 [最強, 次強, 次弱, 最弱]
    if (index === 0) { // 平衡組合: 1+4 vs 2+3
      t1 = [p[0], p[3]];
      t2 = [p[1], p[2]];
    } else if (index === 1) { // 強強聯手: 1+2 vs 3+4
      t1 = [p[0], p[1]];
      t2 = [p[2], p[3]];
    } else { // 交叉組合: 1+3 vs 2+4
      t1 = [p[0], p[2]];
      t2 = [p[1], p[3]];
    }
    setAssignedTeams({ team1: t1, team2: t2 });
  };

  const cyclePairings = () => {
    const nextIdx = (pairingIndex + 1) % 3;
    setPairingIndex(nextIdx);
    const selected = players.filter(p => selectedIds.includes(p.id)).sort((a, b) => b.level - a.level);
    generatePairing(selected, nextIdx);
  };

  const startMatch = () => {
    if (!assignedTeams) return;
    setMatch({
      score1: 0,
      score2: 0,
      server: PlayerPosition.PLAYER_1,
      servingSide: Side.RIGHT,
      history: [],
      gameTo: 21,
      matchType: 'Doubles',
      team1: assignedTeams.team1,
      team2: assignedTeams.team2
    });
    setWinningPlayer(null);
    setShowAssignmentModal(false);
    setView('Match');
  };

  const handleScoreChange = (side: Side, amount: number) => {
    if (!match || (winningPlayer && amount > 0)) return;

    setMatch(prev => {
      if (!prev) return null;
      const newScore1 = side === Side.LEFT ? Math.max(0, prev.score1 + amount) : prev.score1;
      const newScore2 = side === Side.RIGHT ? Math.max(0, prev.score2 + amount) : prev.score2;
      
      const newHistory: HistoryEntry[] = [...prev.history, { 
        score1: prev.score1, 
        score2: prev.score2, 
        server: prev.server 
      }];

      let newServer = prev.server;
      if (amount > 0) {
        if (side === Side.LEFT) newServer = PlayerPosition.PLAYER_1;
        else newServer = PlayerPosition.PLAYER_2;
      }

      if (newScore1 >= prev.gameTo && newScore1 - newScore2 >= 2) setWinningPlayer(Side.LEFT);
      if (newScore2 >= prev.gameTo && newScore2 - newScore1 >= 2) setWinningPlayer(Side.RIGHT);
      if (newScore1 >= 30) setWinningPlayer(Side.LEFT);
      if (newScore2 >= 30) setWinningPlayer(Side.RIGHT);

      const totalScore = newScore1 + newScore2;
      return { 
        ...prev, 
        score1: newScore1, 
        score2: newScore2, 
        server: newServer, 
        history: newHistory, 
        servingSide: totalScore % 2 === 0 ? Side.RIGHT : Side.LEFT 
      };
    });
  };

  const endMatch = () => {
    if (!match) return;
    const participantIds = [...match.team1, ...match.team2].map(p => p.id);
    setPlayers(players.map(p => ({
      ...p,
      matchesPlayed: participantIds.includes(p.id) ? p.matchesPlayed + 1 : p.matchesPlayed
    })));
    setSelectedIds([]);
    setMatch(null);
    setView('Lobby');
  };

  const undo = () => {
    setMatch(prev => {
      if (!prev || prev.history.length === 0) return prev;
      const last = prev.history[prev.history.length - 1];
      setWinningPlayer(null);
      return {
        ...prev,
        score1: last.score1,
        score2: last.score2,
        server: last.server,
        history: prev.history.slice(0, -1),
        servingSide: (last.score1 + last.score2) % 2 === 0 ? Side.RIGHT : Side.LEFT
      };
    });
  };

  const addPlayer = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPlayerName.trim()) return;
    const newP: Player = {
      id: Date.now().toString(),
      name: newPlayerName.trim(),
      level: newPlayerLevel,
      matchesPlayed: 0,
      isActive: false
    };
    setPlayers([...players, newP]);
    setNewPlayerName('');
  };

  const removePlayer = (id: string) => {
    if (confirm('確定要永久移除此球員嗎？')) {
      setPlayers(players.filter(p => p.id !== id));
      setSelectedIds(selectedIds.filter(i => i !== id));
    }
  };

  const handleUpdatePlayer = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingPlayer) return;
    setPlayers(players.map(p => p.id === editingPlayer.id ? editingPlayer : p));
    setEditingPlayer(null);
  };

  const resetMatchesCount = () => {
    if (confirm('確定要將所有球員的上場場次歸零嗎？')) {
      setPlayers(players.map(p => ({ ...p, matchesPlayed: 0 })));
    }
  };

  if (view === 'Settings') {
    return (
      <div className="min-h-screen bg-[#0a0f1e] text-slate-100 p-4 md:p-8">
        <div className="max-w-4xl mx-auto space-y-8">
          <header className="flex justify-between items-center">
            <button onClick={() => setView('Lobby')} className="text-slate-400 hover:text-white flex items-center gap-2 font-bold transition-colors">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
              返回大廳
            </button>
            <h1 className="text-2xl font-black italic text-blue-400 tracking-tight">成員名單管理</h1>
            <div className="w-24"></div>
          </header>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="md:col-span-1 space-y-6">
              <div className="bg-slate-800/30 p-6 rounded-[2rem] border border-slate-700/50 shadow-xl space-y-4 backdrop-blur-sm">
                <h3 className="font-bold text-slate-400 uppercase text-xs tracking-widest">新增長期球員</h3>
                <form onSubmit={addPlayer} className="space-y-4">
                  <input 
                    type="text" 
                    value={newPlayerName}
                    onChange={e => setNewPlayerName(e.target.value)}
                    placeholder="輸入球員姓名"
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-sm focus:border-blue-500 outline-none transition-all"
                    required
                  />
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-500 uppercase">實力等級 ({newPlayerLevel})</label>
                    <input 
                      type="range" min="1" max="10" 
                      value={newPlayerLevel}
                      onChange={e => setNewPlayerLevel(Number(e.target.value))}
                      className="w-full accent-blue-500 h-2 bg-slate-700 rounded-lg cursor-pointer"
                    />
                    <div className="flex justify-between text-[10px] font-black text-slate-600 px-1"><span>初階</span><span>進階</span></div>
                  </div>
                  <button type="submit" className="w-full bg-blue-600 hover:bg-blue-500 py-3 rounded-xl font-bold transition-all shadow-lg shadow-blue-500/10">
                    確認新增
                  </button>
                </form>
              </div>

              <div className="bg-red-500/5 p-6 rounded-[2rem] border border-red-500/10 space-y-4">
                <h3 className="font-bold text-red-400 uppercase text-xs tracking-widest opacity-60">危險區域</h3>
                <button 
                  onClick={resetMatchesCount}
                  className="w-full bg-red-600/10 hover:bg-red-600/20 text-red-400 py-3 rounded-xl font-bold border border-red-500/20 transition-all text-xs"
                >
                  重設所有場次
                </button>
                <button 
                  onClick={() => { if(confirm('確定要清空所有球員名單嗎？')) setPlayers([]); }}
                  className="w-full bg-slate-800 hover:bg-slate-700 py-3 rounded-xl font-bold transition-all text-xs text-slate-400"
                >
                  清空名單
                </button>
              </div>
            </div>

            <div className="md:col-span-2">
              <div className="bg-slate-800/20 rounded-[2rem] border border-slate-700/50 overflow-hidden shadow-2xl backdrop-blur-sm">
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead className="bg-slate-800/50">
                      <tr>
                        <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">球員名稱</th>
                        <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">等級</th>
                        <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">累積場次</th>
                        <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">管理</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/50">
                      {players.map(p => (
                        <tr key={p.id} className="hover:bg-slate-700/10 transition-colors group">
                          <td className="px-6 py-4 font-bold">{p.name}</td>
                          <td className="px-6 py-4 text-blue-400 font-black">Lv.{p.level}</td>
                          <td className="px-6 py-4 text-slate-400 text-sm">{p.matchesPlayed} 次</td>
                          <td className="px-6 py-4 text-right space-x-3">
                            <button onClick={() => setEditingPlayer(p)} className="text-slate-500 hover:text-blue-400 text-sm font-bold transition-colors">編輯</button>
                            <button onClick={() => removePlayer(p.id)} className="text-slate-500 hover:text-red-400 text-sm font-bold transition-colors">移除</button>
                          </td>
                        </tr>
                      ))}
                      {players.length === 0 && (
                        <tr>
                          <td colSpan={4} className="px-6 py-12 text-center text-slate-600 font-medium italic">目前成員庫內無資料，請先新增球員</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </div>

        {editingPlayer && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-in fade-in duration-200">
            <form onSubmit={handleUpdatePlayer} className="bg-slate-900 border border-slate-700 rounded-[2.5rem] p-8 w-full max-w-sm shadow-2xl space-y-6">
              <h3 className="font-black text-xl text-blue-400 italic">編輯球員資訊</h3>
              <div className="space-y-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase px-1">姓名</label>
                  <input 
                    type="text" 
                    value={editingPlayer.name}
                    onChange={e => setEditingPlayer({...editingPlayer, name: e.target.value})}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-sm focus:border-blue-500 outline-none"
                    required
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase px-1">實力等級 ({editingPlayer.level})</label>
                  <input 
                    type="range" min="1" max="10" 
                    value={editingPlayer.level}
                    onChange={e => setEditingPlayer({...editingPlayer, level: Number(e.target.value)})}
                    className="w-full accent-blue-500 h-2 bg-slate-700 rounded-lg cursor-pointer"
                  />
                </div>
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setEditingPlayer(null)} className="flex-1 bg-slate-800 py-3 rounded-xl font-bold hover:bg-slate-700 transition-colors">取消</button>
                <button type="submit" className="flex-1 bg-blue-600 py-3 rounded-xl font-bold shadow-lg hover:bg-blue-500 transition-colors">儲存</button>
              </div>
            </form>
          </div>
        )}
      </div>
    );
  }

  if (view === 'Lobby') {
    return (
      <div className="min-h-screen bg-[#0a0f1e] text-slate-100 p-4 md:p-8">
        <div className="max-w-4xl mx-auto space-y-6">
          <header className="flex justify-between items-center bg-slate-800/40 p-6 rounded-[2rem] border border-slate-700/50 backdrop-blur-md shadow-2xl">
            <div>
              <h1 className="text-3xl font-black italic tracking-tighter text-blue-400">羽球輪替助手</h1>
              <p className="text-slate-500 text-[10px] font-bold tracking-widest uppercase">公平分配 • 實力均衡 • 輕鬆計分</p>
            </div>
            <button 
              onClick={() => setView('Settings')}
              className="bg-slate-700/50 hover:bg-slate-700 px-5 py-2.5 rounded-2xl text-[11px] font-black tracking-widest border border-slate-600 transition-all flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
              成員庫管理
            </button>
          </header>

          <section className="space-y-4 pb-32">
            <div className="flex justify-between items-center px-2">
              <h2 className="font-black text-xl flex items-center gap-2">
                今日出席球員 <span className="text-sm bg-blue-500/20 text-blue-400 px-2 py-0.5 rounded-full">{players.length} 人</span>
              </h2>
              {players.length >= 4 && (
                <button onClick={autoPickPlayers} className="text-xs font-bold text-blue-400 hover:text-blue-300 underline uppercase tracking-widest transition-colors">
                  自動挑選 (上場最少)
                </button>
              )}
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              {sortedPlayers.map(p => (
                <div 
                  key={p.id} 
                  onClick={() => toggleSelection(p.id)}
                  className={`p-4 rounded-[1.5rem] cursor-pointer transition-all border-2 flex items-center justify-between shadow-lg relative active:scale-95 ${
                    selectedIds.includes(p.id) 
                    ? 'border-blue-500 bg-blue-500/10' 
                    : 'border-slate-800/50 bg-slate-800/20 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center font-black ${selectedIds.includes(p.id) ? 'bg-blue-500 text-white' : 'bg-slate-700 text-slate-400'}`}>
                      {p.name[0]}
                    </div>
                    <div>
                      <div className="font-bold flex items-center gap-2">
                        {p.name}
                        <span className="text-[10px] text-blue-400 bg-blue-400/10 px-1.5 rounded font-black">Lv.{p.level}</span>
                      </div>
                      <div className="text-[10px] text-slate-500 font-bold uppercase mt-1 inline-block">已上場：{p.matchesPlayed}</div>
                    </div>
                  </div>
                  {selectedIds.includes(p.id) && (
                    <div className="w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center animate-in zoom-in duration-200">
                      <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                    </div>
                  )}
                </div>
              ))}
            </div>
            {players.length === 0 && (
              <div className="py-24 text-center space-y-6 bg-slate-800/10 rounded-[2.5rem] border border-dashed border-slate-700 shadow-inner">
                <div className="w-16 h-16 bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-4">
                  <svg className="w-8 h-8 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" /></svg>
                </div>
                <div className="space-y-2">
                  <p className="text-slate-400 font-black text-lg">目前名單內沒有成員</p>
                  <p className="text-slate-500 text-sm">請先前往「成員庫管理」新增常用球友</p>
                </div>
                <button onClick={() => setView('Settings')} className="bg-blue-600 hover:bg-blue-500 px-8 py-3 rounded-2xl font-black text-sm transition-all shadow-lg shadow-blue-500/20 active:scale-95">
                  立即新增成員
                </button>
              </div>
            )}
          </section>

          {/* 分隊確認 Modal */}
          {showAssignmentModal && assignedTeams && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-xl animate-in fade-in duration-300">
              <div className="bg-[#0f172a] border border-slate-700 rounded-[3rem] p-8 w-full max-w-2xl shadow-2xl space-y-8">
                <div className="text-center">
                  <h3 className="text-3xl font-black italic text-blue-400 tracking-tighter">確認分隊</h3>
                  <p className="text-slate-500 text-xs font-bold uppercase tracking-widest mt-2">點擊切換對手來手動調整隊友</p>
                </div>

                <div className="flex flex-col md:flex-row items-center gap-6">
                  {/* Team 1 */}
                  <div className="flex-1 w-full bg-blue-500/5 border border-blue-500/20 rounded-[2rem] p-6 space-y-4 text-center">
                    <div className="text-[10px] font-black text-blue-400 uppercase tracking-widest">第一隊 (總 Lv.{assignedTeams.team1.reduce((s, p) => s+p.level, 0)})</div>
                    <div className="space-y-3">
                      {assignedTeams.team1.map(p => (
                        <div key={p.id} className="bg-slate-800/50 py-3 rounded-xl font-bold flex items-center justify-center gap-2">
                          <span className="w-2 h-2 bg-blue-500 rounded-full"></span>
                          {p.name} <span className="text-blue-500/50 text-xs">L{p.level}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="font-black italic text-4xl text-slate-700">VS</div>

                  {/* Team 2 */}
                  <div className="flex-1 w-full bg-emerald-500/5 border border-emerald-500/20 rounded-[2rem] p-6 space-y-4 text-center">
                    <div className="text-[10px] font-black text-emerald-400 uppercase tracking-widest">第二隊 (總 Lv.{assignedTeams.team2.reduce((s, p) => s+p.level, 0)})</div>
                    <div className="space-y-3">
                      {assignedTeams.team2.map(p => (
                        <div key={p.id} className="bg-slate-800/50 py-3 rounded-xl font-bold flex items-center justify-center gap-2">
                          <span className="w-2 h-2 bg-emerald-500 rounded-full"></span>
                          {p.name} <span className="text-emerald-500/50 text-xs">L{p.level}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row gap-4">
                  <button 
                    onClick={() => setShowAssignmentModal(false)}
                    className="flex-1 bg-slate-800 hover:bg-slate-700 py-4 rounded-2xl font-bold transition-all"
                  >
                    取消重選
                  </button>
                  <button 
                    onClick={cyclePairings}
                    className="flex-1 bg-slate-700 hover:bg-slate-600 py-4 rounded-2xl font-bold border border-slate-600 transition-all flex items-center justify-center gap-2"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                    切換組合
                  </button>
                  <button 
                    onClick={startMatch}
                    className="flex-[2] bg-blue-600 hover:bg-blue-500 py-4 rounded-2xl font-black text-xl shadow-lg shadow-blue-500/20 transition-all active:scale-95"
                  >
                    進入開賽
                  </button>
                </div>
              </div>
            </div>
          )}

          <div className="fixed bottom-8 left-1/2 -translate-x-1/2 w-full max-w-md px-4 z-40">
            <button 
              disabled={selectedIds.length !== 4}
              onClick={prepareMatch}
              className="w-full bg-blue-600 hover:bg-blue-500 py-5 rounded-3xl font-black text-xl shadow-[0_10px_40px_-10px_rgba(37,99,235,0.5)] disabled:opacity-20 transition-all active:scale-95 flex items-center justify-center gap-3"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
              開始對決 ({selectedIds.length}/4)
            </button>
          </div>
        </div>
      </div>
    );
  }

  // --- Match View ---
  return (
    <div className="min-h-screen bg-[#0a0f1e] text-white flex flex-col relative overflow-hidden">
      {/* 側邊分配面板 */}
      <div className={`fixed inset-y-0 right-0 w-80 bg-slate-900/95 border-l border-slate-800 backdrop-blur-xl z-50 transform transition-transform duration-500 shadow-2xl ${showStatsDrawer ? 'translate-x-0' : 'translate-x-full'}`}>
        <div className="p-6 h-full flex flex-col">
          <div className="flex justify-between items-center mb-8">
            <h3 className="font-black text-xl italic text-blue-400">當前輪替狀態</h3>
            <button onClick={() => setShowStatsDrawer(false)} className="p-2 hover:bg-slate-800 rounded-xl transition-colors">✕</button>
          </div>
          <div className="flex-1 overflow-y-auto space-y-3 pr-2 custom-scrollbar">
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-4">所有成員統計</p>
            {sortedPlayers.map(p => {
              const isOnCourt = match?.team1.some(tp => tp.id === p.id) || match?.team2.some(tp => tp.id === p.id);
              return (
                <div key={p.id} className={`flex items-center justify-between p-3 rounded-2xl border transition-all ${isOnCourt ? 'bg-blue-500/10 border-blue-500/50 ring-1 ring-blue-500/20' : 'bg-slate-800/50 border-slate-700/30'}`}>
                  <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-bold ${isOnCourt ? 'bg-blue-500 text-white animate-pulse' : 'bg-slate-700 text-slate-400'}`}>{p.name[0]}</div>
                    <div>
                      <div className="text-sm font-bold flex items-center gap-2">
                        {p.name}
                        {isOnCourt && <span className="text-[8px] bg-blue-500 text-white px-1 rounded font-black uppercase tracking-tighter">ON COURT</span>}
                      </div>
                      <div className="text-[9px] text-slate-500">等級 {p.level}</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-black text-blue-400">{p.matchesPlayed}</div>
                    <div className="text-[8px] text-slate-500 uppercase font-bold tracking-tighter">場次</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <header className="p-6 flex justify-between items-center bg-slate-900/40 border-b border-slate-800/50 backdrop-blur-md">
        <button onClick={() => { if(confirm('要取消此場比賽嗎？目前分數將不會被計入。')) setView('Lobby'); }} className="text-slate-500 hover:text-white font-black text-xs flex items-center gap-2 transition-colors">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
          結束此局
        </button>
        <div className="text-center">
          <span className="text-[9px] uppercase font-bold tracking-[0.3em] text-slate-600">SMASH MATCH</span>
          <div className="font-digital text-blue-400 text-lg italic tracking-widest">LIVE SCORE</div>
        </div>
        <div className="flex gap-2">
          <button onClick={undo} className="p-2.5 bg-slate-800/80 rounded-xl hover:bg-slate-700 border border-slate-700 shadow-md active:scale-90 transition-all" title="復原">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" /></svg>
          </button>
          <button onClick={() => setShowStatsDrawer(true)} className="bg-slate-800/80 px-4 py-2 rounded-xl text-[10px] font-black tracking-widest border border-slate-700 hover:bg-slate-700 transition-all shadow-lg flex items-center gap-2">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
            輪替面板
          </button>
        </div>
      </header>

      <main className="flex-1 flex flex-col md:flex-row gap-6 p-6">
        <div 
          onClick={() => handleScoreChange(Side.LEFT, 1)}
          className={`flex-1 flex flex-col items-center justify-center p-8 rounded-[4rem] border-4 transition-all relative active:scale-[0.98] cursor-pointer shadow-2xl overflow-hidden ${
            match?.server === PlayerPosition.PLAYER_1 ? 'border-blue-500 bg-blue-500/10' : 'border-slate-800/50 bg-slate-800/10'
          }`}
        >
          {match?.server === PlayerPosition.PLAYER_1 && <div className="absolute top-8 left-8 bg-blue-500 text-white text-[10px] px-3 py-1 rounded-full font-black animate-pulse">發球方</div>}
          <div className="flex gap-2 mb-12 flex-wrap justify-center">
            {match?.team1.map(p => <span key={p.id} className="bg-slate-800/80 px-4 py-1.5 rounded-full text-[11px] font-black uppercase border border-slate-700 text-blue-300 shadow-sm">{p.name} <span className="text-slate-500 ml-1 opacity-60">L{p.level}</span></span>)}
          </div>
          <div className="font-digital text-[15rem] md:text-[18rem] font-black leading-none drop-shadow-[0_0_60px_rgba(59,130,246,0.35)]">{match?.score1}</div>
          <p className="mt-8 text-slate-600 font-bold uppercase text-[10px] tracking-[0.2em] opacity-50">點擊加分</p>
          {winningPlayer === Side.LEFT && <div className="absolute inset-0 bg-blue-600/95 flex flex-col items-center justify-center text-7xl font-black rounded-[3.8rem] animate-in zoom-in duration-300 backdrop-blur-md z-10 shadow-inner">
            <span className="tracking-tighter italic">WINNER</span>
            <span className="text-xl mt-4 opacity-70">恭喜獲得勝利</span>
          </div>}
        </div>

        <div 
          onClick={() => handleScoreChange(Side.RIGHT, 1)}
          className={`flex-1 flex flex-col items-center justify-center p-8 rounded-[4rem] border-4 transition-all relative active:scale-[0.98] cursor-pointer shadow-2xl overflow-hidden ${
            match?.server === PlayerPosition.PLAYER_2 ? 'border-emerald-500 bg-emerald-500/10' : 'border-slate-800/50 bg-slate-800/10'
          }`}
        >
          {match?.server === PlayerPosition.PLAYER_2 && <div className="absolute top-8 right-8 bg-emerald-500 text-white text-[10px] px-3 py-1 rounded-full font-black animate-pulse">發球方</div>}
          <div className="flex gap-2 mb-12 flex-wrap justify-center">
            {match?.team2.map(p => <span key={p.id} className="bg-slate-800/80 px-4 py-1.5 rounded-full text-[11px] font-black uppercase border border-slate-700 text-emerald-300 shadow-sm">{p.name} <span className="text-slate-500 ml-1 opacity-60">L{p.level}</span></span>)}
          </div>
          <div className="font-digital text-[15rem] md:text-[18rem] font-black leading-none drop-shadow-[0_0_60px_rgba(16,185,129,0.35)]">{match?.score2}</div>
          <p className="mt-8 text-slate-600 font-bold uppercase text-[10px] tracking-[0.2em] opacity-50">點擊加分</p>
          {winningPlayer === Side.RIGHT && <div className="absolute inset-0 bg-emerald-600/95 flex flex-col items-center justify-center text-7xl font-black rounded-[3.8rem] animate-in zoom-in duration-300 backdrop-blur-md z-10 shadow-inner">
            <span className="tracking-tighter italic">WINNER</span>
            <span className="text-xl mt-4 opacity-70">恭喜獲得勝利</span>
          </div>}
        </div>
      </main>

      <footer className="p-8 flex flex-col items-center gap-6">
        {winningPlayer && (
          <button onClick={endMatch} className="w-full max-w-lg bg-white text-[#0a0f1e] py-6 rounded-[2.5rem] font-black text-2xl hover:scale-[1.02] active:scale-95 transition-all shadow-[0_20px_50px_-10px_rgba(255,255,255,0.3)]">
            比賽結束，更新統計
          </button>
        )}
        <div className="flex gap-16 text-slate-600 font-black tracking-[0.3em] text-[10px] uppercase">
          <div className={`transition-all duration-500 ${match?.servingSide === Side.RIGHT ? 'text-blue-400 scale-125 opacity-100' : 'opacity-20'}`}>右側發球 (偶數)</div>
          <div className={`transition-all duration-500 ${match?.servingSide === Side.LEFT ? 'text-blue-400 scale-125 opacity-100' : 'opacity-20'}`}>左側發球 (奇數)</div>
        </div>
      </footer>
    </div>
  );
};

export default App;
